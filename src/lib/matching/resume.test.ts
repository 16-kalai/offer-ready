import assert from "node:assert/strict";
import { test } from "node:test";
import { extractFacts, extractYears } from "./resume";
import { experienceFit, scoreCandidate } from "./score";

const NOW = new Date("2026-10-26T00:00:00Z");

test("years from ranges, merged and skipping education", () => {
  const text = `Experience
Frontend Developer, Zoho — Jan 2021 – Present
Software Engineer, Freshworks — Jun 2018 - Dec 2020
Education
B.Tech, Anna University 2014 – 2018`;
  const { years } = extractYears(text, NOW);
  assert.ok(years !== null && years > 8 && years < 8.6, `got ${years}`);
});

test("overlapping jobs are not double counted", () => {
  const { years } = extractYears("Freelance 2020 - 2022\nAcme Corp Mar 2020 – Dec 2021", NOW);
  assert.ok(years !== null && years >= 2.5 && years <= 3.1, `got ${years}`);
});

test("stated years win", () => {
  assert.equal(extractYears("Senior engineer with 6+ years of experience in React", NOW).years, 6);
});

test("contact details and name", () => {
  const facts = extractFacts(
    `ANANYA RAO
Senior Frontend Engineer
ananya.rao@example.com | +91 98765 43210 | Bengaluru`,
    NOW,
  );
  assert.equal(facts.name, "Ananya Rao");
  assert.equal(facts.email, "ananya.rao@example.com");
  assert.equal(facts.phone, "+91 98765 43210");
  assert.equal(facts.currentTitle, "Senior Frontend Engineer");
});

test("experience fit", () => {
  assert.equal(experienceFit(6, [5, 8]), 1);
  assert.ok(experienceFit(3, [5, 8]) < 0.7);
  assert.ok(experienceFit(14, [5, 8]) >= 0.4);
  assert.equal(experienceFit(null, [5, 8]), 0.5);
});

test("score rewards coverage and explains itself", () => {
  const base = {
    mustHaves: [
      { skill: "React", weight: 2 },
      { skill: "TypeScript", weight: 2 },
      { skill: "Web performance", weight: 2 },
    ],
    relevance: 0.75,
    titleSimilarity: 0.8,
    years: 6,
    band: [5, 8] as [number, number],
    flags: [],
  };
  const strong = scoreCandidate({
    ...base,
    found: new Map([
      ["React", "reactjs"],
      ["TypeScript", "ts"],
      ["Web performance", "lighthouse"],
    ]),
    related: new Map(),
  });
  const weak = scoreCandidate({
    ...base,
    found: new Map([["React", "react"]]),
    related: new Map(),
    relevance: 0.5,
  });
  assert.ok(strong.score > 85, `strong ${strong.score}`);
  assert.ok(weak.score < strong.score - 30, `weak ${weak.score}`);
  assert.deepEqual(weak.missing, ["TypeScript", "Web performance"]);
});
