import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activity,
  candidateInterviews,
  candidates,
  interviewReports,
  interviewSessions,
  invitations,
  roles,
} from "@/db/schema";
import { enqueueInvites } from "@/server/queue";

export const INVITE_HOURS = [24, 48, 72] as const;

/** Shortlisted candidates for the review screen, with any invitation they already have. */
export async function inviteRecipients(ownerId: string, roleId: string) {
  return db()
    .select({
      id: candidates.id,
      name: candidates.name,
      email: candidates.email,
      score: candidates.score,
      fileName: candidates.fileName,
      inviteStatus: invitations.status,
    })
    .from(candidates)
    .leftJoin(invitations, eq(invitations.candidateId, candidates.id))
    .where(
      and(
        eq(candidates.roleId, roleId),
        eq(candidates.ownerId, ownerId),
        eq(candidates.shortlisted, true),
      ),
    )
    .orderBy(sql`${candidates.score} desc nulls last`);
}

/**
 * Creates invitations for the chosen shortlisted candidates who have an email
 * and no invitation yet, then queues them. One transaction: counters, role status and
 * the timeline entry move together. Returns how many were queued.
 */
export async function createInvitations(
  ownerId: string,
  roleId: string,
  options: {
    hours: number;
    note: string | null;
    channel: "gmail" | "dev";
    /** HR's pick from the shortlist; anyone not shortlisted or already invited is ignored. */
    candidateIds: string[];
  },
): Promise<number> {
  const ids = await db().transaction(async (tx) => {
    const eligible = await tx
      .select({ id: candidates.id, email: candidates.email })
      .from(candidates)
      .leftJoin(invitations, eq(invitations.candidateId, candidates.id))
      .where(
        and(
          eq(candidates.roleId, roleId),
          eq(candidates.ownerId, ownerId),
          eq(candidates.shortlisted, true),
          eq(candidates.status, "scored"),
          inArray(candidates.id, options.candidateIds),
          isNull(invitations.id),
        ),
      );
    const withEmail = eligible.filter((c): c is { id: string; email: string } => Boolean(c.email));
    if (withEmail.length === 0) return [];
    const rows = await tx
      .insert(invitations)
      .values(
        withEmail.map((c) => ({
          candidateId: c.id,
          roleId,
          ownerId,
          email: c.email,
          channel: options.channel,
          expiresInHours: options.hours,
          note: options.note,
        })),
      )
      .onConflictDoNothing({ target: invitations.candidateId })
      .returning({ id: invitations.id });
    if (rows.length) {
      await tx
        .update(roles)
        .set({
          invitedCount: sql`${roles.invitedCount} + ${rows.length}`,
          status: sql`case when ${roles.status} in ('draft', 'kit_ready', 'collecting') then 'interviewing'::role_status else ${roles.status} end`,
          lastActivityAt: new Date(),
        })
        .where(and(eq(roles.id, roleId), eq(roles.ownerId, ownerId)));
      await tx
        .insert(activity)
        .values({ ownerId, roleId, kind: "invites_sent", data: { count: rows.length } });
    }
    return rows.map((r) => r.id);
  });
  await enqueueInvites(ids);
  return ids.length;
}

/** Retries failed sends (e.g. after reconnecting Gmail). */
export async function retryFailedInvitations(
  ownerId: string,
  roleId: string,
  channel: "gmail" | "dev",
) {
  const rows = await db()
    .update(invitations)
    .set({ status: "queued", error: null, channel })
    .where(
      and(
        eq(invitations.roleId, roleId),
        eq(invitations.ownerId, ownerId),
        eq(invitations.status, "failed"),
      ),
    )
    .returning({ id: invitations.id });
  await enqueueInvites(rows.map((r) => r.id));
  return rows.length;
}

