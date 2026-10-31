"use client";

import { ArrowRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PublicLevelQuestion } from "@/lib/coach/types";
import { cn } from "@/lib/utils";
import { answerLevel } from "../actions";

const TIER = { 1: "Basics", 2: "Applied", 3: "Interview level" } as const;

export function LevelCheck({
  goalId,
  first,
  asked: initialAsked,
  total,
}: {
  goalId: string;
  first: PublicLevelQuestion;
  asked: number;
  total: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(first);
  const [asked, setAsked] = useState(initialAsked);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{
    correct: boolean;
    answer: number;
    explanation: string;
  } | null>(null);
  const [next, setNext] = useState<PublicLevelQuestion | null | undefined>(undefined);
  const [pending, start] = useTransition();

  function submit(choice: number) {
    if (result || pending) return;
    setPicked(choice);
    start(async () => {
      const r = await answerLevel(goalId, q.id, choice);
      if (!r.ok) {
        toast.error(r.error);
        setPicked(null);
        return;
      }
      setResult({ correct: r.correct, answer: r.answer, explanation: r.explanation });
      setAsked(r.asked);
      setNext(r.next);
    });
  }

  function advance() {
    if (next === null) {
      router.refresh();
      return;
    }
    if (next) {
      setQ(next);
      setPicked(null);
      setResult(null);
      setNext(undefined);
    }
  }

  return (
    <div className="surface p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <Badge variant="secondary" className="font-medium">
          {TIER[q.tier as 1 | 2 | 3]} · {q.topic}
        </Badge>
        <span className="text-sm tabular-nums text-muted-foreground">
          {Math.min(asked + (result ? 0 : 1), total)} / {total}
        </span>
      </div>
      <Progress value={(asked / total) * 100} className="mt-4 h-1.5" />
      <div key={q.id} className="animate-rise">
        <h2 className="mt-6 text-lg font-semibold leading-snug">{q.question}</h2>
        {q.snippet && (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-white/90">
            {q.snippet}
          </pre>
        )}
        <div className="mt-5 grid gap-2.5">
          {q.options.map((o, i) => {
            const isAnswer = result && i === result.answer;
            const isWrongPick = result && picked === i && !result.correct;
            return (
              <button
                key={o}
                type="button"
                disabled={Boolean(result) || pending}
                onClick={() => submit(i)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-[15px] transition-all",
                  !result && "hover:border-primary/50 hover:bg-secondary/50",
                  picked === i && !result && "border-primary bg-secondary",
                  isAnswer && "border-success bg-success/10",
                  isWrongPick && "border-destructive/50 bg-destructive/5",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold text-muted-foreground">
                  {pending && picked === i ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    String.fromCharCode(65 + i)
                  )}
                </span>
                <span className="flex-1">{o}</span>
                {isAnswer && <CheckCircle2 className="size-5 text-success" />}
                {isWrongPick && <XCircle className="size-5 text-destructive" />}
              </button>
            );
          })}
        </div>
        {result && (
          <div className="animate-rise mt-5 flex flex-col gap-4 rounded-xl bg-muted/60 p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm">
              <span
                className={cn(
                  "font-semibold",
                  result.correct ? "text-success" : "text-destructive",
                )}
              >
                {result.correct ? "Right. " : "Not quite. "}
              </span>
              {result.explanation}
            </p>
            <Button onClick={advance} className="gap-2" disabled={next === undefined}>
              {next === null ? "See my level" : result.correct ? "Harder one" : "Next"}{" "}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
