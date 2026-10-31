import { notFound, redirect } from "next/navigation";
import { AutoRefresh, Pending } from "@/components/coach/pending";
import { RetryCard } from "@/components/coach/retry";
import { PageHeader } from "@/components/coach/section";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { getGoal, getIntel, getLinks, getPack, getProject, mockState } from "@/server/goals";
import { packActivity } from "@/server/packs";
import { prepareLaunch } from "../actions";
import { LaunchKitView, StartLaunch } from "./launch-client";

export default async function LaunchPage({ params }: PageProps<"/g/[id]/launch">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const project = await getProject(goal.id);
  if (!project) redirect(`/g/${goal.id}/proof`);
  const [pack, defense, intel] = await Promise.all([
    getPack(goal.id),
    mockState(goal.id, "defense"),
    getIntel(goal),
  ]);

  if (!pack)
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Launch" title="Get your proof in front of the people who decide">
          We'll write your 7-second claim, a 2-minute video script, a LinkedIn post, messages to the
          hiring manager and a referral ask, all in your voice. You post and send everything
          yourself.
        </PageHeader>
        <StartLaunch goalId={goal.id} />
      </div>
    );
  if (pack.status === "failed")
    return (
      <RetryCard
        title="Couldn't write your launch kit"
        body="The AI was busy. Try again."
        action={prepareLaunch.bind(null, goal.id)}
      />
    );
  if (!pack.kit)
    return (
      <Pending
        title="Writing your launch kit"
        steps={[
          "Writing a claim a recruiter gets in 7 seconds…",
          "Scripting your 2-minute walkthrough…",
          "Drafting messages in your voice…",
          "Checking nothing reads like spam…",
        ]}
      />
    );

  const [links, activity] = await Promise.all([getLinks(pack.id), packActivity(pack.id)]);
  const defended =
    defense.stage === "done" &&
    Boolean(defense.report.judged) &&
    defense.report.judged?.overall.recommendation !== "decline";
  const base = env().BETTER_AUTH_URL;
  return (
    <div className="space-y-6">
      {pack.publishedAt && <AutoRefresh every={5000} />}
      <PageHeader
        eyebrow="Launch"
        title={pack.publishedAt ? "Your Proof Page is live" : "Your launch kit"}
      >
        {pack.publishedAt
          ? "Share a tracked link per person or channel. You'll see who opened it and how much they watched."
          : "Pass the quality gate to publish. We'd rather you send one great page than fifty forgettable ones."}
      </PageHeader>
      <LaunchKitView
        goalId={goal.id}
        companyName={goal.companyName}
        kit={pack.kit}
        slug={pack.slug}
        baseUrl={base}
        hostedUploads={Boolean(env().BLOB_READ_WRITE_TOKEN)}
        published={Boolean(pack.publishedAt)}
        hasVideo={Boolean(pack.videoKey || pack.videoUrl)}
        videoUrl={pack.videoUrl}
        contactUrl={pack.contactUrl}
        defended={defended}
        people={intel?.intel?.peopleToReach ?? []}
        links={links.map((l) => ({
          id: l.id,
          code: l.code,
          channel: l.channel,
          label: l.label,
          replied: l.replied,
          opens: activity.perLink.get(l.id)?.opens ?? 0,
          watched: activity.perLink.get(l.id)?.watched ?? 0,
        }))}
        views={activity.views.map((v) => ({ ...v, openedAt: new Date(v.openedAt).toISOString() }))}
      />
    </div>
  );
}
