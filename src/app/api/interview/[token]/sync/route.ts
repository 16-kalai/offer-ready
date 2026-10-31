import { z } from "zod";
import { CANVAS_EVENTS, NOTE_MAX_CHARS } from "@/lib/canvas";
import { ROOM_PARTS, type RoomPart } from "@/lib/interview-room";
import { RoomError, syncLive } from "@/server/candidate-sessions";
import { deviceId, noStore, readJson, roomError } from "@/server/room-http";

/** The in-call heartbeat: new transcript lines and canvas events, the current part and the Live resumption handle. */
const part = z.enum(ROOM_PARTS as [RoomPart, ...RoomPart[]]);
const atMs = z
  .number()
  .int()
  .min(0)
  .max(4 * 3_600_000);
const body = z.object({
  turns: z
    .array(
      z.object({
        seq: z.number().int().min(0).max(100_000),
        speaker: z.enum(["interviewer", "candidate"]),
        part,
        text: z.string().trim().min(1).max(4_000),
        atMs,
        // Measured in the browser; clamped, and only ever context.
        metrics: z
          .object({
            latencyMs: z.number().int().min(0).max(600_000),
            speechMs: z.number().int().min(0).max(3_600_000),
            pauses: z.number().int().min(0).max(10_000),
          })
          .optional(),
      }),
    )
    .max(60)
    .default([]),
  events: z
    .array(
      z.object({
        seq: z.number().int().min(0).max(100_000),
        kind: z.enum(CANVAS_EVENTS),
        caseNumber: z.number().int().min(1).max(3).nullable(),
        by: z.enum(["interviewer", "candidate"]),
        ids: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,29}$/)).max(4),
        text: z.string().max(NOTE_MAX_CHARS).default(""),
        atMs,
      }),
    )
    .max(60)
    .default([]),
  part: part.nullable().default(null),
  handle: z.string().min(1).max(4_096).nullable().default(null),
  hidden: z
    .object({
      count: z.number().int().min(0).max(1_000),
      ms: z.number().int().min(0).max(3_600_000),
    })
    .default({ count: 0, ms: 0 }),
});

export async function POST(request: Request, ctx: RouteContext<"/api/interview/[token]/sync">) {
  try {
    const { token } = await ctx.params;
    const device = await deviceId(false);
    if (!device) throw new RoomError(409, "Your interview continued on another device.", "moved");
    const input = await readJson(request, body);
    return Response.json(await syncLive(token, device, input), { headers: noStore });
  } catch (error) {
    return roomError(error);
  }
}
