import "server-only";
import { createHash } from "node:crypto";
import { and, arrayContains, asc, eq, inArray, isNotNull, lt, max, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activity,
  candidateInterviews,
  candidates,
  canvasEvents,
  type InterviewSession,
  interviewSessions,
  invitations,
  roles,
  transcriptTurns,
  workspaces,
} from "@/db/schema";
import type { CanvasEvent } from "@/lib/canvas";
import { type AnswerMetrics, canaryFor, trapFor } from "@/lib/integrity";
import { currentPlan, DEPTHS, PARTS } from "@/lib/interview";
import {
  cueHash,
  cueWords,
  DEVICE_STALE_MS,
  extensionFor,
  GOODBYE_GRACE_MS,
  INTERVIEW_MS,
  PRACTICE_HARD_LIMIT_MS,
  RESUME_WINDOW_MS,
  type RevealedCase,
  ROOM_PARTS,
  type RoomPart,
  type RoomPlan,
  type SessionSignals,
} from "@/lib/interview-room";
import { interviewerInstruction, transcriptionVocabulary } from "@/lib/interviewer-prompt";
import type { KitCase } from "@/lib/kit";
import { liveModel, mintLiveToken } from "@/server/ai/live";
import { enqueueScore } from "@/server/queue";
import { allow } from "@/server/rate-limit";
import { refreshRoleCounts } from "@/server/roles";

/**
 * Everything a candidate's link can do. The candidate never signs up: the
 * emailed link is the key, and a device cookie keeps one attempt on one
 * device at a time. Time is decided here; the browser only displays it.
 */

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;
/**
 * At least this long between two new case documents, so they can't all be pulled at once. Short:
 * the interviewer decides when the next case opens, and the screen must keep up with it.
 */
const REVEAL_GAP_MS = 15_000;
const TOKENS_PER_HOUR = 20;

export class RoomError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 410 | 429 | 503,
    message: string,
    readonly code?: "elsewhere" | "moved" | "over",
  ) {
    super(message);
  }
}

async function load(token: string) {
  if (!TOKEN.test(token)) return null;
  const [row] = await db()
    .select({
      invitation: invitations,
      candidateName: candidates.name,
      roleTitle: roles.title,
      companyName: sql<string>`coalesce(${roles.companyName}, ${workspaces.companyName})`,
      senderName: workspaces.senderName,
      replyToEmail: workspaces.replyToEmail,
      plan: candidateInterviews.plan,
      planStatus: candidateInterviews.status,
      blueprint: candidateInterviews.blueprint,
      session: interviewSessions,
    })
    .from(invitations)
    .innerJoin(candidates, eq(candidates.id, invitations.candidateId))
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .innerJoin(workspaces, eq(workspaces.ownerId, invitations.ownerId))
    .leftJoin(candidateInterviews, eq(candidateInterviews.candidateId, invitations.candidateId))
    .leftJoin(interviewSessions, eq(interviewSessions.invitationId, invitations.id))
    .where(
      or(
        eq(invitations.tokenHash, sha(token)),
        // A link from an earlier email (before a reminder) still opens the same interview.
        arrayContains(invitations.previousTokenHashes, [sha(token)]),
      ),
    )
    .limit(1);
  if (!row) return null;
  // An interview in an older format is treated as still being prepared until it's rewritten.
  const plan = currentPlan(row.plan);
  return {
    ...row,
    plan,
    planStatus: plan ? row.planStatus : row.plan ? "pending" : row.planStatus,
  };
}
type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

const firstName = (row: Loaded) => row.candidateName?.split(" ")[0] ?? null;
const linkExpired = (row: Loaded, now: number) =>
  row.invitation.expiresAt !== null && row.invitation.expiresAt.getTime() < now;

function roomPlan(row: Loaded): RoomPlan {
  const depth = row.blueprint?.depth ?? "standard";
  const plan = row.plan;
  const minutes = DEPTHS[depth].minutes;
  return {
    firstName: firstName(row),
    companyName: row.companyName,
    roleTitle: row.roleTitle,
    depth,
    parts: PARTS.map((p) => ({ key: p.key, label: p.label, minutes: minutes[p.key] })),
    cases: plan?.cases.length ?? 0,
    caseCues: (plan?.cases ?? []).map((c) => cueWords(`${c.title} ${c.prompt}`).map(cueHash)),
    twistCase: (plan?.cases.length ?? 0) >= 2 ? 2 : null,
  };
}

