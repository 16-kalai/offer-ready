# Deploying Offer Ready

| Piece | Runs on | Notes |
| --- | --- | --- |
| Web app (pages, API, voice room) **and background jobs** | **Vercel** (Singapore, `vercel.json`) | Jobs run inline after the request that queues them, and again while a waiting page polls (`src/server/jobs/run.ts`). |
| Database (data, job queue, resumes) | **Neon Postgres** via the Vercel Marketplace | Vercel sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Migrations run on every build (`pnpm vercel-build`). |
| Videos | **Vercel Blob** | The browser uploads directly (`BLOB_READ_WRITE_TOKEN`), so request size limits don't apply. |

## Environment variables (Production)

| Name | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | 32+ random characters |
| `BETTER_AUTH_URL` | The site's address, no trailing slash |
| `GEMINI_API_KEY` | Google AI Studio key |
| `DATABASE_POOL_MAX` | `5` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Set by the Neon integration |
| `BLOB_READ_WRITE_TOKEN` | Set by the Blob store |

## Scaling up

When traffic outgrows inline jobs, run the dedicated worker (`pnpm worker:start`, `Dockerfile`, or `render.yaml`) with `JOBS_INLINE=false` on both the web app and the worker. It's the same queue and the same jobs; nothing else changes.
