import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CanvasEventKind } from "@/lib/canvas";
import type {
  CompanyIntel,
  DayContent,
  DrillResult,
  LaunchKit,
  LevelQuestion,
  ProofIdea,
  ReadinessRound,
  TrainingPlan,
} from "@/lib/coach/types";
import type { AnswerMetrics } from "@/lib/integrity";
import type { Blueprint, CandidatePlan } from "@/lib/interview";
import type { RoomPart, SessionSignals } from "@/lib/interview-room";
import type { Kit, KitSkill } from "@/lib/kit";
import type { MatchResult } from "@/lib/matching/score";
import type { InterviewReport } from "@/lib/report";
import type { JobDescription, RoleBrief } from "@/lib/role-brief";

/**
 * Sign-in tables, in the shape Better Auth expects (user, session, account,
 * verification). Column names are snake_case in Postgres.
 */
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

/** Linked sign-in providers (Google). Tokens are kept only as long as the provider allows. */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

/** Short-lived values such as OAuth state. */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * Sign-in rate limits, shared by every server instance (in-memory counters
 * would reset per instance and let an attacker spread guesses across them).
 */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/**
 * Uploaded files (resumes) where there's no shared disk: the web app and the
 * worker run on different hosts. Behind the BlobStore interface, so object
 * storage can replace it without touching callers.
 */
export const blobs = pgTable("blobs", {
  key: text("key").primaryKey(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  createdAt: createdAt(),
});

/** Fixed-window limits for app actions (e.g. creating roles), per user, shared by every instance. */
export const actionRateLimit = pgTable("action_rate_limit", {
  key: text("key").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  count: integer("count").notNull(),
});

/** Where a role is in the hiring flow. Order matches the flow. */
export const roleStatus = pgEnum("role_status", [
  "draft",
  "kit_ready",
  "collecting",
  "interviewing",
  "results_ready",
  "closed",
]);

/**
 * A role being hired for: the job description and its progress. Counters are
 * kept on the row (updated as candidates move) so the home page never counts
 * thousands of candidates on every load.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The company the candidate is preparing for (Offer Ready: one hidden role per goal). */
    companyName: text("company_name"),
    /** Plain-text JD (rendered from `jd`, or pasted by HR). Used by later steps. */
    jobDescription: text("job_description").notNull(),
    /** What HR picked in the role builder. Null when HR pasted their own JD. */
    brief: jsonb("brief").$type<RoleBrief>(),
    /** The structured JD HR reviews and edits. Null when pasted. */
    jd: jsonb("jd").$type<JobDescription>(),
    jdModel: text("jd_model"),
    /** Set when HR approves the JD; the interview kit is built only after this. */
    jdApprovedAt: timestamp("jd_approved_at", { withTimezone: true }),
    /** Deprecated: the old shared kit, replaced by per-candidate plans. Kept until a cleanup migration. */
    kit: jsonb("kit").$type<Kit & { skills: KitSkill[] }>(),
    kitModel: text("kit_model"),
    /** How every candidate's interview is built (structure, depth, skills). Their questions are personal. */
    blueprint: jsonb("blueprint").$type<Blueprint>(),
    /** When HR approved the interview (the blueprint). Invites can only go out after this. */
    kitApprovedAt: timestamp("kit_approved_at", { withTimezone: true }),
    status: roleStatus("status").notNull().default("draft"),
    appliedCount: integer("applied_count").notNull().default(0),
    invitedCount: integer("invited_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    toReviewCount: integer("to_review_count").notNull().default(0),
    shortlistedCount: integer("shortlisted_count").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // Home lists a user's roles by recent activity, paged by (last_activity_at, id).
  (t) => [index("roles_owner_activity_idx").on(t.ownerId, t.lastActivityAt.desc(), t.id.desc())],
);

export type Role = typeof roles.$inferSelect;
export type RoleStatus = (typeof roleStatus.enumValues)[number];

/**
 * The hiring workspace: what candidates see (company, sender, reply-to) and
 * the consent HR gave to process candidate data. One per owner for now;
 * teams later add members without changing this table.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  website: text("website"),
  senderName: text("sender_name").notNull(),
  replyToEmail: text("reply_to_email").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  consentVersion: text("consent_version").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type Workspace = typeof workspaces.$inferSelect;

/** Things that happened, newest first on the home timeline. Append-only. */
export const activityKind = pgEnum("activity_kind", [
  "role_created",
  "jd_approved",
  "kit_ready",
  "resumes_added",
  "invites_sent",
  "interview_completed",
  "candidate_advanced",
  "candidate_held",
  "candidate_declined",
  "role_closed",
  "accommodation_requested",
  "new_link_requested",
]);

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").references(() => roles.id, { onDelete: "cascade" }),
    kind: activityKind("kind").notNull(),
    /** Small, kind-specific details, e.g. { count: 186 } or { candidate: "Ananya Rao" }. */
    data: jsonb("data")
      .$type<{ count?: number; candidate?: string; note?: string }>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_owner_created_idx").on(t.ownerId, t.createdAt.desc())],
);

