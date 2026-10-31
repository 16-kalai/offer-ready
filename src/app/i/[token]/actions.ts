"use server";

import { z } from "zod";
import {
  consent,
  RoomError,
  rateExperience,
  requestAccommodation,
  requestNewLink,
} from "@/server/candidate-sessions";

/** The candidate's actions outside the call. Public: the link token is the only key. */

type Result = { ok: true } | { ok: false; error: string };
const token = z.string().regex(/^[A-Za-z0-9_-]{40,60}$/);

async function run(task: () => Promise<void>): Promise<Result> {
  try {
    await task();
    return { ok: true };
  } catch (error) {
    if (error instanceof RoomError) return { ok: false, error: error.message };
    console.error("[candidate]", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function consentAction(raw: unknown): Promise<Result> {
  const parsed = token.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "This link isn't valid." };
  return run(() => consent(parsed.data));
}

export async function accommodationAction(rawToken: unknown, rawNote: unknown): Promise<Result> {
  const t = token.safeParse(rawToken);
  const note = z.string().trim().min(3).max(600).safeParse(rawNote);
  if (!t.success) return { ok: false, error: "This link isn't valid." };
  if (!note.success) return { ok: false, error: "Tell us briefly what would help." };
  return run(() => requestAccommodation(t.data, note.data));
}

export async function newLinkAction(raw: unknown): Promise<Result> {
  const parsed = token.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "This link isn't valid." };
  return run(() => requestNewLink(parsed.data));
}

export async function rateAction(rawToken: unknown, rawRating: unknown): Promise<Result> {
  const t = token.safeParse(rawToken);
  const rating = z.number().int().min(1).max(5).safeParse(rawRating);
  if (!t.success || !rating.success) return { ok: false, error: "Couldn't save that." };
  return run(() => rateExperience(t.data, rating.data));
}
