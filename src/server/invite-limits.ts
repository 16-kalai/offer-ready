/**
 * Reminder rules, shared by the web app (to explain and pre-check) and the
 * worker (to enforce). Kept free of heavy imports: the email renderer only
 * loads in the worker.
 */
export const MAX_NUDGES = 3;
/** The automatic reminder goes out this long before the link expires. */
export const AUTO_REMINDER_BEFORE_MS = 6 * 3_600_000;
/** Never remind the same person twice within this window. */
export const NUDGE_GAP_MS = 2 * 3_600_000;
