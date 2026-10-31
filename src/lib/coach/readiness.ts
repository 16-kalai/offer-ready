import type { ThinkingId } from "@/lib/interview";
import type { ReadinessRound, RoundKind } from "./types";

/**
 * Readiness for one job, round by round. Pure, so it's tested and the same
 * maths runs everywhere. Every input is 0–1; each round leans on the signals
 * that round actually tests:
 * - tests and coding rounds: what the level check showed, then role skills
 * - design and case rounds: framing, trade-offs and risk from the mock
 * - behavioural and hiring-manager rounds: explaining and framing
 * A signal that hasn't been measured yet is left out, not counted as zero.
 */

export interface Signals {
  /** Level check, 0–1. */
  level: number | null;
  /** The mock's five thinking skills, 0–1 each. */
  thinking: Partial<Record<ThinkingId, number>>;
  /** The mock's role skills (null = not shown), 0–1 average. */
  roleSkills: number | null;
  /** Practice drills so far, 0–1 average, by thinking skill they trained. */
  drills: Partial<Record<ThinkingId, number>>;
}

/** 1–4 interview scores to 0–1. */
export const fromFour = (score: number) => Math.min(1, Math.max(0, (score - 1) / 3));

/** Practice moves a skill's estimate towards the drill score, without wiping out the interview. */
export function blended(signals: Signals): Partial<Record<ThinkingId, number>> {
  const out: Partial<Record<ThinkingId, number>> = { ...signals.thinking };
  for (const [id, drill] of Object.entries(signals.drills) as [ThinkingId, number][]) {
    const base = out[id];
    out[id] = base === undefined ? drill : 0.6 * base + 0.4 * drill;
  }
  return out;
}

function mean(values: (number | null | undefined)[]): number | null {
  const real = values.filter((v): v is number => typeof v === "number");
  return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
}

/** Weighted average of the signals that exist; null if none do. */
function weigh(parts: [number | null, number][]): number | null {
  let total = 0;
  let weight = 0;
  for (const [value, w] of parts) {
    if (value === null) continue;
    total += value * w;
    weight += w;
  }
  return weight ? total / weight : null;
}

export function roundScore(kind: RoundKind, signals: Signals): number | null {
  const t = blended(signals);
  const allThinking = mean(Object.values(t));
  switch (kind) {
    case "online_test":
    case "coding":
      return weigh([
        [signals.level, 0.7],
        [signals.roleSkills, 0.2],
        [t.verification ?? null, 0.1],
      ]);
    case "technical":
      return weigh([
        [signals.level, 0.45],
        [signals.roleSkills, 0.35],
        [mean([t.reasoning, t.verification]), 0.2],
      ]);
    case "system_design":
    case "case":
    case "take_home":
      return weigh([
        [mean([t.framing, t.tradeoffs, t.risk]), 0.55],
        [signals.roleSkills, 0.25],
        [signals.level, 0.2],
      ]);
    case "behavioral":
    case "hiring_manager":
      return weigh([
        [mean([t.reasoning, t.framing]), 0.6],
        [allThinking, 0.4],
      ]);
  }
}

export function readiness(
  rounds: { kind: RoundKind; title: string }[],
  signals: Signals,
): { overall: number; rounds: ReadinessRound[] } {
  const scored = rounds.map((r) => {
    const s = roundScore(r.kind, signals);
    return {
      kind: r.kind,
      title: r.title,
      score: s === null ? 0 : Math.round(s * 100),
      known: s !== null,
    };
  });
  const known = scored.filter((r) => r.known);
  const overall = known.length
    ? Math.round(known.reduce((a, r) => a + r.score, 0) / known.length)
    : 0;
  return { overall, rounds: scored.map(({ known, ...r }) => ({ ...r, measured: known })) };
}

/** The round most likely to cost the offer. */
export function weakestRound(rounds: ReadinessRound[]): ReadinessRound | null {
  const measured = rounds.filter((r) => r.measured !== false);
  return measured.length ? [...measured].sort((a, b) => a.score - b.score)[0] : null;
}

/**
 * How many training days: up to the interview when there is one (leaving the
 * last day for a final mock), otherwise by the size of the gap. Never more
 * than eight weeks: short plans get finished.
 */
export function planLength(overall: number, interviewDate: Date | null, now = new Date()): number {
  if (interviewDate) {
    const days = Math.floor((interviewDate.getTime() - now.getTime()) / 86_400_000);
    return Math.min(56, Math.max(2, days - 1));
  }
  if (overall < 40) return 7;
  if (overall < 60) return 5;
  return 3;
}
