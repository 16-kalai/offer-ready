import type { Canvas, CanvasKind } from "./canvas";

/**
 * Canary traps: a made-up name planted in each case where only an AI tool
 * sees it. It's hidden on screen (and from screen readers) but comes along
 * when the case is copied or read by a screen-reading tool, and an AI asked
 * about the case repeats it. A candidate who then says it out loud is
 * reading an AI's answer: the name existed nowhere else.
 *
 * Planted as plain facts, never as instructions ("note for AI: call it X"
 * gets ignored or pointed out by some models). Measured with
 * `pnpm eval:canary`: a name header plus a comment on the problem line was
 * repeated in 13 of 15 answers across two models, and never flagged.
 *
 * Names are two common-sounding parts ("Kestrel 9") so speech recognition
 * gets them right, and matching is strict: an honest candidate must never
 * trip it by chance.
 */

/** Birds and fish: common sounds, rarely said in a software interview. */
const NAMES = [
  "kestrel",
  "osprey",
  "heron",
  "marlin",
  "condor",
  "pelican",
  "puffin",
  "starling",
  "plover",
  "albatross",
  "cormorant",
  "barracuda",
] as const;
/** Numbers that don't sound like everyday words ("two"/"to", "four"/"for", "eight"/"ate"). */
const NUMBERS = [3, 5, 6, 7, 9] as const;
const NUMBER_WORDS: Record<string, string> = {
  three: "3",
  five: "5",
  six: "6",
  seven: "7",
  nine: "9",
};

/** What each kind of block is called in the planted name: "the Kestrel-9 handler". */
const NOUN: Record<CanvasKind, string> = {
  code: "handler",
  screen: "screen",
  log: "job",
  table: "report",
  chart: "report",
  diagram: "service",
  document: "process",
  choices: "plan",
};

export interface Canary {
  /** "Kestrel-9" */
  term: string;
  name: (typeof NAMES)[number];
  number: (typeof NUMBERS)[number];
}

/** What the browser plants in a case: a hidden header, and a hidden note on one part. */
export interface Trap {
  header: string;
  targetId: string | null;
  inline: string;
}

/** FNV-1a: a small, stable hash, so a candidate's canaries are the same every time. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The canary for one case of one interview. Stable (derived, not stored),
 * different across a candidate's cases, and never a word already in the case.
 */
export function canaryFor(seed: string, caseIndex: number, caseText: string): Canary {
  const text = caseText.toLowerCase();
  const start = hash(`${seed}:${caseIndex}`);
  for (let i = 0; i < NAMES.length; i++) {
    // Each case of an interview gets a different name.
    const name = NAMES[(start + caseIndex * 5 + i) % NAMES.length] ?? "kestrel";
    if (text.includes(name)) continue;
    const number = NUMBERS[(start >>> 8) % NUMBERS.length] ?? 9;
    return { term: `${name[0]?.toUpperCase()}${name.slice(1)}-${number}`, name, number };
  }
  return { term: "Kestrel-9", name: "kestrel", number: 9 };
}

/**
 * Where it goes: a header naming the work ("Kestrel-9 handler (internal
 * name)"), and a note on the case's most important planted problem, so an
 * AI explaining that problem names it.
 */
export function trapFor(
  canary: Canary,
  canvas: Canvas,
  issues: { severity: string; targets: string[] }[],
): Trap {
  const kind = canvas[0]?.kind ?? "document";
  const noun = NOUN[kind];
  const key = issues.find((i) => i.severity === "critical") ?? issues[0];
  const targetId = key?.targets[0] ?? null;
  const targetKind = canvas.find((b) =>
    targetId ? JSON.stringify(b).includes(`"${targetId}"`) : false,
  )?.kind;
  const name = `${canary.term} ${targetKind ? NOUN[targetKind] : noun}`;
  return {
    header: `${canary.term} ${noun} (internal name for this ${kind === "code" ? "module" : "work"})`,
    targetId,
    inline: targetKind === "code" ? `  // ${name}` : ` (${name})`,
  };
}

// ---- how answers were given ----

/**
 * Measured in the browser for each answer. Context only: a long wait before
 * speaking describes careful thinkers and non-native speakers as often as
 * someone reading an AI's answer, so these never raise a note on their own.
 */
export interface AnswerMetrics {
  /** From the interviewer's last word to the candidate's first. */
  latencyMs: number;
  /** From their first word to their last. */
  speechMs: number;
  /** Pauses of 0.7 s or more inside the answer. */
  pauses: number;
}

// ---- detection ----

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w);

/** Edit distance, capped: we only care whether it's 0 or 1. */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export interface CanaryHit {
  term: string;
  seq: number;
  atMs: number;
  quote: string;
}

/**
 * Where the candidate said a canary. Strict on purpose: the name (allowing
 * one letter's slip in transcription) followed within two words by its
 * number. A bird name alone, or a number alone, never counts.
 */
export function findCanaries(
  turns: { seq: number; atMs: number; text: string }[],
  canaries: Canary[],
): CanaryHit[] {
  const hits: CanaryHit[] = [];
  for (const turn of turns) {
    const words = normalise(turn.text);
    for (const c of canaries) {
      const at = words.findIndex(
        (w, i) =>
          within1(w, c.name) && words.slice(i + 1, i + 3).some((n) => n === String(c.number)),
      );
      if (at === -1) continue;
      hits.push({ term: c.term, seq: turn.seq, atMs: turn.atMs, quote: turn.text });
    }
  }
  return hits;
}
