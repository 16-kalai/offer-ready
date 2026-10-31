"use client";

import {
  ChevronRight,
  Cloud,
  Database,
  HardDrive,
  ImageIcon,
  Layers,
  Loader2,
  Monitor,
  Server,
  Smartphone,
  Zap,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef } from "react";
import { type Canvas, type CanvasBlock, DIAGRAM, layoutDiagram } from "@/lib/canvas";
import type { Trap } from "@/lib/integrity";
import { cn } from "@/lib/utils";

/**
 * Draws a case's canvas: the work the candidate looks at. The same view is
 * used in HR's preview and in the live room. Parts the interviewer points at
 * light up (and scroll into view); in the room the candidate can tap a part
 * to point at it themselves.
 */

interface Pointing {
  /** Lit up by the interviewer (or, in HR's preview, by hovering a planted problem). */
  lit: ReadonlySet<string>;
  /** Tapped by the candidate. */
  picked: string | null;
  onPick?: (id: string) => void;
  /** Scroll what lights up into view (the live room; not HR's preview, where hovering would jump). */
  follow: boolean;
  /** The case's canary trap (the live room only). */
  trap: Trap | null;
}

const PointingContext = createContext<Pointing>({
  lit: new Set(),
  picked: null,
  follow: false,
  trap: null,
});

/**
 * Text no person sees (or hears from a screen reader) that still comes along
 * when the case is selected and copied, or read by a screen-reading tool.
 */
function HiddenNote({ text, as: Tag = "span" }: { text: string; as?: "span" | "td" }) {
  return (
    <Tag
      aria-hidden="true"
      className="pointer-events-none absolute size-px overflow-hidden whitespace-pre p-0 opacity-0"
    >
      {text}
    </Tag>
  );
}

export function CanvasView({
  canvas,
  lit = new Set(),
  picked = null,
  onPick,
  follow = false,
  trap = null,
  onCopy,
}: {
  canvas: Canvas;
  lit?: ReadonlySet<string>;
  picked?: string | null;
  onPick?: (id: string) => void;
  follow?: boolean;
  trap?: Trap | null;
  /** Someone copied from the case (the trap is added to what they copied). */
  onCopy?: (chars: number) => void;
}) {
  const copy = (e: React.ClipboardEvent) => {
    const selected = window.getSelection()?.toString() ?? "";
    if (!selected) return;
    onCopy?.(selected.length);
    if (!trap || selected.includes(trap.header)) return;
    // Whatever they copy carries the canary, even a single line.
    e.clipboardData.setData("text/plain", `${trap.header}\n${selected}`);
    e.preventDefault();
  };
  return (
    <PointingContext.Provider value={{ lit, picked, onPick, follow, trap }}>
      <div className="relative space-y-4" onCopy={trap ? copy : undefined}>
        {trap && <HiddenNote text={`${trap.header}\n`} />}
        {canvas.map((block, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a canvas's blocks never reorder.
          <Block key={i} block={block} />
        ))}
      </div>
    </PointingContext.Provider>
  );
}

function Block({ block }: { block: CanvasBlock }) {
  switch (block.kind) {
    case "screen":
      return <ScreenBlock block={block} />;
    case "code":
      return <CodeBlock block={block} />;
    case "log":
      return <LogBlock block={block} />;
    case "table":
      return <TableBlock block={block} />;
    case "chart":
      return <ChartBlock block={block} />;
    case "diagram":
      return <DiagramBlock block={block} />;
    case "document":
      return <DocumentBlock block={block} />;
    case "choices":
      return <ChoicesBlock block={block} />;
  }
}

/**
 * One part of the canvas that can be pointed at. Lit parts get a ring and
 * scroll into view; with onPick, tapping (or Enter) points at it.
 */
