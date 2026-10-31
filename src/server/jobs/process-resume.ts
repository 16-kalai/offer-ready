import "server-only";
import { and, eq, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { candidates, type Role, roles } from "@/db/schema";
import { extractFacts } from "@/lib/matching/resume";
import { experienceBand, type MustHave, scoreCandidate } from "@/lib/matching/score";
import { SKILLS } from "@/lib/matching/skill-dictionary";
import { buildMatcher, canonicalize, findSkills, type Matcher } from "@/lib/matching/skills";
import { cosine, embed } from "@/server/ai/embeddings";
import { blobs } from "@/server/storage";

/**
 * Reads one resume and scores it against its role. Runs in the worker.
 * Idempotent: running it twice for the same candidate gives the same result.
 */

/** Skill names that are concepts ("System design"), where wording varies too much for aliases alone. */
const DICTIONARY = new Set(SKILLS.map((s) => s.name));
const isConcept = (skill: string) => !DICTIONARY.has(skill) || skill.includes(" ");
const RELATED_THRESHOLD = 0.74;

interface RoleProfile {
  version: string;
  matcher: Matcher;
  mustHaves: MustHave[];
  mustHaveVectors: Map<string, number[]>;
  jdVectors: number[][];
  titleVector: number[];
  band: [number, number];
}

const profiles = new Map<string, RoleProfile>();

async function roleProfile(role: Role): Promise<RoleProfile> {
  const version = `${role.id}:${role.updatedAt.toISOString()}`;
  const cached = profiles.get(role.id);
  if (cached?.version === version) return cached;

  const briefSkills = role.brief?.skills ?? [];
  const matcher = buildMatcher({ extraSkills: briefSkills });
  const must = new Map<string, number>();
  for (const skill of briefSkills) must.set(canonicalize(skill, matcher), 2);
  // Must-haves come from what the role needs, never from "Nice to have" or "What great looks like".
  const required = role.jd
    ? [role.jd.summary, ...role.jd.responsibilities, ...role.jd.requirements].join("\n")
    : role.jobDescription;
  for (const skill of findSkills(required, matcher).keys())
    if (!must.has(skill)) must.set(skill, 1);
  const mustHaves = [...must].slice(0, 16).map(([skill, weight]) => ({ skill, weight }));

  const jdChunks = role.jd
    ? [role.jd.summary, ...role.jd.responsibilities, ...role.jd.requirements]
    : role.jobDescription
        .split(/\n+|(?<=\.)\s+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 20)
        .slice(0, 24);
  const concepts = mustHaves.map((m) => m.skill).filter(isConcept);
  const vectors = await embed([role.title, ...jdChunks, ...concepts]);
  const profile: RoleProfile = {
    version,
    matcher,
    mustHaves,
    titleVector: vectors[0] ?? [],
    jdVectors: vectors.slice(1, 1 + jdChunks.length),
    mustHaveVectors: new Map(concepts.map((c, i) => [c, vectors[1 + jdChunks.length + i] ?? []])),
    band: role.brief ? experienceBand(role.brief.experience) : [0, 40],
  };
  profiles.set(role.id, profile);
  if (profiles.size > 200) profiles.delete(profiles.keys().next().value as string);
  return profile;
}

class UnreadableResume extends Error {}

/** Text of a stored resume (PDF or DOCX). Shared with interview preparation. */
export async function readText(fileType: "pdf" | "docx", bytes: Uint8Array): Promise<string> {
  if (fileType === "pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    return (text as string[]).join("\n");
  }
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

export async function processResume(candidateId: string): Promise<void> {
  const [row] = await db()
    .select({ candidate: candidates, role: roles })
    .from(candidates)
    .innerJoin(roles, eq(roles.id, candidates.roleId))
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (!row || row.candidate.status === "duplicate") return;
  const { candidate, role } = row;

  await db()
    .update(candidates)
    .set({ status: "reading", error: null })
    .where(eq(candidates.id, candidateId));

  let text: string;
  try {
    text = await readText(candidate.fileType, await blobs().get(candidate.fileKey));
    if (text.replace(/\s/g, "").length < 80)
      throw new UnreadableResume("No readable text. It may be a scanned image.");
  } catch (error) {
    // A broken or image-only file will not get better on retry.
    const message = error instanceof UnreadableResume ? error.message : "Couldn't open this file.";
    await db()
      .update(candidates)
      .set({ status: "failed", error: message })
      .where(eq(candidates.id, candidateId));
    return;
  }

  const facts = extractFacts(text);

  // Same person uploaded twice (different file, same email): keep the earlier one.
  if (facts.email) {
    const [earlier] = await db()
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.roleId, role.id),
          eq(candidates.email, facts.email),
          ne(candidates.id, candidateId),
          ne(candidates.status, "duplicate"),
          lt(candidates.createdAt, candidate.createdAt),
        ),
      )
      .limit(1);
    if (earlier) {
      await db().transaction(async (tx) => {
        await tx
          .update(candidates)
          .set({
            status: "duplicate",
            duplicateOf: earlier.id,
            email: facts.email,
            name: facts.name,
          })
          .where(eq(candidates.id, candidateId));
        await tx
          .update(roles)
          .set({ appliedCount: sql`greatest(${roles.appliedCount} - 1, 0)` })
          .where(eq(roles.id, role.id));
      });
      return;
    }
  }

  const profile = await roleProfile(role);
  const found = findSkills(text, profile.matcher);

  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 12 && l.length <= 400)
    .slice(0, 150);
  const [titleVector, ...lineVectors] = await embed([facts.currentTitle ?? "", ...lines]);

  // How well the resume covers each part of the JD: average of the best-matching line per JD point.
  const relevance =
    profile.jdVectors.length && lineVectors.length
      ? profile.jdVectors.reduce(
          (sum, jd) => sum + Math.max(...lineVectors.map((v) => cosine(jd, v))),
          0,
        ) / profile.jdVectors.length
      : 0;

  const related = new Map<string, string>();
  for (const [skill, vector] of profile.mustHaveVectors) {
    if (found.has(skill)) continue;
    let best = 0;
    let bestLine = "";
    lineVectors.forEach((v, i) => {
      const sim = cosine(vector, v);
      if (sim > best) [best, bestLine] = [sim, lines[i] ?? ""];
    });
    if (best >= RELATED_THRESHOLD)
      related.set(skill, bestLine.length > 80 ? `${bestLine.slice(0, 77)}…` : bestLine);
  }

  const match = scoreCandidate({
    mustHaves: profile.mustHaves,
    found,
    related,
    relevance,
    titleSimilarity:
      facts.currentTitle && titleVector ? cosine(profile.titleVector, titleVector) : null,
    years: facts.years,
    band: profile.band,
    flags: facts.flags,
  });

  await db()
    .update(candidates)
    .set({
      status: "scored",
      name: facts.name,
      email: facts.email,
      phone: facts.phone,
      years: facts.years,
      currentTitle: facts.currentTitle,
      match,
      score: match.score,
    })
    .where(eq(candidates.id, candidateId));
}

export async function markFailed(candidateId: string, message: string) {
  await db()
    .update(candidates)
    .set({ status: "failed", error: message })
    .where(eq(candidates.id, candidateId));
}
