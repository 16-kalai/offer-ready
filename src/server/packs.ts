import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { goals, packEvents, packLinks, proofPacks, proofProjects, user } from "@/db/schema";
import { THINKING } from "@/lib/interview";
import { mockState } from "@/server/goals";

/** Everything the public Proof Page shows. Never the resume, the transcript or contact details. */
export async function publicPack(slug: string) {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const [row] = await db()
    .select({ pack: proofPacks, goal: goals, project: proofProjects, name: user.name })
    .from(proofPacks)
    .innerJoin(goals, eq(goals.id, proofPacks.goalId))
    .innerJoin(proofProjects, eq(proofProjects.goalId, goals.id))
    .innerJoin(user, eq(user.id, goals.ownerId))
    .where(eq(proofPacks.slug, slug))
    .limit(1);
  if (!row?.pack.kit) return null;
  const defense = await mockState(row.goal.id, "defense");
  const judged = defense.stage === "done" ? defense.report.judged : null;
  const defended = judged
    ? {
        at: row.pack.publishedAt ?? new Date(),
        recommendation: judged.overall.recommendation,
        skills: judged.skills.map((s) => ({
          name: THINKING.find((t) => t.id === s.id)?.name ?? s.id,
          score: s.score,
          quote: s.evidence[0]?.quote ?? null,
        })),
      }
    : null;
  return { ...row, defended };
}

/** The live feed on the launch page: recent views with where they came from and how long they watched. */
export async function packActivity(packId: string) {
  const views = await db()
    .select({
      viewId: packEvents.viewId,
      openedAt: sql<Date>`min(${packEvents.createdAt})`,
      watched: sql<number>`coalesce(max(${packEvents.value}) filter (where ${packEvents.kind} = 'watch'), 0)::int`,
      build: sql<boolean>`bool_or(${packEvents.kind} = 'build')`,
      contact: sql<boolean>`bool_or(${packEvents.kind} = 'contact')`,
      label: sql<string | null>`max(${packLinks.label})`,
      channel: sql<string | null>`max(${packLinks.channel})`,
    })
    .from(packEvents)
    .leftJoin(packLinks, eq(packLinks.id, packEvents.linkId))
    .where(eq(packEvents.packId, packId))
    .groupBy(packEvents.viewId)
    .orderBy(desc(sql`min(${packEvents.createdAt})`))
    .limit(30);
  const perLink = await db()
    .select({
      linkId: packEvents.linkId,
      opens: sql<number>`count(distinct ${packEvents.viewId}) filter (where ${packEvents.kind} = 'open')::int`,
      watched: sql<number>`coalesce(max(${packEvents.value}) filter (where ${packEvents.kind} = 'watch'), 0)::int`,
    })
    .from(packEvents)
    .where(eq(packEvents.packId, packId))
    .groupBy(packEvents.linkId);
  return { views, perLink: new Map(perLink.map((p) => [p.linkId, p])) };
}
