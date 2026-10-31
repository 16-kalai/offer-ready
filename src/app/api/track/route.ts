import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { packEvents, packLinks, proofPacks } from "@/db/schema";
import { allow } from "@/server/rate-limit";

/**
 * What a viewer did on a published Proof Page: opened it, watched the video
 * (the furthest second reached), opened the build, or tapped contact. One row
 * per view and kind; watch time only ever grows. Called with sendBeacon.
 */
const body = z.object({
  slug: z.string().min(3).max(80),
  code: z.string().max(20).nullable().optional(),
  viewId: z.string().regex(/^[a-zA-Z0-9_-]{8,40}$/),
  kind: z.enum(["open", "watch", "build", "contact"]),
  value: z.number().int().min(0).max(36_000).default(0),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await allow(`track:${ip}`, 240, 600))) return new Response(null, { status: 204 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  const { slug, code, viewId, kind, value } = parsed.data;
  const [pack] = await db()
    .select({ id: proofPacks.id })
    .from(proofPacks)
    .where(and(eq(proofPacks.slug, slug), isNotNull(proofPacks.publishedAt)))
    .limit(1);
  if (!pack) return new Response(null, { status: 204 });
  const [link] = code
    ? await db()
        .select({ id: packLinks.id })
        .from(packLinks)
        .where(and(eq(packLinks.code, code), eq(packLinks.packId, pack.id)))
        .limit(1)
    : [];
  await db()
    .insert(packEvents)
    .values({ packId: pack.id, linkId: link?.id ?? null, viewId, kind, value })
    .onConflictDoUpdate({
      target: [packEvents.viewId, packEvents.kind],
      set: { value: sql`greatest(${packEvents.value}, excluded.value)` },
    });
  return new Response(null, { status: 204 });
}
