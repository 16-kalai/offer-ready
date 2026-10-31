import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blankBlock,
  type Canvas,
  canvasIds,
  checkCanvas,
  DIAGRAM,
  describeCanvas,
  layoutDiagram,
} from "./canvas";
import { checkCase, type KitCase } from "./kit";

const el = (
  id: string,
  type: "heading" | "button" | "input" | "text",
  label: string,
  more = {},
) => ({
  id,
  type,
  label,
  detail: "",
  tone: "default" as const,
  state: "normal" as const,
  size: "medium" as const,
  ...more,
});

const screen = blankBlock("screen", {
  title: "Checkout",
  device: "mobile",
  elements: [
    el("title", "heading", "Pay for your order", { size: "large" }),
    el("total", "text", "Total ₹1,299 incl. GST", { tone: "faint" }),
    el("upi_field", "input", "UPI ID", { state: "error", detail: "" }),
    el("pay_button", "button", "Pay now", { tone: "primary", size: "small" }),
  ],
});
const code = blankBlock("code", {
  title: "pay.ts",
  language: "ts",
  code: [
    { id: "line1", text: "export async function pay(order) {", change: "same" },
    {
      id: "line2",
      text: "  const total = order.items.reduce((s, i) => s + i.price, 0);",
      change: "same",
    },
    { id: "line3", text: "  log.info('paying', order.customer.upi);", change: "added" },
    { id: "line4", text: "  await gateway.charge(order.customer.upi, total);", change: "same" },
    { id: "line5", text: "  await gateway.charge(order.customer.upi, total);", change: "added" },
    { id: "line6", text: "}", change: "same" },
  ],
});

test("every pointable part has an id, numbered parts included", () => {
  const ids = canvasIds([screen, code]);
  assert.ok(ids.has("pay_button"));
  assert.match(ids.get("pay_button") ?? "", /button "Pay now"/);
  assert.equal(ids.get("line5"), "line 5");
  assert.equal(ids.get("row1"), undefined, "only parts that exist");
  assert.ok(!ids.has("line7"));
});

test("the interviewer reads the canvas exactly, with ids, the same way every time", () => {
  const text = describeCanvas([screen, code]);
  assert.equal(text, describeCanvas([screen, code]));
  assert.match(text, /\[pay_button\] button "Pay now" \(primary, small \(28 px tall\)\)/);
  assert.match(text, /\[total\] text .*faint, low-contrast/);
  assert.match(text, /\[upi_field\] input "UPI ID" \(error\)/);
  assert.match(text, /A pull-request diff in ts/);
  assert.match(text, /\[line5\] \+ {3}await gateway\.charge/);
});

test("broken canvases are caught, with fixes the model can follow", () => {
  const bad: Canvas = [
    blankBlock("table", { columns: ["A", "B"], rows: [{ id: "row1", cells: ["1"] }] }),
    blankBlock("diagram", {
      nodes: [
        { id: "api", label: "API", type: "service", detail: "" },
        { id: "db", label: "DB", type: "database", detail: "" },
        { id: "api", label: "Again", type: "cache", detail: "" },
      ],
      edges: [{ from: "api", to: "nowhere", label: "" }],
    }),
  ];
  const problems = checkCanvas(bad, "card1").join(" ");
  assert.match(problems, /as many cells as there are columns/);
  assert.match(problems, /"api" is used twice/);
  assert.match(problems, /every arrow must join two boxes/);
  assert.deepEqual(checkCanvas([screen, code], "card1"), []);
  assert.match(checkCanvas([code, code], "card1").join(), /two different block kinds/);
});

test("diagram boxes are laid out left to right in the order data flows", () => {
  const { nodes, width } = layoutDiagram({
    nodes: ["app", "api", "queue", "worker", "db"].map((id) => ({
      id,
      label: id,
      type: "service" as const,
      detail: "",
    })),
    edges: [
      { from: "app", to: "api", label: "" },
      { from: "api", to: "queue", label: "" },
      { from: "api", to: "db", label: "" },
      { from: "queue", to: "worker", label: "" },
      { from: "worker", to: "db", label: "" },
      // A cycle doesn't hang the layout.
      { from: "db", to: "api", label: "" },
    ],
  });
  const x = Object.fromEntries(nodes.map((n) => [n.id, n.x]));
  assert.ok((x.app ?? 0) < (x.api ?? 0));
  assert.ok((x.api ?? 0) < (x.queue ?? 0));
  assert.ok((x.worker ?? 0) < (x.db ?? 0), "db sits after everything that writes to it");
  assert.equal(width, Math.max(...nodes.map((n) => n.x)) + DIAGRAM.nodeW);
});

test("each planted problem must point at something on the canvas", () => {
  const kase: KitCase = {
    slot: "card1",
    title: "Checkout PR",
    prompt: "Here's a pull request for checkout. What's wrong here?",
    canvas: [screen, code],
    issues: [
      {
        id: "double_charge",
        description: "Charges twice",
        severity: "critical",
        targets: ["line5"],
      },
      { id: "pii_log", description: "Logs the UPI ID", severity: "major", targets: ["line3"] },
      { id: "tap_target", description: "Tiny pay button", severity: "minor", targets: ["pay_btn"] },
    ],
    goodPriority: "Stop the double charge first.",
    strongSignals: ["Finds the double charge", "Explains the cost"],
    weakSignals: ["Only styling"],
    followUps: ["What would you check first?", "Who do you tell?"],
    skillIds: ["react"],
  };
  const problems = checkCase(kase, ["react"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? "", /"tap_target" points at pay_btn/);
});

test("code pasted into a document is sent back to a code block", () => {
  const doc = blankBlock("document", {
    title: "Churn pipeline",
    sections: [{ id: "section1", heading: "Pipeline", text: "import pandas as pd\ndf = load()" }],
  });
  assert.match(checkCanvas([doc], "card3").join(), /code belongs in a "code" block/);
});

test("a spoken prompt that reads out on-screen facts is caught; one that points at the screen isn't", async () => {
  const { spokenFacts } = await import("./canvas");
  const canvas: Canvas = [
    blankBlock("chart", {
      title: "Checkout conversion",
      unit: "%",
      points: [
        { id: "point1", label: "Mon", value: 3.2 },
        { id: "point2", label: "Sun", value: 2.2 },
      ],
    }),
    blankBlock("choices", {
      options: [
        { id: "opt_split", label: "Route-based code splitting", detail: "", facts: ["3 days"] },
        { id: "opt_defer", label: "Defer analytics scripts", detail: "", facts: [] },
      ],
    }),
    code,
  ];
  const leaky = spokenFacts(
    "Conversion fell from 3.2 to 2.2 after release. Should we do route-based code splitting or fix gateway.charge?",
    canvas,
  );
  assert.ok(leaky.includes("3.2") && leaky.includes("2.2"));
  assert.ok(leaky.includes("Route-based code splitting"));
  assert.deepEqual(
    spokenFacts(
      "Here are this week's numbers and three options. How would you approach this?",
      canvas,
    ),
    [],
  );
});
