import { cn } from "@/lib/utils";

/** Readiness as a ring: violet while building, lime once it's interview-ready (70%+). */
export function ReadinessRing({
  value,
  size = 168,
  stroke = 12,
  label = "ready",
  tone = "light",
  className,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  const ready = v >= 70;
  const id = `ring-${size}-${tone}`;
  return (
    <div
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={ready ? "oklch(0.9 0.2 128)" : "oklch(0.72 0.19 295)"} />
            <stop
              offset="100%"
              stopColor={ready ? "oklch(0.68 0.18 150)" : "oklch(0.52 0.23 272)"}
            />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone === "dark" ? "rgb(255 255 255 / 0.12)" : "var(--muted)"}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <div
          className={cn(
            "font-display font-semibold tabular-nums leading-none tracking-tight",
            tone === "dark" && "text-white",
          )}
          style={{ fontSize: size * 0.26 }}
        >
          {value === null ? "—" : `${v}%`}
        </div>
        {label && (
          <div
            className={cn(
              "mt-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
              tone === "dark" ? "text-white/55" : "text-muted-foreground",
            )}
          >
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
