/**
 * The adaptive level check: start with basics, move up after a right answer,
 * step down after two wrong ones in a row. Pure, so the server decides every
 * step and the browser never sees an answer key.
 */

export const LEVEL_QUESTIONS = 8;
export const TIER_WEIGHT = { 1: 1, 2: 2, 3: 3 } as const;

export interface Answered {
  id: string;
  tier: number;
  correct: boolean;
}

/** Which tier comes next. */
export function nextTier(answers: Answered[]): 1 | 2 | 3 {
  if (answers.length === 0) return 1;
  const last = answers[answers.length - 1];
  const tier = last.tier as 1 | 2 | 3;
  if (last.correct) return Math.min(3, tier + 1) as 1 | 2 | 3;
  const prev = answers[answers.length - 2];
  if (prev && !prev.correct) return Math.max(1, tier - 1) as 1 | 2 | 3;
  return tier;
}

/** Next unasked question at the wanted tier, or the nearest tier that still has one. */
export function pickNext<Q extends { id: string; tier: number }>(
  bank: Q[],
  answers: Answered[],
): Q | null {
  if (answers.length >= LEVEL_QUESTIONS) return null;
  const asked = new Set(answers.map((a) => a.id));
  const want = nextTier(answers);
  for (const tier of [want, want + 1, want - 1, want + 2, want - 2]) {
    const q = bank.find((x) => x.tier === tier && !asked.has(x.id));
    if (q) return q;
  }
  return null;
}

/** 0–1: harder questions count for more, so climbing matters more than volume. */
export function levelScore(answers: Answered[]): number {
  if (answers.length === 0) return 0;
  const max = answers.reduce((a, x) => a + TIER_WEIGHT[x.tier as 1 | 2 | 3], 0);
  const got = answers
    .filter((x) => x.correct)
    .reduce((a, x) => a + TIER_WEIGHT[x.tier as 1 | 2 | 3], 0);
  // Reaching tier 3 at all is a signal: blend accuracy with the highest tier answered right.
  const top = Math.max(0, ...answers.filter((x) => x.correct).map((x) => x.tier));
  return Math.round((0.7 * (got / max) + 0.3 * (top / 3)) * 100) / 100;
}

export function levelBand(score: number): "fresher" | "mid" | "senior" {
  if (score >= 0.75) return "senior";
  if (score >= 0.45) return "mid";
  return "fresher";
}
