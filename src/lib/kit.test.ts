import assert from "node:assert/strict";
import { test } from "node:test";
import { blankBlock } from "./canvas";
import { checkKit, type Kit, skillCoverage, skillId } from "./kit";

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
const base = (
  slot: "card1" | "card2" | "card3",
  issues: ReturnType<typeof issue>[],
  skillIds: string[],
) => ({
  slot,
  title: "A case",
  prompt: "Here is something to look at. What's wrong here?",
  canvas: canvasFor(slot),
  issues,
  goodPriority: "Stops the payment first.",
  strongSignals: ["Names the costly issue", "Explains why"],
  weakSignals: ["Lists typos only"],
  followUps: ["Why that first?", "Who would you tell?"],
  skillIds,
});

const good: Kit = {
  cases: [
    base(
      "card1",
      [issue("dup_row", "critical"), issue("wrong_days", "major"), issue("typo", "minor")],
      ["payroll"],
    ),
    base("card2", [], ["prioritisation"]),
    base(
      "card3",
      [issue("wrong_rate", "critical"), issue("pii", "major"), issue("scope", "minor")],
      ["payroll", "compliance"],
    ),
  ],
  twist: "The deadline moves to tomorrow morning.",
};

test("a well-formed kit passes", () => {
  assert.deepEqual(checkKit(good, ["payroll", "prioritisation", "compliance"]), []);
});

test("rules the model may break are caught", () => {
  const bad: Kit = {
    ...good,
    cases: [
      base("card1", [issue("a", "major"), issue("b", "major")], ["payroll"]),
      base("card2", [issue("x", "minor")], ["unknown_skill"]),
      good.cases[2] as Kit["cases"][number],
    ],
  };
  const problems = checkKit(bad, ["payroll", "prioritisation", "compliance"]);
  assert.ok(problems.some((p) => p.includes("card1 needs 3 to 5")));
  assert.ok(problems.some((p) => p.includes("card2 is a decision")));
  assert.ok(problems.some((p) => p.includes("unknown skills")));
});

test("coverage shows untested skills", () => {
  const cov = skillCoverage(good, [
    { id: "payroll", name: "Payroll" },
    { id: "gst", name: "GST" },
  ]);
  assert.deepEqual(cov[0]?.slots, ["card1", "card3"]);
  assert.deepEqual(cov[1]?.slots, []);
});

test("skill ids are stable slugs", () => {
  assert.equal(skillId("Web performance"), "web_performance");
  assert.equal(skillId("C++"), "c");
  assert.equal(skillId("3D modelling"), "s_3d_modelling");
});

test("a case can't hint at its answer or repeat the slot name", () => {
  const first = good.cases[0] as Kit["cases"][number];
  const leaky = {
    ...first,
    title: "What's wrong here? Payroll",
    prompt: "This sheet has a few planted issues. What's wrong here?",
  };
  const problems = checkKit({ ...good, cases: [leaky, ...good.cases.slice(1)] }, [
    "payroll",
    "prioritisation",
    "compliance",
  ]).join(" ");
  assert.match(problems, /hints at the answer \("planted"\)/);
  assert.match(problems, /repeats the slot name/);
  assert.deepEqual(checkKit(good, ["payroll", "prioritisation", "compliance"]), []);
});
