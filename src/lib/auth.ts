import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "./env";

/**
 * Sign-in for candidates: email and password. Sessions live in our own
 * Postgres (revocable, 30 days, refreshed daily of use). Password hashing
 * (scrypt) and secure cookies are handled by Better Auth.
 */
function createAuth() {
  const config = env();
  return betterAuth({
    appName: "Offer Ready",
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Short-lived signed copy in a cookie, so most requests skip the database.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      // Tighter limits where passwords are guessed or accounts are mass-created.
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/sign-in/social": { window: 60, max: 10 },
      },
    },
    advanced: { useSecureCookies: config.NODE_ENV === "production" },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
// Module scope, not globalThis: a code change rebuilds it with the new config.
// The expensive part (the Postgres pool) is already shared via db().
let instance: Auth | undefined;

export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}
