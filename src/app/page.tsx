import {
  ArrowRight,
  BadgeCheck,
  Eye,
  Gauge,
  Mic,
  PlayCircle,
  Radar,
  Rocket,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReadinessRing } from "@/components/coach/readiness-ring";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { Logo } from "@/components/logo";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "Offer Ready: don't apply. Arrive with the work done." },
  description:
    "Paste any job. We research how they hire, test you in a voice mock interview, close your gaps in days, and help you show up with proof you've already worked on their problem.",
};

const STATS = [
  { value: "244", label: "applicants for the average job opening", source: "Greenhouse" },
  {
    value: "63%",
    label: "of candidates have already faced an AI interview",
    source: "Greenhouse, 2026",
  },
  { value: "7.4s", label: "a recruiter spends on a resume", source: "TheLadders" },
];

const STEPS = [
  {
    icon: Search,
    title: "How they hire",
    body: "We research the company's real rounds and topics, with sources.",
  },
  {
    icon: Gauge,
    title: "Your real level",
    body: "8 adaptive questions that climb from basics to interview level.",
  },
  {
    icon: Mic,
    title: "Voice mock interview",
    body: "15 minutes, built from the job. Real work on screen, a twist halfway.",
  },
  {
    icon: Radar,
    title: "Readiness, per round",
    body: "Honest scores with your own words as evidence. No guessing.",
  },
  {
    icon: Target,
    title: "Days, not months",
    body: "Short drills that train exactly the gap that costs the offer.",
  },
  {
    icon: Rocket,
    title: "Proof, launched",
    body: "Build for their real problem, defend it on record, get it seen.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Start free</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative pt-32 pb-20 sm:pt-40">
        <div className="bg-aurora pointer-events-none absolute inset-0" />
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/80 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
              <Sparkles className="size-3.5" /> Built for the judgment era of hiring
            </div>
            <h1 className="mt-6 text-[44px] font-semibold leading-[1.04] tracking-tight sm:text-[64px]">
              Don't apply.
              <br />
              <span className="text-gradient">Arrive with the work done.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Paste any job. We find out how that company hires, test you in a voice mock interview,
              close your gaps in days, and help you show up with proof you've already worked on
              their problem.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 gap-2 px-6 text-[15px] shadow-lg shadow-primary/25"
              >
                <Link href="/signup">
                  Give us any job <ArrowRight className="size-4" />
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Your honest readiness in about 20 minutes.
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="surface relative overflow-hidden p-6">
              <div className="flex items-center gap-4">
                <VoiceOrb size={64} state="speaking" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Mock interview · Razorpay SDE-1
                  </div>
                  <div className="mt-1 text-[15px] font-medium">
                    "This refund query was written by AI. Would you ship it?"
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-[auto_1fr] items-center gap-6 rounded-2xl bg-muted/60 p-5">
                <ReadinessRing value={41} size={108} stroke={9} />
                <div className="space-y-3 text-sm">
                  {[
                    ["Online test", 62],
                    ["Technical", 48],
                    ["Design round", 22],
                    ["Hiring manager", 55],
                  ].map(([label, v]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between">
                        <span>{label}</span>
                        <span className="tabular-nums text-muted-foreground">{v}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${v}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <blockquote className="mt-5 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
                You approved the 18% figure without checking the denominator.
              </blockquote>
            </div>
            <div className="surface absolute -bottom-8 -left-6 hidden items-center gap-3 px-4 py-3 sm:flex">
              <span className="grid size-9 place-items-center rounded-full bg-proof/30">
                <Eye className="size-4 text-proof-foreground" />
              </span>
              <div className="text-sm">
                <div className="font-medium">Your Proof Page was opened</div>
                <div className="text-xs text-muted-foreground">Hiring manager · watched 1:32</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {STATS.map((s, i) => (
            <Reveal key={s.value} delay={i * 80}>
              <div className="text-4xl font-semibold tracking-tight text-primary">{s.value}</div>
              <div className="mt-1 text-sm text-foreground">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.source}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal>
          <h2 className="max-w-2xl text-[34px] font-semibold leading-tight tracking-tight">
            AI can answer the textbook questions. So interviews now test{" "}
            <span className="text-gradient">judgment</span>.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Can you spot when the work is wrong, make the trade-off, and explain your thinking out
            loud? Very few places let you practise that. Here, every step does.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 60}>
              <div className="surface h-full p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-secondary">
                    <s.icon className="size-5 text-primary" />
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">0{i + 1}</span>
                </div>
                <div className="mt-4 font-semibold">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden bg-ink py-24 text-white">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <Reveal>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-proof">
              The Proof Page
            </div>
            <h2 className="mt-3 text-[34px] font-semibold leading-tight tracking-tight">
              Not a certificate. Work on their problem, defended on record.
            </h2>
            <p className="mt-4 text-white/70">
              We find problems the company is publicly facing. You build one small thing in a few
              evenings. Our AI interviewer questions you on it, with a twist. Pass, and your Proof
              Page unlocks: a 7-second claim, a 2-minute video and the evidence, with tracked links
              so you know exactly who watched.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              {[
                "Ideas grounded in cited public evidence",
                "Defended live, so it can't be faked",
                "Outreach drafted for the people who decide",
                "Opened, watched, replied: you see it all",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-proof" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-3xl bg-white p-6 text-foreground shadow-2xl">
              <div className="text-xs font-medium text-muted-foreground">
                offerready.app/p/riya-kwiko
              </div>
              <h3 className="mt-3 text-xl font-semibold leading-snug">
                I analysed why Kwiko's repeat orders drop after week one, and tested 3 fixes.
              </h3>
              <div className="mt-4 grid aspect-video place-items-center rounded-2xl bg-ink">
                <PlayCircle className="size-12 text-white/90" />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-proof/25 px-3 py-2 text-sm font-medium text-proof-foreground">
                <BadgeCheck className="size-4" /> Defended on record · 31 Oct 2026
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <VoiceOrb size={88} state="speaking" className="mx-auto" />
        <h2 className="mt-8 text-[34px] font-semibold tracking-tight">
          244 people apply to every job. Don't be #245.
        </h2>
        <Button asChild size="lg" className="mt-8 h-12 gap-2 px-7 text-[15px]">
          <Link href="/signup">
            Start with the job you want <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>

      <footer className="border-t border-border/70 py-8 text-center text-xs text-muted-foreground">
        © 2026 Offer Ready · Practice for the interview, proof for the offer.
      </footer>
    </div>
  );
}
