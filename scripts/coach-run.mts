/**
 * Runs one coach job right now, in this process (debugging and demos):
 * `pnpm coach:run research razorpay:software-engineering`
 */
import { runCoachJob } from "@/server/jobs/coach";
import type { CoachJob } from "@/server/queue";

const [job, id, day] = process.argv.slice(2);
const started = Date.now();
await runCoachJob(job as CoachJob, id, day ? Number(day) : undefined);
console.log(`[coach] ${job} ${id} done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(0);