export type ActivityKind = (typeof activityKind.enumValues)[number];

/** Where a resume is in processing. "duplicate" = same person (email) already in this role. */
export const candidateStatus = pgEnum("candidate_status", [
  "queued",
  "reading",
  "scored",
  "failed",
  "duplicate",
]);

/** What HR decided after reading the interview report. */
export const HIRING_DECISIONS = ["advance", "hold", "decline"] as const;
export const hiringDecision = pgEnum("hiring_decision", HIRING_DECISIONS);
export type HiringDecision = (typeof HIRING_DECISIONS)[number];

/**
 * One uploaded resume for one role, and its match. Files are stored by content
 * hash, so re-uploading the same file is a no-op.
 */
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileKey: text("file_key").notNull(),
    fileSha256: text("file_sha256").notNull(),
    fileSize: integer("file_size").notNull(),
    fileType: text("file_type").$type<"pdf" | "docx">().notNull(),
    status: candidateStatus("status").notNull().default("queued"),
    error: text("error"),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    years: real("years"),
    currentTitle: text("current_title"),
    match: jsonb("match").$type<MatchResult>(),
    score: integer("score"),
    shortlisted: boolean("shortlisted").notNull().default(false),
    duplicateOf: uuid("duplicate_of"),
    /** HR's call after the interview. History lives in the activity feed. */
    decision: hiringDecision("decision"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("candidates_role_file_idx").on(t.roleId, t.fileSha256),
    index("candidates_role_score_idx").on(t.roleId, t.score.desc()),
    index("candidates_role_status_idx").on(t.roleId, t.status),
    index("candidates_role_email_idx").on(t.roleId, t.email),
    index("candidates_role_decision_idx").on(t.roleId, t.decision),
  ],
);

export type Candidate = typeof candidates.$inferSelect;

/** Invitation lifecycle. Email delivery and candidate progress in one place. */
export const invitationStatus = pgEnum("invitation_status", [
  "queued",
  "sending",
  "sent",
  "failed",
  "opened",
  "started",
  "completed",
  "incomplete",
  "expired",
  "cancelled",
]);

/**
 * One interview invitation per candidate, which is also the email outbox row.
 * The secret link is created by the worker at send time and only its SHA-256
 * is stored, so neither the database nor the job queue holds a usable link.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .unique()
      .references(() => candidates.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    channel: text("channel").$type<"gmail" | "dev">().notNull(),
    status: invitationStatus("status").notNull().default("queued"),
    tokenHash: text("token_hash").unique(),
    /**
     * Links from earlier emails (each reminder carries a fresh link). They keep
     * working, so a candidate who opens the first email after a reminder isn't
     * told their link is invalid. Cancelling the invite stops them all.
     */
    previousTokenHashes: text("previous_token_hashes").array().notNull().default(sql`'{}'::text[]`),
    expiresInHours: integer("expires_in_hours").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    /** Reminders sent (manual nudges + the automatic one). Capped to protect candidates and HR's Gmail. */
    nudgeCount: integer("nudge_count").notNull().default(0),
    lastNudgedAt: timestamp("last_nudged_at", { withTimezone: true }),
    /** From the candidate: extra time or another format. HR sees it in their updates. */
    accommodationNote: text("accommodation_note"),
    accommodationAt: timestamp("accommodation_at", { withTimezone: true }),
    /** From the candidate, on an expired link. */
    newLinkRequestedAt: timestamp("new_link_requested_at", { withTimezone: true }),
    error: text("error"),
    providerMessageId: text("provider_message_id"),
    /** Dev channel only: the rendered email, for /dev/mailbox. Never stored for real sends. */
    devPreview: jsonb("dev_preview").$type<{
      subject: string;
      html: string;
      text: string;
      from: string;
    }>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("invitations_role_status_idx").on(t.roleId, t.status),
    index("invitations_owner_sent_idx").on(t.ownerId, t.sentAt),
    index("invitations_previous_tokens_idx").using("gin", t.previousTokenHashes),
  ],
);

