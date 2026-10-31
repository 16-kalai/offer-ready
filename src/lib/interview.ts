import { z } from "zod";
import { missingKinds, ROLE_FAMILY_IDS } from "./canvas";
import { checkKit, type KitSkill, kitCaseSchema } from "./kit";

/**
 * The tailored interview. Every candidate gets their own questions, written
 * from their resume, but everyone is judged on the same five thinking skills,
 * in the same 15-minute structure. We judge how people think, not what they
 * produce: anyone can produce the work with AI.
 */

export const INTERVIEW_MINUTES = 15;

export const THINKING = [
  { id: "framing", name: "Framing", hint: "Works out what actually matters before acting" },
  {
    id: "verification",
    name: "Verification",
    hint: "Questions claims, numbers and AI output; asks for evidence",
  },
  {
    id: "tradeoffs",
    name: "Prioritisation and trade-offs",
    hint: "Chooses what comes first and knows what it costs",
  },
  { id: "risk", name: "Risk and second-order effects", hint: "Sees who or what breaks downstream" },
  {
    id: "reasoning",
    name: "Explaining reasoning",
    hint: "Makes their thinking easy for others to follow",
  },
] as const;
export type ThinkingId = (typeof THINKING)[number]["id"];
const thinkingIds = THINKING.map((t) => t.id) as [ThinkingId, ...ThinkingId[]];

/** How deep the "your own projects" part goes. Cases shrink to keep the call at 15 minutes. */
export const DEPTHS = {
  short: {
    label: "Short",
    projectQuestions: 2,
    minutes: { warmup: 1, projects: 3, cases: 10, close: 1 },
  },
  standard: {
    label: "Standard",
    projectQuestions: 3,
    minutes: { warmup: 1, projects: 4, cases: 9, close: 1 },
  },
  deep: {
    label: "Deep",
    projectQuestions: 4,
    minutes: { warmup: 1, projects: 6, cases: 7, close: 1 },
  },
} as const;
export type Depth = keyof typeof DEPTHS;

export const PARTS = [
  { key: "warmup", label: "Warm start", about: "A personal opener about their proudest project" },
  {
    key: "projects",
    label: "Their projects",
    about: "Decisions, trade-offs and lessons in their own work",
  },
  { key: "cases", label: "Real-work cases", about: "Three judgment cases set in their domain" },
  { key: "close", label: "Close", about: "What they'd do differently, and thanks" },
] as const;

/** Role level: what HR approves once. Candidate plans are written within it. */
export const blueprintSchema = z.object({
  depth: z.enum(["short", "standard", "deep"]),
  skills: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .min(1)
    .max(6),
});
export type Blueprint = z.infer<typeof blueprintSchema>;

export const projectQuestionSchema = z.object({
  /** What the interviewer asks, about the candidate's own work. */
  question: z.string().min(10).max(280),
  /** Which project or role on the resume it refers to, in a few words. */
  about: z.string().min(3).max(120),
  /** The thinking skill this question mainly reveals. */
  thinking: z.enum(thinkingIds),
  /** What a strong answer shows, for HR and for scoring. */
  lookFor: z.string().min(5).max(220),
  followUps: z.array(z.string().min(5).max(200)).min(1).max(2),
});
export type ProjectQuestion = z.infer<typeof projectQuestionSchema>;

/** Candidate level: their personal interview. */
export const candidatePlanSchema = z.object({
  /** What kind of job this is; decides which canvases the cases must use. */
  roleFamily: z.enum(ROLE_FAMILY_IDS),
  opening: z.string().min(10).max(260),
  projectQuestions: z.array(projectQuestionSchema).min(2).max(4),
  cases: z.array(kitCaseSchema).length(3),
  twist: z.string().min(10).max(200),
  closing: z.string().min(10).max(220),
});
export type CandidatePlan = z.infer<typeof candidatePlanSchema>;

/**
 * A saved plan in the current format, or null when it was written in an older
 * one (it's rewritten with `pnpm plans:regenerate`). Pages never render a
 * shape they don't know.
 */
export function currentPlan(plan: unknown): CandidatePlan | null {
  const parsed = candidatePlanSchema.safeParse(plan);
  return parsed.success ? parsed.data : null;
}

/** Never asked, whatever the resume says. Checked on every generated plan. */
const OFF_LIMITS =
  /\b(age|how old|married|marital|spouse|husband|wife|children|kids|pregnan|religio|caste|gotra|horoscope|disabilit|medical condition|health condition|salary history|current salary|ctc|expected salary|native place|father'?s|mother'?s|nationality|political)\b/i;
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|https?:\/\/\S+/i;

function strings(plan: CandidatePlan): string[] {
  return [
    plan.opening,
    plan.twist,
    plan.closing,
    ...plan.projectQuestions.flatMap((q) => [q.question, q.lookFor, ...q.followUps]),
    ...plan.cases.flatMap((c) => [c.title, c.prompt, ...c.followUps]),
  ];
}

/** Rules the model can't be trusted to keep, plus fairness and privacy guardrails. */
export function checkPlan(plan: CandidatePlan, blueprint: Blueprint): string[] {
  const problems: string[] = [];
  const want = DEPTHS[blueprint.depth].projectQuestions;
  if (plan.projectQuestions.length !== want)
    problems.push(`Write exactly ${want} project questions.`);
  const thinkingUsed = new Set(plan.projectQuestions.map((q) => q.thinking));
  if (thinkingUsed.size < Math.min(want, 2))
    problems.push("Project questions should reveal different thinking skills.");
  problems.push(
    ...checkKit(
      { cases: plan.cases, twist: plan.twist },
      blueprint.skills.map((s) => s.id),
    ),
  );
  const missing = missingKinds(
    plan.roleFamily,
    plan.cases.flatMap((c) => c.canvas.map((b) => b.kind)),
  );
  if (missing.length)
    problems.push(
      `This is a ${plan.roleFamily} role, so the cases must also show ${missing.join(", and ")}. Change one case's canvas.`,
    );
  for (const text of strings(plan)) {
    if (OFF_LIMITS.test(text)) {
      problems.push(`Off-limits topic in: "${text.slice(0, 80)}". Ask only about work.`);
      break;
    }
    if (CONTACT.test(text)) {
      problems.push("Remove any email address, phone number or link.");
      break;
    }
  }
  return problems;
}

/**
 * Strips direct identifiers before resume text goes to the model: email,
 * phone, links and the candidate's name. What's left is work history.
 */
export function deidentify(text: string, name: string | null): string {
  let t = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{8,16}\d)/g, "[phone]")
    .replace(/https?:\/\/\S+|www\.\S+|(?:linkedin|github)\.com\/\S+/gi, "[link]");
  for (const part of (name ?? "").split(/\s+/).filter((p) => p.length > 1)) {
    t = t.replace(
      new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      "[name]",
    );
  }
  return t
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6_000);
}

export type { KitSkill };
