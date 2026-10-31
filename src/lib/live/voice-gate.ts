/**
 * Lets the candidate's voice through and keeps the room out. Background noise
 * and far-away voices otherwise reach the interviewer, which hears them as the
 * candidate talking: it stops mid-sentence and waits for a turn that never
 * ends. The gate learns the room's noise floor, opens only on sustained speech
 * clearly above it, keeps a moment of audio from just before it opened (so the
 * first word isn't clipped), and stays open through short pauses.
 *
 * Levels are the microphone's 0..1 level per ~40 ms chunk. Pure: no audio I/O.
 */

export const GATE = {
  /** Never open below this, however quiet the room. */
  openMin: 0.09,
  /** Speech must be this many times the noise floor to open the gate. */
  openOverFloor: 3,
  /** Consecutive loud chunks needed to open (~120 ms): a cough or a bang doesn't count. */
  openChunks: 3,
  /** While open, "still talking" means above this share of the utterance's peak... */
  holdOfPeak: 0.25,
  /** ...and above the floor by this much. */
  holdOverFloor: 2,
  holdMin: 0.05,
  /**
   * Chunks (~40 ms each) kept from before the gate opened (~0.6 s): the gate needs a few loud
   * chunks to open, and a soft first word ("So, the...") shouldn't be lost while it does.
   */
  prerollChunks: 15,
  /**
   * How long a pause can last before the turn is considered over (~2.2 s).
   * Candidates stop to think mid-answer ("yeah, so..."); cutting them off is
   * worse than answering a little later.
   */
  hangoverChunks: 55,
  /** The floor is the quiet end (20th percentile) of each ~1.5 s window. */
  windowChunks: 38,
  floorPercentile: 0.2,
  initialFloor: 0.02,
} as const;

export type GateEvent = { kind: "send"; chunks: string[] } | { kind: "close" } | { kind: "none" };

export class VoiceGate {
  private floorLevel: number = GATE.initialFloor;
  private window: number[] = [];
  private isOpen = false;
  private loudRun = 0;
  private peak = 0;
  private hang = 0;
  private preroll: string[] = [];

  /** The room's background level, 0..1. */
  get floor() {
    return this.floorLevel;
  }
  get open() {
    return this.isOpen;
  }

  push(level: number, chunk: string): GateEvent {
    this.learnFloor(level);

    if (!this.isOpen) {
      this.preroll.push(chunk);
      if (this.preroll.length > GATE.prerollChunks) this.preroll.shift();
      const openAt = Math.max(GATE.openMin, this.floorLevel * GATE.openOverFloor);
      this.loudRun = level >= openAt ? this.loudRun + 1 : 0;
      if (this.loudRun < GATE.openChunks) return { kind: "none" };
      this.isOpen = true;
      this.loudRun = 0;
      this.peak = level;
      this.hang = GATE.hangoverChunks;
      const chunks = this.preroll;
      this.preroll = [];
      return { kind: "send", chunks };
    }

    this.peak = Math.max(this.peak, level);
    const holdAt = Math.max(
      GATE.holdMin,
      this.floorLevel * GATE.holdOverFloor,
      this.peak * GATE.holdOfPeak,
    );
    this.hang = level >= holdAt ? GATE.hangoverChunks : this.hang - 1;
    if (this.hang <= 0) {
      this.isOpen = false;
      return { kind: "close" };
    }
    return { kind: "send", chunks: [chunk] };
  }

  /** Learn the room without letting anything through (setup, or while the interviewer speaks). */
  observe(level: number) {
    this.learnFloor(level);
  }

  /** Close now (the interviewer started speaking, or the mic was muted). True if it was open. */
  shut(): boolean {
    const was = this.isOpen;
    this.isOpen = false;
    this.loudRun = 0;
    this.preroll = [];
    return was;
  }

  private learnFloor(level: number) {
    // Much quieter than the floor: follow it down straight away.
    if (level < this.floorLevel * 0.8) this.floorLevel = this.floorLevel * 0.8 + level * 0.2;
    this.window.push(level);
    if (this.window.length < GATE.windowChunks) return;
    // The quiet end of the window. Even while someone talks, the gaps between words are quiet,
    // so speech doesn't count as noise; steady chatter or a fan does.
    const sorted = [...this.window].sort((a, b) => a - b);
    const quiet = sorted[Math.floor(sorted.length * GATE.floorPercentile)] ?? this.floorLevel;
    this.floorLevel = this.floorLevel * 0.5 + quiet * 0.5;
    this.window = [];
  }
}
