import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  companyIntel,
  goals,
  levelChecks,
  mocks,
  planDays,
  proofIdeas,
  proofPacks,
  trainingPlans,
} from "@/db/schema";
import { planLength } from "@/lib/coach/readiness";
import type { CompanyIntel } from "@/lib/coach/types";
import {
  researchCompany,
  writeDay,
  writeIdeas,
  writeLaunchKit,
  writeLevelCheck,
  writeTrainingPlan,
} from "@/server/ai/coach";
import {
  gapsFrom,
  getIntel,
  getPlan,
  getProject,
  latestReport,
  mockState,
  recordReadiness,
} from "@/server/goals";
import { type CoachJob, enqueueCoach } from "@/server/queue";

/**
 * The coach's background writing. Each job is idempotent: finished work is
 * kept, and a retry rewrites only what isn't ready. Runs in the worker.
 */

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function goalById(id: string) {
  const [goal] = await db().select().from(goals).where(eq(goals.id, id));
  return goal ?? null;
}

const context = (g: NonNullable<Awaited<ReturnType<typeof goalById>>>) => ({
  companyName: g.companyName,
  roleTitle: g.roleTitle,
  jobDescription: g.jobDescription,
  resume: g.resumeText,
  level: g.level,
});

export async function runCoachJob(job: CoachJob, id: string, day?: number): Promise<void> {
  switch (job) {
    case "research":
      return research(id);
    case "level":
      return level(id);
    case "plan":
      return plan(id);
    case "day":
      return writeDayJob(id, day ?? 1);
    case "ideas":
      return ideas(id);
    case "launch":
      return launch(id);
  }
}

/** Out of retries: show the step as failed (with a retry button) instead of spinning forever. */
export async function markCoachFailed(job: CoachJob, id: string, error: unknown, day?: number) {
  const set = { status: "failed" as const, error: message(error) };
  if (job === "research") await db().update(companyIntel).set(set).where(eq(companyIntel.key, id));
  if (job === "level") await db().update(levelChecks).set(set).where(eq(levelChecks.goalId, id));
  if (job === "plan") await db().update(trainingPlans).set(set).where(eq(trainingPlans.goalId, id));
  if (job === "day" && day)
    await db()
      .update(planDays)
      .set(set)
      .where(and(eq(planDays.goalId, id), eq(planDays.day, day)));
  if (job === "ideas") await db().update(proofIdeas).set(set).where(eq(proofIdeas.goalId, id));
  if (job === "launch") await db().update(proofPacks).set(set).where(eq(proofPacks.goalId, id));
}

async function research(key: string) {
  const [row] = await db().select().from(companyIntel).where(eq(companyIntel.key, key));
  if (!row) return;
  // Someone targeting the same company is waiting: use one of their goals for the JD.
  const waiting = await db().select().from(goals).where(eq(goals.intelKey, key)).limit(20);
  const sample = waiting[0];
  if (!sample) return;
  const { intel, model } = await researchCompany({
    companyName: row.companyName,
    roleTitle: sample.roleTitle,
    jobDescription: sample.jobDescription,
  });
  await db()
    .update(companyIntel)
    .set({ status: "ready", intel, model, error: null, refreshedAt: new Date() })
    .where(eq(companyIntel.key, key));
  for (const g of waiting) await enqueueCoach("level", g.id);
}

async function level(goalId: string) {
  const goal = await goalById(goalId);
  if (!goal) return;
  const [check] = await db().select().from(levelChecks).where(eq(levelChecks.goalId, goalId));
  if (check?.status === "ready" && check.questions) return;
  const intel = (await getIntel(goal))?.intel ?? null;
  const questions = await writeLevelCheck(context(goal), intel);
  await db()
    .insert(levelChecks)
    .values({ goalId, status: "ready", questions })
    .onConflictDoUpdate({
      target: levelChecks.goalId,
      set: { status: "ready", questions, error: null },
    });
}

