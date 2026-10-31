import "server-only";
import type { Goal } from "@/db/schema";
import {
  getIdeas,
  getIntel,
  getLevelCheck,
  getPack,
  getPlan,
  getProject,
  mockState,
  readinessHistory,
} from "@/server/goals";

export type StepKey =
  | "research"
  | "check"
  | "mock"
  | "report"
  | "plan"
  | "proof"
  | "defense"
  | "launch";
export type StepStatus = "done" | "current" | "open" | "locked" | "working";

export type PhaseKey = "know" | "train" | "prove";

export interface Phase {
  key: PhaseKey;
  label: string;
  blurb: string;
  status: "done" | "current" | "open" | "locked";
  done: number;
  steps: Step[];
}

const PHASES: { key: PhaseKey; label: string; blurb: string; steps: StepKey[] }[] = [
  {
    key: "know",
    label: "Know",
    blurb: "Where you stand",
    steps: ["research", "check", "mock", "report"],
  },
  { key: "train", label: "Train", blurb: "Close the gaps", steps: ["plan"] },
  {
    key: "prove",
    label: "Prove",
    blurb: "Build, defend, launch",
    steps: ["proof", "defense", "launch"],
  },
];

export interface Step {
  key: StepKey;
  label: string;
  hint: string;
  href: string;
  status: StepStatus;
}

/** Where a goal stands: each step's status, the next thing to do, and readiness. */
export async function journey(goal: Goal) {
  const [intel, check, baseline, defense, plan, ideas, project, pack, history] = await Promise.all([
    getIntel(goal),
    getLevelCheck(goal.id),
    mockState(goal.id, "baseline"),
    mockState(goal.id, "defense"),
    getPlan(goal.id),
    getIdeas(goal.id),
    getProject(goal.id),
    getPack(goal.id),
    readinessHistory(goal.id),
  ]);
  const base = `/g/${goal.id}`;
  const researched = intel?.status === "ready";
  const checked = Boolean(check?.completedAt);
  const mocked = baseline.stage === "done";
  const defended = defense.stage === "done";
  const published = Boolean(pack?.publishedAt);

  const raw: Omit<Step, "status">[] = [
    {
      key: "research",
      label: "How they hire",
      hint: "Rounds, topics, sources",
      href: `${base}/research`,
    },
    { key: "check", label: "Level check", hint: "5 minutes, adaptive", href: `${base}/check` },
    { key: "mock", label: "Mock interview", hint: "15 minutes, by voice", href: `${base}/mock` },
    { key: "report", label: "Readiness", hint: "Per round, with evidence", href: `${base}/report` },
    { key: "plan", label: "Training plan", hint: "Days, not months", href: `${base}/plan` },
    {
      key: "proof",
      label: "Proof project",
      hint: "Their problem, your build",
      href: `${base}/proof`,
    },
    { key: "defense", label: "Defend it", hint: "Mock 2 on your project", href: `${base}/defense` },
    { key: "launch", label: "Launch", hint: "Proof Page + outreach", href: `${base}/launch` },
  ];
  const done: Record<StepKey, boolean> = {
    research: researched,
    check: checked,
    mock: mocked,
    report: mocked,
    plan: Boolean(plan?.status === "ready" && plan.plan) && mocked,
    proof: Boolean(project),
    defense: defended,
    launch: published,
  };
  const working: Record<StepKey, boolean> = {
    research: !researched && intel?.status === "pending",
    check: false,
    mock: baseline.stage === "preparing" || baseline.stage === "scoring",
    report: baseline.stage === "scoring",
    plan: mocked && plan?.status === "pending",
    proof: mocked && ideas?.status === "pending",
    defense: defense.stage === "preparing" || defense.stage === "scoring",
    launch: pack?.status === "pending",
  };
  const unlocked: Record<StepKey, boolean> = {
    research: true,
    check: true,
    mock: checked,
    report: mocked,
    plan: mocked,
    proof: mocked,
    defense: Boolean(project),
    launch: Boolean(project),
  };
  let currentSet = false;
  const steps: Step[] = raw.map((s) => {
    let status: StepStatus = done[s.key]
      ? "done"
      : working[s.key]
        ? "working"
        : unlocked[s.key]
          ? "open"
          : "locked";
    if (!currentSet && (status === "open" || status === "working")) {
      currentSet = true;
      if (status === "open") status = "current";
    }
    return { ...s, status };
  });
  const phases: Phase[] = PHASES.map((p) => {
    const own = p.steps.map((k) => steps.find((s) => s.key === k) as Step);
    const done = own.filter((s) => s.status === "done").length;
    const status: Phase["status"] =
      done === own.length
        ? "done"
        : own.some((s) => s.status === "current" || s.status === "working")
          ? "current"
          : own.every((s) => s.status === "locked")
            ? "locked"
            : "open";
    return { ...p, steps: own, done, status };
  });
  const latest = history.at(-1) ?? null;
  return {
    phases,
    steps,
    next: steps.find((s) => s.status === "current" || s.status === "working") ?? null,
    intel,
    check,
    baseline,
    defense,
    plan,
    ideas,
    project,
    pack,
    history,
    readiness: latest ? { overall: latest.overall, rounds: latest.rounds } : null,
  };
}
