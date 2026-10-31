import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One connection pool per server process, kept on globalThis so development
 * hot reloads reuse it instead of opening a new pool on every edit.
 */
const holder = globalThis as unknown as {
  __werdictDb?: NodePgDatabase<typeof schema>;
};

export function db(): NodePgDatabase<typeof schema> {
  if (holder.__werdictDb) return holder.__werdictDb;
  const pool = new pg.Pool({
    connectionString: env().DATABASE_URL,
    max: env().DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  holder.__werdictDb = drizzle(pool, { schema, casing: "snake_case" });
  return holder.__werdictDb;
}