function Target({
  id,
  as: Tag = "div",
  className,
  litClassName = "ring-2 ring-amber-400 bg-amber-50/70",
  pickedClassName = "bg-emerald-50 ring-2 ring-emerald-500",
  children,
}: {
  id: string;
  as?: "div" | "li" | "tr" | "span";
  className?: string;
  litClassName?: string;
  pickedClassName?: string;
  children: React.ReactNode;
}) {
  const { lit, picked, onPick, follow, trap } = useContext(PointingContext);
  const ref = useRef<HTMLElement>(null);
  const isLit = lit.has(id);
  useEffect(() => {
    if (isLit && follow) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isLit, follow]);
  const isPicked = picked === id;
  const interactive = onPick !== undefined;
  return (
    <Tag
      // biome-ignore lint/suspicious/noExplicitAny: one ref across the few tag types used.
      ref={ref as any}
      data-canvas-id={id}
      // The part's own look first, so lighting up and picking always win over it.
      className={cn(
        "rounded-md transition-[box-shadow,background-color] duration-300",
        className,
        interactive && "cursor-pointer hover:ring-1 hover:ring-neutral-300",
        isLit && litClassName,
        isPicked && pickedClassName,
      )}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-pressed": isPicked,
            onClick: () => onPick(id),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(id);
              }
            },
          }
        : {})}
    >
      {children}
      {/* A table row holds only cells: there, the note is a cell of its own. */}
      {trap?.targetId === id && <HiddenNote text={trap.inline} as={Tag === "tr" ? "td" : "span"} />}
    </Tag>
  );
}

function Frame({
  title,
  icon: Icon,
  meta,
  dark = false,
  children,
  className,
}: {
  title: string;
  icon?: typeof Monitor;
  meta?: string;
  dark?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl ring-1",
        dark ? "bg-neutral-950 ring-black/10" : "bg-white ring-black/[0.08]",
        className,
      )}
    >
      {(title || meta) && (
        <figcaption
          className={cn(
            "flex items-center gap-2 border-b px-4 py-2.5 text-xs",
            dark
              ? "border-white/10 font-mono text-neutral-400"
              : "border-black/[0.06] bg-neutral-50 font-medium text-neutral-600",
          )}
        >
          {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{title}</span>
          {meta && <span className="ml-auto shrink-0 font-normal opacity-80">{meta}</span>}
        </figcaption>
      )}
      {children}
    </figure>
  );
}

// ---- screen ----

const TONE_TEXT = {
  default: "text-neutral-900",
  primary: "text-neutral-900",
  danger: "text-rose-600",
  muted: "text-neutral-500",
  // Deliberately low contrast: it's how contrast problems are planted.
  faint: "text-neutral-300",
} as const;

