"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Keyboard,
  Loader2,
  Mic,
  Quote,
  Square,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRecorder } from "@/components/coach/use-recorder";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DrillResult, PublicDrill } from "@/lib/coach/types";
import { cn } from "@/lib/utils";
import { completeDay, openDay, submitDrill, submitSpoken } from "../../actions";

type Attempt = { result: DrillResult; score: number };

export function DayOpener({ goalId, day }: { goalId: string; day: number }) {
  const router = useRouter();
  useEffect(() => {
    openDay(goalId, day).then(() => router.refresh());
  }, [goalId, day, router]);
  return (
    <div className="surface grid place-items-center py-16">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

/** Speak or type an answer. Speaking is the default: interviews are spoken. */
function AnswerBox({
  placeholder,
  busy,
  onSubmit,
  cta,
  disabled,
}: {
  placeholder: string;
  busy: boolean;
  cta: string;
  disabled?: boolean;
  onSubmit: (input: { text?: string; audio?: string; mimeType?: string }) => void;
}) {
  const rec = useRecorder();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const mm = `${Math.floor(rec.seconds / 60)}:${String(rec.seconds % 60).padStart(2, "0")}`;
  if (typing)
    return (
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="min-h-[96px]"
        />
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setTyping(false)}>
            <Mic className="size-3.5" /> Speak instead
          </Button>
          <Button
            size="sm"
            disabled={busy || disabled || text.trim().length < 3}
            onClick={() => onSubmit({ text })}
            className="gap-1.5"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />} {cta}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      {rec.state === "recording" ? (
        <>
          <div className="relative">
            <VoiceOrb size={44} state="listening" />
            <span
              className="absolute inset-0 rounded-full ring-2 ring-proof/60"
              style={{ transform: `scale(${1 + rec.level * 0.6})` }}
            />
          </div>
          <span className="font-mono text-sm tabular-nums">{mm}</span>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              const r = await rec.stop();
              if (!r) {
                toast.error("We didn't catch that. Try again, a little closer to the mic.");
                return;
              }
              onSubmit(r);
            }}
          >
            <Square className="size-3 fill-current" /> Done
          </Button>
        </>
      ) : (
        <Button size="sm" className="gap-1.5" disabled={busy || disabled} onClick={rec.start}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5" />}
          {busy ? "Listening back…" : "Say why"}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setTyping(true)}
        disabled={busy}
      >
        <Keyboard className="size-3.5" /> Type instead
      </Button>
      {rec.state === "denied" && (
        <span className="text-xs text-destructive">Mic blocked. Allow it, or type.</span>
      )}
    </div>
  );
}

