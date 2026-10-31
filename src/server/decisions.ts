import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activity,
  candidateInterviews,
  candidates,
  type HiringDecision,
  interviewReports,
  interviewSessions,
} from "@/db/schema";
import { currentPlan } from "@/lib/interview";
import { refreshRoleCounts } from "@/server/roles";

const ACTIVITY = {
  advance: "candidate_advanced",
  hold: "candidate_held",
  decline: "candidate_declined",
} as const;

/** A note is kept short in the activity feed; the full note stays on the candidate. */
const FEED_NOTE_CHARS = 160;

/**
 * Records HR's decision on an interviewed candidate (and replaces an earlier
 * one; each change is in the activity feed). Only for a candidate whose
 * interview has finished: the decision is about the interview.
 */
export async function decide(
  ownerId: string,
  candidateId: string,
  decision: HiringDecision,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db()
    .select({ candidate: candidates, sessionId: interviewSessions.id })
    .from(candidates)
    .leftJoin(
      interviewSessions,
      and(
        eq(interviewSessions.candidateId, candidates.id),
        inArray(interviewSessions.status, ["completed", "incomplete"]),
      ),
    )
    .where(and(eq(candidates.id, candidateId), eq(candidates.ownerId, ownerId)))
    .limit(1);
  if (!row) return { ok: false, error: "Candidate not found." };
  if (!row.sessionId) return { ok: false, error: "Decide once their interview has finished." };
  const { candidate } = row;
  const trimmed = note.trim();
  if (candidate.decision === decision && (candidate.decisionNote ?? "") === trimmed)
    return { ok: true };

  await db().transaction(async (tx) => {
    await tx
      .update(candidates)
      .set({
        decision,
        decisionNote: trimmed || null,
        decidedAt: new Date(),
        decidedBy: ownerId,
      })
      .where(eq(candidates.id, candidateId));
    await tx.insert(activity).values({
      ownerId,
      roleId: candidate.roleId,
      kind: ACTIVITY[decision],
      data: {
        candidate: candidate.name ?? undefined,
        ...(trimmed ? { note: trimmed.slice(0, FEED_NOTE_CHARS) } : {}),
      },
    });
  });
  await refreshRoleCounts(candidate.roleId);
  return { ok: true };
}

/** At most this many in one bulk decision: a page of results, and a bounded transaction. */
export const BULK_DECISION_MAX = 200;

/**
 * The same decision for several interviewed candidates of one role, all or
 * nothing: every one must belong to this HR user and role and have a finished
 * interview. Notes already written are kept. One line in the activity feed.
 */
export async function decideMany(
  ownerId: string,
  roleId: string,
  candidateIds: string[],
  decision: HiringDecision,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) return { ok: false, error: "Pick at least one person." };
  if (ids.length > BULK_DECISION_MAX)
    return { ok: false, error: `Pick at most ${BULK_DECISION_MAX} at a time.` };
  const eligible = await db()
    .select({ id: candidates.id, name: candidates.name })
    .from(candidates)
    .innerJoin(
      interviewSessions,
      and(
        eq(interviewSessions.candidateId, candidates.id),
        inArray(interviewSessions.status, ["completed", "incomplete"]),
      ),
    )
    .where(
      and(
        inArray(candidates.id, ids),
        eq(candidates.ownerId, ownerId),
        eq(candidates.roleId, roleId),
      ),
    );
  if (eligible.length !== ids.length)
    return {
      ok: false,
      error: "Some of these people haven't finished their interview. Refresh and try again.",
    };

  await db().transaction(async (tx) => {
    await tx
      .update(candidates)
      .set({ decision, decidedAt: new Date(), decidedBy: ownerId })
      .where(inArray(candidates.id, ids));
    await tx.insert(activity).values({
      ownerId,
      roleId,
      kind: ACTIVITY[decision],
      data:
        eligible.length === 1
          ? { candidate: eligible[0]?.name ?? undefined }
          : { count: eligible.length },
    });
  });
  await refreshRoleCounts(roleId);
  return { ok: true, count: eligible.length };
}

/**
 * Everyone in a role whose interview has finished, with their report and
 * HR's decision; or just the given interviews (for comparing them).
 */
export async function listResults(ownerId: string, roleId: string, sessionIds?: string[]) {
  return db()
    .select({
      candidateId: candidates.id,
      name: candidates.name,
      fileName: candidates.fileName,
      currentTitle: candidates.currentTitle,
      decision: candidates.decision,
      decisionNote: candidates.decisionNote,
      decidedAt: candidates.decidedAt,
      sessionId: interviewSessions.id,
      sessionStatus: interviewSessions.status,
      completedAt: interviewSessions.completedAt,
      reportStatus: interviewReports.status,
      report: interviewReports.report,
    })
    .from(interviewSessions)
    .innerJoin(candidates, eq(candidates.id, interviewSessions.candidateId))
    .leftJoin(interviewReports, eq(interviewReports.sessionId, interviewSessions.id))
    .where(
      and(
        eq(interviewSessions.roleId, roleId),
        eq(interviewSessions.ownerId, ownerId),
        inArray(interviewSessions.status, ["completed", "incomplete"]),
        sessionIds ? inArray(interviewSessions.id, sessionIds) : undefined,
      ),
    );
}

export type ResultRow = Awaited<ReturnType<typeof listResults>>[number];

/** Two to four interviews side by side: their results plus each one's own interview plan (for case titles). */
export async function getComparison(ownerId: string, roleId: string, sessionIds: string[]) {
  const rows = await listResults(ownerId, roleId, sessionIds);
  if (rows.length === 0) return [];
  const plans = await db()
    .select({ candidateId: candidateInterviews.candidateId, plan: candidateInterviews.plan })
    .from(candidateInterviews)
    .where(
      and(
        eq(candidateInterviews.ownerId, ownerId),
        inArray(
          candidateInterviews.candidateId,
          rows.map((r) => r.candidateId),
        ),
      ),
    );
  const planOf = new Map(plans.map((p) => [p.candidateId, currentPlan(p.plan)]));
  // In the order they were picked.
  return sessionIds
    .map((id) => rows.find((r) => r.sessionId === id))
    .filter((r): r is ResultRow => Boolean(r))
    .map((r) => ({ ...r, plan: planOf.get(r.candidateId) ?? null }));
}

export type ComparisonRow = Awaited<ReturnType<typeof getComparison>>[number];
