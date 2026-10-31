/**
 * Calls a server action from the browser without ever crashing the page.
 * A call can fail before reaching our code (the connection dropped, the app
 * was updated while the page was open, the server restarted): then the
 * caller gets an ordinary error result to show, instead of an exception that
 * takes the whole screen down.
 */

export const ACTION_FAILED = "Couldn't reach Offer Ready. Refresh the page and try again.";

export async function safely<T>(call: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await call();
  } catch (error) {
    console.error("[action] failed", error);
    return { ok: false, error: ACTION_FAILED };
  }
}