function ScreenBlock({ block }: { block: CanvasBlock }) {
  const mobile = block.device === "mobile";
  return (
    <Frame
      title={block.title}
      icon={mobile ? Smartphone : Monitor}
      meta={mobile ? "Mobile" : "Desktop"}
      className="bg-neutral-100"
    >
      <div className="flex justify-center bg-neutral-100 p-4 sm:p-6">
        <div
          className={cn(
            "w-full overflow-hidden bg-white shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)] ring-1 ring-black/10",
            mobile ? "max-w-[340px] rounded-[28px]" : "max-w-2xl rounded-xl",
          )}
        >
          {mobile ? (
            <div className="flex h-6 items-center justify-center">
              <span className="h-1.5 w-14 rounded-full bg-neutral-200" />
            </div>
          ) : (
            <div className="flex h-7 items-center gap-1.5 border-b border-neutral-100 px-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 rounded-full bg-neutral-200" />
              ))}
            </div>
          )}
          <div className="space-y-2.5 px-4 pt-2 pb-5">
            {block.elements.map((e) => (
              <Target key={e.id} id={e.id} className="-mx-1 px-1 py-0.5">
                <ScreenElement e={e} />
              </Target>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function ScreenElement({ e }: { e: CanvasBlock["elements"][number] }) {
  const tone = TONE_TEXT[e.tone];
  const disabled = e.state === "disabled";
  const error = e.state === "error";
  switch (e.type) {
    case "heading":
      return (
        <p
          className={cn(
            "font-semibold tracking-tight",
            e.size === "large" ? "text-xl" : e.size === "small" ? "text-sm" : "text-base",
            tone,
          )}
        >
          {e.label}
          {e.detail && (
            <span className="block text-sm font-normal text-neutral-500">{e.detail}</span>
          )}
        </p>
      );
    case "text":
      return (
        <p
          className={cn(
            e.size === "small" ? "text-[11px]" : e.size === "large" ? "text-base" : "text-[13px]",
            tone,
          )}
        >
          {e.label}
          {e.detail && <span className="block opacity-80">{e.detail}</span>}
        </p>
      );
    case "button": {
      const filled = e.tone === "primary" || e.tone === "danger";
      return (
        <span className="block">
          <span
            className={cn(
              "flex items-center justify-center rounded-lg px-3 font-medium",
              e.size === "small"
                ? "h-7 text-xs"
                : e.size === "large"
                  ? "h-12 text-base"
                  : "h-10 text-sm",
              filled
                ? e.tone === "danger"
                  ? "bg-rose-600 text-white"
                  : "bg-neutral-900 text-white"
                : e.tone === "faint"
                  ? "bg-neutral-50 text-neutral-300"
                  : "bg-white text-neutral-900 ring-1 ring-neutral-300",
              disabled && "opacity-40",
            )}
          >
            {e.state === "loading" && (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
            )}
            {e.label}
          </span>
          {e.detail && (
            <span className="mt-1 block text-center text-[11px] text-neutral-500">{e.detail}</span>
          )}
        </span>
      );
    }
    case "input":
    case "select":
      return (
        <span className="block">
          {e.label && <span className={cn("mb-1 block text-xs font-medium", tone)}>{e.label}</span>}
          <span
            className={cn(
              "flex h-10 items-center justify-between rounded-lg px-3 text-[13px] ring-1",
              error ? "ring-2 ring-rose-500" : "ring-neutral-300",
              disabled && "bg-neutral-50 opacity-60",
            )}
          >
            <span className={e.detail && !error ? "text-neutral-900" : "text-neutral-400"}>
              {error ? "" : e.detail || (e.type === "select" ? "Select…" : "")}
            </span>
            {e.type === "select" && <ChevronRight className="size-4 rotate-90 text-neutral-400" />}
          </span>
          {error && (
            <span className="mt-1 block text-[11px] text-rose-600">{e.detail || "Error"}</span>
          )}
        </span>
      );
    case "checkbox":
    case "toggle":
      return (
        <span
          className={cn("flex items-center gap-2.5 text-[13px]", tone, disabled && "opacity-50")}
        >
          {e.type === "checkbox" ? (
            <span
              className={cn(
                "size-4 shrink-0 rounded ring-1 ring-neutral-400",
                e.state === "selected" && "bg-neutral-900 ring-neutral-900",
              )}
            />
          ) : (
            <span
              className={cn(
                "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5",
                e.state === "selected" ? "justify-end bg-neutral-900" : "bg-neutral-300",
              )}
            >
              <span className="size-4 rounded-full bg-white" />
            </span>
          )}
          <span>
            {e.label}
            {e.detail && <span className="block text-[11px] text-neutral-500">{e.detail}</span>}
          </span>
        </span>
      );
    case "list_row":
      return (
        <span
          className={cn(
            "flex items-center gap-3 border-b border-neutral-100 py-2",
            disabled && "opacity-50",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px] font-medium", tone)}>{e.label}</span>
            {e.detail && (
              <span className="block truncate text-[11px] text-neutral-500">{e.detail}</span>
            )}
          </span>
          <ChevronRight className="size-4 shrink-0 text-neutral-300" />
        </span>
      );
    case "notice":
      return (
        <span
          className={cn(
            "block rounded-lg px-3 py-2 text-[12px]",
            e.tone === "danger"
              ? "bg-rose-50 text-rose-800"
              : e.tone === "faint"
                ? "bg-neutral-50 text-neutral-300"
                : "bg-amber-50 text-amber-900",
          )}
        >
          <span className="font-medium">{e.label}</span>
          {e.detail && <span className="block">{e.detail}</span>}
        </span>
      );
    case "badge":
      return (
        <span
          className={cn(
            "inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium",
            tone,
          )}
        >
          {e.label}
        </span>
      );
    case "link":
      return (
        <span
          className={cn(
            "text-[13px] underline underline-offset-2",
            e.tone === "default" ? "text-sky-700" : tone,
          )}
        >
          {e.label}
        </span>
      );
    case "image":
      return (
        <span className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg bg-neutral-100 text-[11px] text-neutral-500">
          <ImageIcon className="size-5" aria-hidden="true" />
          {e.label}
        </span>
      );
    case "tabs":
      return (
        <span className="flex gap-1 rounded-lg bg-neutral-100 p-1 text-[12px]">
          {e.label.split("|").map((t, i) => (
            <span
              key={t}
              className={cn(
                "flex-1 rounded-md py-1 text-center",
                i === 0 ? "bg-white font-medium shadow-sm" : "text-neutral-500",
              )}
            >
              {t.trim()}
            </span>
          ))}
        </span>
      );
    case "divider":
      return <span className="my-1 block h-px bg-neutral-200" />;
  }
}

// ---- code ----

/** On the dark code and log blocks: a tinted row with a coloured edge, so the text stays readable. */
const DARK_LIT = "bg-amber-400/20 shadow-[inset_3px_0_0_rgb(251_191_36)]";
const DARK_PICKED = "bg-emerald-400/20 shadow-[inset_3px_0_0_rgb(52_211_153)]";

function CodeBlock({ block }: { block: CanvasBlock }) {
  const diff = block.code.some((l) => l.change !== "same");
  return (
    <Frame
      title={block.title || "code"}
      meta={diff ? `${block.language} · diff` : block.language}
      dark
    >
      <div className="overflow-x-auto py-2 font-mono text-[12.5px] leading-[1.7]">
        {block.code.map((line, i) => (
          <Target
            key={line.id}
            id={line.id}
            className="flex min-w-max rounded-none"
            litClassName={DARK_LIT}
            pickedClassName={DARK_PICKED}
          >
            <span className="w-10 shrink-0 pr-3 text-right text-neutral-600 select-none">
              {i + 1}
            </span>
            <span
              className={cn(
                "w-4 shrink-0 select-none",
                line.change === "added"
                  ? "text-emerald-400"
                  : line.change === "removed"
                    ? "text-rose-400"
                    : "",
              )}
            >
              {line.change === "added" ? "+" : line.change === "removed" ? "-" : ""}
            </span>
            <span
              className={cn(
                "pr-4 whitespace-pre",
                line.change === "added"
                  ? "text-emerald-200"
                  : line.change === "removed"
                    ? "text-rose-300 line-through decoration-rose-400/40"
                    : "text-neutral-100",
              )}
            >
              {line.text || " "}
            </span>
          </Target>
        ))}
      </div>
    </Frame>
  );
}

// ---- log ----

function LogBlock({ block }: { block: CanvasBlock }) {
  return (
    <Frame title={block.title || "log"} dark>
      <div className="overflow-x-auto py-2 font-mono text-[12px] leading-[1.75]">
        {block.log.map((line) => (
          <Target
            key={line.id}
            id={line.id}
            className="flex min-w-max gap-3 rounded-none px-4"
            litClassName={DARK_LIT}
            pickedClassName={DARK_PICKED}
          >
            <span className="shrink-0 text-neutral-500">{line.time}</span>
            <span
              className={cn(
                "w-11 shrink-0 font-semibold",
                line.level === "error"
                  ? "text-rose-400"
                  : line.level === "warn"
                    ? "text-amber-300"
                    : "text-sky-300",
              )}
            >
              {line.level.toUpperCase()}
            </span>
            <span className="whitespace-pre text-neutral-100">{line.text}</span>
          </Target>
        ))}
      </div>
    </Frame>
  );
}

// ---- table ----

function TableBlock({ block }: { block: CanvasBlock }) {
  return (
    <Frame title={block.title} icon={Layers}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50/60 text-left text-xs text-neutral-500">
            <tr>
              {block.columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {block.rows.map((row) => (
              <Target
                key={row.id}
                id={row.id}
                as="tr"
                className="rounded-none border-t border-neutral-100"
                litClassName="bg-amber-50 shadow-[inset_3px_0_0_rgb(251_191_36)]"
              >
                {row.cells.map((cell, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional.
                  <td key={i} className="px-3 py-2 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </Target>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

// ---- chart ----

function ChartBlock({ block }: { block: CanvasBlock }) {
  const { lit, picked } = useContext(PointingContext);
  const values = block.points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const fmt = (v: number) => `${v.toLocaleString("en-IN")}${block.unit ? ` ${block.unit}` : ""}`;

  if (block.chart === "funnel") {
    return (
      <Frame title={block.title} meta={block.unit}>
        <div className="space-y-1.5 p-4">
          {block.points.map((p, i) => (
            <Target key={p.id} id={p.id} className="flex items-center gap-3 px-1 py-0.5">
              <span className="w-28 shrink-0 truncate text-xs text-neutral-600">{p.label}</span>
              <span className="h-6 flex-1">
                <span
                  className="flex h-full items-center rounded bg-neutral-800 px-2 text-[11px] font-medium text-white tabular-nums"
                  style={{ width: `${Math.max(6, (p.value / (max || 1)) * 100)}%` }}
                >
                  {p.value.toLocaleString("en-IN")}
                </span>
              </span>
              {i > 0 && (block.points[i - 1]?.value ?? 0) > 0 && (
                <span className="w-12 shrink-0 text-right text-[11px] text-neutral-500 tabular-nums">
                  {Math.round((p.value / (block.points[i - 1]?.value ?? 1)) * 100)}%
                </span>
              )}
            </Target>
          ))}
        </div>
      </Frame>
    );
  }

  const W = 560;
  const H = 220;
  const pad = { l: 48, r: 12, t: 14, b: 34 };
  const n = block.points.length;
  const x = (i: number) =>
    block.chart === "bar"
      ? pad.l + ((i + 0.5) * (W - pad.l - pad.r)) / n
      : pad.l + (n === 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const ticks = [min, min + span / 2, max];
  const barW = Math.min(40, ((W - pad.l - pad.r) / n) * 0.6);

  return (
    <Frame title={block.title} meta={block.unit}>
      <div className="p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mx-auto max-h-60 w-full"
          role="img"
          aria-label={block.title}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-neutral-100" />
              <text
                x={pad.l - 6}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-neutral-400 text-[10px]"
              >
                {Math.round(t).toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {block.chart === "line" && (
            <polyline
              points={block.points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
              fill="none"
              className="stroke-neutral-900"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}
          {block.points.map((p, i) => {
            const id = p.id;
            const on = lit.has(id) || picked === id;
            return (
              <g key={id}>
                {block.chart === "bar" ? (
                  <rect
                    x={x(i) - barW / 2}
                    width={barW}
                    y={Math.min(y(p.value), y(0))}
                    height={Math.max(1, Math.abs(y(0) - y(p.value)))}
                    rx={3}
                    className={on ? "fill-amber-400" : "fill-neutral-800"}
                  />
                ) : (
                  <circle
                    cx={x(i)}
                    cy={y(p.value)}
                    r={on ? 7 : 3.5}
                    className={cn(
                      on ? "fill-amber-400 stroke-amber-600" : "fill-white stroke-neutral-900",
                    )}
                    strokeWidth={2}
                  />
                )}
                {on && (
                  <text
                    x={x(i)}
                    y={y(p.value) - 12}
                    textAnchor="middle"
                    className="fill-neutral-900 text-[11px] font-semibold"
                  >
                    {fmt(p.value)}
                  </text>
                )}
                <text
                  x={x(i)}
                  y={H - 12}
                  textAnchor="middle"
                  className="fill-neutral-500 text-[10px]"
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
        <ChartPoints block={block} />
      </div>
    </Frame>
  );
}

/** The chart's values as tappable chips, so any point can be pointed at (and read exactly). */
function ChartPoints({ block }: { block: CanvasBlock }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {block.points.map((p) => (
        <Target
          key={p.id}
          id={p.id}
          as="span"
          className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700 tabular-nums"
          litClassName="bg-amber-100 ring-1 ring-amber-400"
        >
          {p.label}: {p.value.toLocaleString("en-IN")}
        </Target>
      ))}
    </div>
  );
}

// ---- diagram ----

const NODE_ICON = {
  client: Smartphone,
  service: Server,
  database: Database,
  queue: Layers,
  cache: Zap,
  external: Cloud,
  storage: HardDrive,
} as const;

function DiagramBlock({ block }: { block: CanvasBlock }) {
  const { lit, picked } = useContext(PointingContext);
  const layout = layoutDiagram(block);
  const at = new Map(layout.nodes.map((n) => [n.id, n]));
  const { nodeW, nodeH } = DIAGRAM;
  const pad = 16;
  const W = layout.width + pad * 2;
  const H = layout.height + pad * 2;
  return (
    <Frame title={block.title} icon={Server}>
      <div className="overflow-x-auto p-3">
        <div className="relative mx-auto" style={{ width: W, height: H }}>
          <svg width={W} height={H} className="absolute inset-0" aria-hidden="true">
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-neutral-400" />
              </marker>
            </defs>
            {block.edges.map((e) => {
              const a = at.get(e.from);
              const b = at.get(e.to);
              if (!a || !b) return null;
              const forward = b.x > a.x;
              const x1 = pad + a.x + (forward ? nodeW : nodeW / 2);
              const y1 = pad + a.y + (forward ? nodeH / 2 : nodeH);
              const x2 = pad + b.x + (forward ? 0 : nodeW / 2);
              const y2 = pad + b.y + (forward ? nodeH / 2 : 0);
              const mx = (x1 + x2) / 2;
              const path = forward
                ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
                : `M${x1},${y1} C${x1},${y1 + 40} ${x2},${y2 - 40} ${x2},${y2}`;
              const on = [e.from, e.to].every((id) => lit.has(id) || picked === id);
              return (
                <g key={`${e.from}-${e.to}-${e.label}`}>
                  <path
                    d={path}
                    fill="none"
                    className={on ? "stroke-amber-500" : "stroke-neutral-300"}
                    strokeWidth={on ? 2.5 : 1.5}
                    markerEnd="url(#arrow)"
                  />
                  {e.label && (
                    <text
                      x={mx}
                      y={(y1 + y2) / 2 - 6}
                      textAnchor="middle"
                      className="fill-neutral-500 text-[10px]"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {block.nodes.map((node) => {
            const p = at.get(node.id);
            if (!p) return null;
            const Icon = NODE_ICON[node.type];
            return (
              <div
                key={node.id}
                className="absolute"
                style={{ left: pad + p.x, top: pad + p.y, width: nodeW, height: nodeH }}
              >
                <Target
                  id={node.id}
                  className="flex h-full items-center gap-2.5 rounded-xl bg-white px-3 ring-1 ring-neutral-300"
                  litClassName="ring-2 ring-amber-400 bg-amber-50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                    <Icon className="size-4 text-neutral-700" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-neutral-900">
                      {node.label}
                    </span>
                    {node.detail && (
                      <span className="line-clamp-2 block text-[10.5px] leading-tight text-neutral-500">
                        {node.detail}
                      </span>
                    )}
                  </span>
                </Target>
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}

// ---- document ----

const DOC_LABEL = {
  email: "Email",
  ticket: "Ticket",
  spec: "Spec",
  chat: "Chat",
  report: "Report",
  note: "Note",
} as const;

function DocumentBlock({ block }: { block: CanvasBlock }) {
  return (
    <Frame title={block.title} meta={DOC_LABEL[block.docType]}>
      {block.meta.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b border-neutral-100 px-5 py-3 text-[13px]">
          {block.meta.map((m) => (
            <div key={m.label} className="contents">
              <dt className="text-neutral-500">{m.label}</dt>
              <dd className="text-neutral-900">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="space-y-1 px-3 py-3">
        {block.sections.map((s) => (
          <Target key={s.id} id={s.id} className="px-2 py-1.5">
            {s.heading && <p className="text-[13px] font-semibold text-neutral-900">{s.heading}</p>}
            <p className="text-[14px] leading-relaxed whitespace-pre-line text-neutral-800">
              {s.text}
            </p>
          </Target>
        ))}
      </div>
    </Frame>
  );
}

// ---- choices ----

function ChoicesBlock({ block }: { block: CanvasBlock }) {
  return (
    <Frame title={block.title || "Options"}>
      <div
        className={cn(
          "grid gap-3 p-4",
          block.options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {block.options.map((o, i) => (
          <Target
            key={o.id}
            id={o.id}
            className="rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200"
            litClassName="ring-2 ring-amber-400 bg-amber-50"
          >
            <p className="text-xs font-semibold text-neutral-500">
              Option {String.fromCharCode(65 + i)}
            </p>
            <p className="mt-1 font-semibold text-neutral-900">{o.label}</p>
            {o.detail && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-700">{o.detail}</p>
            )}
            {o.facts.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12.5px] text-neutral-700">
                {o.facts.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-neutral-400" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </Target>
        ))}
      </div>
    </Frame>
  );
}
