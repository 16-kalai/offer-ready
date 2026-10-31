import { ArrowRight, Gauge } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { RetryCard } from "@/components/coach/retry";
import { PageHeader, Panel } from "@/components/coach/section";
import { Button } from "@/components/ui/button";
import { LEVEL_QUESTIONS, levelBand, pickNext } from "@/lib/coach/level";
import { requireSession } from "@/lib/session";
import { getGoal, getIntel, getLevelCheck } from "@/server/goals";
import { retryLevel } from "../actions";
import { LevelCheck } from "./level-check";

const BAND = {
  fresher: {
    label: "Foundations",
    note: "Your mock will start with concrete, visible problems and build up.",
  },
  mid: { label: "Working level", note: "Your mock will mix realistic problems with trade-offs." },
  senior: {
    label: "Interview level",
    note: "Your mock will be subtle: business trade-offs and second-order effects.",
  },
};

export default async function CheckPage({ params }: PageProps<"/g/[id]/check">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const [check, intel] = await Promise.all([getLevelCheck(goal.id), getIntel(goal)]);

  if (check?.status === "failed")
    return (
      <RetryCard
        title="Couldn't write your level check"
        body="The AI was busy. Try again."
        action={retryLevel.bind(null, goal.id)}
      />
    );
  if (!check?.questions)
    return (
      <Pending
        title="Writing your level check"
        steps={
          intel?.status === "ready"
            ? [
                "Reading the rounds we found…",
                "Writing questions from basics to interview level…",
                "Checking every answer key…",
              ]
            : [
                `First, researching how ${goal.companyName} hires…`,
                "Then we'll write questions that match the real rounds…",
              ]
        }
      />
    );

  if (check.completedAt && check.score !== null) {
    const band = BAND[levelBand(check.score)];
    const right = check.answers.filter((a) => a.correct).length;
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Level check" title="Your level, measured" />
        <Panel>
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="grid size-20 place-items-center rounded-2xl bg-secondary">
              <Gauge className="size-9 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-2xl font-semibold tracking-tight">{band.label}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {right} of {check.answers.length} right, reaching tier{" "}
                {Math.max(...check.answers.filter((a) => a.correct).map((a) => a.tier), 0)} of 3.{" "}
                {band.note}
              </p>
            </div>
            <Button asChild size="lg" className="gap-2">
              <Link href={`/g/${goal.id}/mock`}>
                Go to mock interview <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 flex gap-1.5">
            {check.answers.map((a) => (
              <div
                key={a.id}
                className={`h-2 flex-1 rounded-full ${a.correct ? "bg-success" : "bg-destructive/60"}`}
                title={`Tier ${a.tier}`}
              />
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  const next = pickNext(check.questions, check.answers);
  if (!next) return null;
  const { answer: _a, explanation: _e, ...first } = next;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Level check" title="Let's find your real level">
        {LEVEL_QUESTIONS} questions. They start with basics and climb to the level of{" "}
        {goal.companyName}'s real rounds. Get one right and the next one gets harder.
      </PageHeader>
      <LevelCheck
        goalId={goal.id}
        first={first}
        asked={check.answers.length}
        total={LEVEL_QUESTIONS}
      />
    </div>
  );
}
