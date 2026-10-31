import { cn } from "@/lib/utils";

/**
 * The product's signature: a soft, breathing orb that stands for the coach's
 * voice. "speaking" breathes and turns; "listening" glows lime; "idle" rests.
 */
export function VoiceOrb({
  size = 96,
  state = "idle",
  className,
}: {
  size?: number;
  state?: "idle" | "speaking" | "listening" | "thinking";
  className?: string;
}) {
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-xl transition-opacity duration-700",
          state === "listening" ? "bg-proof/60" : "bg-primary/40",
          state === "idle" ? "opacity-40" : "opacity-80",
        )}
      />
      <div
        className={cn(
          "absolute inset-0 overflow-hidden rounded-full",
          state !== "idle" && "animate-orb",
        )}
        style={{
          background:
            state === "listening"
              ? "radial-gradient(circle at 30% 30%, oklch(0.97 0.08 128), oklch(0.86 0.2 128) 45%, oklch(0.55 0.16 150))"
              : "radial-gradient(circle at 30% 28%, oklch(0.95 0.05 280), oklch(0.62 0.22 285) 42%, oklch(0.38 0.2 270) 80%)",
        }}
      >
        <div
          className={cn("absolute -inset-1/4", state !== "idle" && "animate-orb-spin")}
          style={{
            background:
              "conic-gradient(from 90deg, transparent 0 30%, oklch(0.9 0.15 200 / 0.55) 40%, transparent 55%, oklch(0.88 0.2 128 / 0.5) 70%, transparent 85%)",
            mixBlendMode: "screen",
          }}
        />
        <div className="absolute inset-[14%] rounded-full bg-white/10 blur-md" />
      </div>
    </div>
  );
}
