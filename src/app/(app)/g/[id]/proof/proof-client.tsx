"use client";

import {
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  GitBranch,
  Globe,
  Hammer,
  Loader2,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/coach/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProofIdea } from "@/lib/coach/types";
import { cn } from "@/lib/utils";
import { addTrail, chooseIdea, saveProject } from "../actions";

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
};

export function IdeaPicker({
  goalId,
  ideas,
  slots,
}: {
  goalId: string;
  ideas: (ProofIdea & { taken: number })[];
  slots: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {ideas.map((idea, i) => {
        const full = idea.taken >= slots;
        return (
          <div key={idea.key} className={cn("surface flex flex-col p-5", full && "opacity-60")}>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="font-medium">
                Idea {i + 1}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3" /> {idea.taken}/{slots} building
              </span>
            </div>
            <h3 className="mt-3 text-[17px] font-semibold leading-snug">{idea.headline}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{idea.problem}</p>
            <div className="mt-4 space-y-2">
              {idea.evidence.map((e) => (
                <div key={e.claim} className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  {e.claim}
                  {e.url && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      {e.source ?? host(e.url)}
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm">
              <div className="font-medium">What you'll build</div>
              <p className="mt-1 text-muted-foreground">{idea.build}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {idea.stack.map((s) => (
                <Badge key={s} variant="outline" className="font-normal">
                  {s}
                </Badge>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {idea.sessions} × 45 min
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3.5" />
                Proves: {idea.provesGap}
              </span>
            </div>
            <div className="mt-auto pt-5">
              <Button
                className="w-full gap-2"
                disabled={full || pending !== null}
                onClick={() => {
                  setPending(idea.key);
                  start(async () => {
                    const r = await chooseIdea(goalId, idea.key);
                    if (!r.ok) toast.error(r.error);
                    setPending(null);
                    router.refresh();
                  });
                }}
              >
                {pending === idea.key ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Hammer className="size-4" />
                )}
                {full ? "All slots taken" : "Build this"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Project = {
  idea: ProofIdea;
  repoUrl: string | null;
  demoUrl: string | null;
  summary: string;
  milestonesDone: number[];
  trail: { at: string; aiSaid: string; iDid: string; why: string }[];
};

export function BuildTracker({ goalId, project }: { goalId: string; project: Project }) {
  const router = useRouter();
  const [done, setDone] = useState(new Set(project.milestonesDone));
  const [repo, setRepo] = useState(project.repoUrl ?? "");
  const [demo, setDemo] = useState(project.demoUrl ?? "");
  const [summary, setSummary] = useState(project.summary);
  const [trail, setTrail] = useState({ aiSaid: "", iDid: "changed it", why: "" });
  const [saving, startSave] = useTransition();
  const [adding, startAdd] = useTransition();
  const progress = Math.round((done.size / project.idea.milestones.length) * 100);

  function toggle(i: number) {
    const next = new Set(done);
    next.has(i) ? next.delete(i) : next.add(i);
    setDone(next);
    startSave(async () => {
      const r = await saveProject(goalId, { milestonesDone: [...next] });
      if (!r.ok) toast.error(r.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Panel
          title="Milestones"
          description={`${progress}% done · about ${project.idea.sessions} sessions`}
        >
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.75_0.2_128)] transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ol className="space-y-2">
            {project.idea.milestones.map((m, i) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                    done.has(i)
                      ? "border-success/30 bg-success/5"
                      : "border-border/80 hover:border-primary/40",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border",
                      done.has(i) ? "border-success bg-success text-white" : "border-border",
                    )}
                  >
                    {done.has(i) && <Check className="size-3.5" />}
                  </span>
                  <span className={cn(done.has(i) && "text-muted-foreground line-through")}>
                    {m}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          title="Judgment trail"
          description="Every time you caught the AI being wrong. This is the story recruiters remember."
        >
          {project.trail.length > 0 && (
            <ul className="mb-5 space-y-3">
              {project.trail.map((t) => (
                <li key={t.at} className="rounded-xl border border-border/80 p-3.5 text-sm">
                  <div className="text-muted-foreground">
                    AI suggested: <span className="text-foreground">{t.aiSaid}</span>
                  </div>
                  <div className="mt-1">
                    I {t.iDid}, because {t.why}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-3 rounded-xl bg-muted/50 p-4">
            <div>
              <Label className="text-xs">What the AI suggested</Label>
              <Input
                value={trail.aiSaid}
                onChange={(e) => setTrail({ ...trail, aiSaid: e.target.value })}
                placeholder="e.g. Retry every failed webhook immediately, forever"
                className="mt-1 bg-background"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div>
                <Label className="text-xs">What you did</Label>
                <select
                  value={trail.iDid}
                  onChange={(e) => setTrail({ ...trail, iDid: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="changed it">Changed it</option>
                  <option value="rejected it">Rejected it</option>
                  <option value="kept it after checking">Kept it after checking</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Why</Label>
                <Input
                  value={trail.why}
                  onChange={(e) => setTrail({ ...trail, why: e.target.value })}
                  placeholder="e.g. it would hammer the merchant's server; I added backoff + a dead-letter queue"
                  className="mt-1 bg-background"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 bg-background"
              disabled={adding}
              onClick={() =>
                startAdd(async () => {
                  const r = await addTrail(goalId, trail);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setTrail({ aiSaid: "", iDid: "changed it", why: "" });
                  router.refresh();
                })
              }
            >
              {adding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}{" "}
              Log it
            </Button>
          </div>
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="What you're building">
          <p className="text-sm text-muted-foreground">{project.idea.build}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.idea.stack.map((s) => (
              <Badge key={s} variant="outline" className="font-normal">
                {s}
              </Badge>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-proof/20 px-3 py-2 text-xs text-proof-foreground">
            <span className="font-semibold">Resume line: </span>
            {project.idea.resumeLine}
          </div>
        </Panel>
        <Panel title="Links and summary">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Code repository</Label>
              <div className="relative mt-1">
                <GitBranch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="github.com/you/project"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Live demo</Label>
              <div className="relative mt-1">
                <Globe className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={demo}
                  onChange={(e) => setDemo(e.target.value)}
                  placeholder="your-project.vercel.app"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">In two or three sentences: what you built and found</Label>
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="mt-1 min-h-[96px]"
                placeholder="Dictate it with Wispr Flow: say it like you'd say it to the hiring manager."
              />
            </div>
            <Button
              className="w-full"
              variant="outline"
              disabled={saving}
              onClick={() =>
                startSave(async () => {
                  const r = await saveProject(goalId, { repoUrl: repo, demoUrl: demo, summary });
                  toast[r.ok ? "success" : "error"](r.ok ? "Saved." : r.error);
                })
              }
            >
              {saving && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </div>
        </Panel>
        <Button asChild size="lg" className="w-full gap-2">
          <Link href={`/g/${goalId}/defense`}>
            Ready? Defend it <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
