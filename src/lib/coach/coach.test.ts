import assert from "node:assert/strict";
import { test } from "node:test";
import { levelBand, levelScore, nextTier, pickNext } from "./level";
import { planLength, readiness } from "./readiness";

test("level check climbs after a right answer and drops after two wrong", () => {
  assert.equal(nextTier([]), 1);
  assert.equal(nextTier([{ id: "q1", tier: 1, correct: true }]), 2);
  assert.equal(nextTier([{ id: "q1", tier: 2, correct: false }]), 2);
  assert.equal(
    nextTier([
      { id: "q1", tier: 2, correct: false },
      { id: "q2", tier: 2, correct: false },
    ]),
    1,
  );
  assert.equal(nextTier([{ id: "q1", tier: 3, correct: true }]), 3);
});

test("pickNext never repeats and falls back to a nearby tier", () => {
  const bank = [
    { id: "q1", tier: 1 },
    { id: "q2", tier: 2 },
  ];
  const first = pickNext(bank, []);
  assert.equal(first?.id, "q1");
  const second = pickNext(bank, [{ id: "q1", tier: 1, correct: true }]);
  assert.equal(second?.id, "q2");
  assert.equal(
    pickNext(bank, [
      { id: "q1", tier: 1, correct: true },
      { id: "q2", tier: 2, correct: true },
    ]),
    null,
  );
});

test("harder right answers score higher", () => {
  const easy = levelScore([
    { id: "a", tier: 1, correct: true },
    { id: "b", tier: 1, correct: true },
  ]);
  const hard = levelScore([
    { id: "a", tier: 1, correct: true },
    { id: "b", tier: 3, correct: true },
  ]);
  assert.ok(hard > easy);
  assert.equal(levelBand(0.2), "fresher");
  assert.equal(levelBand(0.6), "mid");
  assert.equal(levelBand(0.9), "senior");
});

test("readiness leaves out what hasn't been measured", () => {
  const rounds = [
    { kind: "online_test" as const, title: "OA" },
    { kind: "hiring_manager" as const, title: "HM" },
  ];
  const before = readiness(rounds, { level: 0.5, thinking: {}, roleSkills: null, drills: {} });
  assert.equal(before.rounds[0].score, 50);
  assert.equal(before.rounds[1].score, 0);
  assert.equal(before.overall, 50, "an unmeasured round doesn't drag the overall down");
  const after = readiness(rounds, {
    level: 0.5,
    thinking: { reasoning: 1, framing: 1, verification: 1, tradeoffs: 1, risk: 1 },
    roleSkills: 0.5,
    drills: {},
  });
  assert.equal(after.rounds[1].score, 100);
});

test("drills move a skill without erasing the interview", () => {
  const rounds = [{ kind: "behavioral" as const, title: "B" }];
  const base = readiness(rounds, {
    level: null,
    thinking: { reasoning: 0, framing: 0 },
    roleSkills: null,
    drills: {},
  });
  const practised = readiness(rounds, {
    level: null,
    thinking: { reasoning: 0, framing: 0 },
    roleSkills: null,
    drills: { reasoning: 1 },
  });
  assert.ok(practised.overall > base.overall);
  assert.ok(practised.overall < 100);
});

test("plan length fits the interview date and never passes eight weeks", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  assert.equal(planLength(30, new Date("2026-11-07T00:00:00Z"), now), 5);
  assert.equal(planLength(30, new Date("2027-06-01T00:00:00Z"), now), 56);
  assert.equal(planLength(30, null, now), 7);
  assert.equal(planLength(70, null, now), 3);
});
