// Microphone → 16-bit PCM chunks for Gemini Live, off the main thread.
// Posts { pcm: ArrayBuffer (Int16, mono), level: 0..1 } about every 40 ms.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = Math.round(sampleRate * 0.04);
    this.buffer = new Int16Array(this.chunk);
    this.filled = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.sumSquares += s * s;
      this.buffer[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.filled === this.chunk) {
        const level = Math.min(1, Math.sqrt(this.sumSquares / this.chunk) * 4);
        const pcm = this.buffer.buffer.slice(0);
        this.port.postMessage({ pcm, level }, [pcm]);
        this.filled = 0;
        this.sumSquares = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
