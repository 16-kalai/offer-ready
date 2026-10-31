import { ArrowRight, BadgeCheck, MoveRight, Quote, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { PageHeader, Panel } from "@/components/coach/section";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { THINKING } from "@/lib/interview";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getGoal, getProject, mockState, readinessHistory } from "@/server/goals";
import { EnterRoomButton, PrepareButton } from "../mock-gate";
import { TooShort } from "../too-short";

export default async function DefensePage({ params }: PageProps<"/g/[id]/defense">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const project = await getProject(goal.id);
  if (!project) redirect(`/g/${goal.id}/proof`);
  const [state, baseline, history] = await Promise.all([
    mockState(goal.id, "defense"),
    mockState(goal.id, "baseline"),
    readinessHistory(goal.id),
  ]);

  if (state.stage === "preparing")
    return (
      <Pending
        title="Writing your defense interview"
        steps={[
          "Reading your project and the decisions you logged…",
          "Writing questions that dig into your choices…",
          "Preparing a twist that changes the constraints…",
        ]}
      />
    );
  if (state.stage === "scoring")
    return (
      <Pending
        title="Scoring your defense"
        steps={[
          "Reading your answers…",
          "Comparing with your first mock…",
          "Deciding if your Proof Page unlocks…",
        ]}
      />
    );

  if (state.stage === "incomplete")
    return <TooShort goalId={goal.id} kind="defense" seconds={state.seconds} words={state.words} />;

  if (
    state.stage === "done" &&
    state.report.judged &&
    baseline.stage === "done" &&
    baseline.report.judged
  ) {
    const before = baseline.report.judged;
    const after = state.report.judged;
    const passed = after.overall.recommendation !== "decline";
    // "Before" is the first mock, not the level check's early read.
    const first = (history.find((h) => h.source === "baseline") ?? history[0])?.overall ?? 0;
    const now = history.at(-1)?.overall ?? 0;
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Defense result"
          title={
            passed
              ? "You defended it. Your Proof Page is unlocked."
              : "Not yet. Here's what to tighten."
          }
          actions={
            passed && (
              <Button asChild size="lg" className="gap-2">
                <Link href={`/g/${goal.id}/launch`}>
                  Launch it <ArrowRight className="size-4" />
                </Link>
              </Button>
            )
          }
        >
          {after.overall.summary}
        </PageHeader>
        <section className="surface relative overflow-hidden p-6 sm:p-8">
          <div className="bg-aurora pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex flex-wrap items-center justify-center gap-6 text-center sm:gap-10">
            <div>
              <div className="text-sm text-muted-foreground">Day 0</div>
              <div className="text-5xl font-semibold tabular-nums tracking-tight text-muted-foreground">
                {first}%
              </div>
            </div>
            <MoveRight className="size-8 text-primary" />
            <div>
              <div className="text-sm text-muted-foreground">Today</div>
              <div className="text-gradient text-6xl font-semibold tabular-nums tracking-tight">
                {now}%
              </div>
            </div>
            {passed && (
              <Badge className="gap-1.5 bg-proof px-3 py-1.5 text-sm font-semibold text-proof-foreground">
                <BadgeCheck className="size-4" /> Defended on record
              </Badge>
            )}
          </div>
        </section>
        <Panel
          title="Then and now"
          description="The same five skills, mock 1 versus your defense, in your own words."
        >
          <div className="space-y-4">
            {THINKING.map((t) => {
              const b = before.skills.find((s) => s.id === t.id);
              const a = after.skills.find((s) => s.id === t.id);
              if (!a || !b) return null;
              const delta = a.score - b.score;
              return (
                <div key={t.id} className="rounded-xl border border-border/80 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.name}</span>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        delta > 0
                          ? "text-success"
                          : delta < 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {b.score} → {a.score}
                      {delta > 0 ? ` (+${delta})` : ""}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <blockquote className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">
                      <Quote className="mt-0.5 size-3.5 shrink-0" />"{b.evidence[0]?.quote}"
                    </blockquote>
                    <blockquote className="flex gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-sm italic">
                      <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" />"
                      {a.evidence[0]?.quote}"
                    </blockquote>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        {!passed && (
          <div className="flex justify-center">
            <PrepareButton goalId={goal.id} kind="defense" label="Defend it again" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mock interview 2" title="Defend your project, on record">
        The interviewer has read your project and the decisions you logged. Expect "why this, not
        that", and a twist that changes the constraints. Pass, and your Proof Page unlocks.
      </PageHeader>
      <section className="surface relative overflow-hidden p-8 sm:p-10">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex flex-col items-center text-center">
          <VoiceOrb
            size={120}
            state={state.stage === "ready" || state.stage === "live" ? "speaking" : "idle"}
          />
          <h2 className="mt-6 max-w-xl text-xl font-semibold tracking-tight">
            {project.idea.headline}
          </h2>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" /> {project.trail.length} logged decision
            {project.trail.length === 1 ? "" : "s"} · {project.milestonesDone.length}/
            {project.idea.milestones.length} milestones
          </p>
          <div className="mt-7">
            {state.stage === "ready" || state.stage === "live" ? (
              <EnterRoomButton
                goalId={goal.id}
                kind="defense"
                label={state.stage === "live" ? "Rejoin defense" : "Start my defense"}
              />
            ) : (
              <PrepareButton
                goalId={goal.id}
                kind="defense"
                label={state.stage === "none" ? "Prepare my defense" : "Write a fresh defense"}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
