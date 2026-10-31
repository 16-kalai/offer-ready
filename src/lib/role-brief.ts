import { z } from "zod";

/**
 * The few facts HR picks to describe a role. Werdict writes the job
 * description from these; HR reviews it before anything else happens.
 */

export const EXPERIENCE = [
  { value: "0-1", label: "Fresher", hint: "0–1 yrs" },
  { value: "1-3", label: "1–3 yrs" },
  { value: "3-5", label: "3–5 yrs" },
  { value: "5-8", label: "5–8 yrs" },
  { value: "8+", label: "8+ yrs" },
] as const;

export const WORK_MODES = [
  { value: "onsite", label: "Onsite" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;

export const EMPLOYMENT = [
  { value: "full_time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
] as const;

export const CITIES = [
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Mumbai",
  "Delhi NCR",
  "Coimbatore",
];

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((x) => x.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

export const roleBriefSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Add a role title.")
      .max(120, "Keep the title under 120 characters."),
    experience: z.enum(values(EXPERIENCE), { message: "Pick the experience level." }),
    workMode: z.enum(values(WORK_MODES), { message: "Pick how they'll work." }),
    location: z.string().trim().max(80),
    employmentType: z.enum(values(EMPLOYMENT)),
    skills: z
      .array(z.string().trim().min(1).max(40))
      .min(1, "Add at least one skill.")
      .max(12, "Up to 12 skills."),
    notes: z.string().trim().max(2_000, "Keep this under 2,000 characters."),
  })
  .refine((b) => b.workMode === "remote" || b.location.length >= 2, {
    path: ["location"],
    message: "Where will they work?",
  });
export type RoleBrief = z.infer<typeof roleBriefSchema>;

/** The generated JD, kept structured so HR can edit one section at a time. */
export const jobDescriptionSchema = z.object({
  summary: z.string().min(40).max(900),
  responsibilities: z.array(z.string().min(5).max(220)).min(3).max(8),
  requirements: z.array(z.string().min(5).max(220)).min(3).max(8),
  niceToHave: z.array(z.string().min(3).max(220)).max(5),
  greatLooksLike: z.array(z.string().min(5).max(220)).min(2).max(4),
});
export type JobDescription = z.infer<typeof jobDescriptionSchema>;

/** HR's own edits: looser than what we ask of the model, since HR may trim sections. */
export const editedJobDescriptionSchema = z.object({
  summary: z.string().trim().min(20, "Keep a short summary.").max(1_500),
  responsibilities: z
    .array(z.string().trim().min(1).max(400))
    .min(1, "Keep at least one responsibility.")
    .max(15),
  requirements: z
    .array(z.string().trim().min(1).max(400))
    .min(1, "Keep at least one requirement.")
    .max(15),
  niceToHave: z.array(z.string().trim().min(1).max(400)).max(10),
  greatLooksLike: z.array(z.string().trim().min(1).max(400)).max(8),
});

export const JD_SECTIONS = [
  { key: "responsibilities", title: "What you'll do" },
  { key: "requirements", title: "What you'll need" },
  { key: "niceToHave", title: "Nice to have" },
  { key: "greatLooksLike", title: "What great looks like" },
] as const satisfies readonly { key: Exclude<keyof JobDescription, "summary">; title: string }[];

/** Plain-text form, stored on the role and used by later steps (interview kit, resume fit). */
export function renderJobDescription(jd: JobDescription): string {
  const sections = JD_SECTIONS.filter((s) => jd[s.key].length > 0).map(
    (s) => `${s.title}\n${jd[s.key].map((line) => `- ${line}`).join("\n")}`,
  );
  return [jd.summary, ...sections].join("\n\n");
}

/** "5–8 yrs · Hybrid · Bengaluru · Full-time" */
export function describeBrief(
  brief: Pick<RoleBrief, "experience" | "workMode" | "location" | "employmentType">,
) {
  return [
    EXPERIENCE.find((e) => e.value === brief.experience)?.label,
    WORK_MODES.find((w) => w.value === brief.workMode)?.label,
    brief.workMode === "remote" ? brief.location || null : brief.location,
    EMPLOYMENT.find((e) => e.value === brief.employmentType)?.label,
  ]
    .filter(Boolean)
    .join(" · ");
}

const SKILL_HINTS: [RegExp, string[]][] = [
  [
    /front ?end|react|ui engineer/i,
    ["React", "TypeScript", "Next.js", "CSS", "Accessibility", "Web performance", "Testing"],
  ],
  [
    /back ?end|api|server/i,
    [
      "Node.js",
      "PostgreSQL",
      "API design",
      "System design",
      "Caching",
      "Observability",
      "Security",
    ],
  ],
  [
    /full ?stack/i,
    ["React", "Node.js", "TypeScript", "PostgreSQL", "API design", "Cloud", "Testing"],
  ],
  [
    /mobile|android|ios|flutter/i,
    ["React Native", "Kotlin", "Swift", "App performance", "Offline sync", "Testing"],
  ],
  [
    /devops|sre|platform|infra/i,
    ["Kubernetes", "AWS", "Terraform", "CI/CD", "Monitoring", "Incident response"],
  ],
  [
    /data (analyst|scien)|analytics/i,
    ["SQL", "Python", "Excel", "Dashboards", "Statistics", "Data storytelling"],
  ],
  [/data engineer/i, ["SQL", "Python", "Spark", "Airflow", "Data modelling", "Data quality"]],
  [/qa|test/i, ["Test planning", "Automation", "Playwright", "API testing", "Bug triage"]],
  [/design/i, ["Figma", "User research", "Interaction design", "Design systems", "Prototyping"]],
  [
    /product manager|pm\b/i,
    ["Prioritisation", "User research", "Roadmapping", "Metrics", "Stakeholder management"],
  ],
  [
    /sales|business development|bdr|sdr/i,
    ["Prospecting", "Negotiation", "CRM", "Pipeline management", "Cold outreach"],
  ],
  [
    /hr|human resources|people|talent|recruit/i,
    ["Payroll", "Statutory compliance", "Employee relations", "HRMS", "Onboarding"],
  ],
  [
    /support|customer success|service/i,
    ["Customer empathy", "Ticket triage", "Escalations", "CRM", "Written communication"],
  ],
  [
    /marketing|growth|content|seo/i,
    ["Campaign planning", "SEO", "Analytics", "Copywriting", "Performance marketing"],
  ],
  [/finance|account/i, ["Accounting", "GST", "Reconciliation", "Excel", "Reporting", "Audit"]],
];

export function suggestSkills(title: string): string[] {
  const match = SKILL_HINTS.find(([pattern]) => pattern.test(title));
  return match
    ? match[1]
    : ["Problem solving", "Communication", "Ownership", "Prioritisation", "Using AI tools well"];
}
