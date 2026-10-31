import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  candidateInterviews,
  candidates,
  companyIntel,
  drillAttempts,
  type Goal,
  goals,
  interviewReports,
  interviewSessions,
  invitations,
  levelChecks,
  mocks,
  packLinks,
  planDays,
  proofIdeas,
  proofPacks,
  proofProjects,
  readinessSnapshots,
  roles,
  trainingPlans,
  workspaces,
} from "@/db/schema";
import { fromFour, readiness, type Signals } from "@/lib/coach/readiness";
import type { CompanyIntel, DrillResult } from "@/lib/coach/types";
import { THINKING, type ThinkingId } from "@/lib/interview";
import type { InterviewReport } from "@/lib/report";
import { CONSENT_VERSION } from "@/lib/workspace";
import { kitSkills } from "@/server/ai/kit";
import { readText } from "@/server/jobs/process-resume";
import { enqueueCoach, enqueuePrepare } from "@/server/queue";
import { blobs } from "@/server/storage";

/**
 * A candidate's goal (one target job) and everything hanging off it. Mock
 * interviews reuse Werdict's room unchanged: each goal owns a hidden role,
 * and each mock is a hidden candidate + invitation in it, so the voice room,
 * its clock, transcript and scoring all work as they are.
 */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Roles that interview alike share research: "SDE-1" and "Backend Engineer" at one company. */
