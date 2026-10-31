import { z } from "zod";

/**
 * The interview canvas: the real work a case puts in front of the candidate.
 * A case's canvas is one or two blocks (a phone screen, a pull request, an
 * alert log, a table, a chart, an architecture diagram, a document, or options
 * to choose between), written fresh for each candidate. Blocks are data, drawn
 * by the browser, so they're small, fast and can't drift from what the
 * interviewer is told.
 *
 * Every part of a block the conversation might refer to has an id. The
 * interviewer is given the canvas as text with those ids (it never needs a
 * screenshot), can point at any of them while it talks, and the answer key
 * ties each planted problem to the ids where it lives.
 */

export const CANVAS_KINDS = [
  "screen",
  "code",
  "log",
  "table",
  "chart",
  "diagram",
  "document",
  "choices",
] as const;
export type CanvasKind = (typeof CANVAS_KINDS)[number];

const elementId = z.string().regex(/^[a-z][a-z0-9_]{1,29}$/);

export const SCREEN_ELEMENTS = [
  "heading",
  "text",
  "button",
  "input",
  "select",
  "checkbox",
  "toggle",
  "list_row",
  "notice",
  "badge",
  "link",
  "image",
  "tabs",
  "divider",
] as const;

export const screenElementSchema = z.object({
  id: elementId,
  type: z.enum(SCREEN_ELEMENTS),
  /** The visible text: a button's label, a field's label, a heading. Tabs: "Home|Orders|Profile". */
  label: z.string().max(120),
  /** Secondary text: a field's value or placeholder, a list row's subtitle, an error message. */
  detail: z.string().max(160),
  /** "faint" is deliberately low contrast, so contrast problems can be planted. */
  tone: z.enum(["default", "primary", "danger", "muted", "faint"]),
  state: z.enum(["normal", "disabled", "error", "selected", "loading"]),
  /** Real sizes: a "small" button is 28 px tall, too small to tap comfortably. */
  size: z.enum(["small", "medium", "large"]),
});

export const blockSchema = z.object({
  kind: z.enum(CANVAS_KINDS),
  /** The screen's, file's, chart's or document's name. */
  title: z.string().max(100),
  /** screen */
  device: z.enum(["mobile", "desktop"]),
  elements: z.array(screenElementSchema).max(24),
  /** code: a file, or a pull-request diff when lines are marked added or removed. */
  language: z.string().max(20),
  code: z
    .array(
      z.object({
        id: elementId,
        text: z.string().max(160),
        change: z.enum(["same", "added", "removed"]),
      }),
    )
    .max(40),
  /** log */
  log: z
    .array(
      z.object({
        id: elementId,
        time: z.string().max(24),
        level: z.enum(["info", "warn", "error"]),
        text: z.string().max(200),
      }),
    )
    .max(20),
  /** table */
  columns: z.array(z.string().min(1).max(40)).max(8),
  rows: z.array(z.object({ id: elementId, cells: z.array(z.string().max(80)).max(8) })).max(12),
  /** chart: one series, in order. */
  chart: z.enum(["line", "bar", "funnel"]),
  unit: z.string().max(16),
  points: z
    .array(z.object({ id: elementId, label: z.string().min(1).max(24), value: z.number() }))
    .max(14),
  /** diagram: boxes and arrows. */
  nodes: z
    .array(
      z.object({
        id: elementId,
        label: z.string().min(1).max(40),
        type: z.enum(["client", "service", "database", "queue", "cache", "external", "storage"]),
        detail: z.string().max(80),
      }),
    )
    .max(10),
  edges: z.array(z.object({ from: elementId, to: elementId, label: z.string().max(40) })).max(14),
  /** document: an email, ticket, spec, chat or report. */
  docType: z.enum(["email", "ticket", "spec", "chat", "report", "note"]),
  meta: z.array(z.object({ label: z.string().min(1).max(20), value: z.string().max(120) })).max(6),
  sections: z
    .array(
      z.object({ id: elementId, heading: z.string().max(80), text: z.string().min(1).max(600) }),
    )
    .max(8),
  /** choices: options to compare or put in order. */
  options: z
    .array(
      z.object({
        id: elementId,
        label: z.string().min(1).max(60),
        detail: z.string().max(220),
        facts: z.array(z.string().min(1).max(100)).max(4),
      }),
    )
    .max(5),
});
export type CanvasBlock = z.infer<typeof blockSchema>;

