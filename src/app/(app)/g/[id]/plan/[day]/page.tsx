import { Lightbulb } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { RetryCard } from "@/components/coach/retry";
import { PageHeader } from "@/components/coach/section";
import type { PublicDrill } from "@/lib/coach/types";
import { requireSession } from "@/lib/session";
import { getAttempts, getDays, getGoal, getPlan } from "@/server/goals";
import { openDay } from "../../actions";
import { DayOpener, DaySession } from "./day-session";

export default async function DayPage({ params }: PageProps<"/g/[id]/plan/[day]">) {
  const { id, day: dayParam } = await params;
  const day = Number(dayParam);
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal || !Number.isInteger(day)) notFound();
  const plan = await getPlan(goal.id);
  const spec = plan?.plan?.days.find((d) => d.day === day);
  if (!spec) redirect(`/g/${goal.id}/plan`);
  const row = (await getDays(goal.id)).find((d) => d.day === day);

  if (!row) return <DayOpener goalId={goal.id} day={day} />;
  if (row.status === "failed")
    return (
      <RetryCard
        title="Couldn't write today's practice"
        body="The AI was busy. Try again."
        action={openDay.bind(null, goal.id, day)}
      />
    );
  if (!row.content)
    return (
      <Pending
        title={`Writing day ${day}: ${spec.title}`}
        steps={[
          "Picking the one idea that fixes the gap…",
          "Writing work an AI made for this role…",
          "Hiding one real flaw in two of them…",
          "Writing your spoken question…",
        ]}
      />
    );
  const c = row.content;
  const attempts = await getAttempts(goal.id, day);
  const latest = Object.fromEntries(
    attempts.map((a) => [a.item, { result: a.result, score: a.score }]),
  );
  const drills: PublicDrill[] = c.drills.map(
    ({ verdict: _v, flaw: _f, explanation: _e, nudge: _n, ...d }) => d,
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Day ${day} · ${spec.focusSkill}`} title={spec.title}>
        {spec.goal}
      </PageHeader>
      <section className="surface relative overflow-hidden p-6">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-[oklch(0.6_0.2_300)]" />
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary">
            <Lightbulb className="size-5 text-primary" />
          </span>
          <div>
            <h2 className="font-semibold">{c.concept.title}</h2>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
              {c.concept.body}
            </p>
            <p className="mt-3 inline-flex rounded-lg bg-proof/25 px-3 py-1.5 text-sm font-medium text-proof-foreground">
              In the interview: {c.concept.move}
            </p>
          </div>
        </div>
      </section>
      <DaySession
        goalId={goal.id}
        day={day}
        drills={drills}
        spoken={c.spoken}
        initial={latest}
        completed={Boolean(row.completedAt)}
      />
    </div>
  );
}
