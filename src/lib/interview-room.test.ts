import assert from "node:assert/strict";
import { test } from "node:test";
import { blankBlock } from "./canvas";
import { INTERVIEW_MINUTES } from "./interview";
import {
  BLIP_MS,
  caseBeingIntroduced,
  caseEnds,
  clockPhase,
  cueHash,
  cueWords,
  extensionFor,
  GOODBYE_GRACE_MS,
  isRoomPart,
  MAX_EXTENSION_MS,
  partBudgets,
  partEnds,
  TIMEKEEPER,
  timekeeper,
  WRAP_UP_MS,
} from "./interview-room";
import { type InterviewerContext, interviewerInstruction } from "./interviewer-prompt";

test("every depth's part budgets add up to the 15-minute call", () => {
  for (const depth of ["short", "standard", "deep"] as const) {
    const total = partBudgets(depth).reduce((sum, b) => sum + b.ms, 0);
    assert.equal(total, INTERVIEW_MINUTES * 60_000, depth);
  }
});

test("the clock moves through wrap-up and time-up to over", () => {
  const end = 1_000_000;
  assert.equal(clockPhase(null, end), "before");
  assert.equal(clockPhase(end, end - WRAP_UP_MS - 1), "running");
  assert.equal(clockPhase(end, end - WRAP_UP_MS), "wrap-up");
  assert.equal(clockPhase(end, end), "time-up");
  assert.equal(clockPhase(end, end + GOODBYE_GRACE_MS), "over");
});

test("time is given back for real disconnects only, and capped", () => {
  assert.equal(extensionFor(BLIP_MS - 1, 0), 0, "a blip costs nothing");
  assert.equal(extensionFor(60_000, 0), 60_000);
  assert.equal(extensionFor(60_000, MAX_EXTENSION_MS - 10_000), 10_000);
  assert.equal(extensionFor(60_000, MAX_EXTENSION_MS), 0);
});

test("only known parts are accepted from the browser", () => {
  assert.ok(isRoomPart("cases"));
  assert.ok(isRoomPart("practice"));
  assert.ok(!isRoomPart("admin"));
  assert.ok(!isRoomPart(3));
});

test("system messages are marked so the interviewer never reads them aloud", () => {
  for (const make of Object.values(timekeeper)) {
    const text = (make as (...a: unknown[]) => string)("cases", "close", 2);
    assert.ok(text.startsWith(TIMEKEEPER), text);
  }
});

test("the clock tells the interviewer when each part's minutes are up, counted from the end", () => {
  const ends = partEnds("standard");
  assert.deepEqual(
    ends.map((e) => `${e.part}>${e.next}`),
    ["warmup>projects", "projects>cases", "cases>close"],
  );
  // Standard: warm start 1, projects 4, cases 9, close 1 (of 15).
  assert.deepEqual(
    ends.map((e) => e.msLeft / 60_000),
    [14, 10, 1],
  );
});

