/**
 * Local development database: a real Postgres stored in `.data/pg`, no Docker.
 * Keep it running in its own terminal: `pnpm db:start`, then `pnpm db:migrate`.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = path.resolve(".data/pg");
const port = 54340;
const server = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: "postgres",
  persistent: true,
});

const isNew = !existsSync(path.join(databaseDir, "PG_VERSION"));
if (isNew) await server.initialise();
await server.start();
if (isNew) await server.createDatabase("offerready");
console.log(`Postgres running on port ${port} (database "offerready"). Press Ctrl+C to stop.`);

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
