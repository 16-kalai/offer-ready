import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { goals, proofPacks } from "@/db/schema";
import { getSession } from "@/lib/session";
import { blobs } from "@/server/storage";

/** Streams a Proof Page's video: public once published, otherwise only to its owner. Supports ranges. */
export async function GET(request: Request, ctx: RouteContext<"/api/p/[slug]/video">) {
  const { slug } = await ctx.params;
  const [row] = await db()
    .select({
      videoKey: proofPacks.videoKey,
      publishedAt: proofPacks.publishedAt,
      ownerId: goals.ownerId,
    })
    .from(proofPacks)
    .innerJoin(goals, eq(goals.id, proofPacks.goalId))
    .where(eq(proofPacks.slug, slug))
    .limit(1);
  if (!row?.videoKey) return new Response("Not found", { status: 404 });
  if (!row.publishedAt) {
    const session = await getSession();
    if (session?.user.id !== row.ownerId) return new Response("Not found", { status: 404 });
  }
  const data = await blobs().get(row.videoKey);
  const type = row.videoKey.endsWith(".mp4")
    ? "video/mp4"
    : row.videoKey.endsWith(".mov")
      ? "video/quicktime"
      : "video/webm";
  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  const base = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
  };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), data.byteLength - 1) : data.byteLength - 1;
    if (start >= data.byteLength || start > end)
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${data.byteLength}` },
      });
    return new Response(Buffer.from(data.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...base,
        "content-range": `bytes ${start}-${end}/${data.byteLength}`,
        "content-length": String(end - start + 1),
      },
    });
  }
  return new Response(Buffer.from(data), {
    headers: { ...base, "content-length": String(data.byteLength) },
  });
}
