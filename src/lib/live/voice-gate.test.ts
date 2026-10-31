import assert from "node:assert/strict";
import { test } from "node:test";
import { GATE, VoiceGate } from "./voice-gate";

/** Feeds levels and returns what the gate let through. */
function run(gate: VoiceGate, levels: number[]) {
  let sent = 0;
  let closes = 0;
  for (const [i, level] of levels.entries()) {
    const e = gate.push(level, `c${i}`);
    if (e.kind === "send") sent += e.chunks.length;
    if (e.kind === "close") closes++;
  }
  return { sent, closes };
}
const repeat = (level: number, n: number) => Array.from({ length: n }, () => level);

test("a quiet room sends nothing", () => {
  const gate = new VoiceGate();
  assert.deepEqual(run(gate, repeat(0.01, 200)), { sent: 0, closes: 0 });
});

test("steady background chatter becomes the floor and stays out", () => {
  const gate = new VoiceGate();
  // 12 seconds of people talking nearby at a moderate level.
  const chatter = Array.from({ length: 300 }, (_, i) => 0.06 + 0.03 * Math.sin(i / 3));
  run(gate, chatter);
  assert.ok(gate.floor > 0.03, `floor learned: ${gate.floor}`);
  const later = run(gate, chatter);
  assert.equal(later.sent, 0, "chatter no longer opens the gate");
});

test("the candidate's voice opens the gate, with the moment before it", () => {
  const gate = new VoiceGate();
  run(gate, repeat(0.01, 50));
  const { sent } = run(gate, [...repeat(0.01, 10), ...repeat(0.4, 20)]);
  // Everything from the first word on, plus a little from just before it.
  assert.ok(sent >= 20 && sent <= 20 + GATE.prerollChunks, `sent ${sent}`);
});

test("short pauses keep the turn open; a long pause closes it once", () => {
  const gate = new VoiceGate();
  run(gate, repeat(0.01, 50));
  const speech = [...repeat(0.4, 25), ...repeat(0.01, 15), ...repeat(0.4, 25)];
  assert.equal(run(gate, speech).closes, 0, "a 0.6 s pause is part of the answer");
  assert.equal(run(gate, repeat(0.01, GATE.hangoverChunks + 5)).closes, 1);
});

test("shut() closes the gate immediately and reports if it was open", () => {
  const gate = new VoiceGate();
  run(gate, [...repeat(0.01, 50), ...repeat(0.4, 5)]);
  assert.equal(gate.shut(), true);
  assert.equal(gate.open, false);
  assert.equal(gate.shut(), false);
});

test("a single bang doesn't open the gate", () => {
  const gate = new VoiceGate();
  run(gate, repeat(0.01, 50));
  assert.equal(run(gate, [0.8, 0.01, 0.01, 0.9, 0.01]).sent, 0);
});

test("speaking over background chatter still gets through, and the turn ends when they stop", () => {
  const gate = new VoiceGate();
  const chatter = (n: number) => Array.from({ length: n }, (_, i) => 0.06 + 0.03 * Math.sin(i / 3));
  run(gate, chatter(200));
  const { sent } = run(gate, repeat(0.45, 40));
  assert.ok(sent >= 40, "the candidate is heard");
  assert.equal(
    run(gate, chatter(GATE.hangoverChunks + 10)).closes,
    1,
    "chatter doesn't hold the turn",
  );
});