export type Invitation = typeof invitations.$inferSelect;

export const planStatus = pgEnum("plan_status", ["pending", "ready", "failed"]);

/**
 * One candidate's personal interview: questions about their own projects and
 * three cases set in their domain, written from their (de-identified) resume
 * within the role's blueprint. The blueprint used is saved with the plan, so
 * scoring later judges against exactly what was asked.
 */
export const candidateInterviews = pgTable(
  "candidate_interviews",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    candidateId: uuid("candidate_id")
      .notNull()
      .unique()
      .references(() => candidates.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: planStatus("status").notNull().default("pending"),
    plan: jsonb("plan").$type<CandidatePlan>(),
    blueprint: jsonb("blueprint").$type<Blueprint>().notNull(),
    model: text("model"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("candidate_interviews_role_idx").on(t.roleId, t.status)],
);

export type CandidateInterview = typeof candidateInterviews.$inferSelect;

export const sessionStatus = pgEnum("session_status", [
  "consented",
  "live",
  "completed",
  "incomplete",
]);

/**
 * One candidate's live interview: one attempt per invitation. The candidate
 * never signs up; the emailed link is the key and this row is the attempt.
 * Time is kept here, on the server: the browser's clock is only a display.
 */
export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    invitationId: uuid("invitation_id")
      .notNull()
      .unique()
      .references(() => invitations.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: sessionStatus("status").notNull().default("consented"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    /** First Live connection: the practice question starts here. */
    firstConnectAt: timestamp("first_connect_at", { withTimezone: true }),
    /** When the scored part began (after the practice question). */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** Hard end. Moves later only to give back time lost to a dropped connection. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    endReason: text("end_reason").$type<"finished" | "time_up" | "candidate_ended" | "abandoned">(),
    part: text("part").$type<RoomPart>().notNull().default("practice"),
    /** Cases shown so far (0–3). A case's document reaches the browser only when the interviewer opens it. */
    revealedCases: integer("revealed_cases").notNull().default(0),
    twistRevealed: boolean("twist_revealed").notNull().default(false),
    lastRevealAt: timestamp("last_reveal_at", { withTimezone: true }),
    /** SHA-256 of the browser's device cookie: one device at a time. */
    deviceHash: text("device_hash"),
    /** Gemini Live resumption handle (valid about 2 hours), so a reconnect keeps the conversation. */
    resumeHandle: text("resume_handle"),
    /** Time given back after disconnects, capped. */
    extendedMs: integer("extended_ms").notNull().default(0),
    connects: integer("connects").notNull().default(0),
    /** Soft signals for HR (never an automatic decision). */
    signals: jsonb("signals").$type<SessionSignals>().notNull().default({}),
    model: text("model"),
    /** The candidate's 1–5 rating of the experience, from the done page. */
    rating: integer("rating"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("interview_sessions_role_status_idx").on(t.roleId, t.status),
    // The sweep for abandoned calls.
    index("interview_sessions_status_seen_idx").on(t.status, t.lastSeenAt),
  ],
);

export type InterviewSession = typeof interviewSessions.$inferSelect;

/**
 * What was said, turn by turn. The browser sends turns with its own sequence
 * number, so a retried upload never duplicates a line.
 */
export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    speaker: text("speaker").$type<"interviewer" | "candidate">().notNull(),
    part: text("part").$type<RoomPart>().notNull(),
    text: text("text").notNull(),
    /** Milliseconds since the session's first connection. */
    atMs: integer("at_ms").notNull(),
    /** Candidate answers: how the answer was given (context for HR, never a verdict on its own). */
    metrics: jsonb("metrics").$type<AnswerMetrics>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("transcript_turns_session_seq_idx").on(t.sessionId, t.seq)],
);

export type TranscriptTurn = typeof transcriptTurns.$inferSelect;

/**
 * What happened on the interview canvas, in order: a case shown, the twist,
 * the interviewer or candidate pointing at part of it, a decision noted.
 * Scoring ties answers to what was on screen ("found the planted bug
 * unprompted at 9:42"). Idempotent per (session, seq), like the transcript.
 */
