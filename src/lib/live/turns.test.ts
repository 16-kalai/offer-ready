import assert from "node:assert/strict";
import { test } from "node:test";
import { TURNS, TurnKeeper } from "./turns";

test("the greeting cue gets exactly one reply", () => {
  const t = new TurnKeeper();
  t.cue(0);
  assert.equal(t.turnStarted(500), "speak");
  t.turnEnded(9_000, "Hi Arjun. How is your day going?");
  // The model starts the same question again after a tool answer: dropped.
  assert.equal(t.turnStarted(12_000), "drop");
  t.turnEnded(20_000, "");
});

test("a question repeated right away is dropped; a short lead-in may continue", () => {
  const t = new TurnKeeper();
  t.cue(0);
  t.turnStarted(100);
  t.turnEnded(1_000, "Got it.");
  assert.equal(t.turnStarted(1_500), "speak", "'Got it.' then the next question");
  t.turnEnded(6_000, "What made you choose RxJS?");
  assert.equal(t.turnStarted(6_500), "drop", "the same question again");
});

test("every answer from the candidate earns one reply", () => {
  const t = new TurnKeeper();
  t.cue(0);
  t.turnStarted(100);
  t.turnEnded(5_000, "Tell me about the migration?");
  t.candidateSpeaking();
  // The model may begin replying before the candidate's turn is formally over.
  assert.equal(t.turnStarted(9_000), "speak");
  t.turnEnded(12_000, "Go on.");
  t.candidateSpeaking();
  t.candidateDone(15_000);
  assert.equal(t.turnStarted(16_000), "speak");
});

test("a reply that doesn't come is flagged twice, then left alone", () => {
  const t = new TurnKeeper();
  t.candidateSpeaking();
  t.candidateDone(0);
  assert.equal(t.overdue(TURNS.stallMs - 1), false);
  assert.equal(t.overdue(TURNS.stallMs), true);
  assert.equal(t.overdue(TURNS.stallMs + 1), false, "once per wait");
  assert.equal(t.overdue(TURNS.stallMs + TURNS.secondStallMs), true);
  assert.equal(t.overdue(60_000), false, "at most twice");
  assert.equal(t.turnStarted(61_000), "speak", "the late reply still plays");
});

test("cues wait for the floor", () => {
  const t = new TurnKeeper();
  assert.ok(t.idle());
  t.cue(0);
  assert.ok(!t.idle(), "a reply is owed");
  t.turnStarted(100);
  assert.ok(!t.idle(), "the interviewer is talking");
  t.turnEnded(4_000, "Thanks.");
  assert.ok(t.idle());
});

test("asking to repeat drops the rest of the current turn", () => {
  const t = new TurnKeeper();
  t.cue(0);
  assert.equal(t.turnStarted(100), "speak");
  t.dropCurrent();
  assert.equal(t.turnStarted(200), "drop", "later parts of the same turn");
  t.turnEnded(3_000, "");
  t.cue(3_100);
  assert.equal(t.turnStarted(3_500), "speak", "the repeat itself");
});