/**
 * A case for the browser, with its canary planted. The canary is derived from
 * the invitation (not stored), so scoring finds the same one later.
 */
function revealedCase(invitationId: string, c: KitCase, index: number): RevealedCase {
  const canary = canaryFor(invitationId, index, JSON.stringify(c));
  return {
    number: index + 1,
    title: c.title,
    canvas: c.canvas,
    trap: trapFor(canary, c.canvas, c.issues),
  };
}

/** What a stale live session becomes: done if it ran (nearly) to the end, otherwise incomplete. */
function settledOutcome(s: InterviewSession): "completed" | "incomplete" {
  if (!s.startedAt || !s.endsAt || !s.lastSeenAt) return "incomplete";
  return s.endsAt.getTime() - s.lastSeenAt.getTime() < 2 * 60_000 ? "completed" : "incomplete";
}

async function finish(
  session: Pick<InterviewSession, "id" | "invitationId" | "ownerId" | "roleId">,
  outcome: "completed" | "incomplete",
  reason: NonNullable<InterviewSession["endReason"]>,
  candidateName: string | null,
) {
  const endedNow = await db().transaction(async (tx) => {
    const ended = await tx
      .update(interviewSessions)
      .set({ status: outcome, completedAt: new Date(), endReason: reason })
      .where(
        and(
          eq(interviewSessions.id, session.id),
          inArray(interviewSessions.status, ["consented", "live"]),
        ),
      )
      .returning({ id: interviewSessions.id });
    if (ended.length === 0) return false; // already ended: idempotent
    await tx
      .update(invitations)
      .set({ status: outcome })
      .where(eq(invitations.id, session.invitationId));
    if (outcome === "completed") {
      await tx.insert(activity).values({
        ownerId: session.ownerId,
        roleId: session.roleId,
        kind: "interview_completed",
        data: { candidate: candidateName ?? undefined },
      });
    }
    return true;
  });
  // The report is written in the background. A failed enqueue doesn't undo the ending:
  // `pnpm reports:write` catches up on any interview without a report.
  if (endedNow) {
    await refreshRoleCounts(session.roleId);
    await enqueueScore(session.id).catch((error) =>
      console.error("[interview] couldn't queue the report", session.id, error),
    );
  }
}

/** Ends live sessions nobody has come back to. Runs every minute in the worker, and lazily on each visit. */
export async function sweepStaleSessions(limit = 500): Promise<number> {
  const cutoff = new Date(Date.now() - RESUME_WINDOW_MS);
  const overdue = new Date(Date.now() - GOODBYE_GRACE_MS - 60_000);
  const stale = await db()
    .select({ session: interviewSessions, candidateName: candidates.name })
    .from(interviewSessions)
    .innerJoin(candidates, eq(candidates.id, interviewSessions.candidateId))
    .where(
      and(
        eq(interviewSessions.status, "live"),
        or(
          lt(interviewSessions.lastSeenAt, cutoff),
          and(isNotNull(interviewSessions.endsAt), lt(interviewSessions.endsAt, overdue)),
        ),
      ),
    )
    .limit(limit);
  for (const { session, candidateName } of stale) {
    const pastEnd = session.endsAt !== null && session.endsAt.getTime() < overdue.getTime();
    const outcome = pastEnd ? "completed" : settledOutcome(session);
    await finish(session, outcome, pastEnd ? "time_up" : "abandoned", candidateName);
  }
  return stale.length;
}

async function settle(row: Loaded): Promise<Loaded> {
  const s = row.session;
  if (s?.status !== "live" || !s.lastSeenAt) return row;
  const now = Date.now();
  const stale = s.lastSeenAt.getTime() < now - RESUME_WINDOW_MS;
  const pastEnd = s.endsAt !== null && s.endsAt.getTime() + GOODBYE_GRACE_MS < now;
  if (!stale && !pastEnd) return row;
  const outcome = pastEnd ? "completed" : settledOutcome(s);
  await finish(s, outcome, pastEnd ? "time_up" : "abandoned", row.candidateName);
  return { ...row, session: { ...s, status: outcome } };
}

export type RoomState =
  | { kind: "invalid" }
  | { kind: "expired"; companyName: string; replyToEmail: string; requested: boolean }
  | { kind: "preparing"; companyName: string }
  | { kind: "done"; companyName: string; firstName: string | null; rated: boolean }
  | { kind: "incomplete"; companyName: string; replyToEmail: string }
  | {
      kind: "ready";
      /** "resume": an attempt is under way and can carry on. */
      stage: "welcome" | "consented" | "resume";
      plan: RoomPlan;
      senderName: string;
      replyToEmail: string;
      deadline: string | null;
      accommodationRequested: boolean;
      minutesLeft: number | null;
    };

