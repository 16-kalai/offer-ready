import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  candidateInterviews,
  canvasEvents,
  interviewReports,
  interviewSessions,
  invitations,
  roles,
  transcriptTurns,
  workspaces,
} from "@/db/schema";
import { canaryFor, findCanaries } from "@/lib/integrity";
import { currentPlan } from "@/lib/interview";
import {
  enoughEvidence,
  type IntegrityNote,
  type InterviewReport,
  REPORT_VERSION,
} from "@/lib/report";
import { judgeInterview } from "@/server/ai/score";
import { onMockScored } from "@/server/jobs/coach";
import { refreshRoleCounts } from "@/server/roles";

const clock = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/**
 * Writes the report for a finished interview. Runs in the worker when an
 * interview ends; safe to run again (it rewrites the same row). Canary
 * checks are deterministic code; the rest is drafted by the AI and checked.
 */
export async function scoreInterview(sessionId: string): Promise<void> {
  const [row] = await db()
    .select({
      session: interviewSessions,
      invitationId: invitations.id,
      plan: candidateInterviews.plan,
      blueprint: candidateInterviews.blueprint,
      roleTitle: roles.title,
      companyName: sql<string>`coalesce(${roles.companyName}, ${workspaces.companyName})`,
    })
    .from(interviewSessions)
    .innerJoin(invitations, eq(invitations.id, interviewSessions.invitationId))
    .innerJoin(
      candidateInterviews,
      eq(candidateInterviews.candidateId, interviewSessions.candidateId),
    )
    .innerJoin(roles, eq(roles.id, interviewSessions.roleId))
    .innerJoin(workspaces, eq(workspaces.ownerId, interviewSessions.ownerId))
    .where(eq(interviewSessions.id, sessionId))
    .limit(1);
  if (!row) return;
  const { session } = row;
  if (session.status !== "completed" && session.status !== "incomplete") return;
  const plan = currentPlan(row.plan);
  if (!plan) throw new Error("The interview plan is in an older format.");

  await db()
    .insert(interviewReports)
    .values({
      sessionId,
      candidateId: session.candidateId,
      roleId: session.roleId,
      ownerId: session.ownerId,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: interviewReports.sessionId,
      set: { status: "pending", error: null },
    });

  try {
    const [transcript, events] = await Promise.all([
      db()
        .select()
        .from(transcriptTurns)
        .where(eq(transcriptTurns.sessionId, sessionId))
        .orderBy(asc(transcriptTurns.seq)),
      db()
        .select()
        .from(canvasEvents)
        .where(eq(canvasEvents.sessionId, sessionId))
        .orderBy(asc(canvasEvents.seq)),
    ]);
    const answers = transcript.filter((t) => t.speaker === "candidate");
    const answered = {
      turns: answers.length,
      words: answers.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0),
    };

    // Canaries: only the cases that were actually shown.
    const shown = plan.cases.slice(0, session.revealedCases);
    const canaries = shown.map((c, i) => ({
      caseNumber: i + 1,
      canary: canaryFor(row.invitationId, i, JSON.stringify(c)),
    }));
    const integrity: IntegrityNote[] = [];
    const seen = new Set<string>();
    for (const hit of findCanaries(
      answers,
      canaries.map((c) => c.canary),
    )) {
      if (seen.has(hit.term)) continue;
      seen.add(hit.term);
      const caseNumber = canaries.find((c) => c.canary.term === hit.term)?.caseNumber;
      const copy = events.find(
        (e) => e.kind === "copy" && e.caseNumber === caseNumber && e.atMs <= hit.atMs,
      );
      integrity.push({
        level: "strong",
        kind: "canary",
        atMs: hit.atMs,
        seqs: [hit.seq],
        explanation: `Said "${hit.term}" at ${clock(hit.atMs)}. That name exists only in hidden text on their screen for case ${caseNumber}, which people can't see; it reaches someone only by copying the case into an AI tool or through a screen-reading assistant.${copy ? ` They copied text from that case at ${clock(copy.atMs)}.` : ""}`,
      });
    }

    let report: InterviewReport;
    let model: string | null = null;
    if (!enoughEvidence(answered)) {
      report = {
        version: REPORT_VERSION,
        status: "insufficient",
        answered,
        judged: null,
        integrity,
      };
    } else {
      const result = await judgeInterview({
        companyName: row.companyName,
        roleTitle: row.roleTitle,
        roleSkills: row.blueprint.skills,
        plan,
        transcript: transcript.map((t) => ({
          seq: t.seq,
          speaker: t.speaker,
          part: t.part,
          text: t.text,
          metrics: t.metrics ?? null,
        })),
        events: events
          .filter((e) => e.kind === "case_shown" || e.kind === "twist_shown" || e.kind === "point")
          .map((e) => ({
            kind: e.kind,
            caseNumber: e.caseNumber,
            by: e.by,
            ids: e.ids,
            text: e.text,
          })),
      });
      model = result.model;
      const atOf = (seq: number) => transcript.find((t) => t.seq === seq)?.atMs ?? null;
      for (const n of result.judged.integrity) {
        integrity.push({
          level: "ask",
          kind: n.kind,
          atMs: atOf(Math.max(...n.seqs)),
          seqs: n.seqs,
          explanation: n.explanation,
        });
      }
      report = {
        version: REPORT_VERSION,
        status: "scored",
        answered,
        judged: result.judged,
        integrity,
      };
    }

    await db()
      .update(interviewReports)
      .set({ status: "ready", report, version: REPORT_VERSION, model, error: null })
      .where(eq(interviewReports.sessionId, sessionId));
    await refreshRoleCounts(session.roleId);
    // Offer Ready: a scored mock moves the candidate's journey on (readiness, plan, launch kit).
    await onMockScored(session.invitationId).catch((error) =>
      console.error("[coach] after-mock step failed", sessionId, error),
    );
  } catch (error) {
    await db()
      .update(interviewReports)
      .set({ status: "failed", error: error instanceof Error ? error.message : String(error) })
      .where(eq(interviewReports.sessionId, sessionId));
    throw error;
  }
}
