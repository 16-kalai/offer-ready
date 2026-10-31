"use client";

import { CalendarDays, Check, Clock, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReadinessRing } from "@/components/coach/readiness-ring";
import { cn } from "@/lib/utils";
import type { Phase, PhaseKey, Step } from "@/server/journey";

/** Which step a URL belongs to: /g/x/plan/3 is the plan step. */
function activeStep(path: string, phases: Phase[]): Step | null {
  for (const p of phases)
    for (const s of p.steps) if (path === s.href || path.startsWith(`${s.href}/`)) return s;
  return null;
}

function activePhase(path: string, phases: Phase[], current: PhaseKey): PhaseKey {
  const step = activeStep(path, phases);
  return phases.find((p) => step && p.steps.includes(step))?.key ?? current;
}

/** Where a phase tab goes: its first step you can act on, else its first step. */
function phaseHref(p: Phase): string {
  return (
    p.steps.find((s) => s.status === "current" || s.status === "working")?.href ??
    [...p.steps].reverse().find((s) => s.status === "done")?.href ??
    p.steps[0].href
  );
}

/**
 * The goal's dark hero. Full on "Today"; compact on a step, so the step's own
 * content starts above the fold.
 */
export function GoalHero(props: {
  goalId: string;
  company: string;
  role: string;
  daysLeft: number | null;
  minutesPerDay: number;
  overall: number | null;
  early: boolean;
  phases: Phase[];
  current: PhaseKey;
}) {
  const path = usePathname();
  const full = path === `/g/${props.goalId}`;
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <div className="bg-aurora pointer-events-none absolute inset-0 opacity-80" />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div
        className={cn(
          "relative mx-auto max-w-6xl px-4 sm:px-6",
          full ? "pt-8 pb-6 sm:pt-10" : "pt-5 pb-4",
        )}
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <div
            className={cn(
              "hidden shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-white/20 to-white/5 font-display font-semibold ring-1 ring-white/15 sm:grid",
              full ? "size-14 text-2xl" : "size-10 text-lg",
            )}
          >
            {props.company.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-proof">
              {props.company}
            </div>
            <h1
              className={cn(
                "font-display font-semibold tracking-tight",
                full
                  ? "mt-1.5 line-clamp-2 text-[26px] leading-[1.1] sm:text-[34px]"
                  : "mt-0.5 truncate text-lg sm:text-xl",
              )}
            >
              {props.role}
            </h1>
            {full && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
                {props.daysLeft !== null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">
                    <CalendarDays className="size-3.5" /> Interview in {props.daysLeft} day
                    {props.daysLeft === 1 ? "" : "s"}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">
                  <Clock className="size-3.5" /> {props.minutesPerDay} min a day
                </span>
              </div>
            )}
          </div>
          <ReadinessRing
            value={props.overall}
            size={full ? 104 : 60}
            stroke={full ? 9 : 6}
            tone="dark"
            label={full ? (props.early ? "early read" : "ready") : ""}
          />
        </div>
        <PhaseTabs
          goalId={props.goalId}
          phases={props.phases}
          current={props.current}
          compact={!full}
        />
      </div>
    </section>
  );
}

function PhaseTabs({
  goalId,
  phases,
  current,
  compact,
}: {
  goalId: string;
  phases: Phase[];
  current: PhaseKey;
  compact: boolean;
}) {
  const path = usePathname();
  const onHome = path === `/g/${goalId}`;
  const active = activePhase(path, phases, current);
  return (
    <nav
      className={cn("grid grid-cols-3 gap-2 sm:gap-3", compact ? "mt-4" : "mt-8")}
      aria-label="Phases"
    >
      {phases.map((p, i) => {
        const locked = p.status === "locked";
        const isActive = !onHome && p.key === active;
        const inner = (
          <>
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                  p.status === "done"
                    ? "bg-proof text-proof-foreground"
                    : isActive
                      ? "bg-primary text-white"
                      : "bg-white/15 text-white",
                )}
              >
                {p.status === "done" ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : locked ? (
                  <Lock className="size-3" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="font-display text-[15px] font-semibold sm:text-base">{p.label}</span>
              <span
                className={cn(
                  "ml-auto hidden text-xs tabular-nums sm:inline",
                  isActive ? "text-muted-foreground" : "text-white/50",
                )}
              >
                {p.done}/{p.steps.length}
              </span>
            </div>
            {!compact && (
              <div
                className={cn(
                  "mt-1 hidden truncate text-xs sm:block",
                  isActive ? "text-muted-foreground" : "text-white/55",
                )}
              >
                {p.blurb}
              </div>
            )}
            <div className={cn("flex gap-1", compact ? "mt-2" : "mt-3")}>
              {p.steps.map((s) => (
                <span
                  key={s.key}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    s.status === "done"
                      ? "bg-proof"
                      : s.status === "current" || s.status === "working"
                        ? isActive
                          ? "bg-primary"
                          : "bg-white/60"
                        : isActive
                          ? "bg-border"
                          : "bg-white/15",
                  )}
                />
              ))}
            </div>
          </>
        );
        const cls = cn(
          "rounded-2xl text-left transition-all",
          compact ? "px-3 py-2.5" : "p-3 sm:p-4",
          isActive
            ? "bg-white text-foreground shadow-xl shadow-black/20"
            : "bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/[0.1]",
          locked && "pointer-events-none opacity-50",
        );
        return locked ? (
          <div key={p.key} className={cls} aria-disabled="true">
            {inner}
          </div>
        ) : (
          <Link key={p.key} href={phaseHref(p)} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

export function StepBar({
  goalId,
  phases,
  current,
  days,
}: {
  goalId: string;
  phases: Phase[];
  current: PhaseKey;
  days: { day: number; done: boolean; href: string }[];
}) {
  const path = usePathname();
  const home = `/g/${goalId}`;
  const phase = phases.find((p) => p.key === activePhase(path, phases, current)) ?? phases[0];
  const step = activeStep(path, phases);
  const onDay =
    phase.key === "train" && days.some((d) => d.href === path && path.includes("/plan/"));
  return (
    <div className="sticky top-16 z-20 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        <Link
          href={home}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            path === home
              ? "bg-ink text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          Today
        </Link>
        <span className="mx-1.5 h-4 w-px shrink-0 bg-border" />
        {phase.steps.map((s) => {
          const active = step?.key === s.key && !onDay;
          const locked = s.status === "locked";
          const content = (
            <>
              {s.status === "done" ? (
                <Check className="size-3.5 text-success" strokeWidth={3} />
              ) : s.status === "working" ? (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              ) : locked ? (
                <Lock className="size-3" />
              ) : (
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    s.status === "current" ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
              )}
              {s.label}
            </>
          );
          const cls = cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            active
              ? "bg-secondary text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            locked && "pointer-events-none opacity-50",
          );
          return locked ? (
            <span key={s.key} className={cls}>
              {content}
            </span>
          ) : (
            <Link key={s.key} href={s.href} className={cls}>
              {content}
            </Link>
          );
        })}
        {phase.key === "train" &&
          days.map((d) => {
            const active = path === d.href;
            return (
              <Link
                key={d.day}
                href={d.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {d.done && <Check className="size-3.5 text-success" strokeWidth={3} />}
                Day {d.day}
              </Link>
            );
          })}
      </div>
    </div>
  );
}
