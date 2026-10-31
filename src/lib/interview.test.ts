import assert from "node:assert/strict";
import { test } from "node:test";
import { blankBlock } from "./canvas";
import { type Blueprint, type CandidatePlan, checkPlan, deidentify } from "./interview";

const table = [
  blankBlock("table", {
    title: "March payroll",
    columns: ["Name", "Days", "Pay"],
    rows: [
      { id: "row1", cells: ["Asha", "22", "₹41,000"] },
      { id: "row2", cells: ["Ravi", "31", "₹52,000"] },
      { id: "row3", cells: ["Asha", "22", "₹41,000"] },
    ],
  }),
];
const chart = blankBlock("chart", {
  title: "Weekly sign-ups",
  points: [
    { id: "point1", label: "W1", value: 120 },
    { id: "point2", label: "W2", value: 95 },
    { id: "point3", label: "W3", value: 60 },
  ],
});
const note = blankBlock("document", {
  title: "Manager's note",
  sections: [{ id: "section1", heading: "", text: "Please send it by Friday." }],
});
/** Different work per case, as the rules require: a table, a chart, and a table with a note. */
const canvasFor = (slot: "card1" | "card2" | "card3") =>
  slot === "card1" ? table : slot === "card2" ? [chart] : [...table, note];
const issue = (id: string, severity: "critical" | "major" | "minor") => ({
  id,
  description: "A planted problem.",
  severity,
  targets: ["row1"],
});
const kase = (slot: "card1" | "card2" | "card3", issues: ReturnType<typeof issue>[]) => ({
  slot,
  title: "A case",
  prompt: "Here is the work. What's wrong here?",
  canvas: canvasFor(slot),
  issues,
  goodPriority: "Stops the payment first.",
  strongSignals: ["Names the costly issue", "Explains why"],
  weakSignals: ["Lists typos only"],
  followUps: ["Why that first?", "Who would you tell?"],
  skillIds: ["react"],
});
const q = (thinking: "framing" | "verification" | "tradeoffs") => ({
  question: "You moved checkout to Next.js. What made you choose that?",
  about: "Checkout rebuild",
  thinking,
  lookFor: "Names the constraint that drove the choice.",
  followUps: ["What did it cost?"],
});
const blueprint: Blueprint = { depth: "standard", skills: [{ id: "react", name: "React" }] };
const plan: CandidatePlan = {
  roleFamily: "other",
  opening: "Tell me about the project you're proudest of, in a minute.",
  projectQuestions: [q("framing"), q("verification"), q("tradeoffs")],
  cases: [
    kase("card1", [issue("a", "critical"), issue("b", "major"), issue("c", "minor")]),
    kase("card2", []),
    kase("card3", [issue("d", "critical"), issue("e", "major"), issue("f", "minor")]),
  ],
  twist: "The deadline moves to tomorrow morning.",
  closing: "Anything you'd do differently in what we discussed?",
};

test("a good plan passes", () => assert.deepEqual(checkPlan(plan, blueprint), []));

test("depth is enforced", () => {
  assert.ok(checkPlan(plan, { ...blueprint, depth: "short" }).some((p) => p.includes("exactly 2")));
});

test("off-limits topics are caught", () => {
  const bad = { ...plan, closing: "Are you married or planning a family soon?" };
  assert.ok(checkPlan(bad, blueprint).some((p) => p.includes("Off-limits")));
});

test("work words that look sensitive are allowed", () => {
  const ok = {
    ...plan,
    closing: "Would you disable the health check, or ask the open-source community first?",
  };
  assert.deepEqual(checkPlan(ok, blueprint), []);
});

test("contact details are caught", () => {
  const bad = { ...plan, opening: "Email me at test@example.com about your project." };
  assert.ok(checkPlan(bad, blueprint).some((p) => p.includes("email")));
});

test("de-identification removes direct identifiers", () => {
  const out = deidentify(
    "Ananya Rao\nananya@x.com | +91 98765 43210 | linkedin.com/in/ananya\nBuilt checkout at Zylo",
    "Ananya Rao",
  );
  assert.ok(!/ananya/i.test(out), out);
  assert.ok(!/98765/.test(out));
  assert.ok(out.includes("Built checkout at Zylo"));
});

test("each kind of job gets the canvases it really works with", () => {
  // The good plan shows a table, a chart and a document: fine for "other", not for frontend.
  assert.deepEqual(checkPlan({ ...plan, roleFamily: "other" }, blueprint), []);
  const problems = checkPlan({ ...plan, roleFamily: "frontend" }, blueprint).join(" ");
  assert.match(problems, /frontend role, so the cases must also show "screen", and "code"/);
});
