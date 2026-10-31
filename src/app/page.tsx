import {
  ArrowRight,
  BadgeCheck,
  Check,
  Dumbbell,
  Eye,
  FileSearch,
  Gauge,
  Lock,
  Mic,
  Quote,
  Radar,
  Rocket,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ReadinessRing } from "@/components/coach/readiness-ring";
import { VoiceOrb } from "@/components/coach/voice-orb";
import { Logo } from "@/components/logo";
import { Reveal } from "@/components/motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ProofPreview } from "./_home/proof-preview";

export const metadata: Metadata = {
  title: { absolute: "Offer Ready: don't apply. Arrive with the work done." },
  description:
    "Paste any job. Offer Ready researches how that company hires, tests you in a live voice interview, closes your gaps in days, and helps you arrive with proof you've already worked on their problem.",
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

const JUDGMENT = [
  {
    icon: FileSearch,
    title: "Spot what's wrong",
    body: "The AI wrote the query, the code or the plan. Can you see the flaw before it ships?",
  },
  {
    icon: Scale,
    title: "Make the trade-off",
    body: "Budget halves, the deadline moves. Do you re-decide, or freeze?",
  },
  {
    icon: Mic,
    title: "Explain it out loud",
    body: "Interviews are spoken. Your reasoning has to land in the first fifteen seconds.",
  },
];

const PHASES = [
  {
    key: "Know",
    blurb: "Where you stand",
    steps: [
      "How they hire, researched live",
      "Adaptive level check",
      "15-minute voice mock",
      "Readiness per round",
    ],
  },
  {
    key: "Train",
    blurb: "Close the gaps",
    steps: [
      "A plan that fits your date",
      "Ship-or-Skip drills on AI work",
      "Spoken answers, scored",
    ],
  },
  {
    key: "Prove",
    blurb: "Build, defend, launch",
    steps: [
      "A project on their real problem",
      "Defended in a second interview",
      "Tracked Proof Page + outreach",
    ],
  },
];

const FAQ = [
  {
    q: "Does it only work for engineers?",
    a: "No. Paste any job description: analyst, product, design, marketing, sales, operations. The research, the interview cases and the project ideas are all written for that role and that company.",
  },
  {
    q: "Is the interviewer a real voice?",
    a: "Yes. It's a live voice conversation with Gemini Live: real work appears on your screen, it follows up on what you say, and the constraints change halfway through. Only the transcript is kept, never your voice.",
  },
  {
    q: "Why short plans instead of a course?",
    a: "Good candidates prepare hard for days or weeks, aimed at one job. Plans fit your interview date and never run past eight weeks, because plans that fit get finished.",
  },
  {
    q: "Isn't a certificate easier?",
    a: "Certificates prove you finished a course. A Proof Page proves you can do the job: work on the company's own problem, defended in a recorded interview, with every claim backed by evidence.",
  },
  {
    q: "Will the company know I used Offer Ready?",
    a: "Only if you share your Proof Page. Your practice, scores and transcripts are private to you. The project ideas use public information only, and never imply you work for the company.",
  },
];

function Shot({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-ink/20 ring-1 ring-black/[0.06]">
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/50 px-3.5 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
      </div>
      <Image
        src={src}
        alt={alt}
        width={1920}
        height={1080}
        priority={priority}
        className="h-auto w-full"
        sizes="(min-width: 1024px) 720px, 100vw"
      />
    </div>
  );
}

function Feature({
  eyebrow,
  icon: Icon,
  title,
  body,
  points,
  shot,
  alt,
  flip = false,
}: {
  eyebrow: string;
  icon: typeof Search;
  title: string;
  body: string;
  points: string[];
  shot: string;
  alt: string;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <Reveal className={flip ? "lg:order-2" : ""}>
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <Icon className="size-4" /> {eyebrow}
        </div>
        <h3 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
          {title}
        </h3>
        <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{body}</p>
        <ul className="mt-5 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[15px]">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10">
                <Check className="size-3 text-primary" strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={120} className={flip ? "lg:order-1" : ""}>
        <Shot src={shot} alt={alt} />
      </Reveal>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      {/* ─── Nav ─── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Offer Ready home">
            <Logo tone="dark" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/70 md:flex">
            <a href="#how" className="transition-colors hover:text-white">
              How it works
            </a>
            <a href="#interview" className="transition-colors hover:text-white">
              Voice interview
            </a>
            <a href="#proof" className="transition-colors hover:text-white">
              Proof Page
            </a>
            <a href="#faq" className="transition-colors hover:text-white">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="bg-white text-ink hover:bg-white/90">
              <Link href="/signup">Start free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-ink pb-28 text-white sm:pb-36">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-90" />
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/15">
              <Sparkles className="size-3.5 text-proof" /> Built for the judgment era of hiring
            </div>
            <h1 className="mx-auto mt-7 max-w-5xl font-display text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-[72px]">
              Don&apos;t apply.
              <br />
              <span className="bg-gradient-to-r from-[oklch(0.8_0.13_290)] via-[oklch(0.85_0.12_230)] to-proof bg-clip-text text-transparent">
                Arrive with the work done.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-white/70 sm:text-lg">
              Paste any job. We research how that company hires, test you in a live voice interview,
              close your gaps in days, and help you show up with proof you&apos;ve already worked on
              their problem.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 gap-2 bg-proof px-7 text-[15px] font-semibold text-ink shadow-lg shadow-proof/20 hover:bg-proof/90"
              >
                <Link href="/signup">
                  Give us any job <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-12 px-6 text-[15px] text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#how">See how it works</a>
              </Button>
            </div>
            <p className="mt-5 text-sm text-white/50">
              Free · your honest readiness in about 20 minutes
            </p>
          </Reveal>
        </div>
      </section>

      {/* Product shot overlapping the hero */}
      <div className="relative mx-auto -mt-20 max-w-5xl px-4 sm:-mt-28 sm:px-6">
        <Reveal>
          <div className="relative">
            <Shot
              src="/landing/today.jpg"
              alt="An Offer Ready goal: readiness 75%, the Know, Train and Prove phases, and the next step"
              priority
            />
            <div className="absolute -left-4 top-1/3 hidden items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl ring-1 ring-black/5 md:flex">
              <ReadinessRing value={75} size={52} stroke={5} label="" />
              <div className="text-sm">
                <div className="font-semibold">Readiness per round</div>
                <div className="text-xs text-muted-foreground">Backed by your own words</div>
              </div>
            </div>
            <div className="absolute -right-4 bottom-10 hidden items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl ring-1 ring-white/10 md:flex">
              <span className="grid size-9 place-items-center rounded-full bg-proof/25">
                <Eye className="size-4 text-proof" />
              </span>
              <div className="text-sm">
                <div className="font-semibold">Your Proof Page was opened</div>
                <div className="text-xs text-white/60">Hiring manager · watched 1:32</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ─── Stats ─── */}
      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <div className="grid gap-6 rounded-3xl border border-border/80 bg-white p-8 sm:grid-cols-3 sm:p-10">
          {STATS.map((s, i) => (
            <Reveal key={s.value} delay={i * 80} className="text-center sm:text-left">
              <div className="font-display text-5xl font-semibold tracking-tight text-primary">
                {s.value}
              </div>
              <div className="mt-2 text-[15px]">{s.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.source}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── The shift ─── */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-[32px] font-semibold leading-tight tracking-tight sm:text-[44px]">
            AI can answer the textbook questions. So interviews now test{" "}
            <span className="text-gradient">judgment</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[17px] text-muted-foreground">
            Very few places let you practise the new format. Offer Ready trains exactly what decides
            the offer.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {JUDGMENT.map((j, i) => (
            <Reveal key={j.title} delay={i * 80}>
              <div className="surface h-full p-7">
                <span className="grid size-11 place-items-center rounded-2xl bg-secondary">
                  <j.icon className="size-5 text-primary" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{j.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{j.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── How it works: three phases ─── */}
      <section id="how" className="scroll-mt-20 border-y border-border/70 bg-white py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              How it works
            </div>
            <h2 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tight sm:text-[42px]">
              Three phases. Days, not months.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {PHASES.map((p, i) => (
              <Reveal key={p.key} delay={i * 90}>
                <div className="relative h-full overflow-hidden rounded-3xl bg-ink p-7 text-white">
                  <div className="bg-aurora pointer-events-none absolute inset-0 opacity-50" />
                  <div className="relative">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-full bg-proof font-display text-sm font-bold text-ink">
                        {i + 1}
                      </span>
                      <span className="font-display text-2xl font-semibold">{p.key}</span>
                    </div>
                    <div className="mt-1 text-sm text-white/60">{p.blurb}</div>
                    <ul className="mt-6 space-y-3">
                      {p.steps.map((s) => (
                        <li key={s} className="flex gap-2.5 text-[15px] text-white/85">
                          <Check className="mt-0.5 size-4 shrink-0 text-proof" strokeWidth={3} />{" "}
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-24 space-y-28">
            <Feature
              eyebrow="Know · how they hire"
              icon={Search}
              title="Every round, researched live, with sources."
              body="Paste the job description. Offer Ready searches the web for how this company actually interviews, and the problems it's publicly facing right now."
              points={[
                "Rounds, topics and timing from recent candidate reports",
                "Problems the company is facing, each one cited",
                "Shared and cached per company, so it's instant for the next person",
              ]}
              shot="/landing/research.jpg"
              alt="Research: Razorpay's five interview rounds with topics and sources"
            />
            <Feature
              eyebrow="Know · honest readiness"
              icon={Radar}
              title="Readiness for every round, quoted back to you."
              body="No vague scores. Every judgment skill comes with what you actually said, and your coach reads the verdict aloud."
              points={[
                "Per-round readiness: online test, technical, design, hiring manager",
                "Which planted problems you caught, and which you missed",
                "The round most likely to cost you the offer",
              ]}
              shot="/landing/report.jpg"
              alt="Readiness report with the coach's verdict"
              flip
            />
            <Feature
              eyebrow="Train · Ship it or skip it"
              icon={Dumbbell}
              title="Practice on AI-made work, not videos."
              body="Each day: one idea, three pieces of work an AI produced with a flaw hidden inside, and one answer spoken out loud. It grades your reasoning, not just your call."
              points={[
                "Plans fit your interview date, never more than 8 weeks",
                "Answer by voice: perfect with Wispr Flow",
                "Coding rounds get targeted LeetCode patterns",
              ]}
              shot="/landing/drill.jpg"
              alt="A Ship-or-Skip drill graded 10 out of 10"
            />
          </div>
        </div>
      </section>

      {/* ─── Voice interview ─── */}
      <section
        id="interview"
        className="relative scroll-mt-20 overflow-hidden bg-ink py-24 text-white"
      >
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <VoiceOrb size={72} state="speaking" />
            <div className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-proof">
              The interview before the interview
            </div>
            <h2 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tight sm:text-[42px]">
              A real voice interview, built from the job and your resume.
            </h2>
            <ul className="mt-6 space-y-3 text-[15px] text-white/80">
              {[
                "Opens on your own projects, then digs into your decisions",
                "Real work on screen: a pull request, a dashboard, an AI draft",
                "A twist halfway: the budget halves or the deadline moves",
                "15 minutes, live with Gemini Live. Only the transcript is kept",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-proof" strokeWidth={3} /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="overflow-hidden rounded-2xl shadow-2xl shadow-black/40 ring-1 ring-white/10">
              <Image
                src="/landing/interview.jpg"
                alt="The live interview room: the voice orb, the interviewer's question and a Go pull request on screen"
                width={1920}
                height={1080}
                className="h-auto w-full"
                sizes="(min-width: 1024px) 640px, 100vw"
              />
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
              <Quote className="mt-0.5 size-4 shrink-0 text-proof" />
              <p className="text-sm text-white/80">
                &ldquo;Setting the HTTP client timeout to zero on line eight is a major red flag:
                the connection hangs if the merchant endpoint stops responding.&rdquo;
                <span className="mt-1 block text-xs text-white/50">
                  Quoted back in the report as evidence of verification
                </span>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Proof Page ─── */}
      <section id="proof" className="scroll-mt-20 py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Prove · the Proof Page
            </div>
            <h2 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tight sm:text-[42px]">
              Not a certificate. Work on their problem, defended on record.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              We find problems the company is publicly facing. You build one small thing in a few
              evenings. A second voice interview questions you on it, with a twist. Pass, and your
              Proof Page goes live, with tracked links so you know exactly who looked.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { icon: Target, t: "Ideas grounded in cited public evidence" },
                { icon: ShieldCheck, t: "Defended live, so it can't be faked" },
                { icon: Rocket, t: "Outreach drafted for the people who decide" },
                { icon: Eye, t: "Opened, watched, replied: you see it all" },
              ].map(({ icon: I, t }) => (
                <li
                  key={t}
                  className="flex items-start gap-2.5 rounded-2xl border border-border/80 bg-white p-3.5 text-sm"
                >
                  <I className="mt-0.5 size-4 shrink-0 text-primary" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="sm:pr-6">
            <ProofPreview />
          </Reveal>
        </div>
      </section>

      {/* ─── Trust ─── */}
      <section className="border-y border-border/70 bg-white py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-4">
          {[
            {
              icon: BadgeCheck,
              t: "Evidence, not vibes",
              b: "Every score quotes what you said. Quotes are checked against the transcript.",
            },
            {
              icon: Lock,
              t: "Private by default",
              b: "Your practice stays yours. Only the Proof Page you publish is public.",
            },
            {
              icon: Gauge,
              t: "Honest when it's thin",
              b: "Too little said? No score. We never guess from your resume.",
            },
            {
              icon: ShieldCheck,
              t: "Answer keys stay hidden",
              b: "Planted problems and level-check answers never reach the browser.",
            },
          ].map(({ icon: I, t, b }, i) => (
            <Reveal key={t} delay={i * 60}>
              <I className="size-5 text-primary" />
              <div className="mt-3 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
        <Reveal>
          <h2 className="text-center font-display text-[32px] font-semibold tracking-tight sm:text-[40px]">
            Questions, answered
          </h2>
          <Accordion type="single" collapsible className="mt-10">
            {FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-[16px] font-medium">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-center text-white sm:py-20">
          <div className="bg-aurora pointer-events-none absolute inset-0 opacity-90" />
          <div className="relative">
            <VoiceOrb size={84} state="speaking" className="mx-auto" />
            <h2 className="mx-auto mt-8 max-w-2xl font-display text-[34px] font-semibold leading-tight tracking-tight sm:text-[48px]">
              244 people apply to every job. <span className="text-proof">Don&apos;t be #245.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">
              Start with the job you want. Your honest readiness in about 20 minutes.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 h-12 gap-2 bg-proof px-8 text-[15px] font-semibold text-ink hover:bg-proof/90"
            >
              <Link href="/signup">
                Give us any job <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <span>Practice for the interview, proof for the offer.</span>
          <span>© 2026 Offer Ready</span>
        </div>
      </footer>
    </div>
  );
}
