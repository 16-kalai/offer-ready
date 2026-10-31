/**
 * The words people see for hiring outcomes, in one place. Plain language:
 * "Move to next round", not "Advance". The stored values (advance, hold,
 * decline) never change; only what's shown does.
 */

/** The AI's suggestion on a report. */
export const SUGGESTION_WORDS = {
  advance: "Next round",
  maybe: "Maybe",
  decline: "Not a fit",
} as const;

/** The buttons HR presses. */
export const ACTION_WORDS = {
  advance: "Move to next round",
  hold: "Put on hold",
  decline: "Not a fit",
} as const;

/** What a candidate's status reads once HR has decided. */
export const DECIDED_WORDS = {
  advance: "Moved to next round",
  hold: "On hold",
  decline: "Not a fit",
} as const;

/** The same, shortened for narrow places (a table column, a chip). */
export const DECIDED_SHORT = {
  advance: "Next round",
  hold: "On hold",
  decline: "Not a fit",
} as const;
