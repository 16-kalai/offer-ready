import { z } from "zod";
import { canvasIds, canvasSchema, checkCanvas, spokenFacts } from "./canvas";

/**
 * The interview kit: three judgment cases written from the approved JD.
 * Candidates aren't asked to produce work (they may use AI for that on the
 * job); they're asked to judge it, prioritise and decide. Each case lists the
 * JD skills it tests, so every skill in the report has a moment that tested
 * it. The answer key never reaches the candidate.
 */
export const KIT_SLOTS = ["card1", "card2", "card3"] as const;
export type KitSlot = (typeof KIT_SLOTS)[number];

export const SLOT_INFO: Record<KitSlot, { label: string; question: string }> = {
  card1: { label: "What's wrong here?", question: "Spot the problems in real work" },
  card2: { label: "How would you approach this?", question: "Make a call with trade-offs" },
  card3: { label: "AI made this. Would you use it?", question: "Judge work an AI produced" },
};

export const kitIssueSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  description: z.string().min(5).max(220),
  severity: z.enum(["critical", "major", "minor"]),
  /** Where on the canvas the problem lives: element ids ("pay_button", "line12", "row3"). */
  targets: z.array(z.string().min(2).max(30)).min(1).max(4),
});

export const kitCaseSchema = z.object({
  slot: z.enum(KIT_SLOTS),
  /** Short name HR sees, e.g. "March payroll sheet". */
  title: z.string().min(3).max(80),
  /** What the interviewer says when showing the case. */
  prompt: z.string().min(10).max(300),
  /** What the candidate sees: one or two blocks of real work (a screen, a diff, a log...). */
  canvas: canvasSchema,
  /** Planted problems (cases 1 and 3). Case 2 has none: it is a decision, not a hunt. */
  issues: z.array(kitIssueSchema).max(5),
  goodPriority: z.string().min(5).max(240),
  strongSignals: z.array(z.string().min(3).max(160)).min(2).max(4),
  weakSignals: z.array(z.string().min(3).max(160)).min(1).max(3),
  followUps: z.array(z.string().min(5).max(200)).min(2).max(3),
  /** Ids of the JD skills this case tests. */
  skillIds: z.array(z.string()).min(1).max(3),
});
export type KitCase = z.infer<typeof kitCaseSchema>;

export const kitSchema = z.object({
  cases: z.array(kitCaseSchema).length(3),
  /** One constraint change applied to case 2 during the interview. */
  twist: z.string().min(10).max(200),
});
export type Kit = z.infer<typeof kitSchema>;

export interface KitSkill {
  id: string;
  name: string;
}

/** Stable ids for skills ("Web performance" → "web_performance"). */
export function skillId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 39);
  return /^[a-z]/.test(id) ? id : `s_${id}`.slice(0, 39);
}

/** Rules the model can't be trusted to keep: slots, counts, skill ids, body shape. */
export function checkKit(kit: Kit, skillIds: string[]): string[] {
  const problems: string[] = [];
  if (new Set(kit.cases.map((c) => c.slot)).size !== 3)
    problems.push("Each slot (card1, card2, card3) must appear exactly once.");
  const kinds = new Set(kit.cases.flatMap((c) => c.canvas.map((b) => b.kind)));
  if (kinds.size < 3)
    problems.push(
      `The three cases use only ${[...kinds].join(" and ")}. Use at least three different block kinds across them, the ones this role really works with.`,
    );
  for (const c of kit.cases) problems.push(...checkCase(c, skillIds));
  return problems;
}

/**
 * Words that tell the candidate there are problems to find. "Error" alone is
 * fine (an error log is just a log); "this has a few bugs" is not.
 */
const GIVEAWAY =
  /\b(planted|flaws?|bugs?|buggy|mistakes?|vulnerab\w*|hazards?|has (?:some |a few |several )?(?:issues|problems))\b/i;

export function checkCase(c: KitCase, skillIds: string[]): string[] {
  const problems: string[] = [];
  const asked = c.prompt.replace(/what'?s wrong here\??/i, "");
  if (GIVEAWAY.test(asked))
    problems.push(
      `${c.slot} prompt hints at the answer ("${asked.match(GIVEAWAY)?.[0]}"). Describe the work neutrally; never say there are problems or what kind.`,
    );
  if (Object.values(SLOT_INFO).some((s) => c.title.toLowerCase().includes(s.label.toLowerCase())))
    problems.push(
      `${c.slot} title repeats the slot name. Title the work itself ("March payroll sheet").`,
    );
  if (GIVEAWAY.test(c.title))
    problems.push(`${c.slot} title "${c.title}" hints at the answer. Name the work neutrally.`);
  for (const b of c.canvas)
    if (GIVEAWAY.test(b.title))
      problems.push(
        `${c.slot} ${b.kind} title "${b.title}" hints at the answer. Name the work neutrally.`,
      );
  const unknown = c.skillIds.filter((id) => !skillIds.includes(id));
  if (unknown.length)
    problems.push(`${c.slot} lists unknown skills: ${unknown.join(", ")}. Use only the given ids.`);
  const critical = c.issues.filter((i) => i.severity === "critical").length;
  if (c.slot !== "card2" && (c.issues.length < 3 || critical < 1 || critical > 2)) {
    problems.push(`${c.slot} needs 3 to 5 planted problems, with 1 or 2 marked critical.`);
  }
  if (c.slot === "card2" && c.issues.length > 0)
    problems.push("card2 is a decision, not a hunt: issues must be empty.");
  if (new Set(c.issues.map((i) => i.id)).size !== c.issues.length)
    problems.push(`${c.slot} has repeated problem ids.`);
  problems.push(...checkCanvas(c.canvas, c.slot));
  const repeated = spokenFacts(c.prompt, c.canvas);
  if (repeated.length)
    problems.push(
      `${c.slot} prompt reads out what's on the screen (${repeated.slice(0, 3).join(", ")}). The prompt only says what to look at and what to decide; facts, numbers and names stay on the canvas.`,
    );
  const ids = canvasIds(c.canvas);
  for (const issue of c.issues) {
    const missing = issue.targets.filter((t) => !ids.has(t));
    if (missing.length)
      problems.push(
        `${c.slot} problem "${issue.id}" points at ${missing.join(", ")}, which isn't on the canvas. Copy the id of the part that shows the problem.`,
      );
  }
  return problems;
}

/** Which cases test each skill. Skills tested by none are shown as "not tested". */
export function skillCoverage(
  kit: Pick<Kit, "cases">,
  skills: KitSkill[],
): { skill: KitSkill; slots: KitSlot[] }[] {
  return skills.map((skill) => ({
    skill,
    slots: kit.cases.filter((c) => c.skillIds.includes(skill.id)).map((c) => c.slot),
  }));
}
