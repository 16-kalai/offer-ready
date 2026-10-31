import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatcher, canonicalize, findSkills } from "./skills";

const m = buildMatcher();
const has = (text: string, skill: string) => findSkills(text, m).has(skill);

test("aliases map to one canonical skill", () => {
  assert.ok(has("Skills: JS, HTML, CSS", "JavaScript"));
  assert.ok(has("Worked with ReactJS and Node.js", "React"));
  assert.ok(has("Worked with ReactJS and Node.js", "Node.js"));
  assert.ok(has("Deployed on k8s with Helm", "Kubernetes"));
  assert.ok(has("Postgres, Redis", "PostgreSQL"));
  assert.ok(has("CI/CD pipelines in GitHub Actions", "CI/CD"));
  assert.ok(has("Strong in C++ and STL", "C++"));
  assert.ok(has("ASP.NET Core APIs", ".NET"));
  assert.ok(has("Front-end with Next.js", "Next.js"));
  assert.ok(has("Handled PF, ESI and gratuity", "Statutory compliance"));
  assert.equal(canonicalize("js", m), "JavaScript");
  assert.equal(canonicalize("ReactJS", m), "React");
});

test("similar names stay apart", () => {
  assert.ok(!has("5 years of Java and Spring Boot", "JavaScript"));
  assert.ok(!has("Expert in JavaScript", "Java"));
  assert.ok(has("Built apps in React Native", "React Native"));
  assert.ok(!has("Built apps in React Native", "React"));
  assert.ok(!has("Embedded systems in C++", "C"));
  assert.ok(has("C, C++ and embedded firmware", "C"));
  assert.ok(!has("Owned the go-to-market plan", "Go"));
  assert.ok(has("Backend services in Golang", "Go"));
  assert.ok(!has("Led R&D for new products", "R"));
  assert.ok(has("Python, R, SQL for analytics", "R"));
  assert.ok(!has("SWIFT payments operations at a bank", "Swift"));
  assert.ok(has("Swift and SwiftUI for iOS", "Swift"));
  assert.ok(!has("PG in Commerce from Madras University", "PostgreSQL"));
  assert.ok(!has("Supported the rest of the team", "API design"));
  assert.ok(has("Designed RESTful APIs", "API design"));
});

test("typos and British spellings", () => {
  assert.ok(has("Javascrpit and Typescirpt", "JavaScript"));
  assert.ok(has("Javascrpit and Typescirpt", "TypeScript"));
  assert.ok(has("Kubernates on AWS", "Kubernetes"));
  assert.ok(has("Prioritisation of the backlog", "Prioritisation"));
  assert.ok(has("Prioritization of the backlog", "Prioritisation"));
});

test("workspace aliases and custom skills", () => {
  const custom = buildMatcher({
    extraSkills: ["Checkout flows"],
    aliases: { "zoho payroll": "Payroll" },
  });
  assert.ok(findSkills("Built checkout flows for 2M users", custom).has("Checkout flows"));
  assert.ok(findSkills("Ran Zoho Payroll monthly", custom).has("Payroll"));
});

test("evidence keeps the spelling that matched", () => {
  assert.equal(findSkills("Skills: JS", m).get("JavaScript"), "js");
});
