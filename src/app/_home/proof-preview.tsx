"use client";

import { BadgeCheck, ExternalLink, Eye, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The landing's Proof Page preview: what a recruiter sees (claim, the finding,
 * evidence, "defended on record") and what the candidate sees a moment later
 * (who opened it, how much they watched). The feed replays on a loop.
 */

const WEEKS = ["W1", "W2", "W3", "W4", "W5", "W6"];
const BEFORE = [100, 46, 38, 33, 30, 28];
const AFTER = [100, 61, 54, 49, 46, 44];

const FEED = [
  { who: "Opened from your DM to the Growth Lead", detail: "watched 1:32 · opened the analysis" },
  { who: "Opened from your referral note", detail: "watched 0:48 · forwarded internally" },
  { who: "Opened from your LinkedIn post", detail: "watched 2:04 · tapped “Talk to Riya”" },
];

function RetentionChart() {
  const w = 340;
  const h = 120;
  const x = (i: number) => 18 + (i / (WEEKS.length - 1)) * (w - 36);
  const y = (v: number) => h - 18 - (v / 100) * (h - 34);
  const line = (vals: number[]) => vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full"
      role="img"
      aria-label="Repeat orders by week, before and with the fix"
    >
      {[25, 50, 75].map((g) => (
        <line
          key={g}
          x1="18"
          x2={w - 18}
          y1={y(g)}
          y2={y(g)}
          stroke="var(--border)"
          strokeDasharray="3 4"
        />
      ))}
      <polyline
        points={line(BEFORE)}
        fill="none"
        stroke="oklch(0.7 0.02 275)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={line(AFTER)}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {AFTER.map((v, i) => (
        <circle
          key={WEEKS[i]}
          cx={x(i)}
          cy={y(v)}
          r="3.5"
          fill="var(--primary)"
          stroke="white"
          strokeWidth="1.5"
        />
      ))}
      {WEEKS.map((wk, i) => (
        <text
          key={wk}
          x={x(i)}
          y={h - 3}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="10"
        >
          {wk}
        </text>
      ))}
    </svg>
  );
}

export function ProofPreview() {
  const [shown, setShown] = useState(2);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(FEED.length);
      return;
    }
    const id = setInterval(() => setShown((n) => (n >= FEED.length ? 2 : n + 1)), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative">
      {/* What the recruiter sees */}
      <div className="overflow-hidden rounded-3xl bg-white text-foreground shadow-2xl shadow-black/30 ring-1 ring-black/5">
        <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate rounded-md bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
            offer-ready-lemon.vercel.app/p/riya-kwiko
          </span>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">
              RS
            </span>
            <div className="text-xs">
              <div className="font-semibold">Riya Sharma</div>
              <div className="text-muted-foreground">Proof of work · Business Analyst, Kwiko</div>
            </div>
          </div>
          <h3 className="mt-4 font-display text-[21px] font-semibold leading-snug tracking-tight">
            I analysed why Kwiko&apos;s repeat orders drop after week one, and tested 3 fixes.
          </h3>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-proof/30 px-2.5 py-1 text-xs font-semibold text-proof-foreground">
            <BadgeCheck className="size-3.5" /> Defended on record · 31 Oct 2026
          </div>

          <div className="mt-4 rounded-2xl border border-border/80 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Repeat orders by week (%)</span>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-0.5 w-3 rounded bg-[oklch(0.7_0.02_275)]" /> Today
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-0.5 w-3 rounded bg-primary" /> With fix #2
                </span>
              </span>
            </div>
            <div className="mt-2">
              <RetentionChart />
            </div>
          </div>

          <ul className="mt-4 grid gap-2 text-[13px] sm:grid-cols-3">
            {[
              "54% of first-time buyers never reorder after week 1",
              "The delivery-fee jump on order #2 explains most of the drop",
              "Fix #2 (free second delivery) lifts week-6 repeat to 44%",
            ].map((p) => (
              <li key={p} className="flex gap-1.5 rounded-xl bg-muted/60 p-2.5 leading-snug">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-medium text-primary-foreground">
              <ExternalLink className="size-3.5" /> Open the analysis
            </span>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-proof bg-proof/25 px-3.5 text-xs font-semibold text-proof-foreground">
              <MessageCircle className="size-3.5" /> Talk to Riya
            </span>
          </div>
        </div>
      </div>

      {/* What the candidate sees, a moment later */}
      <div className="relative z-10 -mt-8 ml-auto min-h-[214px] w-[92%] rounded-2xl bg-ink/95 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur sm:-mr-6 sm:w-[340px]">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-proof opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-proof" />
          </span>
          Live activity
        </div>
        <ul className="mt-3 space-y-2">
          {FEED.slice(0, shown).map((f, i) => (
            <li
              key={f.who}
              className={cn(
                "flex items-start gap-2.5 rounded-xl bg-white/[0.07] p-2.5",
                i === shown - 1 && "animate-rise",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-proof/25">
                <Eye className="size-3.5 text-proof" />
              </span>
              <div className="text-[12px] leading-snug">
                <div className="font-medium">{f.who}</div>
                <div className="text-white/55">just now · {f.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
