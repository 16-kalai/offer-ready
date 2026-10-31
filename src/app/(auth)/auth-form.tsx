"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Mode = "login" | "signup";

const MIN_PASSWORD = 10;

/** Maps Better Auth error codes to messages people can act on. Never reveals whether an email exists on log in. */
function messageFor(error: { code?: string | undefined; status: number }, mode: Mode): string {
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  const code = error.code ?? "";
  if (code.startsWith("USER_ALREADY_EXISTS"))
    return "An account with this email already exists. Log in instead.";
  if (code === "INVALID_EMAIL_OR_PASSWORD") return "That email and password don't match.";
  if (code === "INVALID_EMAIL") return "Enter a valid email address.";
  if (code === "PASSWORD_TOO_SHORT") return `Use at least ${MIN_PASSWORD} characters.`;
  if (code === "PASSWORD_TOO_LONG") return "That password is too long.";
  return mode === "login"
    ? "We couldn't log you in. Try again."
    : "We couldn't create your account. Try again.";
}

export function AuthForm({
  mode,
  initialError,
}: {
  mode: Mode;
  initialError?: string | undefined;
}) {
  const router = useRouter();
  const ids = { name: useId(), email: useId(), password: useId() };
  const [pending, setPending] = useState<"email" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (mode === "signup" && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    setPending("email");
    setError(null);
    const { error: authError } =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });
    if (authError) {
      setError(messageFor(authError, mode));
      setPending(null);
      return;
    }
    router.replace(mode === "signup" ? "/start" : "/dashboard");
    router.refresh();
  }

  const busy = pending !== null;
  return (
    <div>
      <h1 className="font-display text-[30px] font-semibold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {mode === "login"
          ? "Pick up your prep where you left off."
          : "Paste a job, get your honest readiness in 20 minutes. Free."}
      </p>

      <form className="mt-8 grid gap-4" onSubmit={submit}>
        {mode === "signup" && (
          <div className="grid gap-1.5">
            <Label htmlFor={ids.name}>Full name</Label>
            <Input
              id={ids.name}
              name="name"
              autoComplete="name"
              required
              maxLength={100}
              placeholder="Priya Sharma"
              className="h-11 px-3"
            />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={ids.email}>Work email</Label>
          <Input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@company.com"
            className="h-11 px-3"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.password}>Password</Label>
          <div className="relative">
            <Input
              id={ids.password}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "signup" ? MIN_PASSWORD : undefined}
              maxLength={128}
              placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : undefined}
              className="h-11 px-3 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-1 h-11 w-full text-[15px]" disabled={busy}>
          {pending === "email" && <Loader2 className="size-4 animate-spin" />}
          {mode === "login" ? "Log in" : "Create account"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {mode === "login" ? "New to Werdict? " : "Already have an account? "}
        <Link
          href={mode === "login" ? "/signup" : "/login"}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Log in"}
        </Link>
      </p>
    </div>
  );
}