export async function invitationCounts(ownerId: string, roleId: string) {
  const rows = await db()
    .select({ status: invitations.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(invitations)
    .where(and(eq(invitations.roleId, roleId), eq(invitations.ownerId, ownerId)))
    .groupBy(invitations.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<
    Record<(typeof rows)[number]["status"], number>
  >;
}

/** Status as HR should see it: a sent link past its deadline reads as expired. */
export function effectiveStatus(row: { status: string; expiresAt: Date | null }, now = Date.now()) {
  if (
    (row.status === "sent" || row.status === "opened") &&
    row.expiresAt &&
    row.expiresAt.getTime() < now
  ) {
    return "expired";
  }
  return row.status;
}

/** Everyone invited for a role, newest first, for the tracker. */
export async function listInvitations(ownerId: string, roleId: string) {
  return db()
    .select({
      id: invitations.id,
      status: invitations.status,
      email: invitations.email,
      channel: invitations.channel,
      sentAt: invitations.sentAt,
      openedAt: invitations.openedAt,
      expiresAt: invitations.expiresAt,
      nudgeCount: invitations.nudgeCount,
      lastNudgedAt: invitations.lastNudgedAt,
      error: invitations.error,
      createdAt: invitations.createdAt,
      name: candidates.name,
      fileName: candidates.fileName,
      score: candidates.score,
      planStatus: candidateInterviews.status,
      sessionId: interviewSessions.id,
      reportStatus: interviewReports.status,
      recommendation: sql<
        "advance" | "maybe" | "decline" | null
      >`${interviewReports.report}->'judged'->'overall'->>'recommendation'`,
      strongNotes: sql<number>`coalesce((select count(*) from jsonb_array_elements(${interviewReports.report}->'integrity') n where n->>'level' = 'strong'), 0)::int`,
    })
    .from(invitations)
    .innerJoin(candidates, eq(candidates.id, invitations.candidateId))
    .leftJoin(candidateInterviews, eq(candidateInterviews.candidateId, invitations.candidateId))
    .leftJoin(interviewSessions, eq(interviewSessions.invitationId, invitations.id))
    .leftJoin(interviewReports, eq(interviewReports.sessionId, interviewSessions.id))
    .where(and(eq(invitations.roleId, roleId), eq(invitations.ownerId, ownerId)))
    .orderBy(sql`${candidates.score} desc nulls last`);
}

export type InvitationRow = Awaited<ReturnType<typeof listInvitations>>[number];

async function ownedInvitation(ownerId: string, id: string) {
  const [row] = await db()
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/** Queues a reminder with a fresh link. The worker re-checks the same limits before sending. */
export async function nudgeInvitation(
  ownerId: string,
  id: string,
  limits: { maxNudges: number; gapMs: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inv = await ownedInvitation(ownerId, id);
  if (!inv) return { ok: false, error: "Invite not found." };
  if (effectiveStatus(inv) === "expired")
    return { ok: false, error: "The link expired. Extend it first." };
  if (inv.status !== "sent" && inv.status !== "opened")
    return { ok: false, error: "Only waiting invites can be nudged." };
  if (inv.nudgeCount >= limits.maxNudges)
    return { ok: false, error: `Already reminded ${limits.maxNudges} times.` };
  if (inv.lastNudgedAt && Date.now() - inv.lastNudgedAt.getTime() < limits.gapMs) {
    return { ok: false, error: "Reminded recently. Try again in a couple of hours." };
  }
  await enqueueInvites([id], { kind: "nudge" });
  return { ok: true };
}

/** Gives the same link more time. Works for expired links too. */
export async function extendInvitation(ownerId: string, id: string, hours: number) {
  const inv = await ownedInvitation(ownerId, id);
  if (!inv?.expiresAt || !["sent", "opened", "expired"].includes(inv.status)) return false;
  const base = Math.max(inv.expiresAt.getTime(), Date.now());
  await db()
    .update(invitations)
    .set({
      expiresAt: new Date(base + hours * 3_600_000),
      status: inv.status === "expired" ? "sent" : inv.status,
    })
    .where(eq(invitations.id, id));
  return true;
}

/**
 * A fresh attempt after an interrupted interview: the old attempt and its
 * transcript are removed, and the same link works again for at least a day.
 */
export async function allowRetake(ownerId: string, id: string) {
  const inv = await ownedInvitation(ownerId, id);
  if (inv?.status !== "incomplete") return false;
  await db().transaction(async (tx) => {
    await tx.delete(interviewSessions).where(eq(interviewSessions.invitationId, id));
    await tx
      .update(invitations)
      .set({
        status: "sent",
        expiresAt: new Date(Math.max(inv.expiresAt?.getTime() ?? 0, Date.now() + 24 * 3_600_000)),
      })
      .where(and(eq(invitations.id, id), eq(invitations.status, "incomplete")));
  });
  return true;
}

/** Kills the link. The candidate sees "This link isn't valid". */
export async function cancelInvitation(ownerId: string, id: string) {
  const rows = await db()
    .update(invitations)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.ownerId, ownerId),
        inArray(invitations.status, ["queued", "sent", "opened", "failed"]),
      ),
    )
    .returning({ id: invitations.id });
  return rows.length > 0;
}
