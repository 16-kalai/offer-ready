import { getSession } from "@/lib/session";
import { drainJobs, inlineJobs } from "@/server/jobs/run";
import { allow } from "@/server/rate-limit";

/**
 * Inline mode: a page waiting on background work calls this while it polls,
 * so queued or retried jobs keep moving even if the request that queued them
 * was cut short. Signed-in users only; rate-limited.
 */
export const maxDuration = 300;

export async function POST() {
  if (!inlineJobs()) return new Response(null, { status: 204 });
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  if (!(await allow(`drain:${session.user.id}`, 30, 300)))
    return new Response(null, { status: 204 });
  const ran = await drainJobs(270_000);
  return Response.json({ ran });
}
