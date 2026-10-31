import type { Trap } from "./integrity";
import { DEPTHS, type Depth, INTERVIEW_MINUTES, PARTS } from "./interview";
import type { KitCase } from "./kit";

/**
 * Rules of the live interview room, shared by the server (which keeps time
 * and decides) and the browser (which shows it). Pure: no I/O.
 */

export type PartKey = (typeof PARTS)[number]["key"];
/** "practice" is the unscored warm-up question before the clock starts. */
export type RoomPart = "practice" | PartKey;
export const ROOM_PARTS: readonly RoomPart[] = ["practice", ...PARTS.map((p) => p.key)];
export const isRoomPart = (v: unknown): v is RoomPart =>
  typeof v === "string" && (ROOM_PARTS as readonly string[]).includes(v);

export interface SessionSignals {
  /** Times the candidate left the interview tab, and for how long in total. */
  tabHidden?: number;
  hiddenMs?: number;
  reconnects?: number;
  takeovers?: number;
}

export const INTERVIEW_MS = INTERVIEW_MINUTES * 60_000;
/** A closed tab can come back and carry on within this window. */
export const RESUME_WINDOW_MS = 10 * 60_000;
/** Time given back for dropped connections, at most. */
export const MAX_EXTENSION_MS = 5 * 60_000;
/** A gap shorter than this is a blip, not a dropped connection worth giving time back for. */
export const BLIP_MS = 15_000;
/** Another device counts as gone after this long without a sync. */
export const DEVICE_STALE_MS = 25_000;
export const SYNC_EVERY_MS = 5_000;
/** The practice question gets this long before the interviewer is told to begin. */
export const PRACTICE_MS = 90_000;
/** If the interviewer never starts the clock, the server starts it anyway. */
export const PRACTICE_HARD_LIMIT_MS = 3 * 60_000;
/** Before the end: move to the close. */
export const WRAP_UP_MS = 90_000;
/** After the end: the goodbye gets this long before the call is closed for them. */
export const GOODBYE_GRACE_MS = 40_000;
/** Silence (nobody speaking) before a gentle check-in; longer after "give me a moment". */
export const SILENCE_MS = 25_000;
export const MOMENT_MS = 75_000;

/** Each part's share of the 15 minutes, in order. */
export function partBudgets(depth: Depth): { part: PartKey; ms: number }[] {
  const m = DEPTHS[depth].minutes;
  return PARTS.map((p) => ({ part: p.key, ms: m[p.key] * 60_000 }));
}

/** An answer this short (in words) gets a nudge to the interviewer to follow up. */
export const SHORT_ANSWER_WORDS = 7;

/** Too short to move on from? Nothing heard at all isn't short, just silence. */
export function isShortAnswer(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && words < SHORT_ANSWER_WORDS;
}

/** The candidate asked to finish ("we can complete", "I'm done", "can we stop here"). */
export function wantsToFinish(text: string): boolean {
  return /\b(can (we )?(finish|complete|end|stop|wrap up)|let'?s (finish|end|stop|wrap up)|we can (finish|complete|end|stop)|i'?m done|i am done|that'?s all|want to (finish|end|stop)|(finish|end) (the|this) interview)\b/i.test(
    text,
  );
}

/** What the browser may know up front. Cases arrive one at a time, when the interviewer opens them. */
export interface RoomPlan {
  firstName: string | null;
  companyName: string;
  roleTitle: string;
  depth: Depth;
  parts: { key: PartKey; label: string; minutes: number }[];
  /** How many cases this interview has (their contents arrive one at a time). */
  cases: number;
  /** Per case, hashed words of its opening (see cueWords): how the browser recognises it being introduced. */
  caseCues: number[][];
  /** The case the twist belongs to (shown after its first answer), or null. */
  twistCase: number | null;
}

/** A case as the browser receives it: what's on screen, plus its hidden canary trap. */
export type RevealedCase = Pick<KitCase, "title" | "canvas"> & { number: number; trap: Trap };

/** The time-up transitions, decided from the server's clock. */
export function clockPhase(
  endsAt: number | null,
  now: number,
): "before" | "running" | "wrap-up" | "time-up" | "over" {
  if (endsAt === null) return "before";
  if (now >= endsAt + GOODBYE_GRACE_MS) return "over";
  if (now >= endsAt) return "time-up";
  if (now >= endsAt - WRAP_UP_MS) return "wrap-up";
  return "running";
}

/**
 * Time to give back after a gap in syncs (a dropped connection or closed tab).
 * Short blips cost nothing; the total stays capped so the interview can't be
 * stretched indefinitely.
 */
export function extensionFor(gapMs: number, alreadyExtendedMs: number): number {
  if (gapMs < BLIP_MS) return 0;
  return Math.max(0, Math.min(gapMs, MAX_EXTENSION_MS - alreadyExtendedMs));
}

/**
 * When each part's time runs out, as time left on the clock: the browser tells
 * the interviewer then, and the interviewer moves on (the close's own end is
 * the time-up). From the end, so time given back for a dropped connection
 * moves every boundary with it.
 */
export function partEnds(depth: Depth): { part: PartKey; next: PartKey; msLeft: number }[] {
  const budgets = partBudgets(depth);
  const out: { part: PartKey; next: PartKey; msLeft: number }[] = [];
  let left = INTERVIEW_MS;
  budgets.forEach((b, i) => {
    left -= b.ms;
    const next = budgets[i + 1];
    if (next) out.push({ part: b.part, next: next.part, msLeft: left });
  });
  return out;
}

