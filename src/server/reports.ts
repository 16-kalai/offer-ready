import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  candidateInterviews,
  candidates,
  canvasEvents,
  interviewReports,
  interviewSessions,
  roles,
  transcriptTurns,
} from "@/db/schema";
import { currentPlan } from "@/lib/interview";

/**
 * Everything HR needs to review one interview: the report, the transcript
 * (each answer with how it was given) and what happened on the canvas.
 * Only for the HR user who owns the role.
 */
export async function getInterviewReview(ownerId: string, roleId: string, sessionId: string) {
  const [row] = await db()
    .select({
      session: interviewSessions,
      report: interviewReports,
      candidateId: candidates.id,
      candidateName: candidates.name,
      decision: candidates.decision,
      decisionNote: candidates.decisionNote,
      decidedAt: candidates.decidedAt,
      fileName: candidates.fileName,
      email: candidates.email,
      roleTitle: roles.title,
      plan: candidateInterviews.plan,
      blueprint: candidateInterviews.blueprint,
    })
    .from(interviewSessions)
    .innerJoin(candidates, eq(candidates.id, interviewSessions.candidateId))
    .innerJoin(roles, eq(roles.id, interviewSessions.roleId))
    .leftJoin(
      candidateInterviews,
      eq(candidateInterviews.candidateId, interviewSessions.candidateId),
    )
    .leftJoin(interviewReports, eq(interviewReports.sessionId, interviewSessions.id))
    .where(
      and(
        eq(interviewSessions.id, sessionId),
        eq(interviewSessions.roleId, roleId),
        eq(interviewSessions.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [transcript, events] = await Promise.all([
    db()
      .select({
        seq: transcriptTurns.seq,
        speaker: transcriptTurns.speaker,
        part: transcriptTurns.part,
        text: transcriptTurns.text,
        atMs: transcriptTurns.atMs,
        metrics: transcriptTurns.metrics,
      })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.sessionId, sessionId))
      .orderBy(asc(transcriptTurns.seq)),
    db()
      .select({
        seq: canvasEvents.seq,
        kind: canvasEvents.kind,
        caseNumber: canvasEvents.caseNumber,
        by: canvasEvents.by,
        ids: canvasEvents.ids,
        text: canvasEvents.text,
        atMs: canvasEvents.atMs,
      })
      .from(canvasEvents)
      .where(eq(canvasEvents.sessionId, sessionId))
      .orderBy(asc(canvasEvents.seq)),
  ]);
  return { ...row, plan: currentPlan(row.plan), transcript, events };
}

export type InterviewReview = NonNullable<Awaited<ReturnType<typeof getInterviewReview>>>;