function DrillCard({
  goalId,
  day,
  drill,
  index,
  initial,
  onScored,
}: {
  goalId: string;
  day: number;
  drill: PublicDrill;
  index: number;
  initial?: Attempt;
  onScored: (a: Attempt) => void;
}) {
  const [choice, setChoice] = useState<"ship" | "skip" | null>(initial?.result.choice ?? null);
  const [attempt, setAttempt] = useState<Attempt | undefined>(initial);
  const [busy, start] = useTransition();
  function submit(input: { text?: string; audio?: string; mimeType?: string }) {
    if (!choice) return;
    start(async () => {
      const r = await submitDrill({
        goalId,
        day,
        drillId: drill.id,
        choice,
        reason: input.text,
        audio: input.audio,
        mimeType: input.mimeType,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const a = { result: r.result, score: r.score };
      setAttempt(a);
      onScored(a);
    });
  }
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 place-items-center rounded-md bg-secondary text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <span className="font-medium">{drill.title}</span>
        </div>
        <Badge variant="outline" className="font-normal">
          AI-made
        </Badge>
      </div>
      <div className="p-5">
        <p className="text-sm text-muted-foreground">{drill.context}</p>
        {drill.format === "table" ? (
          <div className="mt-3 overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-[13px]">
              <tbody>
                {drill.content
                  .split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <tr
                      key={`${i}-${line}`}
                      className={cn(i === 0 ? "bg-muted/70 font-medium" : "border-t")}
                    >
                      {line.split("|").map((cell, j) => (
                        <td key={`${j}-${cell}`} className="px-3 py-2 tabular-nums">
                          {cell.trim()}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <pre
            className={cn(
              "mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl p-4 text-[13px] leading-relaxed",
              drill.format === "code"
                ? "bg-ink font-mono text-white/90"
                : "bg-muted/60 font-sans text-foreground",
            )}
          >
            {drill.content}
          </pre>
        )}

        {!attempt ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {(["ship", "skip"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChoice(c)}
                  className={cn(
                    "h-12 rounded-xl border text-[15px] font-semibold transition-all",
                    choice === c
                      ? c === "ship"
                        ? "border-success bg-success text-white shadow-sm"
                        : "border-destructive bg-destructive text-white shadow-sm"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  {c === "ship" ? "Ship it" : "Skip it"}
                </button>
              ))}
            </div>
            {choice && (
              <div className="animate-rise">
                <p className="mb-2 text-sm font-medium">Why? The reason is what's scored.</p>
                <AnswerBox
                  placeholder="What did you check, and what did you find?"
                  busy={busy}
                  cta="Submit"
                  onSubmit={submit}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="animate-rise mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {attempt.result.correctCall ? (
                <Badge className="gap-1 bg-success text-white">
                  <CheckCircle2 className="size-3.5" /> Right call
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="size-3.5" /> Wrong call
                </Badge>
              )}
              {attempt.result.namedIssue ? (
                <Badge variant="secondary" className="gap-1">
                  <Check className="size-3.5" /> Named the real issue
                </Badge>
              ) : (
                <Badge variant="outline">Reason missed the issue</Badge>
              )}
              <span className="ml-auto text-sm font-semibold tabular-nums">
                {Math.round(attempt.score * 10)}/10
              </span>
            </div>
            <blockquote className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">
              <Quote className="mt-0.5 size-3.5 shrink-0" />"{attempt.result.answer}"
            </blockquote>
            <p className="text-sm">{attempt.result.feedback}</p>
            {attempt.result.reveal && (
              <p className="rounded-lg border border-primary/15 bg-secondary/50 px-3 py-2 text-sm">
                <span className="font-semibold">The answer: </span>
                {attempt.result.reveal}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function DaySession({
  goalId,
  day,
  drills,
  spoken,
  initial,
  completed,
}: {
  goalId: string;
  day: number;
  drills: PublicDrill[];
  spoken: { question: string; lookFor: string[] };
  initial: Record<string, Attempt>;
  completed: boolean;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, Attempt>>(initial);
  const [spokenBusy, startSpoken] = useTransition();
  const [finishing, startFinish] = useTransition();
  const [finished, setFinished] = useState<number | null>(completed ? -1 : null);
  const spokenAttempt = scores.spoken;
  const doneCount = drills.filter((d) => scores[d.id]).length + (spokenAttempt ? 1 : 0);
  const total = drills.length + 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Ship it or skip it?</h2>
        <span className="text-sm text-muted-foreground">
          {doneCount} of {total} done
        </span>
      </div>
      {drills.map((d, i) => (
        <DrillCard
          key={d.id}
          goalId={goalId}
          day={day}
          drill={d}
          index={i}
          initial={scores[d.id]}
          onScored={(a) => setScores((s) => ({ ...s, [d.id]: a }))}
        />
      ))}

      <div className="surface relative overflow-hidden p-6">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <VoiceOrb size={40} state={spokenBusy ? "thinking" : "speaking"} />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Say it out loud · about a minute
              </div>
              <h3 className="mt-0.5 font-semibold">{spoken.question}</h3>
            </div>
          </div>
          {!spokenAttempt ? (
            <div className="mt-5">
              <AnswerBox
                placeholder="Answer as you would in the interview."
                busy={spokenBusy}
                cta="Score my answer"
                onSubmit={(input) =>
                  startSpoken(async () => {
                    const r = await submitSpoken({ goalId, day, ...input });
                    if (!r.ok) {
                      toast.error(r.error);
                      return;
                    }
                    setScores((s) => ({ ...s, spoken: { result: r.result, score: r.score } }));
                  })
                }
              />
            </div>
          ) : (
            <div className="animate-rise mt-5 space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="font-medium">{Math.round(spokenAttempt.score * 3 + 1)}/4</Badge>
                <span className="text-sm">{spokenAttempt.result.feedback}</span>
              </div>
              {spokenAttempt.result.quote && (
                <blockquote className="flex gap-2 rounded-lg bg-background/80 px-3 py-2 text-sm italic">
                  <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" />"
                  {spokenAttempt.result.quote}"
                </blockquote>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {!!spokenAttempt.result.strengths?.length && (
                  <div className="rounded-xl bg-success/10 p-3 text-sm">
                    <div className="font-medium text-success">Keep</div>
                    {spokenAttempt.result.strengths.map((s) => (
                      <p key={s} className="mt-1">
                        {s}
                      </p>
                    ))}
                  </div>
                )}
                {!!spokenAttempt.result.improve?.length && (
                  <div className="rounded-xl bg-warning/15 p-3 text-sm">
                    <div className="font-medium">Next time</div>
                    {spokenAttempt.result.improve.map((s) => (
                      <p key={s} className="mt-1">
                        {s}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="surface flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          {finished !== null ? (
            <p className="font-medium">
              {finished >= 0 ? (
                <>
                  Day {day} done. Readiness is now <span className="text-primary">{finished}%</span>
                  .
                </>
              ) : (
                <>Day {day} is done.</>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Finish all {total} to update your readiness.
            </p>
          )}
        </div>
        {finished !== null ? (
          <Button asChild className="gap-2">
            <Link href={`/g/${goalId}/plan`}>
              Back to plan <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button
            className="gap-2"
            disabled={doneCount < total || finishing}
            onClick={() =>
              startFinish(async () => {
                const r = await completeDay(goalId, day);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                setFinished(r.overall);
                router.refresh();
              })
            }
          >
            {finishing && <Loader2 className="size-4 animate-spin" />} Finish day {day}
          </Button>
        )}
      </div>
    </div>
  );
}
