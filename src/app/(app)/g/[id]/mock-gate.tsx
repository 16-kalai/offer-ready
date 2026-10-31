"use client";

import { Headphones, Loader2, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enterRoom, prepareMock } from "./actions";

export function EnterRoomButton({
  goalId,
  kind,
  label,
}: {
  goalId: string;
  kind: "baseline" | "defense";
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="h-12 gap-2 px-6 text-[15px] shadow-lg shadow-primary/25"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await enterRoom(goalId, kind);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          window.location.assign(r.href);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />} {label}
    </Button>
  );
}

export function PrepareButton({
  goalId,
  kind,
  label,
}: {
  goalId: string;
  kind: "baseline" | "defense";
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="h-12 gap-2 px-6"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await prepareMock(goalId, kind);
          if (!r.ok) toast.error(r.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Headphones className="size-4" />}{" "}
      {label}
    </Button>
  );
}
