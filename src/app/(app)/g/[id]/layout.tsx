import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getDays, getGoal } from "@/server/goals";
import { journey } from "@/server/journey";
import { GoalHero, StepBar } from "./goal-nav";

/** Background work queued here runs after the response (inline jobs); give it room. */
export const maxDuration = 300;

/**
 * One goal's frame: a dark hero with the target job, readiness and the three
 * phases (Know, Train, Prove); a slim bar with the current phase's steps; then
 * the step itself, full width.
 */
export default async function GoalLayout({ children, params }: LayoutProps<"/g/[id]">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const j = await journey(goal);
  const daysLeft = goal.interviewDate
    ? Math.max(0, Math.ceil((goal.interviewDate.getTime() - Date.now()) / 86_400_000))
    : null;
  const early = j.readiness?.rounds.some((r) => r.measured === false) ?? false;
  const current = j.phases.find((p) => p.status === "current")?.key ?? "prove";
  const done = new Set(
    (j.plan?.plan ? await getDays(goal.id) : []).filter((d) => d.completedAt).map((d) => d.day),
  );
  const days = (j.plan?.plan?.days ?? []).map((d) => ({
    day: d.day,
    done: done.has(d.day),
    href:
      d.kind === "practice"
        ? `/g/${goal.id}/plan/${d.day}`
        : d.kind === "build"
          ? `/g/${goal.id}/proof`
          : `/g/${goal.id}/defense`,
  }));

  return (
    <>
      <GoalHero
        goalId={goal.id}
        company={goal.companyName}
        role={goal.roleTitle}
        daysLeft={daysLeft}
        minutesPerDay={goal.minutesPerDay}
        overall={j.readiness?.overall ?? null}
        early={early}
        phases={j.phases}
        current={current}
      />
      <StepBar goalId={goal.id} phases={j.phases} current={current} days={days} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </>
  );
}