/** A block of the given kind with every field empty: the shape the model fills in. */
export function blankBlock(kind: CanvasKind, fill: Partial<CanvasBlock> = {}): CanvasBlock {
  return {
    kind,
    title: "",
    device: "mobile",
    elements: [],
    language: "",
    code: [],
    log: [],
    columns: [],
    rows: [],
    chart: "line",
    unit: "",
    points: [],
    nodes: [],
    edges: [],
    docType: "note",
    meta: [],
    sections: [],
    options: [],
    ...fill,
  };
}

export const canvasSchema = z.array(blockSchema).min(1).max(2);
export type Canvas = z.infer<typeof canvasSchema>;

// ---- role families ----

/**
 * What each kind of job really looks at. The interview's three cases must,
 * between them, include every "must" group (any one kind from each group),
 * so a frontend engineer always gets a screen and code, an SRE a diagram and
 * a log. "suggest" is what else fits.
 */
export const ROLE_FAMILIES = {
  frontend: {
    label: "Frontend / UI engineer",
    must: [["screen"], ["code"]],
    suggest: "a screen with UX, accessibility or state problems; a code diff of a component",
  },
  backend: {
    label: "Backend engineer",
    must: [["code"], ["log", "table", "diagram"]],
    suggest:
      "a code diff (API, query, job); an error log; query results or a slow-query plan as a table",
  },
  fullstack: {
    label: "Full-stack engineer",
    must: [["screen"], ["code"]],
    suggest: "a screen plus the code behind it; a bug report document",
  },
  mobile: {
    label: "Mobile engineer",
    must: [["screen"], ["code", "log"]],
    suggest: "a mobile screen; a crash log; a release decision as choices",
  },
  devops: {
    label: "DevOps / SRE / platform / cloud engineer",
    must: [["diagram"], ["log", "chart"]],
    suggest: "a system diagram plus an alert log; a latency or error-rate chart",
  },
  qa: {
    label: "QA / test engineer",
    must: [["screen"], ["document", "log"]],
    suggest: "a spec document plus the screen it describes; a flaky-test log",
  },
  security: {
    label: "Security engineer",
    must: [["code"], ["log", "diagram"]],
    suggest:
      "a code diff with a vulnerability; an access log; a diagram with a trust-boundary problem",
  },
  data: {
    label: "Data analyst / data engineer / BI",
    must: [["chart", "table"], ["code"]],
    suggest: "a chart or table where a number doesn't add up; a SQL query or pipeline as code",
  },
  ml: {
    label: "ML / AI engineer, data scientist",
    must: [
      ["chart", "table"],
      ["code", "document"],
    ],
    suggest: "evaluation results that mislead (chart or table); model outputs; AI-written code",
  },
  product: {
    label: "Product manager / product owner",
    must: [["chart", "table"], ["choices"]],
    suggest: "a funnel chart plus customer quotes in a document; features to prioritise as choices",
  },
  design: {
    label: "Product / UX / UI designer",
    must: [["screen"], ["choices", "document"]],
    suggest: "a screen to critique; two directions as choices with research facts",
  },
  business: {
    label: "Business analyst, support, pre-sales, account or delivery manager",
    must: [["document"], ["table", "chart", "choices"]],
    suggest: "a client email, ticket or requirements document with gaps; a table of data; options",
  },
  manager: {
    label: "Engineering manager / team lead",
    must: [["table", "chart"], ["document"]],
    suggest: "team metrics as a table or chart; a message from a team member or a delivery plan",
  },
  other: {
    label: "Any other role (HR, finance, operations, marketing, sales...)",
    must: [["table", "document", "chart"]],
    suggest: "a table, document or chart from that job",
  },
} as const satisfies Record<
  string,
  { label: string; must: readonly (readonly CanvasKind[])[]; suggest: string }
>;
export type RoleFamily = keyof typeof ROLE_FAMILIES;
export const ROLE_FAMILY_IDS = Object.keys(ROLE_FAMILIES) as [RoleFamily, ...RoleFamily[]];

/** The family's must-have kinds that none of the cases show. */
export function missingKinds(family: RoleFamily, used: Iterable<CanvasKind>): string[] {
  const have = new Set(used);
  return ROLE_FAMILIES[family].must
    .filter((group) => !group.some((k) => have.has(k)))
    .map((group) => group.map((k) => `"${k}"`).join(" or "));
}

