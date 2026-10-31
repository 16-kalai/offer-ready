import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { z } from "zod";
import { env } from "@/lib/env";
import { AiUnavailableError } from "@/server/ai/gemini";
import { RoomError } from "@/server/candidate-sessions";

/**
 * Shared plumbing for the candidate's in-call endpoints: the device cookie,
 * bounded JSON bodies and one error shape the room understands.
 */

const DEVICE_COOKIE = "wd_device";
const DEVICE = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_BODY_BYTES = 64 * 1024;

/** The browser's device id; created on first start. httpOnly, so page scripts can't read or copy it. */
export async function deviceId(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && DEVICE.test(existing)) return existing;
  if (!create) return null;
  const id = randomBytes(24).toString("base64url");
  jar.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return id;
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new RoomError(400, "Request too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new RoomError(400, "Request too large.");
  const parsed = schema.safeParse(text ? JSON.parse(text) : {});
  if (!parsed.success) throw new RoomError(400, "Bad request.");
  return parsed.data;
}

export function roomError(error: unknown): Response {
  if (error instanceof RoomError)
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SyntaxError)
    return Response.json({ error: "Bad request." }, { status: 400 });
  if (error instanceof AiUnavailableError)
    return Response.json({ error: error.message }, { status: 503 });
  console.error("[room]", error);
  return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

export const noStore = { "cache-control": "no-store" };
