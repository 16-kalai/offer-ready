/**
 * The match score: one number out of 100 for ordering candidates, plus the
 * evidence behind it. It ranks who to interview first; it never rejects.
 *   45  must-have skills covered (HR's skills count double; "related" counts half)
 *   30  overall relevance to the JD (local embedding similarity)
 *   15  experience fit against the role's band
 *   10  title relevance
 */

export const WEIGHTS = { skills: 45, relevance: 30, experience: 15, title: 10 } as const;

export interface MustHave {
  skill: string;
  weight: number;
}

export interface MatchResult {
  score: number;
  breakdown: { skills: number; relevance: number; experience: number; title: number };
  matched: { skill: string; as: string }[];
  related: { skill: string; as: string }[];
  missing: string[];
  years: number | null;
  flags: string[];
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export function experienceBand(experience: string): [number, number] {
  if (experience.endsWith("+")) return [Number.parseFloat(experience), 40];
  const [lo, hi] = experience.split("-").map(Number);
  return [lo ?? 0, hi ?? 40];
}

export function experienceFit(years: number | null, [lo, hi]: [number, number]): number {
  if (years === null) return 0.5;
  if (years >= lo && years <= hi + 0.5) return 1;
  if (years < lo) return clamp(1 - (lo - years) / Math.max(2, lo));
  return clamp(1 - (years - hi) / 10, 0.4); // overqualified is a softer miss than underqualified
}

export function scoreCandidate(input: {
  mustHaves: MustHave[];
  found: Map<string, string>;
  related: Map<string, string>;
  /** Cosine similarity of resume and JD embeddings. */
  relevance: number;
  /** Cosine similarity of the candidate's title and the role title, or null if no title. */
  titleSimilarity: number | null;
  years: number | null;
  band: [number, number];
  flags: string[];
}): MatchResult {
  const total = input.mustHaves.reduce((s, m) => s + m.weight, 0) || 1;
  const matched: MatchResult["matched"] = [];
  const related: MatchResult["related"] = [];
  const missing: string[] = [];
  let covered = 0;
  for (const m of input.mustHaves) {
    const exact = input.found.get(m.skill);
    const near = input.related.get(m.skill);
    if (exact) {
      matched.push({ skill: m.skill, as: exact });
      covered += m.weight;
    } else if (near) {
      related.push({ skill: m.skill, as: near });
      covered += m.weight / 2;
    } else missing.push(m.skill);
  }
  const breakdown = {
    skills: covered / total,
    // bge-small similarities: ~0.45 unrelated, ~0.80 very close.
    relevance: clamp((input.relevance - 0.45) / 0.35),
    experience: experienceFit(input.years, input.band),
    title: input.titleSimilarity === null ? 0.5 : clamp((input.titleSimilarity - 0.5) / 0.35),
  };
  const score = Math.round(
    WEIGHTS.skills * breakdown.skills +
      WEIGHTS.relevance * breakdown.relevance +
      WEIGHTS.experience * breakdown.experience +
      WEIGHTS.title * breakdown.title,
  );
  return { score, breakdown, matched, related, missing, years: input.years, flags: input.flags };
}
