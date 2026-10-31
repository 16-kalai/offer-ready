/**
 * Browser audio for the live interview: the microphone as 16-bit PCM chunks,
 * and gapless playback of the interviewer's 24 kHz PCM. Both audio contexts
 * must be created from a click (browsers block audio otherwise).
 */

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(data: string): Int16Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

export class MicError extends Error {
  constructor(
    readonly reason: "denied" | "missing" | "unsupported" | "busy",
    message: string,
  ) {
    super(message);
  }
}

/** What the browser needs for the interview. */
export function browserSupport(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (typeof window === "undefined") return { ok: false, missing: ["browser"] };
  if (!navigator.mediaDevices?.getUserMedia) missing.push("microphone access");
  if (typeof AudioWorkletNode === "undefined") missing.push("audio processing");
  if (typeof WebSocket === "undefined") missing.push("live connections");
  return { ok: missing.length === 0, missing };
}

export interface Mic {
  readonly sampleRate: number;
  /** Latest input level, 0..1. */
  readonly level: number;
  /** Every ~40 ms chunk with its level, while not muted. */
  onChunk: ((base64: string, level: number) => void) | null;
  setMuted(muted: boolean): void;
  close(): void;
}

/**
 * Development only: `?devmic=silent` on the interview link stands in a
 * (nearly) silent microphone, so the call can be tested in a browser that has no mic
 * access (an automated or embedded browser). Never in production.
 */
function devSilentMic(): MediaStream | null {
  if (process.env.NODE_ENV === "production") return null;
  // Dev only: the demo recorder's synthetic candidate voice (scripts/demo/record.mts).
  const demo = (window as unknown as { __demoMic?: MediaStream }).__demoMic;
  if (demo) return demo;
  if (new URLSearchParams(window.location.search).get("devmic") !== "silent") return null;
  const ctx = new AudioContext();
  const destination = ctx.createMediaStreamDestination();
  // A second of tone (the device check wants to hear something), then silence.
  const tone = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.setValueAtTime(0, ctx.currentTime + 1);
  tone.connect(gain).connect(destination);
  tone.start();
  return destination.stream;
}

export async function openMic(): Promise<Mic> {
  if (!browserSupport().ok)
    throw new MicError("unsupported", "This browser can't run the interview.");
  let stream: MediaStream;
  const silent = devSilentMic();
  if (silent) stream = silent;
  else
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError")
        throw new MicError("denied", "Microphone access was blocked.");
      if (name === "NotFoundError" || name === "OverconstrainedError")
        throw new MicError("missing", "No microphone was found.");
      throw new MicError("busy", "The microphone is in use by another app.");
    }

  // 16 kHz is what Gemini wants. Some browsers can't capture at another rate than the
  // device's (Firefox); then we send the device rate and Gemini resamples.
  let graph: { ctx: AudioContext; node: AudioWorkletNode };
  try {
    graph = await captureGraph(stream, 16_000);
  } catch {
    graph = await captureGraph(stream);
  }
  const { ctx, node } = graph;

  let muted = false;
  const mic: Mic = {
    sampleRate: ctx.sampleRate,
    level: 0,
    onChunk: null,
    setMuted(value) {
      muted = value;
      for (const track of stream.getAudioTracks()) track.enabled = !value;
    },
    close() {
      node.port.onmessage = null;
      for (const track of stream.getTracks()) track.stop();
      void ctx.close().catch(() => {});
    },
  };
  node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
    (mic as { level: number }).level = muted ? 0 : event.data.level;
    if (!muted) mic.onChunk?.(toBase64(event.data.pcm), event.data.level);
  };
  if (ctx.state === "suspended") await ctx.resume();
  return mic;
}

async function captureGraph(stream: MediaStream, sampleRate?: number) {
  const ctx = new AudioContext(sampleRate ? { sampleRate } : undefined);
  try {
    await ctx.audioWorklet.addModule("/audio/pcm-capture.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    // A silent sink keeps the graph running on every browser without echoing the mic.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(node).connect(sink).connect(ctx.destination);
    return { ctx, node };
  } catch (error) {
    void ctx.close().catch(() => {});
    throw error;
  }
}

/** Plays the interviewer's audio chunks back to back; clears instantly when the candidate interrupts. */
export class Player {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private nextAt = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private samples = new Uint8Array(256);

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24_000 });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(this.ctx.destination);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get playing(): boolean {
    return this.sources.size > 0;
  }

  /** Output level 0..1, for the orb. */
  get level(): number {
    if (!this.playing) return 0;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 3);
  }

  enqueue(base64: string) {
    const pcm = fromBase64(base64);
    if (pcm.length === 0) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, 24_000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = (pcm[i] ?? 0) / 0x8000;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    const startAt = Math.max(this.ctx.currentTime + 0.02, this.nextAt);
    source.start(startAt);
    this.nextAt = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  clear() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextAt = 0;
  }

  /** A short two-note chime, for the speaker check. */
  chime() {
    const now = this.ctx.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.5);
      osc.connect(gain).connect(this.analyser);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.55);
    }
  }

  close() {
    this.clear();
    void this.ctx.close().catch(() => {});
  }
}