export function roleCluster(title: string): string {
  const t = title.toLowerCase();
  const rules: [RegExp, string][] = [
    [/data scien|machine learning|\bml\b|\bai engineer/, "data-science"],
    [/data analy|business analy|analytics|\bbi\b/, "analytics"],
    [/data engineer/, "data-engineering"],
    [/product manag|\bapm\b|product owner/, "product"],
    [/design|ux|ui\b/, "design"],
    [/devops|sre|site reliab|platform eng|cloud/, "devops"],
    [/front.?end|react|web dev/, "frontend"],
    [/android|ios|mobile/, "mobile"],
    [/qa\b|test|quality/, "qa"],
    [/security/, "security"],
    [/engineer|developer|sde|swe|programmer|back.?end|full.?stack/, "software-engineering"],
    [/market|growth|seo|content/, "marketing"],
    [/sales|business develop|account exec|bdr|sdr/, "sales"],
    [/operat|supply|logistic/, "operations"],
    [/financ|account/, "finance"],
    [/hr\b|human res|recruit|talent/, "people"],
    [/consult|strategy/, "consulting"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? (slug(title) || "general");
}

export const companyKey = (name: string) => slug(name) || "company";
export const intelKeyFor = (company: string, role: string) =>
  `${companyKey(company)}:${roleCluster(role)}`;

/** Research older than this is refreshed the next time someone targets the company. */
const INTEL_FRESH_MS = 14 * 86_400_000;

/** Every candidate gets a workspace (Werdict's room shows its sender); made on first use. */
async function ensureWorkspace(user: { id: string; name: string; email: string }) {
  await db()
    .insert(workspaces)
    .values({
      ownerId: user.id,
      companyName: "Offer Ready",
      senderName: "Your Offer Ready coach",
      replyToEmail: user.email,
      consentAt: new Date(),
      consentVersion: CONSENT_VERSION,
    })
    .onConflictDoNothing({ target: workspaces.ownerId });
}

export async function createGoal(input: {
  user: { id: string; name: string; email: string };
  companyName: string;
  roleTitle: string;
  jobDescription: string;
  resume: { bytes: Uint8Array; fileType: "pdf" | "docx" };
  interviewDate: Date | null;
  minutesPerDay: number;
}): Promise<string> {
  const { user } = input;
  // The PDF reader takes ownership of (detaches) the buffer it's given: hand it a copy.
  const resumeText = (await readText(input.resume.fileType, input.resume.bytes.slice())).trim();
  if (resumeText.length < 80)
    throw new GoalError(
      "We couldn't read text from that resume. Try a PDF exported from a document.",
    );
  const sha = createHash("sha256").update(input.resume.bytes).digest("hex");
  const resumeKey = `resumes/${user.id.toLowerCase().replace(/[^a-z0-9]/g, "")}/${sha}.${input.resume.fileType}`;
  await blobs().put(resumeKey, input.resume.bytes);
  await ensureWorkspace(user);

  const skills = kitSkills({ brief: null, jobDescription: input.jobDescription });
  const key = intelKeyFor(input.companyName, input.roleTitle);
  const goalId = await db().transaction(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({
        ownerId: user.id,
        title: input.roleTitle,
        companyName: input.companyName,
        jobDescription: input.jobDescription,
        blueprint: { depth: "standard", skills },
        jdApprovedAt: new Date(),
        kitApprovedAt: new Date(),
        status: "interviewing",
      })
      .returning({ id: roles.id });
    const [goal] = await tx
      .insert(goals)
      .values({
        ownerId: user.id,
        roleId: role.id,
        companyName: input.companyName,
        roleTitle: input.roleTitle,
        jobDescription: input.jobDescription,
        resumeText: resumeText.slice(0, 20_000),
        resumeKey,
        resumeFileType: input.resume.fileType,
        resumeSha256: sha,
        intelKey: key,
        interviewDate: input.interviewDate,
        minutesPerDay: input.minutesPerDay,
      })
      .returning({ id: goals.id });
    await tx
      .insert(companyIntel)
      .values({ key, companyName: input.companyName, roleCluster: roleCluster(input.roleTitle) })
      .onConflictDoNothing({ target: companyIntel.key });
    await tx.insert(levelChecks).values({ goalId: goal.id }).onConflictDoNothing();
    return goal.id;
  });

  const [intel] = await db().select().from(companyIntel).where(eq(companyIntel.key, key));
  const stale = !intel?.refreshedAt || Date.now() - intel.refreshedAt.getTime() > INTEL_FRESH_MS;
  if (intel && (intel.status !== "ready" || stale)) {
    if (intel.status === "failed")
      await db()
        .update(companyIntel)
        .set({ status: "pending", error: null })
        .where(eq(companyIntel.key, key));
    await enqueueCoach("research", key);
  } else {
    // Research is already there (another candidate targeted this company): the level check can start.
    await enqueueCoach("level", goalId);
  }
  return goalId;
}

export class GoalError extends Error {}

export async function listGoals(ownerId: string) {
  return db()
    .select({
      id: goals.id,
      companyName: goals.companyName,
      roleTitle: goals.roleTitle,
      createdAt: goals.createdAt,
      interviewDate: goals.interviewDate,
      // Written out in full: inside a subquery Drizzle drops table names, and "id" would bind to the inner table.
      overall: sql<number | null>`(
        select rs.overall from readiness_snapshots rs
        where rs.goal_id = "goals"."id"
        order by rs.created_at desc limit 1)`,
    })
    .from(goals)
    .where(eq(goals.ownerId, ownerId))
    .orderBy(desc(goals.createdAt))
    .limit(50);
}

export async function getGoal(ownerId: string, goalId: string): Promise<Goal | null> {
  if (!/^[0-9a-f-]{36}$/.test(goalId)) return null;
  const [goal] = await db()
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.ownerId, ownerId)))
    .limit(1);
  return goal ?? null;
}

export async function getIntel(goal: Goal) {
  const [row] = await db().select().from(companyIntel).where(eq(companyIntel.key, goal.intelKey));
  return row ?? null;
}

/* ─────────────── Mock interviews ─────────────── */

export type MockState =
  | { stage: "none" }
  | { stage: "preparing"; mockId: string }
  | { stage: "failed"; mockId: string }
  | { stage: "ready"; mockId: string }
  | { stage: "live"; mockId: string }
  | { stage: "scoring"; mockId: string; sessionId: string }
  | { stage: "done"; mockId: string; sessionId: string; report: InterviewReport }
  | { stage: "incomplete"; mockId: string; seconds: number | null; words: number };

const lasted = (s: {
  startedAt: Date | null;
  firstConnectAt: Date | null;
  completedAt: Date | null;
}) => {
  const from = s.firstConnectAt ?? s.startedAt;
  return from && s.completedAt
    ? Math.round((s.completedAt.getTime() - from.getTime()) / 1000)
    : null;
};