// ---- ids ----

/**
 * Every id on the canvas, with a short human name for it ("line 7", "the
 * button \"Pay\""). Every part carries its own id, written by the model next
 * to its content (code line 7 is usually "line7"), so the answer key can't
 * drift from what it points at when the model miscounts.
 */
export function canvasIds(canvas: Canvas): Map<string, string> {
  const ids = new Map<string, string>();
  for (const b of canvas) {
    for (const [id, name] of partsOf(b)) ids.set(id, name);
  }
  return ids;
}

/** A block's pointable parts: [id, human name], in order. */
function partsOf(b: CanvasBlock): [string, string][] {
  switch (b.kind) {
    case "screen":
      return b.elements.map((e) => [e.id, `the ${e.type.replace("_", " ")} "${e.label}"`]);
    case "code":
      return b.code.map((l, i) => [l.id, `line ${i + 1}`]);
    case "log":
      return b.log.map((l, i) => [l.id, `log line ${i + 1}`]);
    case "table":
      return b.rows.map((r, i) => [r.id, `row ${i + 1}`]);
    case "chart":
      return b.points.map((p) => [p.id, `the ${p.label} point`]);
    case "diagram":
      return b.nodes.map((n) => [n.id, `"${n.label}"`]);
    case "document":
      return b.sections.map((x, i) => [
        x.id,
        x.heading ? `the "${x.heading}" section` : `section ${i + 1}`,
      ]);
    case "choices":
      return b.options.map((o) => [o.id, `option "${o.label}"`]);
  }
}

// ---- checks ----

/** Rules the model can't be trusted to keep. Each problem is phrased as a fix. */
export function checkCanvas(canvas: Canvas, where: string): string[] {
  const problems: string[] = [];
  const kinds = canvas.map((b) => b.kind);
  if (new Set(kinds).size !== kinds.length)
    problems.push(`${where}: use two different block kinds, not the same kind twice.`);
  const seen = new Set<string>();
  for (const b of canvas) {
    for (const [id] of partsOf(b)) {
      if (seen.has(id))
        problems.push(`${where}: the id "${id}" is used twice. Every part needs its own id.`);
      seen.add(id);
    }
    problems.push(...checkBlock(b, where));
  }
  return problems;
}

