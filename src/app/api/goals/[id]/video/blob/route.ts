import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { getSession } from "@/lib/session";
import { getGoal, getPack } from "@/server/goals";
import { allow } from "@/server/rate-limit";

/**
 * Hosted uploads (Vercel Blob): the browser sends the video straight to
 * storage, so request-size limits don't apply. This route only signs a
 * short-lived, single-file permission for the goal's owner.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/goals/[id]/video/blob">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await getSession();
        if (!session) throw new Error("Log in again.");
        const goal = await getGoal(session.user.id, id);
        if (!goal || !(await getPack(goal.id))) throw new Error("Set up your launch kit first.");
        if (!(await allow(`video:${session.user.id}`, 20, 3600)))
          throw new Error("Too many uploads.");
        if (!pathname.startsWith(`videos/${goal.id}/`)) throw new Error("Bad path.");
        return {
          allowedContentTypes: ["video/webm", "video/mp4", "video/quicktime"],
          maximumSizeInBytes: 150 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload refused." },
      { status: 400 },
    );
  }
}
