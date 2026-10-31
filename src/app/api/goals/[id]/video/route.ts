import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { proofPacks } from "@/db/schema";
import { getSession } from "@/lib/session";
import { getGoal, getPack } from "@/server/goals";
import { allow } from "@/server/rate-limit";
import { blobs } from "@/server/storage";

/** Uploads the candidate's 2-minute video (recorded in the browser or picked from disk). */
const MAX_BYTES = 80 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export async function POST(request: Request, ctx: RouteContext<"/api/goals/[id]/video">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Log in again." }, { status: 401 });
  const { id } = await ctx.params;
  const goal = await getGoal(session.user.id, id);
  const pack = goal ? await getPack(goal.id) : null;
  if (!goal || !pack)
    return Response.json({ error: "Set up your launch kit first." }, { status: 404 });
  if (!(await allow(`video:${session.user.id}`, 20, 3600)))
    return Response.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = TYPES[type];
  if (!ext) return Response.json({ error: "Upload a WebM or MP4 video." }, { status: 400 });
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES)
    return Response.json(
      { error: "Keep the video under 80 MB (about 2 minutes)." },
      { status: 413 },
    );
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES)
    return Response.json({ error: "That video is empty or too large." }, { status: 400 });
  const key = `videos/${goal.id}/${randomBytes(6).toString("hex")}.${ext}`;
  await blobs().put(key, bytes);
  await db().update(proofPacks).set({ videoKey: key }).where(eq(proofPacks.id, pack.id));
  return Response.json({ ok: true });
}
