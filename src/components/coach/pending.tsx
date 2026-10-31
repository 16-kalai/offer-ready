"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { VoiceOrb } from "./voice-orb";

/**
 * Shown while background work runs (research, a plan, drills). Refreshes the
 * page every few seconds until the server has the result, and cycles through
 * what the coach is doing so the wait reads as progress.
 */
export function Pending({
  title,
  steps,
  every = 3500,
  className,
}: {
  title: string;
  steps: string[];
  every?: number;
  className?: string;
}) {
  const router = useRouter();
  const [i, setI] = useState(0);
  useEffect(() => {
    // Hosts without a worker: nudge the job runner now and then while we wait.
    const nudge = () =>
      fetch("/api/jobs/drain", { method: "POST", keepalive: true }).catch(() => {});
    nudge();
    const nudger = setInterval(nudge, 20_000);
    const refresh = setInterval(() => router.refresh(), every);
    const tick = setInterval(() => setI((x) => (x + 1) % steps.length), 2600);
    return () => {
      clearInterval(nudger);
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [router, every, steps.length]);
  return (
    <div className={cn("surface flex flex-col items-center px-6 py-14 text-center", className)}>
      <VoiceOrb size={88} state="thinking" />
      <h2 className="mt-6 text-xl font-semibold tracking-tight">{title}</h2>
      <p
        key={i}
        className="animate-rise mt-2 flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        {steps[i]}
      </p>
    </div>
  );
}

/** Refreshes the page on an interval without showing anything (e.g. for a live feed). */
export function AutoRefresh({ every = 4000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), every);
    return () => clearInterval(id);
  }, [router, every]);
  return null;
}
