import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activity, candidates, invitations, roles } from "@/db/schema";

export const MAX_RESUMES_PER_ROLE = 2_000;

/**
 * Adds an uploaded resume to a role. The same file twice is a no-op (unique
 * on role + content hash). The first resume moves the role to "collecting",
 * which also freezes its JD.
 */
export async function addCandidate(input: {
  ownerId: string;
  roleId: string;
  fileName: string;
  fileKey: string;
  fileSha256: string;
  fileSize: number;
  fileType: "pdf" | "docx";
}): Promise<{ id: string } | null> {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .insert(candidates)
      .values(input)
      .onConflictDoNothing({ target: [candidates.roleId, candidates.fileSha256] })
      .returning({ id: candidates.id });
    if (!row) return null;
    await tx
      .update(roles)
      .set({
        appliedCount: sql`${roles.appliedCount} + 1`,
        status: sql`case when ${roles.status} = 'draft' then 'collecting'::role_status else ${roles.status} end`,
        lastActivityAt: new Date(),
      })
      .where(eq(roles.id, input.roleId));
    return row;
  });
}

export async function recordResumesAdded(ownerId: string, roleId: string, count: number) {
  if (count > 0)
    await db().insert(activity).values({ ownerId, roleId, kind: "resumes_added", data: { count } });
}

export async function candidateCounts(ownerId: string, roleId: string) {
  const rows = await db()
    .select({ status: candidates.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(candidates)
    .where(and(eq(candidates.roleId, roleId), eq(candidates.ownerId, ownerId)))
    .groupBy(candidates.status);
  const counts = { queued: 0, reading: 0, scored: 0, failed: 0, duplicate: 0 };
  for (const r of rows) counts[r.status] = r.count;
  return counts;
}

/** Everyone for the ranked list (up to the per-role cap), best match first. */
export async function listCandidates(ownerId: string, roleId: string) {
  return db()
    .select({
      id: candidates.id,
      status: candidates.status,
      fileName: candidates.fileName,
      error: candidates.error,
      name: candidates.name,
      email: candidates.email,
      phone: candidates.phone,
      years: candidates.years,
      currentTitle: candidates.currentTitle,
      score: candidates.score,
      match: candidates.match,
      shortlisted: candidates.shortlisted,
      inviteStatus: invitations.status,
    })
    .from(candidates)
    .leftJoin(invitations, eq(invitations.candidateId, candidates.id))
    .where(
      and(
        eq(candidates.roleId, roleId),
        eq(candidates.ownerId, ownerId),
        ne(candidates.status, "duplicate"),
      ),
    )
    .orderBy(sql`${candidates.score} desc nulls last`, desc(candidates.createdAt))
    .limit(MAX_RESUMES_PER_ROLE);
}

export type CandidateRow = Awaited<ReturnType<typeof listCandidates>>[number];

export type ShortlistSelection =
  | { mode: "top"; count: number }
  | { mode: "min"; score: number }
  | { mode: "ids"; ids: string[] };

/** Replaces the shortlist in one transaction and updates the role's counter. HR decides; nobody is rejected. */
export async function saveShortlist(
  ownerId: string,
  roleId: string,
  selection: ShortlistSelection,
): Promise<number> {
  return db().transaction(async (tx) => {
    const scope = and(
      eq(candidates.roleId, roleId),
      eq(candidates.ownerId, ownerId),
      eq(candidates.status, "scored"),
    );
    await tx
      .update(candidates)
      .set({ shortlisted: false })
      .where(and(scope, eq(candidates.shortlisted, true)));
    let chosen: string[];
    if (selection.mode === "ids") {
      chosen = selection.ids;
    } else {
      const rows = await tx
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          selection.mode === "min"
            ? and(scope, sql`${candidates.score} >= ${selection.score}`)
            : scope,
        )
        .orderBy(desc(candidates.score), desc(candidates.createdAt))
        .limit(selection.mode === "top" ? selection.count : MAX_RESUMES_PER_ROLE);
      chosen = rows.map((r) => r.id);
    }
    const updated = chosen.length
      ? await tx
          .update(candidates)
          .set({ shortlisted: true })
          .where(and(scope, inArray(candidates.id, chosen)))
          .returning({ id: candidates.id })
      : [];
    await tx
      .update(roles)
      .set({ shortlistedCount: updated.length, lastActivityAt: new Date() })
      .where(and(eq(roles.id, roleId), eq(roles.ownerId, ownerId)));
    return updated.length;
  });
}
