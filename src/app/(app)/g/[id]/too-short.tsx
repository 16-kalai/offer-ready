import { Clock, MessageSquareText } from "lucide-react";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { PrepareButton } from "./mock-gate";

/** An interview that ended before there was enough to score: say so plainly, and offer a fresh one. */
export function TooShort({
  goalId,
  kind,
  seconds,
  words,
}: {
  goalId: string;
  kind: "baseline" | "defense";
  seconds: number | null;
  words: number;
}) {
  const time =
    seconds === null
      ? null
      : seconds < 60
        ? `${seconds} seconds`
        : `${Math.round(seconds / 60)} min`;
  return (
    <section className="surface relative overflow-hidden p-8 sm:p-10">
      <div className="bg-aurora pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative flex flex-col items-center text-center">
        <VoiceOrb size={96} state="idle" />
        <div className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          No report this time
        </div>
        <h2 className="mt-2 max-w-lg font-display text-[28px] font-semibold leading-tight tracking-tight">
          That interview was too short to score fairly
        </h2>
        <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
          We only score when you've answered a few questions, so your readiness is based on real
          evidence, never a guess. Nothing counts against you.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
          {time && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
              <Clock className="size-3.5" /> Lasted {time}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1">
            <MessageSquareText className="size-3.5" /> {words} word{words === 1 ? "" : "s"} answered
          </span>
        </div>
        <div className="mt-7">
          <PrepareButton goalId={goalId} kind={kind} label="Start a fresh interview" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          A new set of questions takes about a minute to write.
        </p>
      </div>
    </section>
  );
}
