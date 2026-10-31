import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { Logo } from "@/components/logo";

const POINTS = [
  "Research on how your target company actually interviews",
  "A voice mock interview built from the real job description",
  "Honest readiness for every round, with your own words as evidence",
  "A plan that closes the gaps in days, and a project that proves it",
];

/** Shared frame for log in and sign up: the promise on the left, the form on the right. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <div className="bg-aurora absolute inset-0 opacity-70" />
        <div className="bg-grid absolute inset-0 opacity-40" />
        <Link href="/" className="relative">
          <Logo className="[&_span]:text-white" />
        </Link>
        <div className="relative mt-auto max-w-md">
          <VoiceOrb size={112} state="speaking" />
          <h2 className="mt-8 text-4xl font-semibold leading-tight tracking-tight">
            244 people apply to every job. <span className="text-proof">Don't be #245.</span>
          </h2>
          <ul className="mt-8 space-y-3 text-[15px] text-white/80">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-proof" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-white/50">
          Built for the judgment era of hiring.
        </p>
      </aside>
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Link href="/" className="lg:invisible">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© 2026 Offer Ready</span>
          <span>By continuing you agree to the Terms and Privacy Policy.</span>
        </footer>
      </div>
    </div>
  );
}
