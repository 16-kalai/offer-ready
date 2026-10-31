import { z } from "zod";
import { endLive, RoomError } from "@/server/candidate-sessions";
import { deviceId, noStore, readJson, roomError } from "@/server/room-http";

/** Background work queued here runs after the response (inline jobs); give it room. */
export const maxDuration = 300;

/** The call ended: the interviewer said goodbye, time ran out, or the candidate ended it. */
const body = z.object({ reason: z.enum(["finished", "time_up", "candidate_ended"]) });

export async function POST(request: Request, ctx: RouteContext<"/api/interview/[token]/end">) {
  try {
    const { token } = await ctx.params;
    const device = await deviceId(false);
    if (!device) throw new RoomError(409, "Your interview continued on another device.", "moved");
    const { reason } = await readJson(request, body);
    await endLive(token, device, reason);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return roomError(error);
  }
}
