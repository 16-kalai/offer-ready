"use server";

import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  companyIntel,
  goals,
  levelChecks,
  packLinks,
  planDays,
  proofIdeas,
  proofPacks,
  proofProjects,
  trainingPlans,
} from "@/db/schema";
import { levelBand, levelScore, pickNext } from "@/lib/coach/level";
import type { DrillResult, LevelQuestion, PublicLevelQuestion } from "@/lib/coach/types";
import { requireSession } from "@/lib/session";
import { gradeDrill, scoreSpoken, transcribe } from "@/server/ai/coach";
import {
  companyKey,
  createMock,
  GoalError,
  getDays,
  getGoal,
  getIdeas,
  getPack,
  getPlan,
  getProject,
  IDEA_SLOTS,
  ideaTaken,
  mockState,
  recordReadiness,
  roomLink,
  saveAttempt,
} from "@/server/goals";
import { enqueueCoach } from "@/server/queue";
import { allow } from "@/server/rate-limit";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function owned(goalId: string) {
  const session = await requireSession();
  const goal = await getGoal(session.user.id, goalId);
  if (!goal) throw new GoalError("That goal doesn't exist.");
  return { session, goal };
}

async function guard<R extends { ok: boolean }>(
  fn: () => Promise<R>,
): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GoalError) return { ok: false, error: error.message };
    if (error && typeof error === "object" && "digest" in error) throw error; // redirects
    console.error("[action] failed", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const strip = (q: LevelQuestion): PublicLevelQuestion => ({
  id: q.id,
  tier: q.tier,
  topic: q.topic,
  question: q.question,
  snippet: q.snippet,
  options: q.options,
});

/* ─────────── Research ─────────── */

export async function retryResearch(goalId: string): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    await db()
      .update(companyIntel)
      .set({ status: "pending", error: null })
      .where(eq(companyIntel.key, goal.intelKey));
    await enqueueCoach("research", goal.intelKey);
    revalidatePath(`/g/${goalId}`, "layout");
    return { ok: true };
  });
}

/* ─────────── Level check ─────────── */

export async function retryLevel(goalId: string): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    await db()
      .update(levelChecks)
      .set({ status: "pending", error: null })
      .where(eq(levelChecks.goalId, goal.id));
    await enqueueCoach("level", goal.id);
    return { ok: true };
  });
}

export async function answerLevel(
  goalId: string,
  questionId: string,
  choice: number,
): Promise<
  Result<{
    correct: boolean;
    answer: number;
    explanation: string;
    next: PublicLevelQuestion | null;
    asked: number;
    score?: number;
    level?: string;
  }>
> {
  return guard(async () => {
    const { goal, session } = await owned(goalId);
    const [check] = await db().select().from(levelChecks).where(eq(levelChecks.goalId, goal.id));
    if (!check?.questions) return { ok: false, error: "The level check isn't ready yet." };
    if (check.completedAt) return { ok: false, error: "You've finished the level check." };
    const expected = pickNext(check.questions, check.answers);
    const q = check.questions.find((x) => x.id === questionId);
    if (!q || !expected || expected.id !== q.id)
      return { ok: false, error: "Refresh to continue." };
    const correct = choice === q.answer;
    const answers = [...check.answers, { id: q.id, choice, correct, tier: q.tier }];
    const next = pickNext(check.questions, answers);
    const done = next === null;
    const score = levelScore(answers);
    await db()
      .update(levelChecks)
      .set({ answers, ...(done ? { score, completedAt: new Date() } : {}) })
      .where(eq(levelChecks.id, check.id));
    if (done) {
      const band = levelBand(score);
      await db().update(goals).set({ level: band }).where(eq(goals.id, goal.id));
      await recordReadiness({ ...goal, level: band }, "level");
      // The first mock is written now, so it's ready by the time they reach it.
      if ((await mockState(goal.id, "baseline")).stage === "none")
        await createMock({ ...goal, level: band }, "baseline", {
          name: session.user.name,
          email: session.user.email,
        });
      revalidatePath(`/g/${goalId}`, "layout");
    }
    return {
      ok: true,
      correct,
      answer: q.answer,
      explanation: q.explanation,
      next: next ? strip(next) : null,
      asked: answers.length,
      ...(done ? { score, level: levelBand(score) } : {}),
    };
  });
}

/* ─────────── Mock interviews ─────────── */