/** What the link page should show. Opening it marks the invite "opened" for HR. */
export async function roomState(token: string): Promise<RoomState> {
  const loaded = await load(token);
  if (!loaded || loaded.invitation.status === "cancelled" || !loaded.invitation.tokenHash)
    return { kind: "invalid" };
  const row = await settle(loaded);
  const { invitation, session } = row;
  const now = Date.now();

  if (session?.status === "completed" || invitation.status === "completed")
    return {
      kind: "done",
      companyName: row.companyName,
      firstName: firstName(row),
      rated: session?.rating != null,
    };
  if (session?.status === "incomplete" || invitation.status === "incomplete")
    return { kind: "incomplete", companyName: row.companyName, replyToEmail: row.replyToEmail };

  const underway = session?.status === "live";
  // Once started, a candidate can always finish, even past the link's deadline.
  if (!underway && linkExpired(row, now))
    return {
      kind: "expired",
      companyName: row.companyName,
      replyToEmail: row.replyToEmail,
      requested: invitation.newLinkRequestedAt !== null,
    };
  if (row.planStatus !== "ready" || !row.plan)
    return { kind: "preparing", companyName: row.companyName };

  if (invitation.status === "sent") {
    await db()
      .update(invitations)
      .set({ status: "opened", openedAt: new Date() })
      .where(and(eq(invitations.id, invitation.id), eq(invitations.status, "sent")));
  }

  return {
    kind: "ready",
    stage: underway ? "resume" : session ? "consented" : "welcome",
    plan: roomPlan(row),
    senderName: row.senderName,
    replyToEmail: row.replyToEmail,
    deadline: invitation.expiresAt?.toISOString() ?? null,
    accommodationRequested: invitation.accommodationAt !== null,
    minutesLeft:
      underway && session.endsAt
        ? Math.max(
            1,
            Math.ceil((session.endsAt.getTime() - (session.lastSeenAt?.getTime() ?? now)) / 60_000),
          )
        : null,
  };
}

/** The candidate agreed to the terms. Creates their single attempt. */
export async function consent(token: string): Promise<void> {
  const row = await load(token);
  if (!row || row.invitation.status === "cancelled")
    throw new RoomError(404, "This link isn't valid.");
  if (row.session) return;
  if (linkExpired(row, Date.now())) throw new RoomError(410, "This link has expired.");
  if (row.planStatus !== "ready") throw new RoomError(409, "Your interview is still being set up.");
  await db()
    .insert(interviewSessions)
    .values({
      invitationId: row.invitation.id,
      candidateId: row.invitation.candidateId,
      roleId: row.invitation.roleId,
      ownerId: row.invitation.ownerId,
      consentedAt: new Date(),
    })
    .onConflictDoNothing({ target: interviewSessions.invitationId });
}

export async function requestAccommodation(token: string, note: string): Promise<void> {
  const row = await load(token);
  if (!row || row.invitation.status === "cancelled")
    throw new RoomError(404, "This link isn't valid.");
  if (!(await allow(`accommodation:${row.invitation.id}`, 3, 86_400)))
    throw new RoomError(429, "We've passed on your request. The team will reply by email.");
  await db().transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ accommodationNote: note, accommodationAt: new Date() })
      .where(eq(invitations.id, row.invitation.id));
    await tx.insert(activity).values({
      ownerId: row.invitation.ownerId,
      roleId: row.invitation.roleId,
      kind: "accommodation_requested",
      data: { candidate: row.candidateName ?? undefined, note },
    });
  });
}

export async function requestNewLink(token: string): Promise<void> {
  const row = await load(token);
  if (!row || row.invitation.status === "cancelled")
    throw new RoomError(404, "This link isn't valid.");
  if (!linkExpired(row, Date.now()) || row.invitation.newLinkRequestedAt) return;
  await db().transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ newLinkRequestedAt: new Date() })
      .where(eq(invitations.id, row.invitation.id));
    await tx.insert(activity).values({
      ownerId: row.invitation.ownerId,
      roleId: row.invitation.roleId,
      kind: "new_link_requested",
      data: { candidate: row.candidateName ?? undefined },
    });
  });
}

export async function rateExperience(token: string, rating: number): Promise<void> {
  const row = await load(token);
  if (row?.session?.status !== "completed") return;
  await db()
    .update(interviewSessions)
    .set({ rating: Math.max(1, Math.min(5, Math.round(rating))) })
    .where(eq(interviewSessions.id, row.session.id));
}