/**
 * When each case's share of the cases' minutes runs out (time left on the
 * clock), so the interviewer opens the next one on time instead of spending
 * the cases on the first. Equal shares; the twist lives inside its case's.
 */
export function caseEnds(depth: Depth, cases: number): { case: number; msLeft: number }[] {
  const casesOver = partEnds(depth).find((e) => e.part === "cases")?.msLeft ?? 0;
  const share = (DEPTHS[depth].minutes.cases * 60_000) / Math.max(1, cases);
  return Array.from({ length: Math.max(0, cases - 1) }, (_, i) => ({
    case: i + 1,
    msLeft: casesOver + (cases - 1 - i) * share,
  }));
}

/**
 * Fingerprints of a case's opening, so the browser can tell when the
 * interviewer starts introducing a case it forgot to put on screen, without
 * knowing the case's words: hashes of its distinctive words, never the words.
 */
export const CUE_MIN_MATCHES = 3;
const CUE_STOPWORDS = new Set(
  "about after again also because before being could their there these those which while would should where what when your have this that with from they them then than into will just like more most need some such very here wrong right screen look take think tell case situation show shows okay thanks".split(
    " ",
  ),
);
export function cueWords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !CUE_STOPWORDS.has(w)),
    ),
  ];
}
/** FNV-1a, 32-bit: enough to recognise words, useless for reading them back. */
export function cueHash(word: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The case whose opening the interviewer is saying, from its fingerprints:
 * enough of its distinctive words, not counting words it shares with cases
 * already up ("checkout" in every checkout case). Null when it's none.
 */
export function caseBeingIntroduced(
  cues: number[][],
  shown: ReadonlySet<number>,
  said: string,
): number | null {
  const heard = new Set(cueWords(said).map(cueHash));
  const known = new Set(cues.filter((_, i) => shown.has(i + 1)).flat());
  for (let i = 0; i < cues.length; i++) {
    if (shown.has(i + 1)) continue;
    const hits = (cues[i] ?? []).filter((h) => heard.has(h) && !known.has(h)).length;
    if (hits >= CUE_MIN_MATCHES) return i + 1;
  }
  return null;
}

/**
 * Messages from the interview system to the interviewer. The interviewer runs
 * the interview from its notes; these only tell it the time, or about
 * something the candidate did. It's told never to read them aloud.
 */
export const TIMEKEEPER = "[system]";
const tk = (text: string) => `${TIMEKEEPER} ${text}`;

const PART_NAMES: Record<PartKey, string> = {
  warmup: "warm start",
  projects: "projects",
  cases: "cases",
  close: "close",
};

export const timekeeper = {
  greeting: () =>
    tk("The candidate has joined and can hear you. Begin with the practice question."),
  rejoin: () =>
    tk(
      "The candidate's connection dropped and they're back. Welcome them back in a few words, then carry on where you left off: ask your last question again. If a case was on screen, call show_case for it again first.",
    ),
  /** A fresh connection took over from one that went quiet, mid-interview. */
  carryOn: () =>
    tk(
      "The connection was refreshed. Apologise in a few words and carry on where you left off: answer what the candidate last said, or ask your last question again. If a case was on screen, call show_case for it again first.",
    ),
  waiting: () =>
    tk(
      "The candidate has finished and is waiting for your reply. Reply now. Don't repeat anything you've already said.",
    ),
  /** A part's time is up (context only: acted on at the next turn). */
  partOver: (part: PartKey, next: PartKey, minutesLeft: number) =>
    tk(
      `Clock: about ${minutesLeft} minutes left. The ${PART_NAMES[part]} time is up. When the candidate finishes, move on to the ${PART_NAMES[next]} straight away, with no more follow-ups on this.`,
    ),
  /** A case's share of the time is up (context only). */
  caseOver: (caseNumber: number, minutesLeft: number) =>
    tk(
      `Clock: about ${minutesLeft} minutes left. Case ${caseNumber}'s time is up. When the candidate finishes, move on to case ${caseNumber + 1}: put it on their screen first, then introduce it.`,
    ),
  wrapUp: () =>
    tk(
      "Clock: about a minute and a half left. When the candidate finishes, go to the close: call next_section with close and ask your closing question.",
    ),
  timeUp: () =>
    tk(
      "Time is up. Thank the candidate in one or two sentences, say the team will be in touch, say goodbye, and call end_interview.",
    ),
  moment: () =>
    tk(
      "The candidate asked for a moment to think. Say a few words like 'Of course, take your time', then stay silent until they speak.",
    ),
  repeat: () =>
    tk(
      "The candidate asked you to repeat. Say your last question again, more slowly and in simpler words. Add nothing new.",
    ),
  /** The candidate tapped part of the canvas. Context only: the interviewer doesn't answer it. */
  pointing: (caseNumber: number, id: string, name: string) =>
    tk(
      `The candidate is pointing at [${id}] (${name}) on case ${caseNumber}. When they talk about "this" or "here", that's what they mean.`,
    ),
  silence: () =>
    tk(
      "It has been quiet for a while. Gently check in, in one short sentence: they can take their time, or you can repeat the question.",
    ),
};

/**
 * The interviewer's tools. It runs the interview itself: it records each new
 * part, and puts each case (and the twist) on the candidate's screen before it
 * talks about it. The browser answers each call once the screen has changed.
 */
export const TOOL = {
  nextSection: "next_section",
  showCase: "show_case",
  showTwist: "show_twist",
  pointAt: "point_at",
  note: "note",
  end: "end_interview",
} as const;
