"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Records the microphone in the browser and hands back base64 audio for
 * Gemini to transcribe and score. Capped so a forgotten recording stops.
 */
export function useRecorder(maxSeconds = 150) {
  const [state, setState] = useState<"idle" | "recording" | "denied">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const resolver = useRef<((v: { audio: string; mimeType: string } | null) => void) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const raf = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    for (const t of rec.current?.stream.getTracks() ?? []) t.stop();
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        cleanup();
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000)
          bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        resolver.current?.(blob.size > 1_000 ? { audio: btoa(bin), mimeType: blob.type } : null);
        resolver.current = null;
        setState("idle");
      };
      // A simple level meter for the orb.
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(peak / 128);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      rec.current = r;
      r.start(250);
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) r.state === "recording" && r.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setState("denied");
    }
  }, [cleanup, maxSeconds]);

  const stop = useCallback(
    () =>
      new Promise<{ audio: string; mimeType: string } | null>((resolve) => {
        resolver.current = resolve;
        if (rec.current?.state === "recording") rec.current.stop();
        else resolve(null);
      }),
    [],
  );

  return { state, seconds, level, start, stop };
}
