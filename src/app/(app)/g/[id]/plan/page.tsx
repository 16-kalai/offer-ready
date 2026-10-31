import { ArrowRight, Check, Code2, Dumbbell, Hammer, Mic, Target } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { RetryCard } from "@/components/coach/retry";
import { PageHeader, Panel } from "@/components/coach/section";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getDays, getGoal, getPlan, mockState } from "@/server/goals";
import { retryPlan } from "../actions";

const KIND = {
  practice: { icon: Dumbbell, label: "Practice" },
  build: { icon: Hammer, label: "Build" },
  mock: { icon: Mic, label: "Defense mock" },
};

const leetcode = (pattern: string) =>
  `https://leetcode.com/problemset/?search=${encodeURIComponent(pattern)}`;

export default async function PlanPage({ params }: PageProps<"/g/[id]/plan">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const [baseline, row, days] = await Promise.all([
    mockState(goal.id, "baseline"),
    getPlan(goal.id),
    getDays(goal.id),
  ]);
  if (baseline.stage !== "done") redirect(`/g/${goal.id}/mock`);
  if (row?.status === "failed")
    return (
      <RetryCard
        title="Couldn't write your plan"
        body="The AI was busy. Try again."
        action={retryPlan.bind(null, goal.id)}
      />
    );
  if (!row?.plan)
    return (
      <Pending
        title="Writing your training plan"
        steps={[
          "Finding the gap that costs the offer…",
          "Fitting the plan to your interview date…",
          "Leaving room to build your proof…",
          "Writing day 1…",
        ]}
      />
    );
  const plan = row.plan;
  const done = new Set(days.filter((d) => d.completedAt).map((d) => d.day));
  const today = plan.days.find((d) => !done.has(d.day))?.day ?? null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${plan.days.length}-day plan`} title={plan.headline}>
        Short on purpose: plans that fit in days get finished. Miss a day and the plan simply moves.
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        {plan.focus.map((f) => (
          <div key={f.skill} className="surface p-5">
            <Target className="size-5 text-primary" />
            <div className="mt-3 font-semibold">{f.skill}</div>
            <p className="mt-1 text-sm text-muted-foreground">{f.why}</p>
          </div>
        ))}
      </div>

      <Panel title="Day by day">
        <ol className="space-y-2.5">
          {plan.days.map((d) => {
            const k = KIND[d.kind];
            const isDone = done.has(d.day);
            const isToday = d.day === today;
            const href =
              d.kind === "practice"
                ? `/g/${goal.id}/plan/${d.day}`
                : d.kind === "build"
                  ? `/g/${goal.id}/proof`
                  : `/g/${goal.id}/defense`;
            return (
              <li key={d.day}>
                <Link
                  href={href}
                  className={cn(
                    "group flex items-center gap-4 rounded-xl border p-4 transition-all hover:border-primary/40",
                    isToday ? "border-primary/40 bg-secondary/60 shadow-sm" : "border-border/80",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold",
                      isDone
                        ? "bg-success/15 text-success"
                        : isToday
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="size-4" /> : d.day}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.title}</span>
                      <Badge variant="outline" className="gap-1 font-normal">
                        <k.icon className="size-3" /> {k.label}
                      </Badge>
                      {isToday && <Badge className="font-medium">Today</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{d.goal}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ol>
      </Panel>

      {plan.practice.length > 0 && (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Code2 className="size-4 text-primary" />
              For the coding rounds
            </span>
          }
          description="Practise these patterns on LeetCode. We don't rebuild what already works; we tell you exactly what to drill."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.practice.map((p) => (
              <a
                key={p.pattern}
                href={leetcode(p.pattern)}
                target="_blank"
                rel="noreferrer"
                className="group rounded-xl border border-border/80 p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium group-hover:text-primary">{p.pattern}</span>
                  <Badge variant="secondary">{p.count} problems</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.why}</p>
              </a>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
