import { cn } from "cn";

/** Offer Ready mark: a voice wave that resolves into a check — practice, then proof. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      aria-hidden="true"
      focusable="false"
    >
      <title>Offer Ready</title>
      <defs>
        <linearGradient id="or-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="oklch(0.45 0.21 276)" />
          <stop offset="1" stopColor="oklch(0.55 0.21 300)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#or-g)" />
      <path
        d="M7 16h2.2M11.5 12v8M15.5 9.5v6.5m0 0 3 3.5L25.5 11"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.5" cy="11" r="2.2" fill="oklch(0.89 0.2 127)" />
    </svg>
  );
}

export function Logo({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span
        className={cn(
          "font-display text-[18px] font-semibold tracking-tight",
          tone === "dark" && "text-white",
        )}
      >
        Offer<span className={tone === "dark" ? "text-proof" : "text-primary"}>Ready</span>
      </span>
    </span>
  );
}
