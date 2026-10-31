"use client";

import { Loader2, Pause, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoiceOrb } from "./voice-orb";

/** "Hear your coach": plays the spoken verdict, with the orb breathing while it talks. */
export function VerdictPlayer({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  async function toggle() {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    if (!audio.current) {
      setState("loading");
      const a = new Audio(src);
      a.onended = () => setState("idle");
      a.onerror = () => {
        setState("idle");
        audio.current = null;
        toast.error("Your coach couldn't speak just now. Try again in a moment.");
      };
      a.oncanplay = () => {
        a.play()
          .then(() => setState("playing"))
          .catch(() => setState("idle"));
      };
      audio.current = a;
      return;
    }
    await audio.current.play();
    setState("playing");
  }
  return (
    <div className="flex items-center gap-4">
      <VoiceOrb
        size={56}
        state={state === "playing" ? "speaking" : state === "loading" ? "thinking" : "idle"}
      />
      <Button variant="outline" className="gap-2" onClick={toggle} disabled={state === "loading"}>
        {state === "loading" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : state === "playing" ? (
          <Pause className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
        {state === "loading"
          ? "Your coach is thinking…"
          : state === "playing"
            ? "Pause"
            : "Hear your coach"}
      </Button>
    </div>
  );
}
