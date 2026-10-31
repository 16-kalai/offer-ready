import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { AuthForm } from "./auth-form";

const OAUTH_ERRORS: Record<string, string> = {
  state_mismatch: "That sign-in link expired. Start again.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Server part shared by /login and /signup: signed-in users skip ahead; OAuth errors become messages. */
export function AuthPage({
  mode,
  searchParams,
}: {
  mode: "login" | "signup";
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<div className="h-[520px] rounded-xl bg-muted/50" />}>
      <AuthPageContent mode={mode} searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthPageContent({
  mode,
  searchParams,
}: {
  mode: "login" | "signup";
  searchParams: SearchParams;
}) {
  if (await getSession()) redirect("/dashboard");
  const { error } = await searchParams;
  const code = typeof error === "string" ? error : undefined;
  return (
    <AuthForm
      mode={mode}
      initialError={
        code ? (OAUTH_ERRORS[code] ?? "We couldn't sign you in. Try again.") : undefined
      }
    />
  );
}