export async function prepareMock(goalId: string, kind: "baseline" | "defense"): Promise<Result> {
  return guard(async () => {
    const { goal, session } = await owned(goalId);
    if (!(await allow(`mock:${session.user.id}`, 8, 86_400)))
      return { ok: false, error: "That's plenty of mocks for today. Come back tomorrow." };
    const state = await mockState(goal.id, kind);
    if (state.stage !== "none" && state.stage !== "failed" && state.stage !== "incomplete")
      return { ok: true };
    await createMock(goal, kind, { name: session.user.name, email: session.user.email });
    revalidatePath(`/g/${goalId}`, "layout");
    return { ok: true };
  });
}

export async function enterRoom(
  goalId: string,
  kind: "baseline" | "defense",
): Promise<Result<{ href: string }>> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const state = await mockState(goal.id, kind);
    if (state.stage !== "ready" && state.stage !== "live")
      return { ok: false, error: "Your interview isn't ready yet." };
    const href = await roomLink(goal.id, state.mockId);
    if (!href) return { ok: false, error: "Couldn't open the interview room." };
    return { ok: true, href };
  });
}

/* ─────────── Training ─────────── */

export async function retryPlan(goalId: string): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    await db()
      .insert(trainingPlans)
      .values({ goalId: goal.id })
      .onConflictDoUpdate({
        target: trainingPlans.goalId,
        set: { status: "pending", error: null },
      });
    await enqueueCoach("plan", goal.id);
    return { ok: true };
  });
}

export async function openDay(goalId: string, day: number): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const plan = await getPlan(goal.id);
    if (!plan?.plan?.days.some((d) => d.day === day)) return { ok: false, error: "No such day." };
    const [row] = await db()
      .insert(planDays)
      .values({ goalId: goal.id, day })
      .onConflictDoNothing()
      .returning({ id: planDays.id });
    const existing = (await getDays(goal.id)).find((d) => d.day === day);
    if (row || existing?.status === "failed") {
      if (existing?.status === "failed")
        await db()
          .update(planDays)
          .set({ status: "pending", error: null })
          .where(and(eq(planDays.goalId, goal.id), eq(planDays.day, day)));
      await enqueueCoach("day", goal.id, { day });
    }
    return { ok: true };
  });
}

const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;.*)?$/;
const MAX_AUDIO_BASE64 = 6_000_000; // about 4.5 MB of audio: a few minutes

function audioFrom(input: { audio?: string; mimeType?: string }) {
  if (!input.audio) return undefined;
  if (!input.mimeType || !AUDIO_TYPES.test(input.mimeType))
    throw new GoalError("Unsupported recording format.");
  if (input.audio.length > MAX_AUDIO_BASE64)
    throw new GoalError("That recording is too long. Keep it under 3 minutes.");
  return { mimeType: input.mimeType.split(";")[0], data: input.audio };
}

async function loadDrillDay(goalId: string, day: number) {
  const { goal, session } = await owned(goalId);
  if (!(await allow(`grade:${session.user.id}`, 120, 3600)))
    throw new GoalError("Lots of practice! Take a short break and try again.");
  const row = (await getDays(goal.id)).find((d) => d.day === day);
  if (!row?.content) throw new GoalError("Today's practice isn't ready yet.");
  return { goal, content: row.content };
}

export async function submitDrill(input: {
  goalId: string;
  day: number;
  drillId: string;
  choice: "ship" | "skip";
  reason?: string;
  audio?: string;
  mimeType?: string;
}): Promise<Result<{ result: DrillResult; score: number }>> {
  return guard(async () => {
    const { goal, content } = await loadDrillDay(input.goalId, input.day);
    const drill = content.drills.find((d) => d.id === input.drillId);
    if (!drill) return { ok: false, error: "No such drill." };
    const audio = audioFrom(input);
    const reason = (audio ? await transcribe(audio) : (input.reason ?? "")).trim();
    if (reason.length < 3)
      return { ok: false, error: "Say or type why — the reason is what we score." };
    const correctCall = input.choice === drill.verdict;
    const graded = await gradeDrill({ drill, choice: input.choice, reason });
    // Right call 4, named the real issue 4, reasoning 2 (like Ship or Skip), out of 10.
    const points =
      (correctCall ? 4 : 0) +
      (graded.namedIssue ? 4 : 0) +
      (correctCall && graded.namedIssue ? 2 : reason.length > 40 ? 1 : 0);
    const result: DrillResult = {
      kind: "drill",
      choice: input.choice,
      answer: reason,
      correctCall,
      namedIssue: graded.namedIssue,
      feedback: graded.feedback,
      reveal: drill.explanation,
    };
    const score = points / 10;
    await saveAttempt(goal.id, input.day, drill.id, result, score);
    return { ok: true, result, score };
  });
}

