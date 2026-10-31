import { ArrowRight, CheckCircle2, CircleAlert, Quote, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { PageHeader, Panel, ScoreBar } from "@/components/coach/section";
import { VerdictPlayer } from "@/components/coach/verdict-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { weakestRound } from "@/lib/coach/readiness";
import { THINKING } from "@/lib/interview";
import { SLOT_INFO } from "@/lib/kit";
import { requireSession } from "@/lib/session";
import { getGoal, mockState, readinessHistory } from "@/server/goals";
import { TooShort } from "../too-short";

const LEVEL = ["", "Weak", "Developing", "Solid", "Strong"];

export default async function ReportPage({ params }: PageProps<"/g/[id]/report">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const state = await mockState(goal.id, "baseline");
  if (state.stage === "scoring")
    return (
      <Pending
        title="Scoring your interview"
        steps={[
          "Reading your transcript…",
          "Quoting your own words as evidence…",
          "Checking which problems you caught…",
          "Working out readiness per round…",
        ]}
      />
    );
  if (state.stage === "incomplete")
    return (
      <TooShort goalId={goal.id} kind="baseline" seconds={state.seconds} words={state.words} />
    );
  if (state.stage !== "done") redirect(`/g/${goal.id}/mock`);
  const judged = state.report.judged;
  if (!judged) redirect(`/g/${goal.id}/mock`);
  const history = await readinessHistory(goal.id);
  const latest = history.at(-1);
  const weakest = latest ? weakestRound(latest.rounds) : null;
  const skills = [...judged.skills].sort((a, b) => a.score - b.score);
  const name = (sid: string) => THINKING.find((t) => t.id === sid)?.name ?? sid;
  const scoredRole = judged.roleSkills.filter((r) => r.score !== null);
  const notShown = judged.roleSkills.filter((r) => r.score === null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Readiness report"
        title={`How ready you are for ${goal.companyName}`}
        actions={
          <Button asChild size="lg" className="gap-2">
            <Link href={`/g/${goal.id}/plan`}>
              Fix it in days <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      <section className="surface relative overflow-hidden p-6 sm:p-8">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3">
            <div className="font-display text-6xl font-semibold tabular-nums tracking-tight">
              {latest?.overall ?? "—"}%
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              ready today
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Your coach's verdict
            </div>
            <p className="font-display text-[19px] leading-relaxed">{judged.overall.summary}</p>
            {weakest && (
              <p className="mt-3 text-sm text-muted-foreground">
                The round most likely to cost you the offer:{" "}
                <span className="font-semibold text-foreground">{weakest.title}</span> (
                {weakest.score}%).
              </p>
            )}
            <div className="mt-5">
              <VerdictPlayer src={`/api/goals/${goal.id}/verdict`} />
            </div>
          </div>
        </div>
      </section>

      {latest && (
        <Panel
          title="Every round"
          description="Combines your level check with how you reasoned in the interview."
        >
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {latest.rounds.map((r) => (
              <div key={r.title}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-medium">{r.title}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.measured === false ? "after your mock" : `${r.score}%`}
                  </span>
                </div>
                {r.measured === false ? (
                  <div className="h-2 rounded-full border border-dashed border-border" />
                ) : (
                  <ScoreBar value={r.score} />
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" />
              What you did well
            </span>
          }
        >
          <ul className="space-y-2.5 text-sm">
            {judged.overall.strengths.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                {s}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <CircleAlert className="size-4 text-warning" />
              What's holding you back
            </span>
          }
        >
          <ul className="space-y-2.5 text-sm">
            {judged.overall.concerns.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                {s}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Your judgment, skill by skill"
        description="Weakest first. Every score is backed by what you actually said."
      >
        <div className="space-y-5">
          {skills.map((s) => (
            <div key={s.id} className="rounded-xl border border-border/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{name(s.id)}</div>
                <Badge variant={s.score >= 3 ? "default" : "secondary"} className="font-medium">
                  {LEVEL[s.score]} · {s.score}/4
                </Badge>
              </div>
              <ScoreBar value={((s.score - 1) / 3) * 100} className="mt-2.5" />
              <p className="mt-3 text-sm text-muted-foreground">{s.summary}</p>
              {s.evidence.slice(0, 2).map((e) => (
                <blockquote
                  key={e.seq}
                  className="mt-2 flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm italic"
                >
                  <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" />"{e.quote}"
                </blockquote>
              ))}
            </div>
          ))}
        </div>
      </Panel>

      {judged.cases.length > 0 && (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Search className="size-4 text-primary" />
              What you caught in the cases
            </span>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            {judged.cases.map((c) => {
              const found = c.issues.filter((i) => i.status === "found").length;
              return (
                <div key={c.slot} className="rounded-xl border border-border/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {SLOT_INFO[c.slot].label}
                  </div>
                  {c.issues.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                      {c.issues.map((i) =>
                        i.status === "found" ? (
                          <CheckCircle2 key={i.id} className="size-4 text-success" />
                        ) : i.status === "hinted" ? (
                          <CircleAlert key={i.id} className="size-4 text-warning" />
                        ) : (
                          <XCircle key={i.id} className="size-4 text-destructive/70" />
                        ),
                      )}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {found} of {c.issues.length} found unprompted
                      </span>
                    </div>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">{c.summary}</p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {(scoredRole.length > 0 || notShown.length > 0) && (
        <Panel
          title="The job's own skills"
          description="What the interview showed about the skills in the job description."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {scoredRole.map((r) => (
              <div key={r.id} className="rounded-xl border border-border/80 p-3.5">
                <div className="flex justify-between text-sm font-medium">
                  <span className="capitalize">{r.id.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{r.score}/4</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p>
              </div>
            ))}
            {notShown.map((r) => (
              <div key={r.id} className="rounded-xl border border-dashed border-border p-3.5">
                <div className="text-sm font-medium capitalize">{r.id.replace(/_/g, " ")}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your resume claims it; the interview didn't show it yet.
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