/** A live session, checked for the device; used by every in-call request. */
async function liveFor(token: string, deviceId: string) {
  const loaded = await load(token);
  if (!loaded?.session || loaded.invitation.status === "cancelled")
    throw new RoomError(404, "This link isn't valid.");
  const row = await settle(loaded);
  const session = row.session as InterviewSession;
  if (session.status !== "live") throw new RoomError(410, "This interview has ended.", "over");
  if (session.deviceHash !== sha(deviceId))
    throw new RoomError(409, "Your interview continued on another device.", "moved");
  return { row, session };
}

export interface StartResult {
  token: string;
  model: string;
  resuming: boolean;
  /** True when Gemini will restore the conversation itself; otherwise the transcript is in the instruction. */
  restored: boolean;
  part: RoomPart;
  cases: RevealedCase[];
  twist: string | null;
  /** Transcript times count from here, across reconnects. */
  firstConnectAt: string;
  startedAt: string | null;
  endsAt: string | null;
  serverNow: string;
  nextSeq: number;
  nextEventSeq: number;
  /** Decisions already written on the canvas, so a reloaded page shows them again. */
  notes: { caseNumber: number; text: string }[];
  /** What's been said so far, for the candidate's transcript panel. */
  history: { speaker: "interviewer" | "candidate"; text: string }[];
  plan: RoomPlan;
}

/**
 * Opens (or re-opens) the live connection: checks the device, gives back time
 * lost to a dropped connection, and mints a single-use Live token with this
 * candidate's interviewer locked in.
 */
