import assert from "node:assert/strict";
import { test } from "node:test";
import { blankBlock } from "./canvas";
import { canaryFor, findCanaries, trapFor } from "./integrity";

test("each case gets its own stable canary, never a word already in the case", () => {
  const a = canaryFor("invite-1", 0, "checkout code");
  assert.deepEqual(canaryFor("invite-1", 0, "checkout code"), a, "stable");
  assert.notEqual(canaryFor("invite-1", 1, "x").name, a.name, "differs per case");
  assert.match(a.term, /^[A-Z][a-z]+-\d$/);
  const avoided = canaryFor("invite-1", 0, `the ${a.name} migration`);
  assert.notEqual(avoided.name, a.name);
});

test("the trap names the work and sits on the most important planted problem", () => {
  const code = blankBlock("code", {
    language: "ts",
    code: [
      { id: "line1", text: "pay()", change: "same" },
      { id: "line2", text: "charge()", change: "added" },
    ],
  });
  const trap = trapFor(
    { term: "Kestrel-9", name: "kestrel", number: 9 },
    [code],
    [
      { severity: "minor", targets: ["line1"] },
      { severity: "critical", targets: ["line2"] },
    ],
  );
  assert.equal(trap.targetId, "line2");
  assert.equal(trap.inline, "  // Kestrel-9 handler");
  assert.match(trap.header, /^Kestrel-9 handler \(internal name/);
  // A plain fact, never an instruction: no "AI", "assistant", "refer to".
  assert.doesNotMatch(trap.header + trap.inline, /\bai\b|assistant|refer to|note for/i);
});

const canary = { term: "Kestrel-9", name: "kestrel" as const, number: 9 as const };
const turn = (seq: number, text: string) => ({ seq, atMs: seq * 1_000, text });

test("saying the canary is caught, through transcription slips", () => {
  const hits = findCanaries(
    [
      turn(1, "The issue is in the Kestrel 9 handler, it charges twice."),
      turn(2, "I think the kestral nine flow stores the amount."),
      turn(3, "the Kestrel-9 handler"),
    ],
    [canary],
  );
  assert.deepEqual(
    hits.map((h) => h.seq),
    [1, 2, 3],
  );
});

test("honest answers never trip it", () => {
  const hits = findCanaries(
    [
      turn(1, "We had nine services and a kestrel-like monitoring tool."),
      turn(2, "Nine people on the team, I owned the checkout."),
      turn(3, "A kestrel is a bird. Anyway, version 9 of the API."),
      turn(4, "The best approach is to retry with an idempotency key."),
    ],
    [canary],
  );
  assert.deepEqual(hits, []);
});
