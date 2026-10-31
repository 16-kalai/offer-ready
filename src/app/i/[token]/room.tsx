"use client";

import {
  Check,
  Hand,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  ScrollText,
  Volume2,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasView } from "@/components/canvas-view";
import { Button } from "@/components/ui/button";
import type { RoomPlan } from "@/lib/interview-room";
import type { CallSnapshot, InterviewCall } from "@/lib/live/call";
import { cn } from "@/lib/utils";
import { Card, CompanyMark } from "./shell";

/**
 * The live call. Calm and mostly empty: who's speaking, what the interviewer
 * just said, the case they're discussing, and a few controls.
 */
export function Room({
  call,
  snap,
  plan,
}: {
  call: InterviewCall;
  snap: CallSnapshot;
  plan: RoomPlan;
}) {
  const activeCase = snap.cases.find((c) => c.number === snap.activeCase) ?? null;
  const lit = useMemo(() => new Set(snap.lit), [snap.lit]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const notes = snap.notes.filter((n) => n.caseNumber === activeCase?.number);
  const showCase = activeCase !== null && (snap.part === "cases" || snap.part === "close");

  if (snap.status === "elsewhere")
    return (
      <Centered company={plan.companyName}>
        <Card>
          <h1 className="text-xl font-semibold">Your interview is open somewhere else</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            It looks like it's running in another tab or on another device. You can continue here
            instead; the other one will stop.
          </p>
          <Button className="mt-6 h-11 px-6" onClick={() => void call.begin({ takeover: true })}>
            Continue here
          </Button>
        </Card>
      </Centered>
    );
  if (snap.status === "moved")
    return (
      <Centered company={plan.companyName}>
        <Card>
          <h1 className="text-xl font-semibold">Your interview moved to another device</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            It's carrying on there. You can close this tab.
          </p>
        </Card>
      </Centered>
    );
  if (snap.status === "failed")
    return (
      <Centered company={plan.companyName}>
        <Card>
          <h1 className="text-xl font-semibold">We couldn't connect</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {snap.error ?? "Something went wrong."} Your progress is saved. Open the link again to
            carry on.
          </p>
          <Button className="mt-6 h-11 px-6" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Card>
      </Centered>
    );

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-[#fafafa] transition-[padding] duration-200",
        // Wide screens: the transcript is a column beside the interview, never on top of it.
        transcriptOpen && "lg:pr-[400px]",
      )}
    >
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4 sm:px-8">
        <CompanyMark name={plan.companyName} />
        <CurrentPart plan={plan} part={snap.part} />
        <Timer snap={snap} />
      </header>

      {snap.noisy && snap.status === "live" && (
        <div
          role="status"
          className="mx-auto mb-2 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-primary px-4 py-2 text-center text-sm text-white"
        >
          <Volume2 className="size-4 shrink-0" aria-hidden="true" /> It's noisy around you.
          Headphones with a mic, or a quieter spot, help the interviewer hear you.
        </div>
      )}
      {snap.status === "reconnecting" && (
        <div
          role="status"
          className="mx-auto mb-2 flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950"
        >
          <WifiOff className="size-4" aria-hidden="true" /> Reconnecting… your answers so far are
          saved.
        </div>
      )}

      <main
        className={cn(
          "mx-auto grid w-full flex-1 gap-6 px-4 pb-32 sm:px-8",
          showCase
            ? cn(
                "max-w-7xl",
                // With the transcript open there's less room: side by side only on extra-wide screens.
                transcriptOpen
                  ? "xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
                  : "lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]",
              )
            : "max-w-2xl",
        )}
      >
        <section
          aria-label="Interviewer"
          className={cn(
            "flex flex-col items-center text-center",
            showCase
              ? transcriptOpen
                ? "pt-6 xl:sticky xl:top-6 xl:self-start"
                : "pt-6 lg:sticky lg:top-6 lg:self-start"
              : "justify-center pt-10",
          )}
        >
          <Orb
            call={call}
            speaking={snap.speaking}
            connecting={
              snap.status === "connecting" ||
              snap.status === "reconnecting" ||
              (snap.mic === "waiting" && snap.speaking === null)
            }
          />
          <MicStatus snap={snap} />
          <Captions snap={snap} compact={showCase} />
        </section>

        {showCase && activeCase && (
          <section aria-label="The case" className="pt-2 lg:pt-6">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06] sm:p-7">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  Situation {activeCase.number} of 3
                </p>
                {snap.cases.length > 1 && (
                  <div className="flex gap-1">
                    {snap.cases.map((c) => (
                      <span
                        key={c.number}
                        className={cn(
                          "size-1.5 rounded-full",
                          c.number === activeCase.number ? "bg-primary" : "bg-neutral-300",
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
              <h2 className="mb-1 text-lg font-semibold tracking-tight">{activeCase.title}</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Talk it through out loud. You can also tap something to point at it.
              </p>
              <CanvasView
                canvas={activeCase.canvas}
                lit={lit}
                picked={snap.picked}
                onPick={snap.status === "live" ? (id) => call.pick(id) : undefined}
                follow
                trap={activeCase.trap}
                onCopy={(chars) => call.copied(chars)}
              />
              {snap.twist && activeCase.number === 2 && (
                <div className="mt-4 flex gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 text-[15px] text-amber-950 ring-1 ring-amber-600/20">
                  <Zap className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    <span className="font-semibold">Something changed: </span>
                    {snap.twist}
                  </p>
                </div>
              )}
              {notes.length > 0 && (
                <div className="mt-4 rounded-2xl bg-primary px-5 py-4 text-white">
                  <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                    Your decisions
                  </p>
                  <ol className="mt-2.5 space-y-1.5" aria-live="polite">
                    {notes.map((n) => (
                      <li
                        key={n.text}
                        className="flex animate-in gap-2.5 text-[15px] duration-300 fade-in slide-in-from-bottom-1"
                      >
                        <Check
                          className="mt-1 size-4 shrink-0 text-emerald-400"
                          aria-hidden="true"
                        />
                        {n.text}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {transcriptOpen && <TranscriptPanel snap={snap} onClose={() => setTranscriptOpen(false)} />}
      <Controls
        call={call}
        snap={snap}
        transcriptOpen={transcriptOpen}
        onTranscript={() => setTranscriptOpen(!transcriptOpen)}
      />
    </div>
  );
}

/** Says whose turn it is, so the candidate knows when they're heard. */
function MicStatus({ snap }: { snap: CallSnapshot }) {
  let text: string;
  let tone = "text-muted-foreground";
  if (snap.status === "connecting") text = "Connecting to your interviewer…";
  else if (snap.status === "reconnecting") text = "Reconnecting…";
  else if (snap.status === "ending") text = "Wrapping up…";
  else if (snap.muted) {
    text = "You're muted";
    tone = "text-amber-700";
  } else if (snap.mic === "waiting")
    text = snap.slowStart
      ? "Taking a little longer than usual. Hang on, your interviewer is joining…"
      : "Your interviewer is joining…";
  else if (snap.mic === "paused") text = "Interviewer speaking · your mic is paused";
  else if (snap.awaitingReply) text = "Interviewer is thinking…";
  else if (snap.thinking) text = "Take your time. Start speaking whenever you're ready.";
  else if (snap.speaking === "candidate") {
    text = "Listening…";
    tone = "text-emerald-700";
  } else {
    text = snap.part === "practice" ? "Your turn · practice, doesn't count" : "Your turn";
    tone = "text-emerald-700";
  }
  return (
    <p
      className={cn("mt-6 flex items-center gap-1.5 text-sm font-medium", tone)}
      aria-live="polite"
    >
      {snap.mic === "listening" && !snap.muted && snap.status === "live" ? (
        <Mic className="size-4" aria-hidden="true" />
      ) : snap.status === "live" ? (
        <MicOff className="size-4" aria-hidden="true" />
      ) : null}
      {text}
    </p>
  );
}

/**
 * What the interviewer asked, kept on screen until it asks something new, so
 * anyone who couldn't hear it can read it. Under it, what the interviewer
 * heard them say, so they can see they're being understood.
 */
function Captions({ snap, compact }: { snap: CallSnapshot; compact: boolean }) {
  if (!snap.caption && !snap.heard) return <div className="mt-5 min-h-24" />;
  return (
    <div className="mt-5 w-full max-w-xl space-y-3 text-left">
      {snap.caption && (
        <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-black/[0.08]">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Interviewer
          </p>
          <p
            aria-live="polite"
            className={cn(
              "mt-1.5 text-pretty text-neutral-900",
              compact ? "text-[16px] leading-relaxed" : "text-[19px] leading-relaxed",
            )}
          >
            {snap.caption}
          </p>
        </div>
      )}
      {snap.heard && (
        <div className="rounded-2xl bg-primary px-5 py-3.5 text-white">
          <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">You</p>
          <p className="mt-1 text-[15px] leading-relaxed text-pretty">
            {snap.heard.length > 280 ? `…${snap.heard.slice(-280)}` : snap.heard}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The conversation so far, exactly as it was captured, so candidates can see
 * what the AI took from what they said. Opens beside the call; the newest
 * line is always in view.
 */
function TranscriptPanel({ snap, onClose }: { snap: CallSnapshot; onClose: () => void }) {
  const end = useRef<HTMLLIElement>(null);
  const count = snap.history.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on each new line or live word.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count, snap.heard]);
  return (
    <aside
      aria-label="Transcript"
      className="fixed inset-x-0 top-0 bottom-[124px] z-20 flex flex-col border-l border-neutral-200 bg-white shadow-[-12px_0_32px_-24px_rgb(0_0_0/0.25)] sm:bottom-[72px] sm:left-auto sm:w-[400px] lg:shadow-none"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5">
        <div>
          <p className="font-semibold">Transcript</p>
          <p className="text-xs text-muted-foreground">
            What the interviewer captured, as it happened
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close transcript"
          className="flex size-9 items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ol className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {count === 0 && !snap.heard && (
          <li className="text-sm text-muted-foreground">The conversation will appear here.</li>
        )}
        {snap.history.map((turn, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are only ever appended.
          <li key={i}>
            <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              {turn.speaker === "interviewer" ? "Interviewer" : "You"}
            </p>
            <p
              className={cn(
                "mt-1 text-[15px] leading-relaxed",
                turn.speaker === "candidate" ? "text-neutral-900" : "text-neutral-700",
              )}
            >
              {turn.text}
            </p>
          </li>
        ))}
        {snap.heard && snap.speaking === "candidate" && (
          <li>
            <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
              You · speaking
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-neutral-900">{snap.heard}</p>
          </li>
        )}
        <li ref={end} aria-hidden="true" />
      </ol>
    </aside>
  );
}

function Centered({ company, children }: { company: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#fafafa]">
      <header className="flex h-16 items-center px-5 sm:px-8">
        <CompanyMark name={company} />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}

/** Only the part they're in: the rest of the agenda was on the welcome page. */
function CurrentPart({ plan, part }: { plan: RoomPlan; part: CallSnapshot["part"] }) {
  const label =
    part === "practice"
      ? "Practice"
      : part === "projects"
        ? "Your projects"
        : part === "cases"
          ? "Situations"
          : (plan.parts.find((p) => p.key === part)?.label ?? "");
  return (
    <p className="rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-white">
      {label}
    </p>
  );
}

const TIMER = "justify-self-end rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap";

function Timer({ snap }: { snap: CallSnapshot }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, []);
  if (snap.endsAt === null)
    return <span className={cn(TIMER, "bg-neutral-200 text-neutral-900")}>15 min</span>;
  const left = Math.max(0, snap.endsAt - (Date.now() + snap.clockOffset));
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1_000);
  return (
    <span
      role="timer"
      className={cn(
        TIMER,
        "tabular-nums",
        left < 90_000 ? "bg-amber-400 text-amber-950" : "bg-neutral-200 text-neutral-900",
      )}
      aria-label={`${m} minutes left`}
    >
      {m}:{String(s).padStart(2, "0")} left
    </span>
  );
}

/** A soft orb that breathes with whoever is speaking. Painted per frame, outside React. */
function Orb({
  call,
  speaking,
  connecting,
}: {
  call: InterviewCall;
  speaking: CallSnapshot["speaking"];
  connecting: boolean;
}) {
  const core = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    let smooth = 0;
    const paint = () => {
      const { candidate, interviewer } = call.levels();
      const level = Math.max(candidate, interviewer);
      smooth += (level - smooth) * 0.25;
      if (core.current) core.current.style.transform = `scale(${1 + smooth * 0.18})`;
      if (halo.current) {
        halo.current.style.transform = `scale(${1.1 + smooth * 0.6})`;
        halo.current.style.opacity = String(0.15 + smooth * 0.5);
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [call]);

  return (
    <div className="relative flex size-44 items-center justify-center sm:size-52">
      <div
        ref={halo}
        className={cn(
          "absolute inset-6 rounded-full blur-xl transition-colors duration-500",
          speaking === "candidate" ? "bg-emerald-400" : "bg-neutral-400",
        )}
      />
      <div
        ref={core}
        className={cn(
          "relative flex size-28 items-center justify-center rounded-full shadow-[0_20px_60px_-20px_rgb(0_0_0/0.5)] transition-colors duration-500 sm:size-32",
          speaking === "candidate"
            ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
            : "bg-gradient-to-br from-neutral-700 to-neutral-950",
        )}
      >
        {connecting && <Loader2 className="size-6 animate-spin text-white/80" />}
      </div>
    </div>
  );
}

function Controls({
  call,
  snap,
  transcriptOpen,
  onTranscript,
}: {
  call: InterviewCall;
  snap: CallSnapshot;
  transcriptOpen: boolean;
  onTranscript: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const live = snap.status === "live";
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 px-4 py-3.5">
        {confirmEnd ? (
          <>
            <p className="mr-2 text-sm">End the interview now? You can't restart it.</p>
            <button
              type="button"
              className={cn(CONTROL, IDLE)}
              onClick={() => setConfirmEnd(false)}
            >
              Keep going
            </button>
            <button
              type="button"
              className={cn(CONTROL, "bg-rose-600 text-white hover:bg-rose-700")}
              onClick={() => void call.endByCandidate()}
            >
              End interview
            </button>
          </>
        ) : (
          <>
            <Control
              icon={RotateCcw}
              label="Repeat that"
              onClick={() => call.repeat()}
              disabled={!live}
            />
            <Control
              icon={Hand}
              label="Give me a moment"
              onClick={() => call.askForMoment()}
              disabled={!live || snap.thinking}
            />
            <Control
              icon={snap.muted ? MicOff : Mic}
              label={snap.muted ? "Unmute" : "Mute"}
              onClick={() => call.setMuted(!snap.muted)}
              disabled={!live}
              active={snap.muted}
            />
            <Control
              icon={ScrollText}
              label="Transcript"
              onClick={onTranscript}
              disabled={false}
              active={transcriptOpen}
            />
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              disabled={snap.status === "ending"}
              className={cn(CONTROL, "bg-rose-600 text-white hover:bg-rose-700 sm:ml-4")}
            >
              <PhoneOff className="size-4" aria-hidden="true" /> End
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Solid at all times: while reconnecting they just don't respond, instead of fading out. */
const CONTROL =
  "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed";
const IDLE = "bg-neutral-100 text-neutral-900 hover:bg-neutral-200";

function Control({
  icon: Icon,
  label,
  onClick,
  disabled,
  active = false,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={cn(CONTROL, active ? "bg-primary text-white hover:bg-neutral-800" : IDLE)}
    >
      <Icon className="size-4" aria-hidden="true" /> {label}
    </button>
  );
}
