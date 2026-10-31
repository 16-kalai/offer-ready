"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { safely } from "@/lib/safe-action";
import { cn } from "@/lib/utils";
import { newLinkAction } from "./actions";

/** The practice room's frame: the target company first, Offer Ready quietly at the bottom. */
export function Shell({
  company,
  wide = false,
  children,
}: {
  company: string | null;
  wide?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-5 sm:px-8">
        {company && <CompanyMark name={company} />}
      </header>
      <main
        className={cn(
          "mx-auto flex w-full flex-1 flex-col px-4 pb-10 sm:px-6",
          wide ? "max-w-6xl" : "max-w-xl justify-center",
        )}
      >
        {children ?? (
          <div className="h-80 animate-pulse rounded-3xl bg-white ring-1 ring-black/[0.05]" />
        )}
      </main>
      <footer className="pb-6 text-center text-xs text-neutral-400">
        Practice interview by{" "}
        <a href="/dashboard" className="font-medium hover:text-neutral-600">
          Offer Ready
        </a>
      </footer>
    </div>
  );
}

export function CompanyMark({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="font-semibold">{name}</span>
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.18)] ring-1 ring-black/[0.06] sm:p-9",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{children}</p>
    </Card>
  );
}

export function ExpiredCard({
  token,
  replyToEmail,
  requested,
}: {
  token: string;
  replyToEmail: string;
  requested: boolean;
}) {
  const [sent, setSent] = useState(requested);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight">This interview link has expired</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        The deadline has passed. If you'd still like to do the interview, ask for more time and the
        team will reopen this same link.
      </p>
      {sent ? (
        <p className="mt-6 flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm text-emerald-800">
          <Check className="size-4" aria-hidden="true" /> Request sent. You'll hear back by email.
        </p>
      ) : (
        <Button
          className="mt-6 h-11 gap-2 px-5"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await safely(() => newLinkAction(token));
              if (res.ok) setSent(true);
              else setError(res.error);
            })
          }
        >
          {pending && <Loader2 className="size-4 animate-spin" />} Ask for more time
        </Button>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <p className="mt-6 text-sm text-muted-foreground">
        Or email{" "}
        <a
          href={`mailto:${replyToEmail}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          {replyToEmail}
        </a>
        .
      </p>
    </Card>
  );
}
