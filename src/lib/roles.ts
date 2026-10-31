import { z } from "zod";
import type { RoleStatus } from "@/db/schema";

/** What HR types (or dictates with Wispr Flow) to start a role. Shared by the form and the server. */
export const newRoleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Add a role title, like “Backend Engineer”.")
    .max(120, "Keep the title under 120 characters."),
  jobDescription: z
    .string()
    .trim()
    .min(50, "Tell us a bit more: what the person will do, and what good looks like.")
    .max(20_000, "That's too long. Keep it under 20,000 characters."),
});
export type NewRole = z.infer<typeof newRoleSchema>;

export const ROLE_FILTERS = ["all", "active", "review"] as const;
export type RoleFilter = (typeof ROLE_FILTERS)[number];

export function parseRoleFilter(value: unknown): RoleFilter {
  return ROLE_FILTERS.includes(value as RoleFilter) ? (value as RoleFilter) : "all";
}

export const STATUS: Record<
  RoleStatus,
  { label: string; next: string; tone: "neutral" | "active" | "done" }
> = {
  draft: { label: "Draft", next: "Build the interview", tone: "neutral" },
  kit_ready: { label: "Interview ready", next: "Upload resumes", tone: "neutral" },
  collecting: { label: "Collecting resumes", next: "Review the shortlist", tone: "active" },
  interviewing: { label: "Interviewing", next: "Review results", tone: "active" },
  results_ready: { label: "Results ready", next: "Review results", tone: "done" },
  closed: { label: "Closed", next: "View results", tone: "neutral" },
};

/** The next thing HR should do for a role. A draft first needs its JD approved. */
export function nextStep(role: { status: RoleStatus; jdApprovedAt: Date | null }): string {
  if (role.status === "draft" && !role.jdApprovedAt) return "Review the job description";
  return STATUS[role.status].next;
}

/** True once candidates are involved, so the list shows numbers instead of a next step. */
export function hasCandidates(status: RoleStatus): boolean {
  return status !== "draft" && status !== "kit_ready";
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 hours ago", "yesterday", "just now". */
export function timeAgo(date: Date, now = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
