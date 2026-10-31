import { z } from "zod";

/**
 * Shapes the coach's AI writes and the app stores. Each schema is what the
 * model is asked for and what's checked before saving; the inferred types are
 * what pages render. Pure: no I/O.
 */

/** Kinds of interview round, so readiness knows which skills each one tests. */
export const ROUND_KINDS = [
  "online_test",
  "coding",
  "technical",
  "system_design",
  "case",
  "take_home",
  "behavioral",
  "hiring_manager",
] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export const ROUND_KIND_LABEL: Record<RoundKind, string> = {
  online_test: "Online test",
  coding: "Coding interview",
  technical: "Technical interview",
  system_design: "Design round",
  case: "Case round",
  take_home: "Take-home",
  behavioral: "Behavioural",
  hiring_manager: "Hiring manager",
};

const source = z.object({
  title: z.string().max(200),
  url: z.string().max(600),
});
export type Source = z.infer<typeof source>;

export const companyIntelSchema = z.object({
  /** One line on what the company does, for context. */
  about: z.string().min(10).max(300),
  rounds: z
    .array(
      z.object({
        kind: z.enum(ROUND_KINDS),
        title: z.string().min(2).max(80),
        /** What happens in it, concretely. */
        what: z.string().min(10).max(300),
        topics: z.array(z.string().min(2).max(60)).min(1).max(6),
        minutes: z.number().int().min(0).max(300),
      }),
    )
    .min(2)
    .max(7),
  /** "high" only when several recent interview reports agree. */
  confidence: z.enum(["high", "medium", "low"]),
  confidenceNote: z.string().max(240),
  /** Problems the company is publicly facing, each with evidence. Basis for proof projects. */
  problems: z
    .array(
      z.object({
        title: z.string().min(5).max(120),
        evidence: z.string().min(10).max(320),
        sourceIndexes: z.array(z.number().int().min(0)).max(4),
      }),
    )
    .min(2)
    .max(6),
  /** Who a candidate should reach at this company, as job titles (never names). */
  peopleToReach: z
    .array(z.object({ title: z.string().min(3).max(80), why: z.string().min(5).max(160) }))
    .min(2)
    .max(4),
  sources: z.array(source).max(16),
});
export type CompanyIntel = z.infer<typeof companyIntelSchema>;

/** Level check: tier 1 basics, tier 2 working knowledge, tier 3 interview level. */
export const levelQuestionSchema = z.object({
  id: z.string().regex(/^q[0-9]{1,2}$/),
  tier: z.number().int().min(1).max(3),
  topic: z.string().min(2).max(60),
  question: z.string().min(10).max(400),
  /** Code or data the question refers to, shown in monospace. Empty when none. */
  snippet: z.string().max(900),
  options: z.array(z.string().min(1).max(200)).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string().min(10).max(300),
});
export type LevelQuestion = z.infer<typeof levelQuestionSchema>;
/** What the browser may see: never the answer. */
export type PublicLevelQuestion = Omit<LevelQuestion, "answer" | "explanation">;

export const trainingPlanSchema = z.object({
  headline: z.string().min(10).max(160),
  focus: z
    .array(z.object({ skill: z.string().min(2).max(60), why: z.string().min(10).max(220) }))
    .min(1)
    .max(3),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1),
        title: z.string().min(3).max(80),
        focusSkill: z.string().min(2).max(60),
        goal: z.string().min(10).max(200),
        kind: z.enum(["practice", "build", "mock"]),
      }),
    )
    .min(2)
    .max(56),
  /** For coding or online-test rounds: problem patterns to practise elsewhere. */
  practice: z
    .array(
      z.object({
        pattern: z.string().min(2).max(60),
        why: z.string().min(5).max(160),
        count: z.number().int().min(1).max(20),
      }),
    )
    .max(6),
});
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

