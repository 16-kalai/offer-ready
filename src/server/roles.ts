import "server-only";
import { and, desc, eq, gt, ne, or, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import {
  activity,
  candidates,
  interviewReports,
  interviewSessions,
  type Role,
  roles,
} from "@/db/schema";
import { type JobDescription, type RoleBrief, renderJobDescription } from "@/lib/role-brief";
import type { NewRole, RoleFilter } from "@/lib/roles";

/**
 * Data access for roles. Every query is scoped to the owner, so one HR user can
 * never read or change another's roles, whatever id is passed in.
 */

export const ROLES_PAGE_SIZE = 20;

export type RoleRow = Pick<
  Role,
  | "id"
  | "title"
  | "status"
  | "appliedCount"
  | "invitedCount"
  | "completedCount"
  | "toReviewCount"
  | "lastActivityAt"
  | "jdApprovedAt"
>;

const rowColumns = {
  id: roles.id,
  title: roles.title,
  status: roles.status,
  appliedCount: roles.appliedCount,
  invitedCount: roles.invitedCount,
  completedCount: roles.completedCount,
  toReviewCount: roles.toReviewCount,
  lastActivityAt: roles.lastActivityAt,
  jdApprovedAt: roles.jdApprovedAt,
};

const FILTERS = {
  all: undefined,
  active: ne(roles.status, "closed"),
  review: gt(roles.toReviewCount, 0),
} satisfies Record<RoleFilter, unknown>;

/** Opaque cursor: the (last_activity_at, id) of the last row seen. */
function encodeCursor(row: RoleRow): string {
  return Buffer.from(`${row.lastActivityAt.toISOString()}|${row.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const at = new Date(iso ?? "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Number.isNaN(at.getTime()) || !id || !uuid.test(id) ? null : { at, id };
}

/** One page of roles, most recent activity first (keyset pagination, served by roles_owner_activity_idx). */
export async function listRoles(
  ownerId: string,
  options: { cursor?: string; filter?: RoleFilter } = {},
): Promise<{ rows: RoleRow[]; nextCursor: string | null }> {
  const after = options.cursor ? decodeCursor(options.cursor) : null;
  const rows = await db()
    .select(rowColumns)
    .from(roles)
    .where(
      and(
        eq(roles.ownerId, ownerId),
        FILTERS[options.filter ?? "all"],
        after
          ? sql`(${roles.lastActivityAt}, ${roles.id}) < (${after.at}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(sql`${roles.lastActivityAt} desc nulls last`, sql`${roles.id} desc nulls last`)
    .limit(ROLES_PAGE_SIZE + 1);
  const page = rows.slice(0, ROLES_PAGE_SIZE);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: rows.length > ROLES_PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

/** Totals for the profile card and tabs, from the counters on each role. */
export async function roleSummary(ownerId: string) {
  const open = sql`${roles.status} <> 'closed'`;
  const [row] = await db()
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${open})`.mapWith(Number),
      built: sql<number>`count(*) filter (where ${roles.status} <> 'draft')`.mapWith(Number),
      applied: sql<number>`coalesce(sum(${roles.appliedCount}), 0)`.mapWith(Number),
      invited: sql<number>`coalesce(sum(${roles.invitedCount}), 0)`.mapWith(Number),
      completed: sql<number>`coalesce(sum(${roles.completedCount}), 0)`.mapWith(Number),
      shortlisted: sql<number>`coalesce(sum(${roles.shortlistedCount}), 0)`.mapWith(Number),
      toReview:
        sql<number>`coalesce(sum(${roles.toReviewCount}) filter (where ${open}), 0)`.mapWith(
          Number,
        ),
      rolesToReview: sql<number>`count(*) filter (where ${roles.toReviewCount} > 0)`.mapWith(
        Number,
      ),
    })
    .from(roles)
    .where(eq(roles.ownerId, ownerId));
  return (
    row ?? { total: 0, active: 0, completed: 0, shortlisted: 0, toReview: 0, rolesToReview: 0 }
  );
}

/** The few roles that need a decision now: results to review first, then unfinished drafts. */
export async function rolesNeedingYou(ownerId: string, limit = 3) {
  return db()
    .select({
      id: roles.id,
      title: roles.title,
      status: roles.status,
      toReviewCount: roles.toReviewCount,
      jdApprovedAt: roles.jdApprovedAt,
    })
    .from(roles)
    .where(
      and(eq(roles.ownerId, ownerId), or(gt(roles.toReviewCount, 0), eq(roles.status, "draft"))),
    )
    .orderBy(desc(roles.toReviewCount), desc(roles.lastActivityAt))
    .limit(limit);
}

/** Cached per request: the role layout and its page share one query. */
export const getRole = cache(async (ownerId: string, id: string): Promise<Role | null> => {
  const [row] = await db()
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
});

/** Creates the role and its first timeline entry together, or neither. */
export async function createRole(ownerId: string, input: NewRole): Promise<{ id: string }> {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .insert(roles)
      .values({ ownerId, title: input.title, jobDescription: input.jobDescription })
      .returning({ id: roles.id });
    if (!row) throw new Error("createRole: insert returned no row");
    await tx.insert(activity).values({ ownerId, roleId: row.id, kind: "role_created" });
    return row;
  });
}

/** A role written by Werdict from HR's brief, waiting for HR to review the JD. */
export async function createRoleFromBrief(
  ownerId: string,
  input: { brief: RoleBrief; jd: JobDescription; model: string },
): Promise<{ id: string }> {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .insert(roles)
      .values({
        ownerId,
        title: input.brief.title,
        brief: input.brief,
        jd: input.jd,
        jdModel: input.model,
        jobDescription: renderJobDescription(input.jd),
      })
      .returning({ id: roles.id });
    if (!row) throw new Error("createRoleFromBrief: insert returned no row");
    await tx.insert(activity).values({ ownerId, roleId: row.id, kind: "role_created" });
    return row;
  });
}

/**
 * Saves an edited or regenerated JD. Any change clears approval, so what HR
 * approved is always exactly what is stored. Only drafts can be changed.
 */
export async function saveJobDescription(
  ownerId: string,
  id: string,
  update: { jd: JobDescription; model?: string } | { text: string },
): Promise<boolean> {
  const values =
    "jd" in update
      ? {
          jd: update.jd,
          jobDescription: renderJobDescription(update.jd),
          ...(update.model ? { jdModel: update.model } : {}),
        }
      : { jobDescription: update.text };
  const rows = await db()
    .update(roles)
    .set({ ...values, jdApprovedAt: null, lastActivityAt: new Date() })
    .where(and(eq(roles.id, id), eq(roles.ownerId, ownerId), eq(roles.status, "draft")))
    .returning({ id: roles.id });
  return rows.length > 0;
}

export async function setJobDescriptionApproved(
  ownerId: string,
  id: string,
  approved: boolean,
): Promise<boolean> {
  return db().transaction(async (tx) => {
    const rows = await tx
      .update(roles)
      .set({ jdApprovedAt: approved ? new Date() : null, lastActivityAt: new Date() })
      .where(and(eq(roles.id, id), eq(roles.ownerId, ownerId), eq(roles.status, "draft")))
      .returning({ id: roles.id });
    if (rows.length && approved)
      await tx.insert(activity).values({ ownerId, roleId: id, kind: "jd_approved" });
    return rows.length > 0;
  });
}

/**
 * Recounts a role's interview numbers from the source tables: finished
 * interviews, and reports ready that nobody has decided on yet. Exact and
 * idempotent (no increments to drift), so it's safe to call after any change:
 * an interview ending, a report being written, a decision.
 */
export async function refreshRoleCounts(roleId: string) {
  await db()
    .update(roles)
    .set({
      completedCount: sql`(
        select count(*)::int from ${interviewSessions}
        where ${interviewSessions.roleId} = ${roles.id}
          and ${interviewSessions.status} in ('completed', 'incomplete')
      )`,
      toReviewCount: sql`(
        select count(*)::int from ${interviewReports}
        join ${candidates} on ${candidates.id} = ${interviewReports.candidateId}
        where ${interviewReports.roleId} = ${roles.id}
          and ${interviewReports.status} = 'ready'
          and ${candidates.decision} is null
      )`,
    })
    .where(eq(roles.id, roleId));
}
