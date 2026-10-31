import { THINKING } from "@/lib/interview";
import { getSession } from "@/lib/session";
import { writeVerdictScript } from "@/server/ai/coach";
import { speak } from "@/server/ai/gemini";
import { getGoal, mockState, readinessHistory } from "@/server/goals";
import { allow } from "@/server/rate-limit";
import { blobs } from "@/server/storage";

/**
 * The coach's spoken verdict after the first mock (Gemini text to speech).
 * Written and voiced once per interview, then served from storage.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/goals/[id]/verdict">) {
  const session = await getSession();
  if (!session) return new Response("Log in again.", { status: 401 });
  const { id } = await ctx.params;
  const goal = await getGoal(session.user.id, id);
  if (!goal) return new Response("Not found", { status: 404 });
  const state = await mockState(goal.id, "baseline");
  if (state.stage !== "done" || !state.report.judged)
    return new Response("Not ready", { status: 409 });
  const key = `verdicts/${goal.id}/${state.sessionId}.wav`;
  const headers = { "content-type": "audio/wav", "cache-control": "private, max-age=86400" };
  try {
    return new Response(Buffer.from(await blobs().get(key)), { headers });
  } catch {
    // Not voiced yet.
  }
  if (!(await allow(`verdict:${session.user.id}`, 10, 3600)))
    return new Response("Slow down", { status: 429 });
  const judged = state.report.judged;
  const sorted = [...judged.skills].sort((a, b) => b.score - a.score);
  const name = (sid: string) => THINKING.find((t) => t.id === sid)?.name ?? sid;
  const history = await readinessHistory(goal.id);
  const script = await writeVerdictScript({
    firstName: session.user.name.split(" ")[0] ?? null,
    companyName: goal.companyName,
    overall: history.at(-1)?.overall ?? 0,
    strongest: name(sorted[0].id),
    weakest: name(sorted.at(-1)?.id ?? sorted[0].id),
    quote: sorted[0].evidence[0]?.quote ?? null,
  });
  const audio = await speak(script);
  await blobs().put(key, audio);
  return new Response(Buffer.from(audio), { headers });
}
