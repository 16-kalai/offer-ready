import { SKILLS, type SkillDef } from "./skill-dictionary";

/**
 * Finds skills in free text and maps every spelling to one canonical name, so
 * "JS" in a resume matches "JavaScript" in a JD. Pure and deterministic: no
 * network, no model. Order of safeguards:
 *   1. normalise both sides the same way (case, dots, dashes, C++/C#/.NET)
 *   2. whole-word, longest-alias-first matching (Java ≠ JavaScript, React ≠ React Native)
 *   3. short or ambiguous aliases count only with context ("r" next to Python/SQL)
 *   4. one-letter typos on long words ("Javascrpit")
 */

/** Same transformation for resumes, JDs and aliases. */
export function normalize(text: string): string {
  let t = ` ${text.toLowerCase()} `;
  t = t
    .replace(/c\+\+/g, " cplusplus ")
    .replace(/c#/g, " csharp ")
    .replace(/f#/g, " fsharp ")
    .replace(/(^|[^a-z0-9])\.net\b/g, "$1 dotnet ")
    .replace(/r&d/g, " rnd ")
    .replace(/\ba\/b\b/g, " ab ")
    .replace(/isation/g, "ization")
    .replace(/ising\b/g, "izing");
  // Join tokens split by a dot or dash: node.js → nodejs, front-end → frontend, go-to-market → gotomarket.
  for (let i = 0; i < 2; i++) t = t.replace(/([a-z0-9])[.-]([a-z0-9])/g, "$1$2");
  t = t.replace(/[^a-z0-9]+/g, " ");
  return ` ${t.trim()} `;
}

interface Entry {
  alias: string;
  skill: string;
  context?: RegExp;
  /** A multi-word alias with its spaces removed ("react native" → "reactnative"). */
  joined?: boolean;
}

export interface Matcher {
  entries: Entry[];
  /** Long single-word aliases, for typo tolerance. */
  fuzzy: Map<string, string>;
  canonical: Map<string, string>;
}

/** Workspace-specific aliases ("fe" → "Frontend") and skills not in the dictionary can be added. */
export function buildMatcher(
  options: { extraSkills?: string[]; aliases?: Record<string, string> } = {},
): Matcher {
  const entries: Entry[] = [];
  const canonical = new Map<string, string>();
  const add = (alias: string, skill: string, context?: RegExp) => {
    const norm = normalize(alias).trim();
    if (!norm) return;
    for (const variant of new Set([norm, norm.replaceAll(" ", "")])) {
      entries.push({ alias: variant, skill, context, joined: variant !== norm });
      if (!context) canonical.set(variant, skill);
    }
  };
  const defs: SkillDef[] = [...SKILLS];
  for (const extra of options.extraSkills ?? []) {
    if (!canonicalSkill(extra, canonical))
      defs.push({ name: extra.trim(), aliases: [extra.trim()] });
  }
  for (const def of defs) {
    for (const alias of def.aliases) add(alias, def.name);
    for (const alias of def.contextual?.aliases ?? [])
      add(alias, def.name, def.contextual?.context);
  }
  for (const [alias, skill] of Object.entries(options.aliases ?? {}))
    add(alias, canonicalSkill(skill, canonical) ?? skill);
  // Longest first, so "react native" claims its words before "react" can.
  entries.sort((a, b) => b.alias.length - a.alias.length);
  const fuzzy = new Map<string, string>();
  // Typo tolerance only for real single-word aliases: "embedded" must never be a typo of "embedded c".
  for (const e of entries) {
    if (!e.context && !e.joined && !e.alias.includes(" ") && e.alias.length >= 8)
      fuzzy.set(e.alias, e.skill);
  }
  return { entries, fuzzy, canonical };
}

function canonicalSkill(name: string, canonical: Map<string, string>): string | undefined {
  const norm = normalize(name).trim();
  return canonical.get(norm) ?? canonical.get(norm.replaceAll(" ", ""));
}

/** The canonical name for a skill as HR typed it ("js" → "JavaScript"), or the trimmed input if unknown. */
export function canonicalize(name: string, matcher: Matcher): string {
  return canonicalSkill(name, matcher.canonical) ?? name.trim();
}

/** Damerau-Levenshtein distance capped at 2 (enough to decide "≤ 1"). */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const row = d[i] as number[];
    const prev = d[i - 1] as number[];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] as number, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}

/** Skills found in the text, each with the spelling that matched (shown to HR as evidence). */
export function findSkills(text: string, matcher: Matcher): Map<string, string> {
  const full = normalize(text);
  let work = full;
  const found = new Map<string, string>();
  for (const entry of matcher.entries) {
    const needle = ` ${entry.alias} `;
    if (!work.includes(needle)) continue;
    if (entry.context && !entry.context.test(full)) continue;
    if (!found.has(entry.skill)) found.set(entry.skill, entry.alias);
    work = work.split(needle).join(" | ");
  }
  // Typos on long words, only for skills not already found.
  const tokens = new Set(work.split(" ").filter((t) => t.length >= 8));
  for (const token of tokens) {
    for (const [alias, skill] of matcher.fuzzy) {
      if (found.has(skill)) continue;
      if (editDistance(token, alias) <= 1) found.set(skill, token);
    }
  }
  return found;
}
