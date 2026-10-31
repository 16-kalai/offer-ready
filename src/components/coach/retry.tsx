"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** A failed background step: what happened, and a retry. */
export function RetryCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="surface flex flex-col items-center px-6 py-12 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      <Button
        className="mt-5 gap-2"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            if (!r.ok) toast.error(r.error ?? "Couldn't retry.");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{" "}
        Try again
      </Button>
    </div>
  );
}
