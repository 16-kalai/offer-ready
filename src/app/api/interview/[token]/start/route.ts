import { z } from "zod";
import { startLive } from "@/server/candidate-sessions";
import { deviceId, noStore, readJson, roomError } from "@/server/room-http";

/** Opens or re-opens the live call: returns a single-use Live token and where the interview stands. */
const body = z.object({
  takeover: z.boolean().default(false),
  handle: z.string().min(1).max(4_096).nullable().default(null),
  /** The last session on the main model never answered: use the fallback model. */
  fallback: z.boolean().default(false),
});

export async function POST(request: Request, ctx: RouteContext<"/api/interview/[token]/start">) {
  try {
    const { token } = await ctx.params;
    const input = await readJson(request, body);
    const device = (await deviceId(true)) as string;
    return Response.json(await startLive(token, device, input), { headers: noStore });
  } catch (error) {
    return roomError(error);
  }
}
