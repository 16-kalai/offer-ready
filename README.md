# Offer Ready

Paste any job. Offer Ready researches how that company hires, finds your real level, runs a voice mock interview built from the job, shows readiness for every round with your own words as evidence, trains the gaps in days, and helps you arrive with **proof**: a small project built around the company's real problem, defended on record, published as a tracked Proof Page.

Built for the Product Space × Wispr Flow hackathon (problem statement #5, career coach). Forked from Werdict, whose voice interview room, judgment cases and quote-backed scoring it reuses unchanged.

## The journey

1. **How they hire.** Gemini with Google Search grounding researches the company's real rounds, topics and public problems, with sources. Cached per company and role cluster and shared by everyone who targets it.
2. **Level check.** 8 adaptive questions (basics → applied → interview level). The answer key never leaves the server.
3. **Mock interview.** 15 minutes over Gemini Live: warm start, questions on the candidate's own projects, three judgment cases on screen, a twist, then the close. Written from the JD and the de-identified resume.
4. **Readiness.** Per round, from the level check plus the mock's five judgment skills and the role's skills. A spoken verdict uses Gemini text to speech.
5. **Training plan.** Short (days, never more than 8 weeks): a concept, three Ship-or-Skip drills on AI-made work, and a spoken answer, scored from audio. Coding rounds get targeted LeetCode patterns.
6. **Proof project.** Three ideas from the company's own public problems, with cited evidence and slot limits per company. A build tracker plus a judgment trail.
7. **Defense.** A second voice mock that questions the project and the decisions the candidate logged, with a twist. It ends with a then-and-now comparison.
8. **Launch.** A quality gate (defended, video, 7-second test), then the public Proof Page, a teleprompter video recorder, a LinkedIn post, a message to the hiring manager, a referral ask, a follow-up, LinkedIn people-search links, and tracked links per person with a live "opened · watched 1:32" feed.

## Run it locally

```bash
pnpm install
pnpm db:start        # embedded Postgres on :54340 (keep running)
pnpm db:migrate
pnpm dev --port 3100 # web
pnpm worker          # background jobs (research, plans, drills, scoring)
```

`.env.local` needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3100` and `GEMINI_API_KEY`. The models can be overridden with `GEMINI_COACH_MODELS`, `GEMINI_RESEARCH_MODELS`, `GEMINI_TTS_MODEL` and `GEMINI_LIVE_MODEL`.

Useful scripts:
- `pnpm coach:run <research|level|plan|day|ideas|launch> <id> [day]` runs one coach job right now.
- `pnpm live:smoke --invitation <id>` runs a full voice interview against Gemini Live, with macOS `say` as a fictional candidate.
- `pnpm test` runs the unit tests (readiness maths, adaptive level logic, plus Werdict's suite).

## Architecture (built to scale out)

- **Stateless Next.js web tier.** Every AI step runs as a **pg-boss job** on stateless workers (`scripts/worker.mts`). Add more workers to go faster. Jobs are idempotent, keyed by singleton, and failures show a retry in the UI.
- **Shared, cached work.** Company research is stored once per `company:role-cluster` (`company_intel`) and refreshed after 14 days. Cost grows with companies, not users.
- **Voice never touches our servers.** The browser talks to Gemini Live with a single-use, locked, short-lived token. We store only the transcript.
- **Trust.** Answer keys (level check, drills, planted case problems) stay server-side. Every report quote is checked against the transcript. Resumes are de-identified before any model sees them.
- **Tracking** is append-only (`pack_events`), one row per view and kind, with watch time only ever growing. It's rate-limited per IP and owner views aren't counted.
- **Not done yet for production scale:** an object-storage driver for videos (the `BlobStore` interface is ready), roll-up tables for tracking, and load testing.

Code map: `src/lib/coach/*` (pure logic and schemas, tested), `src/server/ai/coach.ts` (all coach prompts), `src/server/goals.ts` (journey data, hidden Werdict records), `src/server/jobs/coach.ts` (jobs), `src/app/(app)/g/[id]/*` (journey screens), `src/app/p/[slug]` (public Proof Page).
