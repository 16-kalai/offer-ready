import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Fast redirect for signed-out visitors. It only checks that a session cookie
 * exists; every page still validates the session itself (lib/session.ts).
 *
 * Server action calls are never redirected here: the client expects an action
 * response, and an HTML login page would surface as "An unexpected response
 * was received from the server". Each action checks the session itself
 * (requireWorkspace) and its redirect to /login is one the client follows.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  if (request.headers.has("next-action")) {
    if (process.env.NODE_ENV !== "production") {
      // Names only, never values: enough to tell a missing cookie from a renamed one.
      const names = request.cookies.getAll().map((c) => c.name);
      console.warn("[proxy] action without a session cookie", request.nextUrl.pathname, names);
    }
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/dashboard", "/start", "/g/:path*"] };