export async function startLive(
  token: string,
  deviceId: string,
  opts: { takeover: boolean; handle: string | null; fallback?: boolean },
): Promise<StartResult> {
  const loaded = await load(token);
  if (!loaded || loaded.invitation.status === "cancelled")
    throw new RoomError(404, "This link isn't valid.");
  const row = await settle(loaded);
  const s = row.session;
  if (!s) throw new RoomError(403, "Please accept the terms first.");
  if (s.status === "completed" || s.status === "incomplete")
    throw new RoomError(410, "This interview has ended.", "over");
  if (!row.plan || !row.blueprint)
    throw new RoomError(409, "Your interview is still being set up.");
  const now = Date.now();
  if (s.status === "consented" && linkExpired(row, now))
    throw new RoomError(410, "This link has expired.");

  const device = sha(deviceId);
  const otherDevice = s.deviceHash !== null && s.deviceHash !== device;
  const otherIsActive =
    otherDevice && s.lastSeenAt !== null && now - s.lastSeenAt.getTime() < DEVICE_STALE_MS;
  if (otherIsActive && !opts.takeover)
    throw new RoomError(409, "Your interview is open on another device.", "elsewhere");

  if (!(await allow(`live-token:${s.id}`, TOKENS_PER_HOUR, 3_600)))
    throw new RoomError(429, "Too many reconnects. Wait a minute and try again.");

  // Give back time lost while disconnected (capped).
  let endsAt = s.endsAt?.getTime() ?? null;
  let extendedMs = s.extendedMs;
  if (s.status === "live" && endsAt !== null && s.lastSeenAt) {
    const extra = extensionFor(now - s.lastSeenAt.getTime(), extendedMs);
    endsAt += extra;
    extendedMs += extra;
  }
  if (endsAt !== null && now >= endsAt + GOODBYE_GRACE_MS) {
    await finish(s, "completed", "time_up", row.candidateName);
    throw new RoomError(410, "This interview has ended.", "over");
  }

  const resuming = s.connects > 0;
  // A resumption handle only works on the model that issued it; switching to the fallback model
  // carries the conversation over as text instead.
  const fallback = opts.fallback ?? false;
  const sameModel = s.model === null || s.model === liveModel(fallback);
  const handle = sameModel ? (opts.handle ?? s.resumeHandle) : null;
  // The conversation so far: shown in the candidate's transcript panel after a reload, and
  // given to the interviewer when there's no resumption handle to carry it over.
  const transcript = resuming
    ? await db()
        .select({ speaker: transcriptTurns.speaker, text: transcriptTurns.text })
        .from(transcriptTurns)
        .where(eq(transcriptTurns.sessionId, s.id))
        .orderBy(asc(transcriptTurns.seq))
    : [];
  const plan = roomPlan(row);
  const live = await mintLiveToken({
    instruction: interviewerInstruction({
      companyName: row.companyName,
      roleTitle: row.roleTitle,
      firstName: plan.firstName,
      depth: row.blueprint.depth,
      plan: row.plan,
      resume: resuming && !handle ? { part: s.part, transcript } : undefined,
    }),
    resumeHandle: handle,
    fallback,
    vocabulary: transcriptionVocabulary({
      companyName: row.companyName,
      roleTitle: row.roleTitle,
      skills: row.blueprint.skills.map((x) => x.name),
      plan: row.plan,
    }),
  });

  const signals: SessionSignals = {
    ...s.signals,
    reconnects: (s.signals.reconnects ?? 0) + (resuming ? 1 : 0),
    takeovers: (s.signals.takeovers ?? 0) + (otherDevice ? 1 : 0),
  };
  await db().transaction(async (tx) => {
    await tx
      .update(interviewSessions)
      .set({
        status: "live",
        deviceHash: device,
        firstConnectAt: s.firstConnectAt ?? new Date(now),
        lastSeenAt: new Date(now),
        connects: s.connects + 1,
        endsAt: endsAt === null ? null : new Date(endsAt),
        extendedMs,
        signals,
        model: live.model,
      })
      .where(eq(interviewSessions.id, s.id));
    await tx
      .update(invitations)
      .set({ status: "started" })
      .where(
        and(eq(invitations.id, s.invitationId), inArray(invitations.status, ["sent", "opened"])),
      );
  });

  const [[{ last } = { last: null }], events] = await Promise.all([
    db()
      .select({ last: max(transcriptTurns.seq) })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.sessionId, s.id)),
    db()
      .select({
        seq: canvasEvents.seq,
        kind: canvasEvents.kind,
        caseNumber: canvasEvents.caseNumber,
        text: canvasEvents.text,
      })
      .from(canvasEvents)
      .where(eq(canvasEvents.sessionId, s.id))
      .orderBy(asc(canvasEvents.seq)),
  ]);

  return {
    token: live.token,
    model: live.model,
    resuming,
    restored: resuming && Boolean(handle),
    part: s.part,
    cases: row.plan.cases
      .slice(0, s.revealedCases)
      .map((c, i) => revealedCase(row.invitation.id, c, i)),
    twist: s.twistRevealed ? row.plan.twist : null,
    firstConnectAt: (s.firstConnectAt ?? new Date(now)).toISOString(),
    startedAt: s.startedAt?.toISOString() ?? null,
    endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
    serverNow: new Date(now).toISOString(),
    nextSeq: (last ?? -1) + 1,
    nextEventSeq: (events.at(-1)?.seq ?? -1) + 1,
    history: transcript,
    notes: events
      .filter((e) => e.kind === "note" && e.caseNumber !== null)
      .map((e) => ({ caseNumber: e.caseNumber ?? 0, text: e.text })),
    plan,
  };
}

export interface SyncInput {
  turns: {
    seq: number;
    speaker: "interviewer" | "candidate";
    part: RoomPart;
    text: string;
    atMs: number;
    metrics?: AnswerMetrics;
  }[];
  part: RoomPart | null;
  handle: string | null;
  hidden: { count: number; ms: number };
  events: CanvasEvent[];
}

export interface SyncResult {
  startedAt: string | null;
  endsAt: string | null;
  serverNow: string;
}

/**
 * The in-call heartbeat: saves new transcript lines (idempotent by sequence),
 * moves the part forward, and starts the 15-minute clock when the practice
 * is over. One row lock per call keeps concurrent syncs consistent.
 */