async function plan(goalId: string) {
  const goal = await goalById(goalId);
  if (!goal) return;
  const existing = await getPlan(goalId);
  if (existing?.status === "ready" && existing.plan) return;
  const intel = ((await getIntel(goal))?.intel ?? null) as CompanyIntel | null;
  const report = await latestReport(goalId);
  const current = await recordReadiness(goal, "baseline");
  const days = planLength(current.overall, goal.interviewDate);
  const written = await writeTrainingPlan({
    goal: context(goal),
    intel,
    days,
    readiness: { overall: current.overall, rounds: current.rounds },
    report: report?.judged
      ? {
          overall: report.judged.overall,
          skills: report.judged.skills.map((s) => ({
            id: s.id,
            score: s.score,
            summary: s.summary,
          })),
          roleSkills: report.judged.roleSkills.map((r) => ({
            id: r.id,
            score: r.score,
            summary: r.summary,
          })),
        }
      : null,
  });
  await db()
    .insert(trainingPlans)
    .values({ goalId, status: "ready", plan: written })
    .onConflictDoUpdate({
      target: trainingPlans.goalId,
      set: { status: "ready", plan: written, error: null },
    });
  // Day 1 is written straight away, so it's ready when they open it.
  await db().insert(planDays).values({ goalId, day: 1 }).onConflictDoNothing();
  await enqueueCoach("day", goalId, { day: 1 });
}

async function writeDayJob(goalId: string, day: number) {
  const goal = await goalById(goalId);
  const row = await getPlan(goalId);
  const spec = row?.plan?.days.find((d) => d.day === day);
  if (!goal || !spec) return;
  const [existing] = await db()
    .select()
    .from(planDays)
    .where(and(eq(planDays.goalId, goalId), eq(planDays.day, day)));
  if (existing?.status === "ready" && existing.content) return;
  const content = await writeDay({ goal: context(goal), day: spec });
  await db()
    .insert(planDays)
    .values({ goalId, day, status: "ready", content })
    .onConflictDoUpdate({
      target: [planDays.goalId, planDays.day],
      set: { status: "ready", content, error: null },
    });
}

async function ideas(goalId: string) {
  const goal = await goalById(goalId);
  if (!goal) return;
  const intel = (await getIntel(goal))?.intel;
  if (!intel) throw new Error("Research isn't ready yet.");
  const report = await latestReport(goalId);
  const written = await writeIdeas({
    goal: context(goal),
    intel,
    gaps: gapsFrom(report),
    sessions: Math.max(3, Math.min(8, Math.round((goal.minutesPerDay * 4) / 45))),
  });
  await db()
    .insert(proofIdeas)
    .values({ goalId, status: "ready", ideas: written })
    .onConflictDoUpdate({
      target: proofIdeas.goalId,
      set: { status: "ready", ideas: written, error: null },
    });
}

async function launch(goalId: string) {
  const goal = await goalById(goalId);
  if (!goal) return;
  const project = await getProject(goalId);
  if (!project) throw new Error("No proof project yet.");
  const defense = await mockState(goalId, "defense");
  const kit = await writeLaunchKit({
    goal: context(goal),
    project: {
      idea: project.idea,
      summary: project.summary,
      trail: project.trail,
      repoUrl: project.repoUrl,
      demoUrl: project.demoUrl,
    },
    defense:
      defense.stage === "done" && defense.report.judged
        ? { overall: defense.report.judged.overall, skills: defense.report.judged.skills }
        : null,
  });
  await db()
    .update(proofPacks)
    .set({ status: "ready", kit, error: null })
    .where(eq(proofPacks.goalId, goalId));
}

/** A mock was scored: update readiness and start what comes next. */
export async function onMockScored(invitationId: string) {
  const [mock] = await db().select().from(mocks).where(eq(mocks.invitationId, invitationId));
  if (!mock) return;
  const goal = await goalById(mock.goalId);
  if (!goal) return;
  if (mock.kind === "baseline") {
    await db().insert(trainingPlans).values({ goalId: goal.id }).onConflictDoNothing();
    await db().insert(proofIdeas).values({ goalId: goal.id }).onConflictDoNothing();
    await enqueueCoach("plan", goal.id);
    await enqueueCoach("ideas", goal.id);
  } else {
    await recordReadiness(goal, "defense");
    const pack = await db().select().from(proofPacks).where(eq(proofPacks.goalId, goal.id));
    if (pack.length) await enqueueCoach("launch", goal.id);
  }
}
