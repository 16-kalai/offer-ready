import { Headphones, MessageSquareQuote, MonitorPlay, Shuffle, Timer } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Pending } from "@/components/coach/pending";
import { PageHeader } from "@/components/coach/section";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { requireSession } from "@/lib/session";
import { getGoal, getLevelCheck, mockState } from "@/server/goals";
import { EnterRoomButton, PrepareButton } from "../mock-gate";
import { TooShort } from "../too-short";

const EXPECT = [
  {
    icon: MessageSquareQuote,
    title: "Your own work",
    body: "A warm start, then questions on decisions in your projects.",
  },
  {
    icon: MonitorPlay,
    title: "Real work on screen",
    body: "Three cases from this job: spot what's wrong, make a call, judge AI output.",
  },
  {
    icon: Shuffle,
    title: "A twist halfway",
    body: "The constraints change. We watch how you re-decide.",
  },
  {
    icon: Timer,
    title: "15 minutes",
    body: "Speak naturally. Thinking out loud is exactly what's scored.",
  },
];

export default async function MockPage({ params }: PageProps<"/g/[id]/mock">) {
  const { id } = await params;
  const session = await requireSession();
  const goal = await getGoal(session.user.id, id);
  if (!goal) notFound();
  const [state, check] = await Promise.all([
    mockState(goal.id, "baseline"),
    getLevelCheck(goal.id),
  ]);
  if (state.stage === "done") redirect(`/g/${goal.id}/report`);
  if (state.stage === "preparing")
    return (
      <Pending
        title="Writing your interview"
        steps={[
          "Reading your resume for decisions worth asking about…",
          `Setting three cases in ${goal.companyName}'s world…`,
          "Planting the problems a strong candidate would catch…",
          "Writing the twist…",
        ]}
      />
    );
  if (state.stage === "scoring")
    return (
      <Pending
        title="Scoring your interview"
        steps={[
          "Reading your transcript…",
          "Matching every score to your own words…",
          "Checking which problems you caught…",
          "Working out readiness per round…",
        ]}
      />
    );

  if (state.stage === "incomplete")
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Mock interview 1" title="Let's try that again" />
        <TooShort goalId={goal.id} kind="baseline" seconds={state.seconds} words={state.words} />
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mock interview 1" title="The interview, before the interview">
        Built from the {goal.roleTitle} job description and your resume. Judgment-first, the way
        hiring works now.
      </PageHeader>
      <section className="surface relative overflow-hidden p-8 sm:p-10">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex flex-col items-center text-center">
          <VoiceOrb
            size={132}
            state={state.stage === "ready" || state.stage === "live" ? "speaking" : "idle"}
          />
          <h2 className="mt-8 text-2xl font-semibold tracking-tight">
            {state.stage === "live" ? "Your interview is in progress" : "Your interviewer is ready"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Find a quiet spot and use headphones if you can. You'll get one practice question before
            the clock starts.
          </p>
          <div className="mt-7">
            {state.stage === "ready" || state.stage === "live" ? (
              <EnterRoomButton
                goalId={goal.id}
                kind="baseline"
                label={state.stage === "live" ? "Rejoin interview" : "Enter interview room"}
              />
            ) : !check?.completedAt ? (
              <p className="text-sm font-medium text-muted-foreground">
                Finish the level check first: it sets how hard this is.
              </p>
            ) : (
              <PrepareButton
                goalId={goal.id}
                kind="baseline"
                label={state.stage === "none" ? "Prepare my interview" : "Write a fresh interview"}
              />
            )}
          </div>
          {state.stage === "failed" && (
            <p className="mt-4 text-sm text-muted-foreground">
              We couldn't write that interview. Try again.
            </p>
          )}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EXPECT.map((e) => (
          <div key={e.title} className="surface p-5">
            <e.icon className="size-5 text-primary" />
            <div className="mt-3 text-sm font-semibold">{e.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
          </div>
        ))}
      </div>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Headphones className="size-3.5" /> Voice by Gemini Live. Audio goes straight from your
        browser to Google; we keep the transcript.
      </p>
    </div>
  );
}