export async function submitSpoken(input: {
  goalId: string;
  day: number;
  text?: string;
  audio?: string;
  mimeType?: string;
}): Promise<Result<{ result: DrillResult; score: number }>> {
  return guard(async () => {
    const { goal, content } = await loadDrillDay(input.goalId, input.day);
    const audio = audioFrom(input);
    if (!audio && (input.text ?? "").trim().length < 20)
      return { ok: false, error: "Answer in a few sentences (or record it)." };
    const scored = await scoreSpoken({
      question: content.spoken.question,
      lookFor: content.spoken.lookFor,
      text: audio ? undefined : input.text,
      audio,
    });
    const result: DrillResult = {
      kind: "spoken",
      answer: scored.transcript,
      feedback: scored.feedback,
      strengths: scored.strengths,
      improve: scored.improve,
      quote: scored.quote,
    };
    const score = (scored.score - 1) / 3;
    await saveAttempt(goal.id, input.day, "spoken", result, score);
    return { ok: true, result, score };
  });
}

export async function completeDay(
  goalId: string,
  day: number,
): Promise<Result<{ overall: number }>> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    await db()
      .update(planDays)
      .set({ completedAt: new Date() })
      .where(and(eq(planDays.goalId, goal.id), eq(planDays.day, day)));
    const result = await recordReadiness(goal, "drill");
    // Write tomorrow ahead of time.
    const plan = await getPlan(goal.id);
    const next = plan?.plan?.days.find((d) => d.day === day + 1);
    if (next && next.kind === "practice") {
      await db().insert(planDays).values({ goalId: goal.id, day: next.day }).onConflictDoNothing();
      await enqueueCoach("day", goal.id, { day: next.day });
    }
    revalidatePath(`/g/${goalId}`, "layout");
    return { ok: true, overall: result.overall };
  });
}

/* ─────────── Proof ─────────── */

export async function retryIdeas(goalId: string): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    await db()
      .insert(proofIdeas)
      .values({ goalId: goal.id })
      .onConflictDoUpdate({ target: proofIdeas.goalId, set: { status: "pending", error: null } });
    await enqueueCoach("ideas", goal.id);
    return { ok: true };
  });
}

export async function chooseIdea(goalId: string, key: string): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const ideas = await getIdeas(goal.id);
    const idea = ideas?.ideas?.find((i) => i.key === key);
    if (!idea) return { ok: false, error: "That idea isn't available." };
    const taken = await ideaTaken(goal.companyName, [key], goal.id);
    if ((taken.get(key) ?? 0) >= IDEA_SLOTS)
      return {
        ok: false,
        error: `${IDEA_SLOTS} others are already building this for ${goal.companyName}. Pick another angle.`,
      };
    await db()
      .insert(proofProjects)
      .values({ goalId: goal.id, companyKey: companyKey(goal.companyName), ideaKey: key, idea })
      .onConflictDoUpdate({
        target: proofProjects.goalId,
        set: { ideaKey: key, idea, milestonesDone: [], companyKey: companyKey(goal.companyName) },
      });
    revalidatePath(`/g/${goalId}`, "layout");
    return { ok: true };
  });
}

const url = (v: string | undefined) => {
  const t = (v ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
    return u.toString().slice(0, 500);
  } catch {
    throw new GoalError("That link doesn't look right.");
  }
};

export async function saveProject(
  goalId: string,
  input: { repoUrl?: string; demoUrl?: string; summary?: string; milestonesDone?: number[] },
): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const project = await getProject(goal.id);
    if (!project) return { ok: false, error: "Pick a project first." };
    await db()
      .update(proofProjects)
      .set({
        ...(input.repoUrl !== undefined ? { repoUrl: url(input.repoUrl) } : {}),
        ...(input.demoUrl !== undefined ? { demoUrl: url(input.demoUrl) } : {}),
        ...(input.summary !== undefined ? { summary: input.summary.trim().slice(0, 2_000) } : {}),
        ...(input.milestonesDone
          ? {
              milestonesDone: [
                ...new Set(
                  input.milestonesDone.filter((n) => Number.isInteger(n) && n >= 0 && n < 10),
                ),
              ],
            }
          : {}),
      })
      .where(eq(proofProjects.goalId, goal.id));
    revalidatePath(`/g/${goalId}/proof`);
    return { ok: true };
  });
}