/** Source code pasted into prose: an import, a query, a function definition. */
const LOOKS_LIKE_CODE =
  /(^|\n)\s*(import \w+|from \w+ import|SELECT\s.+\sFROM\s|def \w+\(|function \w+\(|const \w+ = )/i;

function checkBlock(b: CanvasBlock, where: string): string[] {
  const p: string[] = [];
  const at = `${where} ${b.kind}`;
  switch (b.kind) {
    case "screen":
      if (b.elements.length < 4) p.push(`${at}: a screen needs at least 4 elements.`);
      break;
    case "code":
      if (b.code.length < 6) p.push(`${at}: show at least 6 lines of code.`);
      if (!b.language.trim()) p.push(`${at}: set the language.`);
      break;
    case "log":
      if (b.log.length < 4) p.push(`${at}: a log needs at least 4 lines.`);
      break;
    case "table":
      if (!b.columns.length || !b.rows.length)
        p.push(`${at}: a table needs columns and at least one row.`);
      if (b.rows.some((r) => r.cells.length !== b.columns.length))
        p.push(`${at}: every row needs exactly as many cells as there are columns.`);
      break;
    case "chart":
      if (b.points.length < 3) p.push(`${at}: a chart needs at least 3 points.`);
      break;
    case "diagram": {
      if (b.nodes.length < 3) p.push(`${at}: a diagram needs at least 3 boxes.`);
      const nodes = new Set(b.nodes.map((n) => n.id));
      const dangling = b.edges.filter((e) => !nodes.has(e.from) || !nodes.has(e.to));
      if (dangling.length)
        p.push(`${at}: every arrow must join two boxes that exist (check from/to ids).`);
      if (!b.edges.length) p.push(`${at}: a diagram needs arrows between its boxes.`);
      break;
    }
    case "document":
      if (!b.sections.length) p.push(`${at}: a document needs at least one section.`);
      if (b.sections.some((x) => LOOKS_LIKE_CODE.test(x.text)))
        p.push(`${at}: code belongs in a "code" block with its own lines, not in a document.`);
      break;
    case "choices":
      if (b.options.length < 2) p.push(`${at}: give at least 2 options.`);
      break;
  }
  return p;
}

// ---- facts stay on screen ----

/**
 * Facts from the canvas that a spoken prompt repeats: numbers, option names,
 * code identifiers. Tools that listen to the call can't help a candidate when
 * the question never says the facts; it only points at the screen.
 */
export function spokenFacts(prompt: string, canvas: Canvas): string[] {
  const said = prompt.toLowerCase();
  const found = new Set<string>();
  const screen = describeCanvas(canvas).replace(/\[[a-z0-9_]+\]/g, " ");
  // Numbers that carry information: 2+ digits, decimals, percentages, money ("4" alone is too common).
  for (const n of screen.match(/₹?\d[\d,]*(?:\.\d+)?%?/g) ?? []) {
    const plain = n.replace(/[₹,%]/g, "");
    if (plain.replace(".", "").length < 2) continue;
    if (new RegExp(`(^|[^\\d])${plain.replace(".", "\\.")}(?![\\d])`).test(said)) found.add(n);
  }
  for (const b of canvas) {
    for (const o of b.options)
      if (o.label.length > 6 && said.includes(o.label.toLowerCase())) found.add(o.label);
    for (const line of b.code)
      for (const id of line.text.match(/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b|\b\w+\(\)/g) ?? [])
        if (said.includes(id.toLowerCase())) found.add(id);
  }
  return [...found];
}

// ---- as text, for the interviewer ----

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

/**
 * The canvas exactly as the candidate sees it, in words, with ids in square
 * brackets. Deterministic: the same canvas always reads the same.
 */
export function describeCanvas(canvas: Canvas): string {
  return canvas.map(describeBlock).join("\n");
}

function describeBlock(b: CanvasBlock): string {
  const lines: string[] = [];
  switch (b.kind) {
    case "screen":
      lines.push(`A ${b.device} screen ${q(b.title)}, top to bottom:`);
      for (const e of b.elements) {
        const traits = [
          e.tone !== "default" && (e.tone === "faint" ? "faint, low-contrast text" : e.tone),
          e.size !== "medium" &&
            `${e.size}${e.type === "button" && e.size === "small" ? " (28 px tall)" : ""}`,
          e.state !== "normal" && e.state,
        ].filter(Boolean);
        const detail = e.detail
          ? ` with ${e.type === "input" ? "value" : "text"} ${q(e.detail)}`
          : "";
        lines.push(
          `  [${e.id}] ${e.type.replace("_", " ")} ${q(e.label)}${detail}${traits.length ? ` (${traits.join(", ")})` : ""}`,
        );
      }
      break;
    case "code": {
      const diff = b.code.some((l) => l.change !== "same");
      lines.push(
        `${diff ? "A pull-request diff" : "Code"} in ${b.language}${b.title ? `, ${q(b.title)}` : ""}${diff ? " (+ added, - removed)" : ""}:`,
      );
      for (const l of b.code) {
        const mark = l.change === "added" ? "+ " : l.change === "removed" ? "- " : diff ? "  " : "";
        lines.push(`  [${l.id}] ${mark}${l.text}`);
      }
      break;
    }
    case "log":
      lines.push(`A log${b.title ? ` ${q(b.title)}` : ""}:`);
      for (const l of b.log) lines.push(`  [${l.id}] ${l.time} ${l.level.toUpperCase()} ${l.text}`);
      break;
    case "table":
      lines.push(`A table${b.title ? ` ${q(b.title)}` : ""}. Columns: ${b.columns.join(" | ")}`);
      for (const r of b.rows) lines.push(`  [${r.id}] ${r.cells.join(" | ")}`);
      break;
    case "chart":
      lines.push(`A ${b.chart} chart ${q(b.title)}${b.unit ? ` (${b.unit})` : ""}:`);
      for (const pt of b.points) lines.push(`  [${pt.id}] ${pt.label}: ${pt.value}`);
      break;
    case "diagram":
      lines.push(`An architecture diagram ${q(b.title)}. Boxes:`);
      for (const n of b.nodes)
        lines.push(`  [${n.id}] ${n.type} ${q(n.label)}${n.detail ? `: ${n.detail}` : ""}`);
      lines.push("  Arrows:");
      for (const e of b.edges)
        lines.push(`  ${e.from} -> ${e.to}${e.label ? ` (${e.label})` : ""}`);
      break;
    case "document":
      lines.push(`A ${b.docType} ${q(b.title)}.`);
      for (const m of b.meta) lines.push(`  ${m.label}: ${m.value}`);
      for (const x of b.sections)
        lines.push(`  [${x.id}] ${x.heading ? `${x.heading}: ` : ""}${x.text}`);
      break;
    case "choices":
      lines.push(`Options to choose between${b.title ? `, ${q(b.title)}` : ""}:`);
      for (const o of b.options)
        lines.push(
          `  [${o.id}] ${q(o.label)}${o.detail ? `: ${o.detail}` : ""}${o.facts.length ? ` (${o.facts.join("; ")})` : ""}`,
        );
      break;
  }
  return lines.join("\n");
}

// ---- diagram layout ----

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
}

export const DIAGRAM = { nodeW: 168, nodeH: 64, colGap: 72, rowGap: 28 } as const;

/**
 * Left-to-right layers: each box sits one column right of everything that
 * points to it, arrows that loop back are ignored for placement, and each
 * column is centred vertically.
 */
export function layoutDiagram(block: Pick<CanvasBlock, "nodes" | "edges">): {
  nodes: PlacedNode[];
  width: number;
  height: number;
} {
  const ids = block.nodes.map((n) => n.id);
  const known = new Set(ids);
  const edges = block.edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const e of edges) outgoing.get(e.from)?.push(e.to);

  // Arrows that point back up the flow (cycles) don't move boxes: find them with a
  // depth-first walk from the boxes nothing points to.
  const back = new Set<string>();
  const state = new Map<string, "open" | "done">();
  const walk = (id: string) => {
    state.set(id, "open");
    for (const to of outgoing.get(id) ?? []) {
      if (state.get(to) === "open") back.add(`${id}>${to}`);
      else if (!state.has(to)) walk(to);
    }
    state.set(id, "done");
  };
  const hasIncoming = new Set(edges.map((e) => e.to));
  for (const id of [...ids.filter((id) => !hasIncoming.has(id)), ...ids])
    if (!state.has(id)) walk(id);

  const incoming = new Map(ids.map((id) => [id, [] as string[]]));
  for (const e of edges) if (!back.has(`${e.from}>${e.to}`)) incoming.get(e.to)?.push(e.from);
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const d = Math.max(-1, ...(incoming.get(id) ?? []).map(depthOf)) + 1;
    depth.set(id, d);
    return d;
  };
  for (const id of ids) depthOf(id);

  const deepest = Math.max(0, ...depth.values());
  const columns: string[][] = Array.from({ length: deepest + 1 }, () => []);
  for (const id of ids) columns[depth.get(id) ?? 0]?.push(id);
  const { nodeW, nodeH, colGap, rowGap } = DIAGRAM;
  const tallest = Math.max(1, ...columns.map((c) => c?.length ?? 0));
  const height = tallest * nodeH + (tallest - 1) * rowGap;
  const nodes: PlacedNode[] = [];
  columns.forEach((col, c) => {
    if (!col) return;
    const colHeight = col.length * nodeH + (col.length - 1) * rowGap;
    col.forEach((id, r) => {
      nodes.push({
        id,
        x: c * (nodeW + colGap),
        y: (height - colHeight) / 2 + r * (nodeH + rowGap),
      });
    });
  });
  const width = columns.length * nodeW + (columns.length - 1) * colGap;
  return { nodes, width, height };
}

// ---- what happens on the canvas during the call ----

/** A moment on the canvas, saved with the transcript so scoring can tie answers to what was on screen. */
export const CANVAS_EVENTS = [
  "case_shown",
  "twist_shown",
  "point",
  "note",
  /** The candidate copied text from the case. */
  "copy",
  /** The candidate left the interview tab; text is how long they were away, in ms. */
  "tab_away",
] as const;
export type CanvasEventKind = (typeof CANVAS_EVENTS)[number];

export interface CanvasEvent {
  seq: number;
  kind: CanvasEventKind;
  /** Which case (1-3). */
  caseNumber: number | null;
  /** Who did it: the interviewer pointing, or the candidate tapping. */
  by: "interviewer" | "candidate";
  ids: string[];
  text: string;
  atMs: number;
}

/** Notes the interviewer writes on the canvas: the candidate's own decisions, short. */
export const MAX_NOTES_PER_CASE = 6;
export const NOTE_MAX_CHARS = 90;
