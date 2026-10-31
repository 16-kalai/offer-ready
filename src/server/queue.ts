import "server-only";
import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

/**
 * Background jobs in our own Postgres (pg-boss): no extra service to run or
 * pay for. Jobs survive restarts, retry with backoff, and any number of worker
 * processes can share the load.
 */
export const QUEUES = {
  resume: "resume.process",
  invite: "invite.send",
  prepare: "interview.prepare",
  sweep: "interview.sweep",
  score: "interview.score",
  coach: "coach.write",
} as const;
export const COACH_RETRY_LIMIT = 2;
export type CoachJob = "research" | "level" | "plan" | "day" | "ideas" | "launch";
export const RESUME_RETRY_LIMIT = 3;
export const INVITE_RETRY_LIMIT = 5;
export const PREPARE_RETRY_LIMIT = 2;
export const SCORE_RETRY_LIMIT = 3;

const holder = globalThis as unknown as { __werdictBoss?: Promise<PgBoss> };

/**
 * The coach's AI writing (research, level check, plan, a day's drills, ideas,
 * launch kit), keyed so each piece is written once however often it's asked.
 */
export async function enqueueCoach(job: CoachJob, id: string, extra?: { day?: number }) {
  const boss = await queue();
  const key = `${job}:${id}${extra?.day ? `:${extra.day}` : ""}`;
  await boss.send(QUEUES.coach, { job, id, ...extra }, { singletonKey: key });
  await kick();
}

/** Inline mode (no worker): run the queue after this request. Loaded lazily to avoid an import cycle. */
async function kick() {
  const { kickJobs } = await import("@/server/jobs/run");
  kickJobs();
}

/**
 * The queue. The web app only adds jobs ("producer"): on serverless hosting
 * each instance would otherwise run pg-boss's maintenance and cron timers. The
 * worker process (`role: "worker"`) runs them, and takes the jobs.
 */
export function queue(role: "producer" | "worker" = "producer"): Promise<PgBoss> {
  holder.__werdictBoss ??= (async () => {
    const worker = role === "worker";
    const boss = new PgBoss({
      connectionString: env().DATABASE_URL,
      max: worker ? 4 : 2,
      application_name: worker ? "offerready-worker" : "offerready-web",
      supervise: worker,
      schedule: worker,
    });
    boss.on("error", (error) => console.error("[queue]", error));
    await boss.start();
    await boss.createQueue(QUEUES.resume, {
      retryLimit: RESUME_RETRY_LIMIT,
      retryBackoff: true,
      retryDelay: 5,
      expireInSeconds: 300,
    });
    await boss.createQueue(QUEUES.invite, {
      retryLimit: INVITE_RETRY_LIMIT,
      retryBackoff: true,
      retryDelay: 30,
      expireInSeconds: 120,
    });
    await boss.createQueue(QUEUES.prepare, {
      retryLimit: PREPARE_RETRY_LIMIT,
      retryBackoff: true,
      retryDelay: 20,
      expireInSeconds: 300,
    });
    await boss.createQueue(QUEUES.score, {
      retryLimit: SCORE_RETRY_LIMIT,
      retryBackoff: true,
      retryDelay: 30,
      expireInSeconds: 600,
    });
    await boss.createQueue(QUEUES.coach, {
      retryLimit: COACH_RETRY_LIMIT,
      retryBackoff: true,
      retryDelay: 5,
      expireInSeconds: 300,
    });
    // Once a minute, any worker: ends calls nobody came back to. Missing a run is harmless.
    await boss.createQueue(QUEUES.sweep, { retryLimit: 0, expireInSeconds: 50 });
    return boss;
  })();
  return holder.__werdictBoss;
}

export async function enqueueResumes(candidateIds: string[]) {
  if (candidateIds.length === 0) return;
  const boss = await queue();
  await boss.insert(
    QUEUES.resume,
    candidateIds.map((candidateId) => ({ data: { candidateId }, singletonKey: candidateId })),
  );
}

export async function enqueueInvites(
  invitationIds: string[],
  options: { kind?: "invite" | "nudge" | "auto-reminder"; startAfter?: Date } = {},
) {
  if (invitationIds.length === 0) return;
  const boss = await queue();
  const kind = options.kind ?? "invite";
  await boss.insert(
    QUEUES.invite,
    invitationIds.map((invitationId) => ({
      data: { invitationId, kind },
      ...(options.startAfter ? { startAfter: options.startAfter } : {}),
    })),
  );
}

/** Writes a candidate's personal interview; then, if given, sends their invite. */
export async function enqueuePrepare(candidateId: string, invitationId?: string) {
  const boss = await queue();
  await boss.send(
    QUEUES.prepare,
    { candidateId, invitationId: invitationId ?? null },
    { singletonKey: `prepare:${candidateId}` },
  );
  await kick();
}

/** Writes the report for a finished interview (once per interview, however often it's asked). */
export async function enqueueScore(sessionId: string) {
  const boss = await queue();
  await boss.send(QUEUES.score, { sessionId }, { singletonKey: `score:${sessionId}` });
  await kick();
}
