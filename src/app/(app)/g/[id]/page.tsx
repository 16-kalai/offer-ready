import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock,
  Dumbbell,
  Eye,
  Hammer,
  Mic,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/coach/pending";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { Button } from "@/components/ui/button";
import { weakestRound } from "@/lib/coach/readiness";
import { ROUND_KIND_LABEL } from "@/lib/coach/types";
import { requireSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getDays, getGoal } from "@/server/goals";
import { journey } from "@/server/journey";
import { packActivity } from "@/server/packs";

const NEXT: Record<string, { title: string; body: string; cta: string; minutes: string }> = {
  research: {
    title: "We're researching how they hire",
    body: "Reading recent interview write-ups and public signals about the company. You'll see every round, its topics and the sources.",
    cta: "Watch it come in",
    minutes: "about a minute",
  },
  check: {
    title: "Find your real level",
    body: "Eight questions that start with basics and climb to the level of the real interview. Get one right and the next gets harder.",
    cta: "Start level check",
    minutes: "5 min",
  },
  mock: {
    title: "Take your first mock interview",
    body: "A voice interview built from this job: your own projects, three real-work cases on screen, and a twist halfway through.",
    cta: "Go to the interview",
    minutes: "15 min",
  },
  report: {
    title: "See how ready you are",
    body: "Readiness for every round, with your own words as evidence.",
    cta: "Open readiness",
    minutes: "3 min",
  },
  plan: {
    title: "Today's training",
    body: "A short session aimed at the gap most likely to cost you the offer.",
    cta: "Start today",
    minutes: "20 min",
  },
  proof: {
    title: "Pick your proof project",
    body: "Three problems this company is publicly facing. Build one in a few evenings and walk in with the work done.",
    cta: "See the ideas",
    minutes: "5 min",
  },
  defense: {
    title: "Defend your project, on record",
    body: "A second voice interview that questions your project, with a twist. Pass and your Proof Page unlocks.",
    cta: "Go to defense",
    minutes: "15 min",
  },
  launch: {
    title: "Get it in front of the people who decide",
    body: "Your Proof Page, a 2-minute video and messages written in your voice, with tracked links.",
    cta: "Open launch kit",
    minutes: "20 min",
  },
};

function Trend({ values }: { values: number[] }) {
  const w = 280;
  const h = 72;
  if (values.length < 2)
    return (
      <div className="grid h-[72px] place-items-center text-xs text-muted-foreground">
        Your trend appears after the next step.
      </div>
    );
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 6 - (v / 100) * (h - 12);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-[72px] w-full overflow-visible"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.52 0.23 272)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="oklch(0.52 0.23 272)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#trend-fill)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={x(values.length - 1)}
        cy={y(values.at(-1) ?? 0)}
        r="4.5"
        fill="var(--primary)"
        stroke="white"
        strokeWidth="2"
      />
    </svg>
  );
}

