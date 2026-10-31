import { ArrowRight, ExternalLink, Globe, Lightbulb, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { RetryCard } from "@/components/coach/retry";
import { PageHeader, Panel } from "@/components/coach/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUND_KIND_LABEL } from "@/lib/coach/types";
import { requireSession } from "@/lib/session";
import { getGoal, getIntel } from "@/server/goals";
import { retryResearch } from "../actions";

const CONFIDENCE = {
  high: { label: "High confidence", cls: "bg-success/10 text-success border-success/20" },
  medium: {
    label: "Medium confidence",
    cls: "bg-warning/15 text-[oklch(0.5_0.12_70)] border-warning/30",
  },
  low: { label: "Low confidence", cls: "bg-muted text-muted-foreground" },
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export default async function ResearchPage({ params }: PageProps<"/g/[id]/research">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const row = await getIntel(goal);

  if (!row || row.status === "pending" || !row.intel) {
    if (row?.status === "failed")
      return (
        <RetryCard
          title="Research didn't finish"
          body="Search was busy. Try again; it usually works on the second go."
          action={retryResearch.bind(null, goal.id)}
        />
      );
    return (
      <Pending
        title={`Researching how ${goal.companyName} hires`}
        steps={[
          "Searching recent interview experiences…",
          "Reading candidate write-ups from 2025–26…",
          `Looking for problems ${goal.companyName} is facing publicly…`,
          "Cross-checking sources…",
          "Mapping every round and its topics…",
        ]}
      />
    );
  }
  const intel = row.intel;
  const conf = CONFIDENCE[intel.confidence];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="How they hire"
        title={`Inside ${goal.companyName}'s interview`}
        actions={
          <Button asChild className="gap-2">
            <Link href={`/g/${goal.id}/check`}>
              Find my level <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      >
        {intel.about}
      </PageHeader>

      <Panel
        title={`${intel.rounds.length} rounds for ${goal.roleTitle}`}
        description={intel.confidenceNote}
        action={
          <Badge variant="outline" className={`gap-1 ${conf.cls}`}>
            <ShieldCheck className="size-3" />
            {conf.label}
          </Badge>
        }
      >
        <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
          {intel.rounds.map((r, i) => (
            <li key={`${r.title}-${i}`} className="relative flex gap-4">
              <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-primary/20 bg-secondary text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="flex-1 rounded-xl border border-border/80 bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <Badge variant="secondary" className="font-normal">
                    {ROUND_KIND_LABEL[r.kind]}
                  </Badge>
                  {r.minutes > 0 && (
                    <span className="text-xs text-muted-foreground">~{r.minutes} min</span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{r.what}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.topics.map((t) => (
                    <Badge key={t} variant="outline" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" />
              Problems they're facing
            </span>
          }
          description="From public signals. These become your proof-project ideas."
        >
          <ul className="space-y-3">
            {intel.problems.map((p) => (
              <li key={p.title} className="rounded-xl border border-border/80 p-4">
                <div className="font-medium">{p.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{p.evidence}</p>
                {p.sourceIndexes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.sourceIndexes.map(
                      (i) =>
                        intel.sources[i] && (
                          <a
                            key={i}
                            href={intel.sources[i].url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            {host(intel.sources[i].title || intel.sources[i].url)}
                          </a>
                        ),
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <Users className="size-4 text-primary" />
                Who decides
              </span>
            }
            description="Titles to reach when you launch your proof."
          >
            <ul className="space-y-3">
              {intel.peopleToReach.map((p) => (
                <li key={p.title}>
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.why}</div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                Sources
              </span>
            }
            description={`${intel.sources.length} pages, found with Google Search`}
          >
            <ul className="space-y-2">
              {intel.sources.slice(0, 10).map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-2 text-sm"
                  >
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    <span className="truncate group-hover:text-primary">
                      {host(s.title || s.url)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
