import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activity, roles } from "@/db/schema";

/** Latest events for the timeline (served by activity_owner_created_idx). */
export async function recentActivity(ownerId: string, limit = 8) {
  return db()
    .select({
      id: activity.id,
      kind: activity.kind,
      data: activity.data,
      createdAt: activity.createdAt,
      roleId: activity.roleId,
      roleTitle: roles.title,
    })
    .from(activity)
    .leftJoin(roles, eq(roles.id, activity.roleId))
    .where(eq(activity.ownerId, ownerId))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

export type ActivityItem = Awaited<ReturnType<typeof recentActivity>>[number];

/** Interviews completed on each of the last 7 days (UTC), oldest first, zero-filled. */
export async function interviewsByDay(
  ownerId: string,
  now = new Date(),
): Promise<{ day: Date; count: number }[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
  const rows = await db()
    .select({
      day: sql<string>`to_char(date_trunc('day', ${activity.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`coalesce(sum(coalesce((${activity.data}->>'count')::int, 1)), 0)`.mapWith(
        Number,
      ),
    })
    .from(activity)
    .where(
      and(
        eq(activity.ownerId, ownerId),
        eq(activity.kind, "interview_completed"),
        gte(activity.createdAt, start),
      ),
    )
    .groupBy(sql`1`);
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start.getTime() + i * 86_400_000);
    return { day, count: byDay.get(day.toISOString().slice(0, 10)) ?? 0 };
  });
}
