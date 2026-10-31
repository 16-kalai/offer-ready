"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "./shell";

/** Back after a closed tab or lost connection: one click picks up where they were. */
export function Resume({
  firstName,
  minutesLeft,
  onResume,
}: {
  firstName: string | null;
  minutesLeft: number | null;
  onResume: () => void;
}) {
  return (
    <Card>
      <span className="flex size-11 items-center justify-center rounded-full bg-neutral-100">
        <RotateCcw className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Welcome back{firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Your interview is still open. You'll pick up right where you left off
        {minutesLeft
          ? `, with about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} to go`
          : ""}
        . Time you were away (up to 5 minutes) is given back.
      </p>
      <Button onClick={onResume} className="mt-7 h-12 w-full text-[15px]">
        Resume the interview
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Your browser may ask for the microphone again.
      </p>
    </Card>
  );
}