export default async function GoalToday({ params }: PageProps<"/g/[id]">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const j = await journey(goal);
  const days = j.plan?.plan ? await getDays(goal.id) : [];
  const activity = j.pack ? await packActivity(j.pack.id) : null;
  const next = j.next;
  const copy = next ? NEXT[next.key] : null;
  const phase = j.phases.find((p) => p.steps.some((s) => s.key === next?.key));
  const stepNo = next ? j.steps.findIndex((s) => s.key === next.key) + 1 : j.steps.length;
  const first = (j.history.find((h) => h.source === "baseline") ?? j.history[0])?.overall;
  const now = j.readiness?.overall ?? null;
  const weakest = j.readiness ? weakestRound(j.readiness.rounds) : null;
  const working = j.steps.some((s) => s.status === "working");
  const doneDays = new Set(days.filter((d) => d.completedAt).map((d) => d.day));
  const views = activity?.views ?? [];

  return (
    <div className="space-y-6">
      {(working || j.pack?.publishedAt) && <AutoRefresh every={5000} />}

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        {next && copy ? (
          <section className="surface relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Up next
                <span className="text-muted-foreground">
                  · {phase?.label} · step {stepNo} of {j.steps.length}
                </span>
              </div>
              <div className="mt-5 flex items-start gap-5">
                <VoiceOrb
                  size={64}
                  state={next.status === "working" ? "thinking" : "speaking"}
                  className="mt-1 hidden sm:block"
                />
                <div>
                  <h2 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
                    {copy.title}
                  </h2>
                  <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                    {copy.body}
                  </p>
                </div>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-4 sm:mt-auto sm:pt-8">
                <Button
                  asChild
                  size="lg"
                  className="h-12 gap-2 px-6 text-[15px] shadow-lg shadow-primary/25"
                >
                  <Link href={next.href}>
                    {copy.cta} <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-4" /> {copy.minutes}
                </span>
              </div>
            </div>
          </section>
        ) : (
          <section className="surface relative overflow-hidden p-6 sm:p-8">
            <div className="bg-aurora pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full bg-proof/30 px-3 py-1 text-xs font-semibold text-proof-foreground">
                <BadgeCheck className="size-3.5" /> Launched
              </div>
              <h2 className="mt-4 font-display text-[30px] font-semibold leading-tight tracking-tight">
                Your proof is out there. Now follow up.
              </h2>
              <p className="mt-2 max-w-lg text-[15px] text-muted-foreground">
                Watch who opens it, send the day-3 follow-up, and practise the company-specific
                questions before the interview.
              </p>
              <Button asChild size="lg" className="mt-6 gap-2">
                <Link href={`/g/${goal.id}/launch`}>
                  Open launch kit <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </section>
        )}

        <section className="surface flex flex-col p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Readiness</h3>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-5xl font-semibold tabular-nums tracking-tight">
              {now === null ? "—" : `${now}%`}
            </span>
            {first !== undefined && now !== null && now !== first && (
              <span
                className={cn(
                  "text-sm font-semibold",
                  now > first ? "text-success" : "text-destructive",
                )}
              >
                {now > first ? "+" : ""}
                {now - first} since your first mock
              </span>
            )}
          </div>
          <div className="mt-4">
            <Trend
              values={(j.history.some((h) => h.source !== "level")
                ? j.history.filter((h) => h.source !== "level")
                : j.history
              ).map((h) => h.overall)}
            />
          </div>
          {weakest && (
            <div className="mt-auto rounded-xl bg-muted/60 p-3 pt-3 text-sm">
              <span className="text-muted-foreground">Riskiest round: </span>
              <span className="font-medium">{weakest.title}</span>
              <span className="text-muted-foreground"> · {weakest.score}%</span>
            </div>
          )}
        </section>
      </div>

      {j.readiness && (
        <section className="surface p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Your interview path at {goal.companyName}</h3>
              <p className="text-sm text-muted-foreground">
                How likely you are to clear each round today.
              </p>
            </div>
            <Link
              href={`/g/${goal.id}/research`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              How they hire <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {j.readiness.rounds.map((r, i) => {
              const measured = r.measured !== false;
              const tone = !measured
                ? "muted"
                : r.score >= 70
                  ? "good"
                  : r.score >= 45
                    ? "mid"
                    : "low";
              return (
                <li
                  key={`${r.title}-${i}`}
                  className="relative rounded-2xl border border-border/80 bg-background p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-6 place-items-center rounded-full bg-secondary text-[11px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                        tone === "good" && "bg-success/12 text-success",
                        tone === "mid" && "bg-primary/10 text-primary",
                        tone === "low" && "bg-warning/20 text-[oklch(0.5_0.12_60)]",
                        tone === "muted" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {measured ? `${r.score}%` : "soon"}
                    </span>
                  </div>
                  <div className="mt-3 line-clamp-2 text-sm font-medium leading-snug">
                    {r.title}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {ROUND_KIND_LABEL[r.kind]}
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        tone === "good"
                          ? "bg-success"
                          : tone === "mid"
                            ? "bg-primary"
                            : tone === "low"
                              ? "bg-warning"
                              : "bg-transparent",
                      )}
                      style={{ width: `${measured ? Math.max(4, r.score) : 0}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {j.plan?.plan && (
          <section className="surface p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Your {j.plan.plan.days.length}-day plan</h3>
              <Link
                href={`/g/${goal.id}/plan`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{j.plan.plan.headline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {j.plan.plan.days.map((d) => {
                const done = doneDays.has(d.day);
                const Icon = d.kind === "build" ? Hammer : d.kind === "mock" ? Mic : Dumbbell;
                const href =
                  d.kind === "practice"
                    ? `/g/${goal.id}/plan/${d.day}`
                    : d.kind === "build"
                      ? `/g/${goal.id}/proof`
                      : `/g/${goal.id}/defense`;
                return (
                  <Link
                    key={d.day}
                    href={href}
                    title={d.title}
                    className={cn(
                      "flex w-[72px] flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs transition-colors",
                      done
                        ? "border-success/30 bg-success/5 text-success"
                        : "border-border/80 hover:border-primary/40",
                    )}
                  >
                    {done ? (
                      <Check className="size-4" strokeWidth={3} />
                    ) : (
                      <Icon className="size-4 text-primary" />
                    )}
                    <span className="font-medium text-foreground">Day {d.day}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {j.project && (
          <section className="surface p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Your proof</h3>
              <Link
                href={`/g/${goal.id}/${j.pack?.publishedAt ? "launch" : "proof"}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open
              </Link>
            </div>
            <p className="mt-2 line-clamp-2 font-display text-lg font-semibold leading-snug">
              {j.project.idea.headline}
            </p>
            {j.pack?.publishedAt ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Eye className="size-4 text-primary" />
                  <span className="font-medium">
                    {views.length} view{views.length === 1 ? "" : "s"}
                  </span>
                  <span className="text-muted-foreground">on your Proof Page</span>
                </div>
                {views.slice(0, 2).map((v) => (
                  <div key={v.viewId} className="rounded-xl bg-muted/60 px-3 py-2 text-xs">
                    <span className="font-medium">
                      {v.label ? `From "${v.label}"` : "Direct link"}
                    </span>
                    {v.watched > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        · watched {Math.floor(v.watched / 60)}:
                        {String(v.watched % 60).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Milestones</span>
                  <span>
                    {j.project.milestonesDone.length}/{j.project.idea.milestones.length}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.78_0.2_128)]"
                    style={{
                      width: `${(j.project.milestonesDone.length / j.project.idea.milestones.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
