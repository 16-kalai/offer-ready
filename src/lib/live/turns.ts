/**
 * Who speaks when. The interviewer may speak only when something asked it
 * to: the candidate finished an answer, or the interview system sent a cue
 * (the greeting, "repeat that", time's up). One cue, one reply.
 *
 * Without this, the model sometimes starts a second turn nobody asked for
 * (after a tool call, it re-asks the question it just asked) and sometimes
 * never answers at all. The keeper drops turns nobody asked for, and says
 * when a reply is overdue so the interviewer can be nudged.
 *
 * Pure: the call feeds it events and the time; no audio or network here.
 */

export const TURNS = {
  /** No reply this long after the candidate finished (or a cue): nudge the interviewer. */
  stallMs: 6_000,
  /** And again this long after the first nudge; then stop nudging. */
  secondStallMs: 10_000,
  /**
   * A turn may follow the interviewer's own turn within this long, unprompted,
   * only when that turn didn't end in a question ("Got it." then "Next, ...").
   * A question followed by another turn is the model repeating itself.
   */
  followOnMs: 3_000,
} as const;

export type TurnDecision = "speak" | "drop";

export class TurnKeeper {
  /** The interviewer owes a reply. */
  private owed = false;
  /** When it started owing it (the candidate finished, or a cue was sent). */
  private owedSince: number | null = null;
  private nudges = 0;
  private lastTurnEndedAt: number | null = null;
  private lastTurnAsked = false;
  /** A turn is in progress, and whether we're letting it through. */
  private open: TurnDecision | null = null;

  get owesReply() {
    return this.owed;
  }
  /** The interviewer is mid-turn (generating). */
  get speaking() {
    return this.open !== null;
  }

  /** The candidate started talking: whatever they say, they're owed a reply. */
  candidateSpeaking() {
    this.owed = true;
    this.owedSince = null;
  }

  /** The candidate finished. The reply clock starts now. */
  candidateDone(now: number) {
    if (!this.owed) return;
    this.owedSince = now;
    this.nudges = 0;
  }

  /** The system sent a cue the interviewer should answer. */
  cue(now: number) {
    this.owed = true;
    this.owedSince = now;
    this.nudges = 0;
  }

  /** The first audio or words of a new interviewer turn: let it through, or drop it. */
  turnStarted(now: number): TurnDecision {
    if (this.open) return this.open;
    let decision: TurnDecision;
    if (this.owed) decision = "speak";
    else if (
      this.lastTurnEndedAt !== null &&
      now - this.lastTurnEndedAt < TURNS.followOnMs &&
      !this.lastTurnAsked
    )
      decision = "speak";
    else decision = "drop";
    if (decision === "speak") {
      this.owed = false;
      this.owedSince = null;
    }
    this.open = decision;
    return decision;
  }

  /** The turn finished (or was cut off). `said` is what it said, if it was let through. */
  turnEnded(now: number, said: string) {
    if (this.open === "speak") {
      this.lastTurnEndedAt = now;
      this.lastTurnAsked = /\?\s*$/.test(said.trim());
    }
    this.open = null;
  }

  /** The current turn is no longer wanted (the candidate asked to hear it again): drop the rest. */
  dropCurrent() {
    if (this.open) this.open = "drop";
  }

  /** Is a reply overdue? True once per nudge, at most twice per wait. */
  overdue(now: number): boolean {
    if (!this.owed || this.owedSince === null || this.open) return false;
    const wait = this.nudges === 0 ? TURNS.stallMs : TURNS.stallMs + TURNS.secondStallMs;
    if (this.nudges >= 2 || now - this.owedSince < wait) return false;
    this.nudges++;
    return true;
  }

  /** How long the current reply has been owed since the candidate finished (0 if none). */
  owedFor(now: number): number {
    return this.owed && this.owedSince !== null && !this.open ? now - this.owedSince : 0;
  }

  /** The floor is free: nobody is talking and nothing is owed. Cues may be sent. */
  idle() {
    return !this.owed && this.open === null;
  }
}