export async function mockState(goalId: string, kind: "baseline" | "defense"): Promise<MockState> {
  const [row] = await db()
    .select({
      mock: mocks,
      planStatus: candidateInterviews.status,
      session: interviewSessions,
      reportStatus: interviewReports.status,
      report: interviewReports.report,
    })
    .from(mocks)
    .leftJoin(candidateInterviews, eq(candidateInterviews.candidateId, mocks.candidateId))
    .leftJoin(interviewSessions, eq(interviewSessions.invitationId, mocks.invitationId))
    .leftJoin(interviewReports, eq(interviewReports.sessionId, interviewSessions.id))
    .where(and(eq(mocks.goalId, goalId), eq(mocks.kind, kind)))
    .orderBy(desc(mocks.createdAt))
    .limit(1);
  if (!row) return { stage: "none" };
  const mockId = row.mock.id;
  const s = row.session;
  if (s?.status === "completed" || s?.status === "incomplete") {
    if (row.reportStatus === "ready" && row.report) {
      if (row.report.status === "insufficient")
        return {
          stage: "incomplete",
          mockId,
          seconds: lasted(s),
          words: row.report.answered.words,
        };
      return { stage: "done", mockId, sessionId: s.id, report: row.report };
    }
    if (s.status === "incomplete" && row.reportStatus !== "pending" && !row.report)
      return { stage: "incomplete", mockId, seconds: lasted(s), words: 0 };
    return { stage: "scoring", mockId, sessionId: s.id };
  }
  if (s?.status === "live" || s?.status === "consented") return { stage: "live", mockId };
  if (row.planStatus === "ready") return { stage: "ready", mockId };
  if (row.planStatus === "failed") return { stage: "failed", mockId };
  return { stage: "preparing", mockId };
}

const EXPERIENCE = { fresher: "0-1", mid: "1-3", senior: "5-8" } as const;

