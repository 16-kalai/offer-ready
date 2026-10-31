"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Small, quiet motion for the home page.
 *
 * Reveal fades content up as it scrolls into view. The page renders fully
 * visible on the server; only what's still below the fold is hidden once the
 * script runs, so nothing is ever stuck invisible without JavaScript, and
 * nothing already on screen flickers. With reduced motion, or in a tab that
 * isn't showing, it does nothing.
 */
type State = "idle" | "hidden" | "shown";

export function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
}: {
  as?: "div" | "li";
  /** Milliseconds, for staggering items in a row. */
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A page opened in a background tab (or prerendered) gets no intersection
    // updates until it's shown; leave it visible rather than risk it staying blank.
    if (document.visibilityState !== "visible") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // biome-ignore lint/suspicious/noExplicitAny: one ref shared by div and li.
      ref={ref as any}
      style={state === "shown" ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        state !== "idle" &&
          "transition-[opacity,translate] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        state === "hidden" && "translate-y-5 opacity-0",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** The sticky header: a hairline and a little more paper once the page scrolls. */
export function StickyHeader({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-md transition-[background-color,border-color] duration-300",
        scrolled
          ? "border-[var(--l-line)] bg-[var(--l-paper)]/90"
          : "border-transparent bg-[var(--l-paper)]/60",
      )}
    >
      {children}
    </header>
  );
}
