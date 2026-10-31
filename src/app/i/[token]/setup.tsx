"use client";

import { AlertTriangle, Check, Loader2, Mic, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { browserSupport } from "@/lib/live/audio";
import { type InterviewCall, MicError, NOISY_FLOOR } from "@/lib/live/call";
import { cn } from "@/lib/utils";
import { Card } from "./shell";

type MicState = "idle" | "asking" | "on" | MicError["reason"];

const MIC_HELP: Record<MicError["reason"], string> = {
  denied:
    "Your browser blocked the microphone. Click the lock or camera icon in the address bar, allow the microphone for this site, then try again.",
  missing:
    "We couldn't find a microphone. Plug one in (or connect headphones with a mic) and try again.",
  busy: "Another app is using your microphone. Close it (Zoom, Meet, Teams) and try again.",
  unsupported:
    "This browser can't run the interview. Please open the link in a recent Chrome, Edge or Safari.",
};

/** A one-minute check before the call: browser, microphone (with a live meter) and speaker. */
export function Setup({ call, onStart }: { call: InterviewCall; onStart: () => void }) {
  const [support] = useState(() => browserSupport());
  const [mic, setMic] = useState<MicState>("idle");
  const [heardYou, setHeardYou] = useState(false);
  const [noisy, setNoisy] = useState(false);
  const [speaker, setSpeaker] = useState<"idle" | "played" | "ok" | "no">("idle");
  const meter = useRef<HTMLDivElement>(null);

  // Live mic level, painted every frame without re-rendering.
  useEffect(() => {
    if (mic !== "on") return;
    let frame = 0;
    const since = performance.now();
    const paint = () => {
      const level = call.levels().candidate;
      // Give the room a few seconds to be measured before judging it.
      if (performance.now() - since > 3_000) setNoisy(call.noiseFloor() > NOISY_FLOOR);
      if (meter.current) meter.current.style.transform = `scaleX(${Math.max(0.02, level)})`;
      if (level > 0.15) setHeardYou(true);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [mic, call]);

  async function allowMic() {
    setMic("asking");
    try {
      await call.prepareAudio();
      setMic("on");
    } catch (error) {
      setMic(error instanceof MicError ? error.reason : "busy");
    }
  }

  const ready = support.ok && mic === "on" && heardYou && speaker === "ok";

  return (
    <Card>
      <h1 className="text-2xl font-semibold tracking-tight">Quick check</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        Takes a minute, so nothing gets in the way once you start.
      </p>

      <ol className="mt-6 space-y-3">
        <Step done={support.ok} title="Browser" failed={!support.ok}>
          {support.ok ? "Ready." : <span className="text-amber-800">{MIC_HELP.unsupported}</span>}
        </Step>

        <Step done={mic === "on" && heardYou} title="Microphone" failed={isError(mic)}>
          {mic === "idle" || mic === "asking" ? (
            <Button
              size="sm"
              onClick={allowMic}
              disabled={mic === "asking" || !support.ok}
              className="mt-2 gap-1.5"
            >
              {mic === "asking" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Mic className="size-3.5" />
              )}
              Allow microphone
            </Button>
          ) : mic === "on" ? (
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <div
                  ref={meter}
                  className="h-full origin-left rounded-full bg-success/100 transition-transform duration-75"
                  style={{ transform: "scaleX(0.02)" }}
                />
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {heardYou ? "We can hear you." : "Say something. The bar should move."}
              </p>
              {noisy && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  It's noisy where you are. Background voices can confuse the interviewer: move
                  somewhere quieter, or use headphones with a mic.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-1">
              <p className="text-sm text-amber-800">{MIC_HELP[mic]}</p>
              <Button size="sm" variant="outline" onClick={allowMic} className="mt-2">
                Try again
              </Button>
            </div>
          )}
        </Step>

        <Step done={speaker === "ok"} title="Speaker" failed={speaker === "no"}>
          {speaker === "idle" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                call.chime();
                setSpeaker("played");
              }}
              disabled={mic !== "on"}
              className="mt-2 gap-1.5"
            >
              <Volume2 className="size-3.5" /> Play a sound
            </Button>
          ) : speaker === "ok" ? (
            "Sound works."
          ) : (
            <div className="mt-1">
              <p className="text-sm">
                {speaker === "no"
                  ? "Turn your volume up, check your headphones are connected, then play it again."
                  : "Did you hear a chime?"}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setSpeaker("ok")}>
                  Yes, I heard it
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (speaker === "no") call.chime();
                    setSpeaker(speaker === "no" ? "played" : "no");
                  }}
                >
                  {speaker === "no" ? "Play again" : "No"}
                </Button>
              </div>
            </div>
          )}
        </Step>
      </ol>

      <p className="mt-6 rounded-xl bg-neutral-50 px-4 py-3 text-sm text-muted-foreground">
        The interviewer speaks first, with a practice question that doesn't count. Your mic turns on
        when it finishes and pauses whenever it speaks, so wait for your turn. You can ask it to
        repeat, or take a moment to think, at any time.
      </p>

      <Button onClick={onStart} disabled={!ready} className="mt-6 h-12 w-full text-[15px]">
        Start the interview
      </Button>
    </Card>
  );
}

const isError = (m: MicState) => !["idle", "asking", "on"].includes(m);

function Step({
  done,
  failed,
  title,
  children,
}: {
  done: boolean;
  failed: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5 rounded-2xl p-4 ring-1 ring-border">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          done
            ? "bg-success/100 text-white"
            : failed
              ? "bg-amber-100 text-amber-800"
              : "bg-neutral-100",
        )}
      >
        {done ? (
          <Check className="size-4" aria-hidden="true" />
        ) : failed ? (
          <AlertTriangle className="size-3.5" aria-hidden="true" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}
