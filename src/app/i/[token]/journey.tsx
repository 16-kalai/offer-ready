"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { InterviewCall } from "@/lib/live/call";
import type { RoomState } from "@/server/candidate-sessions";
import { Consent } from "./consent";
import { Done } from "./done";
import { Resume } from "./resume";
import { Room } from "./room";
import { Setup } from "./setup";
import { Shell } from "./shell";
import { Welcome } from "./welcome";

type Ready = Extract<RoomState, { kind: "ready" }>;
type Step = "welcome" | "consent" | "setup" | "resume" | "room";

/** The candidate's path through the link: one screen at a time, nothing to sign up for. */
export function Journey({
  token,
  state,
  backHref,
}: {
  token: string;
  state: Ready;
  /** Offer Ready: the result page to go to when the interview ends. */
  backHref: string | null;
}) {
  const [step, setStep] = useState<Step>(state.stage === "resume" ? "resume" : "welcome");
  const [call] = useState(() => new InterviewCall(token));
  const snap = useSyncExternalStore(call.subscribe, call.getSnapshot, call.getSnapshot);
  const company = state.plan.companyName;

  // Leaving the page mid-call keeps the attempt resumable.
  useEffect(() => () => call.dispose(), [call]);

  if (snap.status === "ended")
    return (
      <Shell company={company}>
        <Done
          token={token}
          companyName={company}
          firstName={state.plan.firstName}
          rated={false}
          backHref={backHref}
          autoRedirect
        />
      </Shell>
    );

  if (step === "room") return <Room call={call} snap={snap} plan={state.plan} />;

  return (
    <Shell company={company}>
      {step === "welcome" && (
        <Welcome
          state={state}
          onNext={() => setStep(state.stage === "consented" ? "setup" : "consent")}
        />
      )}
      {step === "consent" && (
        <Consent
          token={token}
          companyName={company}
          accommodationRequested={state.accommodationRequested}
          onBack={() => setStep("welcome")}
          onNext={() => setStep("setup")}
        />
      )}
      {step === "setup" && (
        <Setup
          call={call}
          onStart={() => {
            setStep("room");
            void call.begin();
          }}
        />
      )}
      {step === "resume" && (
        <Resume
          firstName={state.plan.firstName}
          minutesLeft={state.minutesLeft}
          onResume={() => {
            setStep("room");
            void call.begin();
          }}
        />
      )}
    </Shell>
  );
}
