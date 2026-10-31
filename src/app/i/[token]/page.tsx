import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { roomState } from "@/server/candidate-sessions";
import { resultHrefForToken } from "@/server/goals";
import { Done } from "./done";
import { Journey } from "./journey";
import { ExpiredCard, Notice, Shell } from "./shell";

export const metadata: Metadata = {
  title: "Practice interview",
  robots: { index: false, follow: false },
};

/** Where a candidate lands from the invite email. Public, no sign-up: the link is the only key. */
export default function InvitationPage({ params }: PageProps<"/i/[token]">) {
  return (
    <Suspense fallback={<Shell company={null} />}>
      <Landing params={params} />
    </Suspense>
  );
}

async function Landing({ params }: Pick<PageProps<"/i/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const state = await roomState(token);

  switch (state.kind) {
    case "invalid":
      return (
        <Shell company={null}>
          <Notice title="This link isn't valid">
            Check that you opened the full link from your email. If it still doesn't work, reply to
            go back to Offer Ready and open your mock interview again.
          </Notice>
        </Shell>
      );
    case "expired":
      return (
        <Shell company={state.companyName}>
          <ExpiredCard
            token={token}
            replyToEmail={state.replyToEmail}
            requested={state.requested}
          />
        </Shell>
      );
    case "preparing":
      return (
        <Shell company={state.companyName}>
          <Notice title="Your interview is almost ready">
            We're still setting up your questions. Try this link again in a minute.
          </Notice>
        </Shell>
      );
    case "incomplete":
      return (
        <Shell company={state.companyName}>
          <Notice title="This interview has ended">
            The interview was interrupted and couldn't be resumed in time. If something went wrong,
            email{" "}
            <a
              href={`mailto:${state.replyToEmail}`}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {state.replyToEmail}
            </a>{" "}
            and the team can let you try again.
          </Notice>
        </Shell>
      );
    case "done":
      return (
        <Shell company={state.companyName}>
          <Done
            token={token}
            companyName={state.companyName}
            firstName={state.firstName}
            rated={state.rated}
            backHref={await resultHrefForToken(token)}
            autoRedirect
          />
        </Shell>
      );
    case "ready":
      return <Journey token={token} state={state} backHref={await resultHrefForToken(token)} />;
  }
}
