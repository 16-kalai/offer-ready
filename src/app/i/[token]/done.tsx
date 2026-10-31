"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { safely } from "@/lib/safe-action";
import { cn } from "@/lib/utils";
import { rateAction } from "./actions";
import { Card } from "./shell";

const RATINGS = ["Poor", "Okay", "Good", "Great", "Excellent"];

/** After the call: what happens next, and a one-tap rating. */
export function Done({
  token,
  companyName,
  firstName,
  rated,
  backHref,
  autoRedirect = false,
}: {
  backHref?: string | null;
  /** Right after the call: go to the result on its own after a short countdown. */
  autoRedirect?: boolean;
  token: string;
  companyName: string;
  firstName: string | null;
  rated: boolean;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [saved, setSaved] = useState(rated);
  const [, start] = useTransition();
  const router = useRouter();
  const [seconds, setSeconds] = useState(autoRedirect && backHref ? 6 : null);

  useEffect(() => {
    if (seconds === null || !backHref) return;
    if (seconds <= 0) {
      router.push(backHref);
      return;
    }
    const t = setTimeout(() => setSeconds((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [seconds, backHref, router]);

  return (
    <Card>
      <span className="flex size-12 items-center justify-center rounded-full bg-success/10">
        <Check className="size-6 text-success" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Thank you{firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Your coach is scoring your {companyName} practice interview now: readiness for every round,
        with your own words as evidence. It takes about a minute.
      </p>
      {backHref && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild className="h-11 gap-2 px-6">
            <Link href={backHref}>
              See my results <ArrowRight className="size-4" />
            </Link>
          </Button>
          {seconds !== null && (
            <span className="text-sm text-muted-foreground">
              Taking you there in {seconds}s…{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setSeconds(null)}
              >
                Stay here
              </button>
            </span>
          )}
        </div>
      )}

      <div className="mt-7 rounded-2xl bg-neutral-50 p-5">
        {saved ? (
          <p className="flex items-center gap-2 text-sm">
            <Check className="size-4 text-success" aria-hidden="true" /> Thanks for the feedback.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">How was the experience?</p>
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rating">
              {RATINGS.map((label, i) => (
                // biome-ignore lint/a11y/useSemanticElements: chip acting as a radio.
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={rating === i + 1}
                  onClick={() => {
                    setRating(i + 1);
                    start(async () => {
                      const res = await safely(() => rateAction(token, i + 1));
                      if (res.ok) setSaved(true);
                    });
                  }}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors",
                    rating === i + 1
                      ? "bg-primary text-white ring-primary"
                      : "bg-white ring-border hover:ring-neutral-400",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Only the written transcript was kept; your voice wasn't recorded. Nothing is shared with{" "}
        {companyName}.
      </p>
    </Card>
  );
}
