import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at first use. The app refuses to start
 * with a missing or malformed value instead of failing later at random.
 * Never read process.env anywhere else.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Signs session cookies and OAuth state. 32+ random characters. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Public base URL of the app, e.g. http://localhost:3000. */
  BETTER_AUTH_URL: z.url(),
  /**
   * Where uploaded files live: "disk" (STORAGE_DIR, one machine) or "database" (shared by the
   * web app and the worker on separate hosts). Production defaults to the database.
   */
  STORAGE_DRIVER: z.enum(["disk", "database"]).optional(),
  STORAGE_DIR: z.string().default(".data/blobs"),
  /** Local embedding model cache (downloaded once, about 35 MB). */
  MODEL_CACHE_DIR: z.string().default(".data/models"),
  /** Gemini (AI Studio). AI features show a clear error until it is set. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Text models in order of preference; later ones are fallbacks when one is busy. */
  GEMINI_TEXT_MODELS: z
    .string()
    .default("gemini-3.5-flash-lite,gemini-3.1-flash-lite")
    .transform((value) =>
      value
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  /**
   * Run background jobs inside the web app (hosts without a worker, e.g. Vercel). Defaults to on
   * when running on Vercel; set false when the dedicated worker runs.
   */
  JOBS_INLINE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  /** Vercel Blob (hosted video uploads). Without it, videos go through the app to BlobStore. */
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  /** The coach's writing (research, plans, drills, ideas, launch kit): quality over speed. */
  GEMINI_COACH_MODELS: z
    .string()
    .default("gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-latest")
    .transform((value) =>
      value
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  /** Research with Google Search grounding, in order (search quota is per model family). */
  GEMINI_RESEARCH_MODELS: z
    .string()
    .default("gemini-3.5-flash,gemini-2.5-flash")
    .transform((value) =>
      value
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  /** The coach's spoken verdicts (text to speech). */
  GEMINI_TTS_MODEL: z.string().min(1).default("gemini-3.8-flash-tts"),
  GEMINI_TTS_VOICE: z.string().min(1).default("Sulafat"),
  /**
   * The voice interviewer (Gemini Live, native audio). Flash Live answers in about a second;
   * gemini-3.8-live measured 13 to 90 seconds of silence before each reply.
   */
  GEMINI_LIVE_MODEL: z.string().min(1).default("gemini-3.1-flash-live-preview"),
  GEMINI_LIVE_VOICE: z.string().min(1).default("Kore"),
  /**
   * Used when a session on the main model doesn't answer: the call retries on this one. Preview
   * Live models (and free-tier keys) sometimes accept a session and never reply.
   */
  GEMINI_LIVE_FALLBACK_MODEL: z.string().min(1).default("gemini-2.5-flash-native-audio-latest"),
  /**
   * Tokens the interviewer may think before speaking. Thinking is dead air on a call, and the
   * plan was already worked out before it; 0 answers fastest.
   */
  GEMINI_LIVE_THINKING_BUDGET: z.coerce.number().int().min(0).max(8192).default(0),
  /** BCP-47 hints for transcribing candidates, comma-separated. Candidates are mostly in India. */
  GEMINI_LIVE_LANGUAGES: z
    .string()
    .default("en-IN")
    .transform((value) =>
      value
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // `KEY=` in a .env file means "not set".
  const source = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(source);
  if (!parsed.success)
    throw new Error(
      `Invalid environment:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  cached = parsed.data;
  return cached;
}