export async function addTrail(
  goalId: string,
  entry: { aiSaid: string; iDid: string; why: string },
): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const clean = {
      at: new Date().toISOString(),
      aiSaid: entry.aiSaid.trim().slice(0, 300),
      iDid: entry.iDid.trim().slice(0, 200),
      why: entry.why.trim().slice(0, 300),
    };
    if (clean.aiSaid.length < 3 || clean.why.length < 3)
      return { ok: false, error: "Fill in what the AI said and why." };
    await db()
      .update(proofProjects)
      .set({ trail: sql`(${proofProjects.trail} || ${JSON.stringify([clean])}::jsonb)` })
      .where(eq(proofProjects.goalId, goal.id));
    revalidatePath(`/g/${goalId}/proof`);
    return { ok: true };
  });
}

/* ─────────── Launch ─────────── */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export async function prepareLaunch(goalId: string): Promise<Result> {
  return guard(async () => {
    const { goal, session } = await owned(goalId);
    const project = await getProject(goal.id);
    if (!project) return { ok: false, error: "Pick a proof project first." };
    const existing = await getPack(goal.id);
    if (!existing) {
      const slug = `${slugify(session.user.name.split(" ")[0] ?? "me")}-${slugify(goal.companyName)}-${randomBytes(3).toString("hex")}`;
      await db().insert(proofPacks).values({ goalId: goal.id, slug }).onConflictDoNothing();
    } else {
      await db()
        .update(proofPacks)
        .set({ status: "pending", error: null })
        .where(eq(proofPacks.goalId, goal.id));
    }
    await enqueueCoach("launch", goal.id);
    revalidatePath(`/g/${goalId}/launch`);
    return { ok: true };
  });
}

export async function savePack(
  goalId: string,
  input: { videoUrl?: string; contactUrl?: string; claim?: string },
): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const pack = await getPack(goal.id);
    if (!pack) return { ok: false, error: "Set up your launch kit first." };
    const kit =
      pack.kit && input.claim ? { ...pack.kit, claim: input.claim.trim().slice(0, 130) } : pack.kit;
    await db()
      .update(proofPacks)
      .set({
        // A new video link (pasted, or a hosted upload) replaces an uploaded file.
        ...(input.videoUrl !== undefined ? { videoUrl: url(input.videoUrl), videoKey: null } : {}),
        ...(input.contactUrl !== undefined ? { contactUrl: url(input.contactUrl) } : {}),
        kit,
      })
      .where(eq(proofPacks.goalId, goal.id));
    revalidatePath(`/g/${goalId}/launch`);
    return { ok: true };
  });
}

/** The quality gate: a defended project, a video and a claim that passes the 7-second test. */
export async function publishPack(goalId: string): Promise<Result<{ slug: string }>> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const pack = await getPack(goal.id);
    if (!pack?.kit) return { ok: false, error: "Your launch kit isn't ready yet." };
    const defense = await mockState(goal.id, "defense");
    const defended =
      defense.stage === "done" &&
      defense.report.judged &&
      defense.report.judged.overall.recommendation !== "decline";
    if (!defended) return { ok: false, error: "Pass your defense interview first." };
    if (!pack.videoKey && !pack.videoUrl)
      return { ok: false, error: "Add your 2-minute video first." };
    await db()
      .update(proofPacks)
      .set({ publishedAt: new Date() })
      .where(eq(proofPacks.id, pack.id));
    revalidatePath(`/g/${goalId}`, "layout");
    return { ok: true, slug: pack.slug };
  });
}

export async function createLink(
  goalId: string,
  input: { channel: "post" | "dm" | "referral" | "resume" | "other"; label: string },
): Promise<Result<{ code: string }>> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const pack = await getPack(goal.id);
    if (!pack) return { ok: false, error: "Set up your launch kit first." };
    const label = input.label.trim().slice(0, 80) || "Link";
    const code = randomBytes(5)
      .toString("base64url")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "x");
    await db().insert(packLinks).values({ packId: pack.id, code, channel: input.channel, label });
    revalidatePath(`/g/${goalId}/launch`);
    return { ok: true, code };
  });
}

export async function markReplied(
  goalId: string,
  linkId: string,
  replied: boolean,
): Promise<Result> {
  return guard(async () => {
    const { goal } = await owned(goalId);
    const pack = await getPack(goal.id);
    if (!pack) return { ok: false, error: "No launch kit." };
    await db()
      .update(packLinks)
      .set({ replied })
      .where(and(eq(packLinks.id, linkId), eq(packLinks.packId, pack.id)));
    revalidatePath(`/g/${goalId}/launch`);
    return { ok: true };
  });
}
