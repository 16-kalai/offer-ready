import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "./auth";

/**
 * The signed-in HR user for this request, checked against the database (the
 * proxy only looks for a cookie). Cached for the duration of one request.
 */
export const getSession = cache(async () => {
  // Session checks depend on the request and the clock: never prerendered.
  await connection();
  return auth().api.getSession({ headers: await headers() });
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
