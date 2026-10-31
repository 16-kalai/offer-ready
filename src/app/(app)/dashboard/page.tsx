import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReadinessRing } from "@/components/coach/readiness-ring";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/session";
import { listGoals } from "@/server/goals";

export const metadata: Metadata = { title: "Your goals" };

export default async function Dashboard() {
  const session = await requireSession();
  const goals = await listGoals(session.user.id);
  if (goals.length === 0) redirect("/start");
  const first = session.user.name.split(" ")[0];
  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-80" />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 pt-10 pb-24 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-proof">
              Your goals
            </div>
            <h1 className="mt-2 font-display text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">
              Hi {first}, where are we heading?
            </h1>
            <p className="mt-2 text-white/65">
              Each target job gets its own research, practice and proof.
            </p>
          </div>
          <Button asChild size="lg" className="h-11 gap-2 bg-white text-ink hover:bg-white/90">
            <Link href="/start">
              <Plus className="size-4" /> New target job
            </Link>
          </Button>
        </div>
      </section>
      <main className="relative mx-auto -mt-16 max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <Link
              key={g.id}
              href={`/g/${g.id}`}
              className="surface group flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="grid size-11 place-items-center rounded-xl bg-secondary font-display text-lg font-semibold text-primary">
                  {g.companyName.slice(0, 1).toUpperCase()}
                </div>
                <ReadinessRing value={g.overall} size={72} stroke={7} label="" />
              </div>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                {g.companyName}
              </div>
              <div className="mt-1 line-clamp-2 font-display text-lg font-semibold leading-snug">
                {g.roleTitle}
              </div>
              <div className="mt-auto flex items-center justify-between pt-6 text-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  {g.interviewDate ? (
                    <>
                      <CalendarDays className="size-4" />
                      {g.interviewDate.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </>
                  ) : (
                    "No date yet"
                  )}
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  Continue{" "}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
          <Link
            href="/start"
            className="flex min-h-[220px] flex-col items-center justify-center rounded-[calc(var(--radius)*1.4)] border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="size-6" />
            <span className="mt-2 text-sm font-medium">Add another target job</span>
          </Link>
        </div>
      </main>
    </>
  );
}
