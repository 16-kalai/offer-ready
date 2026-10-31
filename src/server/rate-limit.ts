import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionRateLimit } from "@/db/schema";

/**
 * Fixed-window limit in Postgres, so it holds across every server instance.
 * One atomic upsert per call: no read-then-write race.
 * Returns true when the call is allowed.
 */
export async function allow(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (now % (windowSeconds * 1000));
  const [row] = await db()
    .insert(actionRateLimit)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: actionRateLimit.key,
      set: {
        count: sql`case when ${actionRateLimit.windowStart} = ${windowStart} then ${actionRateLimit.count} + 1 else 1 end`,
        windowStart: sql`${windowStart}`,
      },
    })
    .returning({ count: actionRateLimit.count });
  return (row?.count ?? 1) <= max;
}
