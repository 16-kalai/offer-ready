import { z } from "zod";
import { RoomError, reveal } from "@/server/candidate-sessions";
import { deviceId, noStore, readJson, roomError } from "@/server/room-http";

/** A case document or the twist, released when the interviewer opens it. */
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("case"), number: z.number().int().min(1).max(3) }),
  z.object({ kind: z.literal("twist") }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/interview/[token]/reveal">) {
  try {
    const { token } = await ctx.params;
    const device = await deviceId(false);
    if (!device) throw new RoomError(409, "Your interview continued on another device.", "moved");
    const input = await readJson(request, body);
    return Response.json(await reveal(token, device, input), { headers: noStore });
  } catch (error) {
    return roomError(error);
  }
}