export const canvasEvents = pgTable(
  "canvas_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind").$type<CanvasEventKind>().notNull(),
    caseNumber: integer("case_number"),
    by: text("by").$type<"interviewer" | "candidate">().notNull(),
    ids: jsonb("ids").$type<string[]>().notNull().default([]),
    text: text("text").notNull().default(""),
    /** Milliseconds since the session's first connection. */
    atMs: integer("at_ms").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("canvas_events_session_seq_idx").on(t.sessionId, t.seq)],
);

export type CanvasEventRow = typeof canvasEvents.$inferSelect;

export const reportStatus = pgEnum("report_status", ["pending", "ready", "failed"]);

/**
 * One report per finished interview: the AI's draft of how the candidate
 * thinks, with quotes as evidence, plus integrity notes. Written by a
 * background job when the interview ends; rewritten if scoring changes
 * (the version says which scoring wrote it).
 */
export const interviewReports = pgTable(
  "interview_reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid("session_id")
      .notNull()
      .unique()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: reportStatus("status").notNull().default("pending"),
    report: jsonb("report").$type<InterviewReport>(),
    version: text("version"),
    model: text("model"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("interview_reports_role_idx").on(t.roleId, t.status),
    index("interview_reports_candidate_idx").on(t.candidateId),
  ],
);

export type InterviewReportRow = typeof interviewReports.$inferSelect;

/* ───────────────────────── Offer Ready: the candidate's side ───────────────────────── */

export const jobStatus = pgEnum("job_status", ["pending", "ready", "failed"]);

/**
 * One target job a candidate is preparing for: the JD, their resume and the
 * hidden Werdict role that runs their mock interviews. Everything else in the
 * journey hangs off this row.
 */
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    roleTitle: text("role_title").notNull(),
    jobDescription: text("job_description").notNull(),
    resumeText: text("resume_text").notNull(),
    resumeKey: text("resume_key").notNull(),
    resumeFileType: text("resume_file_type").$type<"pdf" | "docx">().notNull(),
    resumeSha256: text("resume_sha256").notNull(),
    /** The shared research this goal reads (company + role cluster). */
    intelKey: text("intel_key").notNull(),
    interviewDate: timestamp("interview_date", { withTimezone: true }),
    minutesPerDay: integer("minutes_per_day").notNull().default(30),
    /** From the level check; sets how hard the mock interviews are. */
    level: text("level").$type<"fresher" | "mid" | "senior">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_owner_created_idx").on(t.ownerId, t.createdAt.desc())],
);
export type Goal = typeof goals.$inferSelect;

/**
 * How a company hires for a kind of role, and the problems it's publicly
 * facing, researched once with Google Search grounding and shared by every
 * candidate targeting it. Refreshed when stale.
 */
