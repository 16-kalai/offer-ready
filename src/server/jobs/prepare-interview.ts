import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  candidateInterviews,
  candidates,
  invitations,
  mocks,
  roles,
  workspaces,
} from "@/db/schema";
import { deidentify } from "@/lib/interview";
import { writeCandidatePlan } from "@/server/ai/interview";
import { enqueueInvites } from "@/server/queue";
import { blobs } from "@/server/storage";
import { readText } from "./process-resume";

/**
 * Writes one candidate's personal interview from their de-identified resume,
 * within the role's approved blueprint. Runs in the worker; idempotent (a
 * ready plan is reused). When an invitation is waiting on it, queues the email.
 */
export async function prepareInterview(
  candidateId: string,
  invitationId: string | null,
): Promise<void> {
  const [row] = await db()
    .select({
      candidate: candidates,
      role: roles,
      workspace: workspaces,
      plan: candidateInterviews,
      mock: mocks,
    })
    .from(candidates)
    .innerJoin(roles, eq(roles.id, candidates.roleId))
    .innerJoin(workspaces, eq(workspaces.ownerId, candidates.ownerId))
    .leftJoin(candidateInterviews, eq(candidateInterviews.candidateId, candidates.id))
    .leftJoin(mocks, eq(mocks.candidateId, candidates.id))
    .where(eq(candidates.id, candidateId))
    .limit(1);
  const blueprint = row?.role.blueprint;
  if (!row || !blueprint) return;
  const { candidate, role, workspace } = row;

  if (row.plan?.status !== "ready") {
    await db()
      .insert(candidateInterviews)
      .values({
        candidateId,
        roleId: role.id,
        ownerId: candidate.ownerId,
        blueprint,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: candidateInterviews.candidateId,
        set: { status: "pending", blueprint, error: null },
      });

    // A mock interview carries its own resume text (the defense adds the proof project).
    const text =
      row.mock?.resumeText ??
      (await readText(candidate.fileType, await blobs().get(candidate.fileKey)));
    const { plan, model } = await writeCandidatePlan({
      companyName: role.companyName ?? workspace.companyName,
      focusProject: row.mock?.focus ?? null,
      roleTitle: role.title,
      jobDescription: role.jobDescription,
      brief: role.brief,
      blueprint,
      resume: deidentify(text, candidate.name),
    });
    await db()
      .update(candidateInterviews)
      .set({ status: "ready", plan, model, error: null })
      .where(eq(candidateInterviews.candidateId, candidateId));
  }

  if (invitationId) await enqueueInvites([invitationId]);
}

/** Out of retries: the plan is marked failed, and so is the invite waiting on it (HR can retry). */
export async function markPrepareFailed(
  candidateId: string,
  invitationId: string | null,
  message: string,
) {
  await db()
    .update(candidateInterviews)
    .set({ status: "failed", error: message })
    .where(eq(candidateInterviews.candidateId, candidateId));
  if (invitationId) {
    await db()
      .update(invitations)
      .set({
        status: "failed",
        error: "Couldn't prepare this candidate's interview. Retry to try again.",
      })
      .where(eq(invitations.id, invitationId));
  }
}
