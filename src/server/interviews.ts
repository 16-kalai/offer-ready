import "server-only";
import { and, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activity, candidateInterviews, candidates, invitations, roles } from "@/db/schema";
import { type Blueprint, currentPlan } from "@/lib/interview";

/**
 * Saves how this role's interviews are built. Any change clears approval, and
 * personal plans not yet sent are discarded so they're rewritten under the new
 * blueprint. Plans already sent to candidates are kept as they were.
 */
export async function saveBlueprint(
  ownerId: string,
  roleId: string,
  blueprint: Blueprint,
): Promise<boolean> {
  return db().transaction(async (tx) => {
    const rows = await tx
      .update(roles)
      .set({ blueprint, kitApprovedAt: null, lastActivityAt: new Date() })
      .where(and(eq(roles.id, roleId), eq(roles.ownerId, ownerId)))
      .returning({ id: roles.id });
    if (!rows.length) return false;
    const sent = tx
      .select({ id: invitations.candidateId })
      .from(invitations)
      .where(
        and(eq(invitations.roleId, roleId), notInArray(invitations.status, ["queued", "failed"])),
      );
    await tx
      .delete(candidateInterviews)
      .where(
        and(
          eq(candidateInterviews.roleId, roleId),
          notInArray(candidateInterviews.candidateId, sent),
        ),
      );
    return true;
  });
}

export async function approveInterview(ownerId: string, roleId: string): Promise<boolean> {
  return db().transaction(async (tx) => {
    const rows = await tx
      .update(roles)
      .set({
        kitApprovedAt: new Date(),
        lastActivityAt: new Date(),
        status: sql`case when ${roles.status} = 'draft' then 'kit_ready'::role_status else ${roles.status} end`,
      })
      .where(
        and(eq(roles.id, roleId), eq(roles.ownerId, ownerId), sql`${roles.blueprint} is not null`),
      )
      .returning({ id: roles.id });
    if (rows.length) await tx.insert(activity).values({ ownerId, roleId, kind: "kit_ready" });
    return rows.length > 0;
  });
}

/** Shortlisted candidates (best first) to preview a real personal interview with. */
export async function previewCandidates(ownerId: string, roleId: string) {
  return db()
    .select({
      id: candidates.id,
      name: candidates.name,
      fileName: candidates.fileName,
      currentTitle: candidates.currentTitle,
      score: candidates.score,
      planStatus: candidateInterviews.status,
    })
    .from(candidates)
    .leftJoin(candidateInterviews, eq(candidateInterviews.candidateId, candidates.id))
    .where(
      and(
        eq(candidates.roleId, roleId),
        eq(candidates.ownerId, ownerId),
        eq(candidates.status, "scored"),
        or(eq(candidates.shortlisted, true), sql`${candidateInterviews.id} is not null`),
      ),
    )
    .orderBy(desc(candidates.score))
    .limit(8);
}

export async function getCandidatePlan(ownerId: string, candidateId: string) {
  const [row] = await db()
    .select({
      plan: candidateInterviews,
      name: candidates.name,
      fileName: candidates.fileName,
      roleId: candidates.roleId,
    })
    .from(candidates)
    .leftJoin(candidateInterviews, eq(candidateInterviews.candidateId, candidates.id))
    .where(and(eq(candidates.id, candidateId), eq(candidates.ownerId, ownerId)))
    .limit(1);
  if (!row?.plan) return row ?? null;
  // An older format reads as "being written" until it's regenerated.
  const plan = currentPlan(row.plan.plan);
  return {
    ...row,
    plan: plan ? { ...row.plan, plan } : { ...row.plan, plan: null, status: "pending" as const },
  };
}

/** Marks a plan for rewriting (preview "regenerate"), unless the candidate already started. */
export async function resetPlan(ownerId: string, candidateId: string): Promise<boolean> {
  const started = await db()
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.candidateId, candidateId),
        inArray(invitations.status, ["started", "completed"]),
      ),
    )
    .limit(1);
  if (started.length) return false;
  await db()
    .delete(candidateInterviews)
    .where(
      and(
        eq(candidateInterviews.candidateId, candidateId),
        eq(candidateInterviews.ownerId, ownerId),
      ),
    );
  return true;
}

/** Shows "writing…" right away, before the worker picks the job up. */
export async function markPlanPending(
  ownerId: string,
  roleId: string,
  candidateId: string,
  blueprint: Blueprint,
) {
  await db()
    .insert(candidateInterviews)
    .values({ candidateId, roleId, ownerId, blueprint, status: "pending" })
    .onConflictDoUpdate({
      target: candidateInterviews.candidateId,
      set: { status: "pending", blueprint, error: null },
      where: sql`${candidateInterviews.status} <> 'ready'`,
    });
}