export async function syncLive(
  token: string,
  deviceId: string,
  input: SyncInput,
): Promise<SyncResult> {
  const { row, session } = await liveFor(token, deviceId);
  const now = Date.now();

  if (input.turns.length) {
    await db()
      .insert(transcriptTurns)
      .values(input.turns.map((t) => ({ ...t, sessionId: session.id })))
      .onConflictDoNothing({ target: [transcriptTurns.sessionId, transcriptTurns.seq] });
  }
  if (input.events.length) {
    await db()
      .insert(canvasEvents)
      .values(input.events.map((e) => ({ ...e, sessionId: session.id })))
      .onConflictDoNothing({ target: [canvasEvents.sessionId, canvasEvents.seq] });
  }

  const result = await db().transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, session.id))
      .for("update");
    if (!s) throw new RoomError(404, "This link isn't valid.");

    // Parts only move forward.
    let part = s.part;
    if (input.part && ROOM_PARTS.indexOf(input.part) > ROOM_PARTS.indexOf(part)) part = input.part;

    let startedAt = s.startedAt?.getTime() ?? null;
    let endsAt = s.endsAt?.getTime() ?? null;
    let extendedMs = s.extendedMs;
    const practiceTooLong =
      s.firstConnectAt !== null && now - s.firstConnectAt.getTime() > PRACTICE_HARD_LIMIT_MS;
    if (startedAt === null && (part !== "practice" || practiceTooLong)) {
      startedAt = now;
      endsAt = now + INTERVIEW_MS;
      if (part === "practice") part = "warmup";
    } else if (endsAt !== null && s.lastSeenAt) {
      const extra = extensionFor(now - s.lastSeenAt.getTime(), extendedMs);
      endsAt += extra;
      extendedMs += extra;
    }

    const signals: SessionSignals = {
      ...s.signals,
      tabHidden: (s.signals.tabHidden ?? 0) + Math.min(input.hidden.count, 50),
      hiddenMs: (s.signals.hiddenMs ?? 0) + Math.min(input.hidden.ms, 60_000),
    };
    await tx
      .update(interviewSessions)
      .set({
        part,
        startedAt: startedAt === null ? null : new Date(startedAt),
        endsAt: endsAt === null ? null : new Date(endsAt),
        extendedMs,
        lastSeenAt: new Date(now),
        resumeHandle: input.handle ?? s.resumeHandle,
        signals,
      })
      .where(eq(interviewSessions.id, s.id));
    return { startedAt, endsAt };
  });

  if (result.endsAt !== null && now >= result.endsAt + GOODBYE_GRACE_MS + 30_000) {
    await finish(session, "completed", "time_up", row.candidateName);
    throw new RoomError(410, "This interview has ended.", "over");
  }
  return {
    startedAt: result.startedAt === null ? null : new Date(result.startedAt).toISOString(),
    endsAt: result.endsAt === null ? null : new Date(result.endsAt).toISOString(),
    serverNow: new Date(now).toISOString(),
  };
}

/** A case document (or the twist), released only when the interviewer opens it, in order. */
export async function reveal(
  token: string,
  deviceId: string,
  what: { kind: "case"; number: number } | { kind: "twist" },
): Promise<{ case?: RevealedCase; twist?: string }> {
  const { row, session } = await liveFor(token, deviceId);
  const plan = row.plan;
  if (!plan) throw new RoomError(409, "Your interview is still being set up.");
  const now = Date.now();
  const tooSoon =
    session.lastRevealAt !== null && now - session.lastRevealAt.getTime() < REVEAL_GAP_MS;

  if (what.kind === "twist") {
    if (session.revealedCases < 2) throw new RoomError(409, "Not yet.");
    if (!session.twistRevealed)
      await db()
        .update(interviewSessions)
        .set({ twistRevealed: true })
        .where(eq(interviewSessions.id, session.id));
    return { twist: plan.twist };
  }

  const n = what.number;
  if (!Number.isInteger(n) || n < 1 || n > plan.cases.length)
    throw new RoomError(400, "No such case.");
  // The interviewer opens the cases in order, and may skip one when time is short.
  if (n > session.revealedCases) {
    if (tooSoon && n > 1) throw new RoomError(409, "Not yet.");
    await db()
      .update(interviewSessions)
      .set({
        revealedCases: n,
        lastRevealAt: new Date(now),
        part:
          ROOM_PARTS.indexOf(session.part) < ROOM_PARTS.indexOf("cases") ? "cases" : session.part,
      })
      .where(
        and(
          eq(interviewSessions.id, session.id),
          eq(interviewSessions.revealedCases, session.revealedCases),
        ),
      );
  }
  const c = plan.cases[n - 1];
  if (!c) throw new RoomError(400, "No such case.");
  return { case: revealedCase(row.invitation.id, c, n - 1) };
}

/** The call ended: by the interviewer's goodbye, the clock, or the candidate. */
export async function endLive(
  token: string,
  deviceId: string,
  reason: "finished" | "time_up" | "candidate_ended",
): Promise<void> {
  const { row, session } = await liveFor(token, deviceId).catch((error) => {
    // Ending twice, or after the sweep, is fine.
    if (error instanceof RoomError && error.code === "over") return { row: null, session: null };
    throw error;
  });
  if (!session || !row) return;
  // Leaving during the practice question isn't an interview.
  const outcome = session.startedAt ? "completed" : "incomplete";
  await finish(session, outcome, reason, row.candidateName);
}