export const companyIntel = pgTable("company_intel", {
  key: text("key").primaryKey(),
  companyName: text("company_name").notNull(),
  roleCluster: text("role_cluster").notNull(),
  status: jobStatus("status").notNull().default("pending"),
  intel: jsonb("intel").$type<CompanyIntel>(),
  model: text("model"),
  error: text("error"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type CompanyIntelRow = typeof companyIntel.$inferSelect;

/** The adaptive level check: a bank of questions by tier, and what the candidate answered. */
export const levelChecks = pgTable("level_checks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: uuid("goal_id")
    .notNull()
    .unique()
    .references(() => goals.id, { onDelete: "cascade" }),
  status: jobStatus("status").notNull().default("pending"),
  questions: jsonb("questions").$type<LevelQuestion[]>(),
  answers: jsonb("answers")
    .$type<{ id: string; choice: number; correct: boolean; tier: number }[]>()
    .notNull()
    .default([]),
  score: real("score"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type LevelCheck = typeof levelChecks.$inferSelect;

/** A mock interview: one hidden Werdict candidate + invitation, so the voice room runs unchanged. */
export const mocks = pgTable(
  "mocks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"baseline" | "defense">().notNull(),
    candidateId: uuid("candidate_id")
      .notNull()
      .unique()
      .references(() => candidates.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    /** The resume the interview is written from (the defense adds the proof project). */
    resumeText: text("resume_text").notNull(),
    /** The defense: the project the interviewer must question first. */
    focus: text("focus"),
    createdAt: createdAt(),
  },
  (t) => [index("mocks_goal_idx").on(t.goalId, t.createdAt)],
);
export type Mock = typeof mocks.$inferSelect;

/** Readiness over time, for the ring and its history. Append-only. */
export const readinessSnapshots = pgTable(
  "readiness_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    source: text("source").$type<"level" | "baseline" | "drill" | "defense">().notNull(),
    overall: integer("overall").notNull(),
    rounds: jsonb("rounds").$type<ReadinessRound[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("readiness_goal_created_idx").on(t.goalId, t.createdAt)],
);

/** The training plan: days, each with a focus. A day's drills are written when it's opened. */
export const trainingPlans = pgTable("training_plans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: uuid("goal_id")
    .notNull()
    .unique()
    .references(() => goals.id, { onDelete: "cascade" }),
  status: jobStatus("status").notNull().default("pending"),
  plan: jsonb("plan").$type<TrainingPlan>(),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const planDays = pgTable(
  "plan_days",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    content: jsonb("content").$type<DayContent>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("plan_days_goal_day_idx").on(t.goalId, t.day)],
);
export type PlanDay = typeof planDays.$inferSelect;

/** One graded attempt at a drill or spoken answer. The latest per item counts. */
export const drillAttempts = pgTable(
  "drill_attempts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    item: text("item").notNull(),
    result: jsonb("result").$type<DrillResult>().notNull(),
    score: real("score").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("drill_attempts_goal_idx").on(t.goalId, t.day, t.item)],
);

/** Three project ideas from the company's own public problems. */
export const proofIdeas = pgTable("proof_ideas", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: uuid("goal_id")
    .notNull()
    .unique()
    .references(() => goals.id, { onDelete: "cascade" }),
  status: jobStatus("status").notNull().default("pending"),
  ideas: jsonb("ideas").$type<ProofIdea[]>(),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The project the candidate builds, its links and their judgment trail. */
export const proofProjects = pgTable(
  "proof_projects",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    goalId: uuid("goal_id")
      .notNull()
      .unique()
      .references(() => goals.id, { onDelete: "cascade" }),
    /** For slot limits: how many candidates build the same idea for the same company. */
    companyKey: text("company_key").notNull(),
    ideaKey: text("idea_key").notNull(),
    idea: jsonb("idea").$type<ProofIdea>().notNull(),
    repoUrl: text("repo_url"),
    demoUrl: text("demo_url"),
    summary: text("summary").notNull().default(""),
    milestonesDone: jsonb("milestones_done").$type<number[]>().notNull().default([]),
    trail: jsonb("trail")
      .$type<{ at: string; aiSaid: string; iDid: string; why: string }[]>()
      .notNull()
      .default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("proof_projects_slot_idx").on(t.companyKey, t.ideaKey)],
);
export type ProofProject = typeof proofProjects.$inferSelect;

/** The public Proof Page and everything needed to promote it. */
export const proofPacks = pgTable("proof_packs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: uuid("goal_id")
    .notNull()
    .unique()
    .references(() => goals.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  status: jobStatus("status").notNull().default("pending"),
  kit: jsonb("kit").$type<LaunchKit>(),
  videoKey: text("video_key"),
  videoUrl: text("video_url"),
  contactUrl: text("contact_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type ProofPack = typeof proofPacks.$inferSelect;

/** One tracked link per channel or person, so the candidate sees who opened what. */
export const packLinks = pgTable(
  "pack_links",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    packId: uuid("pack_id")
      .notNull()
      .references(() => proofPacks.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    channel: text("channel").$type<"post" | "dm" | "referral" | "resume" | "other">().notNull(),
    label: text("label").notNull(),
    replied: boolean("replied").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("pack_links_pack_idx").on(t.packId)],
);
export type PackLink = typeof packLinks.$inferSelect;

/** What viewers did on a Proof Page. Append-only; read newest first. */
export const packEvents = pgTable(
  "pack_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    packId: uuid("pack_id")
      .notNull()
      .references(() => proofPacks.id, { onDelete: "cascade" }),
    linkId: uuid("link_id").references(() => packLinks.id, { onDelete: "set null" }),
    /** One id per page view, so watch time updates the same view. */
    viewId: text("view_id").notNull(),
    kind: text("kind").$type<"open" | "watch" | "build" | "contact">().notNull(),
    value: integer("value").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("pack_events_pack_created_idx").on(t.packId, t.createdAt.desc()),
    uniqueIndex("pack_events_view_kind_idx").on(t.viewId, t.kind),
  ],
);