/** Writes a new mock interview in the background. The defense questions the proof project first. */
export async function createMock(
  goal: Goal,
  kind: "baseline" | "defense",
  user: { name: string; email: string },
) {
  let resumeText = goal.resumeText;
  let focus: string | null = null;
  if (kind === "defense") {
    const [project] = await db()
      .select()
      .from(proofProjects)
      .where(eq(proofProjects.goalId, goal.id));
    if (!project) throw new GoalError("Pick a proof project first.");
    focus = [
      `PROOF PROJECT (built this week for ${goal.companyName}): ${project.idea.headline}.`,
      `What they built: ${project.summary || project.idea.build}`,
      project.trail.length
        ? `Decisions they logged: ${project.trail.map((t) => `AI suggested "${t.aiSaid}"; they ${t.iDid} because ${t.why}`).join(" | ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    resumeText = `${focus}\n\n${goal.resumeText}`;
  }
  // The mock's difficulty follows the level check.
  await db()
    .update(roles)
    .set({
      brief: {
        title: goal.roleTitle,
        experience: EXPERIENCE[goal.level ?? "fresher"],
        workMode: "remote",
        location: "",
        employmentType: "full_time",
        skills: [],
        notes: "",
      },
    })
    .where(eq(roles.id, goal.roleId));

  const candidateId = await db().transaction(async (tx) => {
    const [candidate] = await tx
      .insert(candidates)
      .values({
        roleId: goal.roleId,
        ownerId: goal.ownerId,
        fileName: "resume",
        fileKey: goal.resumeKey,
        // Unique per mock: the same resume can be interviewed more than once.
        fileSha256: `${goal.resumeSha256}:${kind}:${randomBytes(4).toString("hex")}`,
        fileSize: resumeText.length,
        fileType: goal.resumeFileType,
        status: "scored",
        name: user.name,
        email: user.email,
      })
      .returning({ id: candidates.id });
    const [invitation] = await tx
      .insert(invitations)
      .values({
        candidateId: candidate.id,
        roleId: goal.roleId,
        ownerId: goal.ownerId,
        email: user.email,
        channel: "dev",
        status: "sent",
        expiresInHours: 24 * 14,
        sentAt: new Date(),
      })
      .returning({ id: invitations.id });
    await tx.insert(mocks).values({
      goalId: goal.id,
      kind,
      candidateId: candidate.id,
      invitationId: invitation.id,
      resumeText,
      focus,
    });
    return candidate.id;
  });
  await enqueuePrepare(candidateId);
}

/**
 * A fresh link into the voice room. Only its hash is stored (as in Werdict);
 * earlier links keep working so a second tab doesn't break.
 */
export async function roomLink(goalId: string, mockId: string): Promise<string | null> {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const [mock] = await db()
    .select({ invitationId: mocks.invitationId })
    .from(mocks)
    .where(and(eq(mocks.id, mockId), eq(mocks.goalId, goalId)));
  if (!mock) return null;
  await db()
    .update(invitations)
    .set({
      tokenHash: hash,
      previousTokenHashes: sql`(array_prepend(${invitations.tokenHash}, ${invitations.previousTokenHashes}))[1:5]`,
    })
    .where(eq(invitations.id, mock.invitationId));
  return `/i/${token}`;
}

/** Which goal a voice-room link belongs to, so the room can send the candidate back. */
export async function goalForInvitation(invitationId: string): Promise<string | null> {
  const [row] = await db()
    .select({ goalId: mocks.goalId })
    .from(mocks)
    .where(eq(mocks.invitationId, invitationId));
  return row?.goalId ?? null;
}

/** Where the candidate goes when a voice-room link's interview ends: its result page. */
export async function resultHrefForToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const [row] = await db()
    .select({ goalId: mocks.goalId, kind: mocks.kind })
    .from(invitations)
    .innerJoin(mocks, eq(mocks.invitationId, invitations.id))
    .where(
      sql`${invitations.tokenHash} = ${hash} or ${hash} = any(${invitations.previousTokenHashes})`,
    )
    .limit(1);
  if (!row) return null;
  return `/g/${row.goalId}/${row.kind === "defense" ? "defense" : "report"}`;
}

/* ─────────────── Readiness ─────────────── */

function thinkingFrom(report: InterviewReport | null): Partial<Record<ThinkingId, number>> {
  const out: Partial<Record<ThinkingId, number>> = {};
  for (const s of report?.judged?.skills ?? []) out[s.id] = fromFour(s.score);
  return out;
}

function roleSkillsFrom(report: InterviewReport | null): number | null {
  const scored = (report?.judged?.roleSkills ?? []).filter((r) => r.score !== null);
  if (!scored.length) return null;
  return scored.reduce((a, r) => a + fromFour(r.score as number), 0) / scored.length;
}

const FOCUS_TO_THINKING: [RegExp, ThinkingId][] = [
  [/verif|check|evidence|number|data|accura/i, "verification"],
  [/trade|priorit|decision|decid/i, "tradeoffs"],
  [/risk|second|edge|secur|compliance/i, "risk"],
  [/fram|problem|scope|requirement/i, "framing"],
  [/explain|communic|structur|story|reason|lead/i, "reasoning"],
];
export function thinkingFor(skill: string): ThinkingId {
  return FOCUS_TO_THINKING.find(([re]) => re.test(skill))?.[1] ?? "reasoning";
}

/** Recomputes readiness from everything measured so far and records a snapshot. */
export async function recordReadiness(
  goal: Goal,
  source: "level" | "baseline" | "drill" | "defense",
) {
  const intel = (await getIntel(goal))?.intel as CompanyIntel | null;
  const rounds = intel?.rounds ?? [
    { kind: "technical" as const, title: "Technical interview" },
    { kind: "hiring_manager" as const, title: "Hiring manager" },
  ];
  const [check] = await db().select().from(levelChecks).where(eq(levelChecks.goalId, goal.id));
  const latest = await latestReport(goal.id);

  // Drills: average score per trained thinking skill.
  const plan = await getPlan(goal.id);
  const attempts = await db()
    .select({ day: drillAttempts.day, score: drillAttempts.score })
    .from(drillAttempts)
    .where(eq(drillAttempts.goalId, goal.id));
  const byThinking = new Map<ThinkingId, number[]>();
  for (const a of attempts) {
    const day = plan?.plan?.days.find((d) => d.day === a.day);
    const id = thinkingFor(day?.focusSkill ?? "");
    byThinking.set(id, [...(byThinking.get(id) ?? []), a.score]);
  }
  const drills: Signals["drills"] = {};
  for (const [id, scores] of byThinking)
    drills[id] = scores.reduce((x, y) => x + y, 0) / scores.length;

  const result = readiness(rounds, {
    level: check?.score ?? null,
    thinking: thinkingFrom(latest),
    roleSkills: roleSkillsFrom(latest),
    drills,
  });
  await db()
    .insert(readinessSnapshots)
    .values({ goalId: goal.id, source, overall: result.overall, rounds: result.rounds });
  return result;
}

/** The newest scored mock report (the defense, once it's done, otherwise the baseline). */
export async function latestReport(goalId: string): Promise<InterviewReport | null> {
  const defense = await mockState(goalId, "defense");
  if (defense.stage === "done") return defense.report;
  const baseline = await mockState(goalId, "baseline");
  return baseline.stage === "done" ? baseline.report : null;
}

export async function readinessHistory(goalId: string) {
  return db()
    .select()
    .from(readinessSnapshots)
    .where(eq(readinessSnapshots.goalId, goalId))
    .orderBy(asc(readinessSnapshots.createdAt))
    .limit(200);
}

export async function getLevelCheck(goalId: string) {
  const [row] = await db().select().from(levelChecks).where(eq(levelChecks.goalId, goalId));
  return row ?? null;
}

export async function getPlan(goalId: string) {
  const [row] = await db().select().from(trainingPlans).where(eq(trainingPlans.goalId, goalId));
  return row ?? null;
}

export async function getDays(goalId: string) {
  return db().select().from(planDays).where(eq(planDays.goalId, goalId)).orderBy(asc(planDays.day));
}

export async function getAttempts(goalId: string, day?: number) {
  return db()
    .select()
    .from(drillAttempts)
    .where(
      day
        ? and(eq(drillAttempts.goalId, goalId), eq(drillAttempts.day, day))
        : eq(drillAttempts.goalId, goalId),
    )
    .orderBy(asc(drillAttempts.createdAt));
}

export async function saveAttempt(
  goalId: string,
  day: number,
  item: string,
  result: DrillResult,
  score: number,
) {
  await db().insert(drillAttempts).values({ goalId, day, item, result, score });
}

export async function getIdeas(goalId: string) {
  const [row] = await db().select().from(proofIdeas).where(eq(proofIdeas.goalId, goalId));
  return row ?? null;
}

export async function getProject(goalId: string) {
  const [row] = await db().select().from(proofProjects).where(eq(proofProjects.goalId, goalId));
  return row ?? null;
}

/** How many others already build each idea for this company (slot limits). */
export async function ideaTaken(companyName: string, keys: string[], exceptGoal: string) {
  if (!keys.length) return new Map<string, number>();
  const rows = await db()
    .select({ ideaKey: proofProjects.ideaKey, n: sql<number>`count(*)::int` })
    .from(proofProjects)
    .where(
      and(
        eq(proofProjects.companyKey, companyKey(companyName)),
        inArray(proofProjects.ideaKey, keys),
        sql`${proofProjects.goalId} <> ${exceptGoal}`,
      ),
    )
    .groupBy(proofProjects.ideaKey);
  return new Map(rows.map((r) => [r.ideaKey, r.n]));
}
export const IDEA_SLOTS = 3;

export async function getPack(goalId: string) {
  const [row] = await db().select().from(proofPacks).where(eq(proofPacks.goalId, goalId));
  return row ?? null;
}

export async function getLinks(packId: string) {
  return db()
    .select()
    .from(packLinks)
    .where(eq(packLinks.packId, packId))
    .orderBy(asc(packLinks.createdAt));
}

/** The weakest thinking skills from the latest mock, by name. */
export function gapsFrom(report: InterviewReport | null): string[] {
  const skills = [...(report?.judged?.skills ?? [])].sort((a, b) => a.score - b.score);
  return skills.slice(0, 2).map((s) => THINKING.find((t) => t.id === s.id)?.name ?? s.id);
}