export const FLAWS = [
  "wrong_assumption",
  "missed_requirement",
  "edge_case",
  "wrong_metric",
  "ignored_risk",
  "audience_mismatch",
  "compliance",
  "factual_error",
  "performance",
  "security",
  "none",
] as const;
export type Flaw = (typeof FLAWS)[number];
export const FLAW_LABEL: Record<Flaw, string> = {
  wrong_assumption: "Wrong assumption",
  missed_requirement: "Missed requirement",
  edge_case: "Edge case",
  wrong_metric: "Wrong metric",
  ignored_risk: "Ignored risk",
  audience_mismatch: "Wrong audience",
  compliance: "Compliance",
  factual_error: "Factual error",
  performance: "Performance",
  security: "Security",
  none: "Nothing wrong",
};

export const drillSchema = z.object({
  id: z.string().regex(/^d[0-9]$/),
  /** "AI-written refund query", "AI summary for the CFO". */
  title: z.string().min(3).max(90),
  context: z.string().min(10).max(300),
  format: z.enum(["code", "text", "table"]),
  language: z.string().max(20),
  content: z.string().min(10).max(2_000),
  verdict: z.enum(["ship", "skip"]),
  flaw: z.enum(FLAWS),
  /** What exactly is wrong (or why it's fine), for grading and the reveal. */
  explanation: z.string().min(10).max(400),
  nudge: z.string().min(5).max(200),
});
export type Drill = z.infer<typeof drillSchema>;
export type PublicDrill = Omit<Drill, "verdict" | "flaw" | "explanation" | "nudge">;

export const dayContentSchema = z.object({
  concept: z.object({
    title: z.string().min(3).max(80),
    body: z.string().min(40).max(900),
    move: z.string().min(5).max(160),
  }),
  drills: z.array(drillSchema).length(3),
  spoken: z.object({
    question: z.string().min(10).max(300),
    lookFor: z.array(z.string().min(3).max(140)).min(2).max(4),
  }),
});
export type DayContent = z.infer<typeof dayContentSchema>;

export interface DrillResult {
  kind: "drill" | "spoken";
  choice?: "ship" | "skip";
  answer: string;
  correctCall?: boolean;
  namedIssue?: boolean;
  feedback: string;
  strengths?: string[];
  improve?: string[];
  quote?: string;
  reveal?: string;
}

export const proofIdeaSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{2,40}$/),
  /** The one line a recruiter reads first. */
  headline: z.string().min(10).max(140),
  problem: z.string().min(20).max(400),
  evidence: z
    .array(
      z.object({
        claim: z.string().min(5).max(240),
        url: z.string().max(600),
        /** The source's site name, filled in from research (grounding links are redirects). */
        source: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(4),
  build: z.string().min(20).max(500),
  stack: z.array(z.string().min(1).max(40)).max(6),
  sessions: z.number().int().min(2).max(10),
  provesGap: z.string().min(5).max(200),
  milestones: z.array(z.string().min(5).max(140)).min(3).max(6),
  resumeLine: z.string().min(10).max(180),
});
export type ProofIdea = z.infer<typeof proofIdeaSchema>;

export const launchKitSchema = z.object({
  claim: z.string().min(10).max(130),
  sevenSecond: z.object({
    pass: z.boolean(),
    note: z.string().min(5).max(240),
  }),
  evidencePoints: z.array(z.string().min(5).max(160)).length(3),
  script: z
    .array(
      z.object({ beat: z.string().max(40), seconds: z.number().int(), line: z.string().max(400) }),
    )
    .min(4)
    .max(6),
  post: z.string().min(80).max(2_200),
  dmHiringManager: z.string().min(40).max(700),
  referralAsk: z.string().min(40).max(700),
  forwardBlurb: z.string().min(20).max(300),
  followUp: z.string().min(20).max(500),
  resumeLine: z.string().min(10).max(180),
  hashtags: z.array(z.string().max(40)).max(5),
  college: z.string().max(120),
});
export type LaunchKit = z.infer<typeof launchKitSchema>;

export interface ReadinessRound {
  kind: RoundKind;
  title: string;
  score: number;
  /** False until something has tested this round (the mock tests most of them). */
  measured?: boolean;
}
