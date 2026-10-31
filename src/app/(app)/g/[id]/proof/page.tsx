import { notFound, redirect } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { RetryCard } from "@/components/coach/retry";
import { PageHeader } from "@/components/coach/section";
import { requireSession } from "@/lib/session";
import { getGoal, getIdeas, getProject, IDEA_SLOTS, ideaTaken, mockState } from "@/server/goals";
import { retryIdeas } from "../actions";
import { BuildTracker, IdeaPicker } from "./proof-client";

export default async function ProofPage({ params }: PageProps<"/g/[id]/proof">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const [baseline, ideas, project] = await Promise.all([
    mockState(goal.id, "baseline"),
    getIdeas(goal.id),
    getProject(goal.id),
  ]);
  if (baseline.stage !== "done") redirect(`/g/${goal.id}/mock`);

  if (project)
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Your proof project" title={project.idea.headline}>
          Build it in short sessions. Log the moments you corrected the AI: your defense interview
          will ask about them.
        </PageHeader>
        <BuildTracker
          goalId={goal.id}
          project={{
            idea: project.idea,
            repoUrl: project.repoUrl,
            demoUrl: project.demoUrl,
            summary: project.summary,
            milestonesDone: project.milestonesDone,
            trail: project.trail,
          }}
        />
      </div>
    );

  if (ideas?.status === "failed")
    return (
      <RetryCard
        title="Couldn't write your ideas"
        body="The AI was busy. Try again."
        action={retryIdeas.bind(null, goal.id)}
      />
    );
  if (!ideas?.ideas)
    return (
      <Pending
        title={`Finding problems ${goal.companyName} is facing`}
        steps={[
          "Reading the public evidence we found…",
          "Matching problems to this role…",
          "Sizing each build to a few evenings…",
          "Aiming each one at your weakest skill…",
        ]}
      />
    );
  const taken = await ideaTaken(
    goal.companyName,
    ideas.ideas.map((i) => i.key),
    goal.id,
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Proof project"
        title={`Three problems ${goal.companyName} is facing. Pick one to build.`}
      >
        Small enough for a few evenings, real enough to talk about in the interview. Each idea is a
        hypothesis from public information, never insider knowledge.
      </PageHeader>
      <IdeaPicker
        goalId={goal.id}
        ideas={ideas.ideas.map((i) => ({ ...i, taken: taken.get(i.key) ?? 0 }))}
        slots={IDEA_SLOTS}
      />
    </div>
  );
}
