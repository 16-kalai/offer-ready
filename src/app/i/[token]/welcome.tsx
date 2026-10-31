"use client";

import { ArrowRight, Clock, Headphones, Laptop, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { THINKING } from "@/lib/interview";
import type { PartKey } from "@/lib/interview-room";
import type { RoomState } from "@/server/candidate-sessions";
import { Card } from "./shell";

type Ready = Extract<RoomState, { kind: "ready" }>;

/** The parts in the candidate's words. */
const PART_COPY: Record<PartKey, { title: string; about: string }> = {
  warmup: { title: "Warm start", about: "A quick chat about something you've worked on" },
  projects: { title: "Your projects", about: "The choices you made in your own work, and why" },
  cases: { title: "Real situations", about: "Three short scenarios from the job, shown on screen" },
  close: { title: "Close", about: "A last reflection, and you're done" },
};

const deadlineFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function Welcome({ state, onNext }: { state: Ready; onNext: () => void }) {
  const { plan } = state;
  const [notYou, setNotYou] = useState(false);
  return (
    <Card>
      <p className="text-sm text-muted-foreground">{plan.roleTitle}</p>
      <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">
        {plan.firstName ? `Hi ${plan.firstName}, welcome` : "Welcome"}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-700">
        Your practice interview for {plan.companyName}: a{" "}
        <strong className="font-semibold">15-minute voice conversation</strong> with an AI
        interviewer, built from the real job description. Think out loud: that's what's scored.
      </p>

      <div className="mt-6 rounded-2xl bg-neutral-50 p-5">
        <p className="text-sm font-semibold">It's about how you think</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Hiring now tests judgment. Your report will score these five skills, with your own words
          as evidence:
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {THINKING.map((t) => (
            <li
              key={t.id}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-black/[0.06]"
            >
              {t.name}
            </li>
          ))}
        </ul>
      </div>

      <section className="mt-7" aria-labelledby="parts-heading">
        <h2 id="parts-heading" className="text-sm font-semibold">
          How the 15 minutes go
        </h2>
        <ol className="relative mt-4 grid gap-5 sm:grid-cols-4 sm:gap-2">
          {/* The line joining the steps: across on wide screens, down on phones. */}
          <span
            aria-hidden="true"
            className="absolute top-3 right-[12.5%] left-[12.5%] hidden h-px bg-neutral-200 sm:block"
          />
          {plan.parts.map((p, i) => (
            <li
              key={p.key}
              className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:gap-2.5 sm:text-center"
            >
              {i < plan.parts.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-6 -bottom-5 left-3 w-px bg-neutral-200 sm:hidden"
                />
              )}
              <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white ring-4 ring-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-snug font-medium">{PART_COPY[p.key].title}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{p.minutes} min</p>
                <p className="mt-0.5 text-sm text-muted-foreground sm:hidden">
                  {PART_COPY[p.key].about}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <ul className="mt-6 space-y-2.5 text-sm text-neutral-700">
        <li className="flex items-center gap-2.5">
          <Clock className="size-4 shrink-0 text-neutral-500" aria-hidden="true" /> About 20 minutes
          with setup
        </li>
        <li className="flex items-center gap-2.5">
          <Headphones className="size-4 shrink-0 text-neutral-500" aria-hidden="true" /> A quiet
          place; headphones help
        </li>
        <li className="flex items-center gap-2.5">
          <Laptop className="size-4 shrink-0 text-neutral-500" aria-hidden="true" /> A laptop is
          best; a phone works too
        </li>
        <li className="flex items-center gap-2.5">
          <MessageCircle className="size-4 shrink-0 text-neutral-500" aria-hidden="true" /> You'll
          start with a practice question that doesn't count
        </li>
      </ul>

      {state.deadline && (
        <p className="mt-6 text-xs text-muted-foreground">
          Open until {deadlineFormat.format(new Date(state.deadline))} IST. Once you start, you have
          one attempt.
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setNotYou((v) => !v)}
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Not you?
        </button>
        <Button onClick={onNext} className="h-11 gap-2 px-6">
          Get started <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {notYou && (
        <p className="mt-4 rounded-xl bg-neutral-50 px-4 py-3 text-sm text-muted-foreground">
          This practice link belongs to someone else's account. Log in to Offer Ready with your own
          account to practise.
        </p>
      )}
    </Card>
  );
}
