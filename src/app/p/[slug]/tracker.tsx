"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useRef } from "react";

/** One id per page view, so watch time updates the same view instead of adding new ones. */
function viewId(): string {
  const w = window as unknown as { __orView?: string };
  w.__orView ??= crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  return w.__orView;
}

function send(payload: { slug: string; code: string | null; kind: string; value?: number }) {
  const body = JSON.stringify({ ...payload, viewId: viewId() });
  if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" })))
    fetch("/api/track", {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => {});
}

export function Tracker({ slug, code }: { slug: string; code: string | null }) {
  useEffect(() => {
    // Real people, not link-preview bots: only count a view once the page has been visible a moment.
    const t = setTimeout(() => send({ slug, code, kind: "open" }), 1200);
    return () => clearTimeout(t);
  }, [slug, code]);
  return null;
}

export function TrackedVideo({
  src,
  slug,
  code,
  track,
}: {
  src: string;
  slug: string;
  code: string | null;
  track: boolean;
}) {
  const furthest = useRef(0);
  const sent = useRef(0);
  useEffect(() => {
    if (!track) return;
    const flush = () => {
      if (furthest.current <= sent.current) return;
      send({ slug, code, kind: "watch", value: Math.floor(furthest.current) });
      sent.current = furthest.current;
    };
    const id = setInterval(flush, 5000);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [slug, code, track]);
  return (
    // biome-ignore lint/a11y/useMediaCaption: the candidate's own walkthrough; captions come from their upload.
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      className="aspect-video w-full bg-black"
      onTimeUpdate={(e) => {
        furthest.current = Math.max(furthest.current, e.currentTarget.currentTime);
      }}
    />
  );
}

export function TrackedLink({
  href,
  slug,
  code,
  kind,
  track,
  className,
  children,
}: {
  href: string;
  slug: string;
  code: string | null;
  kind: "build";
  track: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={() => track && send({ slug, code, kind })}
    >
      {children}
    </a>
  );
}

export function ContactButton({
  href,
  slug,
  code,
  track,
  label,
}: {
  href: string;
  slug: string;
  code: string | null;
  track: boolean;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => track && send({ slug, code, kind: "contact" })}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-proof bg-proof/30 px-5 text-sm font-semibold text-proof-foreground"
    >
      <MessageCircle className="size-4" /> {label}
    </a>
  );
}
