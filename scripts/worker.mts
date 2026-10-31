/**
 * Background worker: reads and scores resumes, sends invites, writes
 * personal interviews and closes abandoned calls. Run next to the web
 * app (`pnpm worker`); start more copies to go faster. Uses the same code as
 * the app, loaded with a small preload so server-only modules load outside Next.
 */

import { createServer } from "node:http";
import { sweepStaleSessions } from "@/server/candidate-sessions";
import { markCoachFailed, runCoachJob } from "@/server/jobs/coach";
import { markPrepareFailed, prepareInterview } from "@/server/jobs/prepare-interview";
import { scoreInterview } from "@/server/jobs/score-interview";
import {
  COACH_RETRY_LIMIT,
  type CoachJob,
  PREPARE_RETRY_LIMIT,
  QUEUES,
  queue,
} from "@/server/queue";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

const boss = await queue("worker");

// The coach's writing: research, level checks, plans, drills, ideas, launch kits.
await boss.work<{ job: CoachJob; id: string; day?: number }>(
  QUEUES.coach,
  {
    localConcurrency: CONCURRENCY,
    batchSize: 1,
    pollingIntervalSeconds: 1,
    includeMetadata: true as const,
  },
  async ([job]) => {
    if (!job) return;
    const { job: kind, id, day } = job.data;
    try {
      await runCoachJob(kind, id, day);
    } catch (error) {
      console.error(`[worker] coach ${kind} failed`, id, error);
      if (job.retryCount >= COACH_RETRY_LIMIT) await markCoachFailed(kind, id, error, day);
      throw error;
    }
  },
);
// Personal interviews: AI writing, two at a time to stay inside the model's rate limits.
await boss.work<{ candidateId: string; invitationId: string | null }>(
  QUEUES.prepare,
  { localConcurrency: 2, batchSize: 1, pollingIntervalSeconds: 1 },
  async ([job]) => {
    if (!job) return;
    try {
      await prepareInterview(job.data.candidateId, job.data.invitationId);
    } catch (error) {
      console.error("[worker] prepare failed", job.data.candidateId, error);
      if (job.retryCount >= PREPARE_RETRY_LIMIT) {
        await markPrepareFailed(
          job.data.candidateId,
          job.data.invitationId,
          error instanceof Error ? error.message : "Failed",
        );
      }
      throw error;
    }
  },
);
// Reports for finished interviews: AI writing, one at a time (they're long).
await boss.work<{ sessionId: string }>(
  QUEUES.score,
  { localConcurrency: 1, batchSize: 1, pollingIntervalSeconds: 2 },
  async ([job]) => {
    if (!job) return;
    try {
      await scoreInterview(job.data.sessionId);
    } catch (error) {
      console.error("[worker] score failed", job.data.sessionId, error);
      throw error;
    }
  },
);
// Live interviews nobody came back to: done if they ran to the end, otherwise incomplete.
await boss.schedule(QUEUES.sweep, "* * * * *");
await boss.work(QUEUES.sweep, { batchSize: 1, pollingIntervalSeconds: 10 }, async () => {
  const ended = await sweepStaleSessions();
  if (ended) console.log(`[worker] closed ${ended} abandoned interview(s)`);
});
console.log(`[worker] ready (${CONCURRENCY} at a time)`);

// Hosts that run the worker as a web service (Render's free tier) need it to answer on a port,
// and an uptime check on /health keeps a free instance from sleeping. Not used otherwise.
if (process.env.PORT) {
  const startedAt = new Date().toISOString();
  createServer((req, res) => {
    const ok = req.url === "/health" || req.url === "/";
    res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { ok: true, worker: "offerready", startedAt } : { ok: false }));
  }).listen(Number(process.env.PORT), () =>
    console.log(`[worker] health check on port ${process.env.PORT}`),
  );
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  });
}
