import { z } from "zod";
import { THINKING, type ThinkingId } from "./interview";
import { KIT_SLOTS } from "./kit";

/**
 * The interview report HR reads: how the candidate thinks, with their own
 * words as evidence, what they found in each case, and integrity notes. The
 * AI drafts it; a person decides. Versioned, so a report keeps meaning what
 * it meant when it was written.
 */

export const REPORT_VERSION = "report@2";

const thinkingIds = THINKING.map((t) => t.id) as [ThinkingId, ...ThinkingId[]];

/** A quote from one of the candidate's answers, by its transcript line. */
const evidenceSchema = z.object({
  seq: z.number().int().min(0),
  quote: z.string().min(3).max(300),
});

/** What the scoring model writes. Checked in code before it's saved (quotes must be real). */
export const judgedSchema = z.object({
  skills: z
    .array(
      z.object({
        id: z.enum(thinkingIds),
        /** 1 weak, 2 developing, 3 solid, 4 strong. */
        score: z.number().int().min(1).max(4),
        summary: z.string().min(10).max(300),
        evidence: z.array(evidenceSchema).min(1).max(3),
      }),
    )
    .length(THINKING.length),
  /**
   * The role's own skills (from the job description), each judged from the
   * cases and questions that tested it. A null score means "not shown in this
   * interview": no real evidence, so no guess.
   */
  roleSkills: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        /** 1-4 as for thinking skills, or null when the interview gave no evidence. */
        score: z.number().int().min(1).max(4).nullable(),
        summary: z.string().min(10).max(300),
        evidence: z.array(evidenceSchema).max(3),
      }),
    )
    .max(8),
  cases: z
    .array(
      z.object({
        slot: z.enum(KIT_SLOTS),
        summary: z.string().min(10).max(400),
        /** Planted problems (cases 1 and 3): found unprompted, found after a hint, or missed. */
        issues: z.array(
          z.object({
            id: z.string().min(2).max(40),
            status: z.enum(["found", "hinted", "missed"]),
            seq: z.number().int().min(0).nullable(),
          }),
        ),
      }),
    )
    .max(3),
  overall: z.object({
    recommendation: z.enum(["advance", "maybe", "decline"]),
    confidence: z.enum(["low", "medium", "high"]),
    summary: z.string().min(20).max(600),
    strengths: z.array(z.string().min(3).max(200)).max(3),
    concerns: z.array(z.string().min(3).max(200)).max(3),
  }),
  /**
   * Things worth asking about, judged from what was said: an answer that
   * contradicts the candidate's own earlier fact, or a fluent answer that
   * falls apart under a simple follow-up. Never from timing or style alone.
   */
  integrity: z
    .array(
      z.object({
        kind: z.enum(["contradiction", "fell_apart"]),
        seqs: z.array(z.number().int().min(0)).min(1).max(4),
        explanation: z.string().min(10).max(300),
      }),
    )
    .max(4),
});
export type Judged = z.infer<typeof judgedSchema>;

/**
 * Two levels only, and no combined "cheating score": "strong" is a canary
 * the candidate said out loud; "ask" is something a person should ask about.
 */
export interface IntegrityNote {
  level: "strong" | "ask";
  kind: "canary" | "contradiction" | "fell_apart";
  atMs: number | null;
  seqs: number[];
  explanation: string;
}

export interface InterviewReport {
  version: string;
  /** "insufficient": too little was said to judge fairly; nothing is scored. */
  status: "scored" | "insufficient";
  /** How much the candidate actually said. */
  answered: { turns: number; words: number };
  judged: Judged | null;
  integrity: IntegrityNote[];
}

/** Below this, the report says "not enough evidence" instead of scoring. */
export const MIN_EVIDENCE = { turns: 6, words: 180 } as const;

export function enoughEvidence(answered: InterviewReport["answered"]): boolean {
  return answered.turns >= MIN_EVIDENCE.turns && answered.words >= MIN_EVIDENCE.words;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9₹% ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Does the quote really come from that line? Allows the model to trim or
 * lightly normalise, not to invent: at least 80% of the quote's words, in
 * order, must appear in the line.
 */
export function quoteMatches(quote: string, line: string): boolean {
  const q = words(quote);
  const l = words(line);
  if (q.length === 0) return false;
  let j = 0;
  let hits = 0;
  for (const w of q) {
    const at = l.indexOf(w, j);
    if (at !== -1) {
      hits++;
      j = at + 1;
    }
  }
  return hits / q.length >= 0.8;
}

// ---- comparing candidates ----

/** One interviewed candidate at a glance, for ranking a role's results. */
export interface ResultSummary {
  /** 0 = scored, 1 = not enough evidence, 2 = report not ready. */
  tier: 0 | 1 | 2;
  recommendation: Judged["overall"]["recommendation"] | null;
  confidence: Judged["overall"]["confidence"] | null;
  /** Mean of the five skill scores (1-4), or null when not scored. */
  average: number | null;
  skills: Partial<Record<ThinkingId, number>>;
  /** The role's own skills: 1-4, or null when the interview didn't show it. */
  roleSkills: Record<string, number | null>;
  /** Planted problems across the cases: found unprompted, after a hint, missed. */
  problems: { found: number; hinted: number; missed: number };
  strongNotes: number;
  askNotes: number;
}

const VERDICT_ORDER = { advance: 0, maybe: 1, decline: 2 } as const;

export function summarise(report: InterviewReport | null, ready: boolean): ResultSummary {
  const integrity = report?.integrity ?? [];
  const base = {
    strongNotes: integrity.filter((n) => n.level === "strong").length,
    askNotes: integrity.filter((n) => n.level === "ask").length,
  };
  const judged = ready ? report?.judged : null;
  if (!judged)
    return {
      tier: ready && report ? 1 : 2,
      recommendation: null,
      confidence: null,
      average: null,
      skills: {},
      roleSkills: {},
      problems: { found: 0, hinted: 0, missed: 0 },
      ...base,
    };
  const problems = { found: 0, hinted: 0, missed: 0 };
  for (const c of judged.cases) for (const i of c.issues) problems[i.status]++;
  return {
    tier: 0,
    recommendation: judged.overall.recommendation,
    confidence: judged.overall.confidence,
    average: judged.skills.reduce((n, s) => n + s.score, 0) / judged.skills.length,
    skills: Object.fromEntries(judged.skills.map((s) => [s.id, s.score])),
    // Reports written before role skills were scored have none.
    roleSkills: Object.fromEntries((judged.roleSkills ?? []).map((s) => [s.id, s.score])),
    problems,
    ...base,
  };
}

/**
 * Best first: scored interviews by verdict, then average skill, then planted
 * problems found unprompted; then "not enough evidence"; then reports still
 * being written. Integrity notes are shown, never used to reorder: the
 * verdict already reflects the evidence, and a person decides.
 */
export function compareResults(a: ResultSummary, b: ResultSummary): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier !== 0) return 0;
  const verdict =
    VERDICT_ORDER[a.recommendation ?? "decline"] - VERDICT_ORDER[b.recommendation ?? "decline"];
  if (verdict) return verdict;
  const avg = (b.average ?? 0) - (a.average ?? 0);
  if (Math.abs(avg) > 1e-9) return avg;
  return b.problems.found - a.problems.found;
}
