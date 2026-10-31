"use client";

import { Bot, Check, FileText, Loader2, ShieldCheck, UserCheck, VolumeX } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { safely } from "@/lib/safe-action";
import { accommodationAction, consentAction } from "./actions";
import { Card } from "./shell";

export function Consent({
  token,
  companyName,
  accommodationRequested,
  onBack,
  onNext,
}: {
  token: string;
  companyName: string;
  accommodationRequested: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const id = useId();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const terms = [
    { icon: Bot, text: "Your interviewer is an AI." },
    {
      icon: FileText,
      text: "A written transcript is saved to your account, so your coach can show you exactly what you said. Only you can see it.",
    },
    { icon: VolumeX, text: "Your voice is not recorded or stored. Only the transcript is kept." },
    {
      icon: ShieldCheck,
      text: "Treat it like the real thing: no notes, no AI help. The point is to see how you think today.",
    },
    {
      icon: UserCheck,
      text: `This is practice for ${companyName}. Nothing is shared with them, ever.`,
    },
  ];

  return (
    <Card>
      <h1 className="text-2xl font-semibold tracking-tight">Before you start</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">Here's exactly what happens.</p>
      <ul className="mt-6 space-y-4">
        {terms.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3.5 text-[15px] leading-relaxed">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
              <Icon className="size-4 text-neutral-700" aria-hidden="true" />
            </span>
            <span className="pt-1">{text}</span>
          </li>
        ))}
      </ul>

      <Accommodation token={token} requested={accommodationRequested} />

      <label
        htmlFor={id}
        className="mt-7 flex cursor-pointer items-start gap-3 rounded-xl bg-neutral-50 px-4 py-3.5 text-sm"
      >
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>I understand: an AI-led practice interview with a saved transcript.</span>
      </label>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button
          className="h-11 gap-2 px-6"
          disabled={!agreed || pending}
          onClick={() =>
            start(async () => {
              const res = await safely(() => consentAction(token));
              if (res.ok) onNext();
              else setError(res.error);
            })
          }
        >
          {pending && <Loader2 className="size-4 animate-spin" />} Continue
        </Button>
      </div>
    </Card>
  );
}

function Accommodation({ token, requested }: { token: string; requested: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(requested);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sent)
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-emerald-700">
        <Check className="size-4" aria-hidden="true" /> Your request for an accommodation was sent.
        The team will reply by email; you can still start now if you'd like.
      </p>
    );
  return (
    <div className="mt-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium underline underline-offset-2"
        >
          Need extra time or a different format?
        </button>
      ) : (
        <div className="rounded-xl p-4 ring-1 ring-border">
          <label htmlFor="accommodation" className="text-sm font-medium">
            What would help?
          </label>
          <textarea
            id="accommodation"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={600}
            placeholder="e.g. I have a stammer and would like more time per answer."
            className="mt-2 field-sizing-content min-h-20 w-full resize-none rounded-lg px-3 py-2.5 text-sm ring-1 ring-border outline-none focus:ring-neutral-400"
          />
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || note.trim().length < 3}
              onClick={() =>
                start(async () => {
                  const res = await safely(() => accommodationAction(token, note));
                  if (res.ok) setSent(true);
                  else setError(res.error);
                })
              }
            >
              Send to the team
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
