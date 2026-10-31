import {
  describeBrief,
  EMPLOYMENT,
  JD_SECTIONS,
  type JobDescription,
  type RoleBrief,
} from "./role-brief";

/**
 * The approved JD, shaped for where HR posts it. Plain text only: job boards
 * strip formatting, and both LinkedIn and Naukri keep "•" bullets.
 */

function sections(jd: JobDescription, bullet: string) {
  return JD_SECTIONS.filter((s) => jd[s.key].length > 0)
    .map((s) => `${s.title}\n${jd[s.key].map((line) => `${bullet} ${line}`).join("\n")}`)
    .join("\n\n");
}

const hashtag = (text: string) =>
  `#${text
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join("")}`;

export function forLinkedIn(input: {
  title: string;
  company: string;
  jd: JobDescription;
  brief: RoleBrief | null;
}) {
  const meta = input.brief ? describeBrief(input.brief) : "";
  const tags = [
    "#Hiring",
    hashtag(input.title),
    input.brief?.location ? hashtag(input.brief.location) : null,
  ]
    .filter(Boolean)
    .join(" ");
  return [
    `We're hiring: ${input.title} at ${input.company}`,
    meta,
    input.jd.summary,
    sections(input.jd, "•"),
    "Interested? Apply with your resume.",
    tags,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function forNaukri(input: {
  title: string;
  company: string;
  jd: JobDescription;
  brief: RoleBrief | null;
}) {
  const b = input.brief;
  const facts = b
    ? [
        `Experience: ${b.experience === "8+" ? "8+ years" : b.experience === "0-1" ? "0–1 years (freshers welcome)" : `${b.experience.replace("-", "–")} years`}`,
        `Location: ${b.workMode === "remote" ? `Remote${b.location ? ` (${b.location})` : ""}` : `${b.location} (${b.workMode === "hybrid" ? "Hybrid" : "Onsite"})`}`,
        `Employment type: ${EMPLOYMENT.find((e) => e.value === b.employmentType)?.label ?? ""}`,
        `Key skills: ${b.skills.join(", ")}`,
      ].join("\n")
    : "";
  return [
    `${input.title} | ${input.company}`,
    facts,
    `Job description\n${input.jd.summary}`,
    sections(input.jd, "•"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function forPlainText(input: {
  title: string;
  company: string;
  jd: JobDescription | null;
  text: string;
}) {
  return input.jd
    ? `${input.title} at ${input.company}\n\n${input.jd.summary}\n\n${sections(input.jd, "-")}`
    : input.text;
}
