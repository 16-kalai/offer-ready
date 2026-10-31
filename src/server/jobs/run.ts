import "server-only";
import { after } from "next/server";
import { env } from "@/lib/env";
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

/**
 * Runs queued jobs inside the web app, for hosts without an always-on worker
 * (Vercel). The same jobs, queue and retries as `scripts/worker.mts`: run the
 * worker instead (JOBS_INLINE=false) when traffic outgrows this.
 *
 * Jobs are drained right after the request that queued them (`after`), and
 * again whenever a waiting page polls, so a job cut off by a timeout is picked
 * up on its retry. pg-boss locks each job, so concurrent drains never run the
 * same job twice.
 */

type Handler = { name: string; run: (job: { data: unknown; retryCount: number }) => Promise<void> };

const HANDLERS: Handler[] = [
  {
    name: QUEUES.coach,
    run: async ({ data, retryCount }) => {
      const { job, id, day } = data as { job: CoachJob; id: string; day?: number };
      try {
        await runCoachJob(job, id, day);
      } catch (error) {
        if (retryCount >= COACH_RETRY_LIMIT) await markCoachFailed(job, id, error, day);
        throw error;
      }
    },
  },
  {
    name: QUEUES.prepare,
    run: async ({ data, retryCount }) => {
      const { candidateId, invitationId } = data as {
        candidateId: string;
        invitationId: string | null;
      };
      try {
        await prepareInterview(candidateId, invitationId);
      } catch (error) {
        if (retryCount >= PREPARE_RETRY_LIMIT)
          await markPrepareFailed(
            candidateId,
            invitationId,
            error instanceof Error ? error.message : "Failed",
          );
        throw error;
      }
    },
  },
  {
    name: QUEUES.score,
    run: async ({ data }) => scoreInterview((data as { sessionId: string }).sessionId),
  },
];

export const inlineJobs = () => env().JOBS_INLINE ?? Boolean(process.env.VERCEL);

/** Runs available jobs until none are left or the time budget is spent. */
export async function drainJobs(budgetMs = 240_000): Promise<number> {
  const boss = await queue();
  const deadline = Date.now() + budgetMs;
  let ran = 0;
  while (Date.now() < deadline) {
    const batch = (
      await Promise.all(
        HANDLERS.map(async (h) => {
          const jobs = await boss.fetch(h.name, { batchSize: 2, includeMetadata: true });
          return jobs.map((job) => ({ h, job }));
        }),
      )
    ).flat();
    if (batch.length === 0) break;
    await Promise.all(
      batch.map(async ({ h, job }) => {
        try {
          await h.run({ data: job.data, retryCount: job.retryCount });
          await boss.complete(h.name, job.id);
        } catch (error) {
          console.error(`[jobs] ${h.name} failed`, error);
          await boss.fail(h.name, job.id, {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
    ran += batch.length;
  }
  return ran;
}

/** After this request responds, run whatever it queued (inline mode only; no-op elsewhere). */
export function kickJobs() {
  if (!inlineJobs()) return;
  try {
    after(() => drainJobs().catch((error) => console.error("[jobs] drain failed", error)));
  } catch {
    // Not inside a request (a script or the worker): the worker runs the queue.
  }
}