const canvas = [
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
const kase = (slot: "card1" | "card2" | "card3", n: number) => ({
  slot,
  title: `Case title ${n}`,
  prompt: `Case prompt ${n}: what would you do?`,
  canvas,
  issues:
    slot === "card2"
      ? []
      : [
          {
            id: `issue_${n}`,
            description: `Planted problem ${n}`,
            severity: "critical" as const,
            targets: ["row3"],
          },
        ],
  goodPriority: `Priority ${n}`,
  strongSignals: ["a", "b"],
  weakSignals: ["c"],
  followUps: [`Follow-up ${n}?`, "Why?"],
  skillIds: ["react"],
});
const ctx: InterviewerContext = {
  companyName: "Northwind Labs",
  roleTitle: "Frontend Engineer",
  firstName: "Pooja",
  depth: "standard",
  plan: {
    roleFamily: "frontend",
    opening: "Tell me about the checkout work at Trailmix.",
    projectQuestions: [
      {
        question: "Why that state approach?",
        about: "Trailmix checkout",
        thinking: "tradeoffs",
        lookFor: "Names the cost",
        followUps: ["What did you give up?"],
      },
      {
        question: "How did you verify the speed-up?",
        about: "Performance",
        thinking: "verification",
        lookFor: "Real user data",
        followUps: ["Which metric?"],
      },
      {
        question: "What would you do differently?",
        about: "Webwise",
        thinking: "reasoning",
        lookFor: "Clear lesson",
        followUps: ["Why?"],
      },
    ],
    cases: [kase("card1", 1), kase("card2", 2), kase("card3", 3)],
    twist: "The launch moved up a week.",
    closing: "Looking back, what would you change?",
  },
};

test("the interviewer runs the plan: its questions, cases and twist, and a tool call before each case", () => {
  const text = interviewerInstruction(ctx);
  assert.match(text, /Pooja/);
  assert.match(text, /Trailmix/);
  for (const q of ctx.plan.projectQuestions) assert.ok(text.includes(q.question), q.question);
  for (const n of [1, 2, 3]) assert.ok(text.includes(`Case prompt ${n}`));
  assert.ok(text.includes("The launch moved up a week."));
  // It runs the sections in order, and puts each case on screen before it talks about it.
  for (const section of ["0. practice", "1. warmup", "2. projects", "3. cases", "4. close"])
    assert.ok(text.includes(section), section);
  for (const tool of ["next_section", "show_case", "show_twist", "end_interview"])
    assert.ok(text.includes(tool), tool);
  assert.match(text, /call show_case with its number FIRST/);
  assert.match(text, /can't see it[^.]*call show_case/);
  assert.match(text, /\[system\]/);
  assert.match(text, /never reveal/i);
  // Off-topic questions ("who is the president?") are declined, never answered.
  assert.match(text, /general knowledge[^.]*don't answer it/);
  // The interviewer sees each case's canvas, with ids to point at, and where each problem lives.
  assert.ok(text.includes("[row3] Asha | 22 | ₹41,000"));
  assert.match(text, /at row3\]/);
  for (const tool of ["point_at", "note"]) assert.ok(text.includes(tool), tool);
  assert.doesNotMatch(text, /RESUMING/);
});

test("a resumed call without a handle carries the recent conversation, capped", () => {
  const long = Array.from({ length: 400 }, (_, i) => ({
    speaker: i % 2 ? "candidate" : "interviewer",
    text: `Line number ${i} of the conversation so far.`,
  }));
  const text = interviewerInstruction({ ...ctx, resume: { part: "cases", transcript: long } });
  assert.match(text, /RESUMING/);
  assert.ok(text.includes("Line number 399"), "keeps the most recent line");
  assert.ok(!text.includes("Line number 0 of"), "drops the oldest lines");
  assert.match(text, /Don't start over/);
});

test("the saved transcript drops notes the interviewer might echo", async () => {
  const { spokenOnly } = await import("./live/call");
  const echoed =
    'Let\'s begin. Tell me about the migration? * **Move to warmup:** `move_to(part="warmup")` * **Ask:** "Tell me"';
  assert.equal(spokenOnly(echoed).trim(), "Let's begin. Tell me about the migration?");
  assert.equal(spokenOnly("A normal sentence."), "A normal sentence.");
});

test("transcription chunks read as clean text, without breaking names like Node.js", async () => {
  const { tidy } = await import("./live/call");
  assert.equal(
    tidy("  I used   Node.js ,  and React .\n Then  we shipped "),
    "I used Node.js, and React. Then we shipped",
  );
  assert.equal(tidy("₹1,299 for e.g. UPI"), "₹1,299 for e.g. UPI");
});

test("the recogniser is told this interview's names and terms, once each", async () => {
  const { transcriptionVocabulary } = await import("./interviewer-prompt");
  const words = transcriptionVocabulary({
    companyName: "Northwind Labs",
    roleTitle: "Frontend Engineer",
    skills: ["React", "TypeScript", "react"],
    plan: ctx.plan,
  });
  assert.ok(words.includes("Northwind Labs"));
  assert.ok(words.includes("Trailmix checkout"), "the candidate's own projects");
  assert.equal(words.filter((w) => w.toLowerCase() === "react").length, 1);
  assert.ok(words.length <= 60);
});

test("names and tech terms are picked out of the interviewer's questions", async () => {
  const { namesIn } = await import("./interviewer-prompt");
  assert.deepEqual(
    namesIn(
      "Looking at your Angular work at FinEdge, what made you choose RxJS? Tell me about Infotech Solutions and the Node.js API.",
    ),
    ["Angular", "FinEdge", "RxJS", "Infotech Solutions", "Node.js API"],
  );
});

test("asking to finish is recognised; finishing a task isn't", async () => {
  const { wantsToFinish } = await import("./interview-room");
  assert.ok(wantsToFinish("No, we are good. We can complete."));
  assert.ok(wantsToFinish("I'm done, can we finish?"));
  assert.ok(!wantsToFinish("I'd finish the migration first and then test it."));
});

test("results rank scored interviews by verdict, then skills, then problems found", async () => {
  const { compareResults, summarise } = await import("./report");
  const skills = (n: number) =>
    (["framing", "verification", "tradeoffs", "risk", "reasoning"] as const).map((id) => ({
      id,
      score: n,
      summary: "A summary of this skill.",
      evidence: [{ seq: 1, quote: "a quote" }],
    }));
  const report = (rec: "advance" | "maybe" | "decline", score: number, found: number) => ({
    version: "report@1",
    status: "scored" as const,
    answered: { turns: 10, words: 400 },
    integrity: [],
    judged: {
      skills: skills(score),
      roleSkills: [],
      cases: [
        {
          slot: "card1" as const,
          summary: "How they handled it.",
          issues: Array.from({ length: 3 }, (_, i) => ({
            id: `p${i}`,
            status: (i < found ? "found" : "missed") as "found" | "missed",
            seq: null,
          })),
        },
      ],
      overall: {
        recommendation: rec,
        confidence: "medium" as const,
        summary: "An overall summary of the interview.",
        strengths: [],
        concerns: [],
      },
      integrity: [],
    },
  });
  const rows = [
    { name: "pending", s: summarise(null, false) },
    { name: "decline", s: summarise(report("decline", 4, 3), true) },
    { name: "advance-3", s: summarise(report("advance", 3, 1), true) },
    {
      name: "insufficient",
      s: summarise({ ...report("advance", 4, 3), status: "insufficient", judged: null }, true),
    },
    { name: "advance-4", s: summarise(report("advance", 4, 0), true) },
    { name: "advance-3-more-found", s: summarise(report("advance", 3, 3), true) },
  ];
  const order = rows.sort((a, b) => compareResults(a.s, b.s)).map((r) => r.name);
  assert.deepEqual(order, [
    "advance-4",
    "advance-3-more-found",
    "advance-3",
    "decline",
    "insufficient",
    "pending",
  ]);
});

test("each case gets its share of the cases' minutes; the clock says when to open the next", () => {
  // Standard: cases run from 10 to 1 minutes left, three cases of 3 minutes each.
  assert.deepEqual(
    caseEnds("standard", 3).map((e) => [e.case, e.msLeft / 60_000]),
    [
      [1, 7],
      [2, 4],
    ],
  );
  assert.deepEqual(caseEnds("standard", 1), []);
});

test("a case's opening is recognised from fingerprints of its words, not from earlier cases' words", () => {
  const cue = (title: string, prompt: string) => cueWords(`${title} ${prompt}`).map(cueHash);
  const cues = [
    cue("Checkout Payment Component Review", "What's wrong here?"),
    cue(
      "Checkout Bundle Optimization Decision",
      "We need to reduce checkout bundle size before the festive sale. Review these choices.",
    ),
  ];
  // Nothing readable reaches the browser.
  assert.ok(cues.flat().every((h) => typeof h === "number"));
  const none = new Set<number>();
  assert.equal(
    caseBeingIntroduced(
      cues,
      none,
      "Okay. Take a look at this checkout payment component code. What's wrong here?",
    ),
    1,
  );
  const one = new Set([1]);
  // Case 1's follow-ups don't open case 2, even though both are about checkout.
  assert.equal(
    caseBeingIntroduced(
      cues,
      one,
      "How would you refactor the DOM code in this checkout component?",
    ),
    null,
  );
  assert.equal(
    caseBeingIntroduced(
      cues,
      one,
      "Moving on, we need to reduce checkout bundle size before the festive sale.",
    ),
    2,
  );
});
