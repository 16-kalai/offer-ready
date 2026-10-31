/**
 * Facts read from resume text with plain rules (no AI, no network): contact
 * details, total years of experience, current title. Each field says when it
 * is unsure, so HR sees "check experience" instead of a silent wrong number.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?`;
const POINT = String.raw`(?:${MONTH}\s*,?\s*(?:19|20)\d{2}|\d{1,2}\s*[/.-]\s*(?:19|20)\d{2}|(?:19|20)\d{2})`;
const RANGE = new RegExp(
  String.raw`(${POINT})\s*(?:-|–|—|to|till|until)\s*(present|current|now|till\s*date|to\s*date|date|ongoing|${POINT})`,
  "gi",
);
const EDUCATION =
  /\b(b\.?\s?tech|b\.?\s?e\b|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|bca|mca|mba|bba|b\.?\s?com|m\.?\s?com|bachelor|master|degree|diploma|university|college|school|institute|cgpa|gpa|class\s+(x|xii|10|12)|hsc|ssc|graduat)/i;
const ROLE_WORDS =
  /\b(engineer|developer|manager|analyst|designer|executive|specialist|lead|consultant|intern|associate|officer|architect|scientist|administrator|recruiter|accountant|programmer|tester|coordinator|head|director|representative|generalist|partner)\b/i;

export interface ResumeFacts {
  name: string | null;
  email: string | null;
  phone: string | null;
  years: number | null;
  currentTitle: string | null;
  flags: string[];
}

function toMonthIndex(point: string, now: Date): number | null {
  const p = point.toLowerCase().trim();
  if (/present|current|now|date|ongoing/.test(p)) return now.getFullYear() * 12 + now.getMonth();
  const year = Number(p.match(/(19|20)\d{2}/)?.[0]);
  if (!year || year < 1975 || year > now.getFullYear()) return null;
  const named = MONTHS.findIndex((m) => p.startsWith(m));
  const numeric = p.match(/^(\d{1,2})\s*[/.-]/);
  const month =
    named >= 0 ? named : numeric ? Math.min(11, Math.max(0, Number(numeric[1]) - 1)) : null;
  return year * 12 + (month ?? 0);
}

/** Total years from work date ranges (overlaps merged, education lines skipped), or a stated "N years of experience". */
export function extractYears(
  text: string,
  now = new Date(),
): { years: number | null; source: "stated" | "ranges" | null } {
  const stated = text.match(
    /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs|year)\s*(?:of\s*)?(?:total\s*|overall\s*|professional\s*|work\s*|industry\s*)?(?:experience|exp)\b/i,
  );
  const statedYears = stated ? Number(stated[1]) : null;

  const intervals: [number, number][] = [];
  for (const line of text.split(/\n/)) {
    if (EDUCATION.test(line)) continue;
    for (const match of line.matchAll(RANGE)) {
      const start = toMonthIndex(match[1] ?? "", now);
      const end = toMonthIndex(match[2] ?? "", now);
      if (start === null || end === null || end < start) continue;
      // A bare-year end ("2019 – 2021") means through that year.
      const endAdj = /^\s*(19|20)\d{2}\s*$/.test(match[2] ?? "") ? end + 11 : end;
      intervals.push([start, Math.max(start + 1, endAdj)]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let current: [number, number] | null = null;
  for (const [s, e] of intervals) {
    if (current && s <= current[1]) current[1] = Math.max(current[1], e);
    else {
      if (current) months += current[1] - current[0];
      current = [s, e];
    }
  }
  if (current) months += current[1] - current[0];
  const fromRanges = months > 0 ? Math.round((months / 12) * 10) / 10 : null;

  if (statedYears !== null && statedYears <= 45) return { years: statedYears, source: "stated" };
  if (fromRanges !== null && fromRanges <= 45) return { years: fromRanges, source: "ranges" };
  return { years: null, source: null };
}

export function extractFacts(text: string, now = new Date()): ResumeFacts {
  const flags: string[] = [];
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const email =
    text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase() ?? null;
  // Any run of digits with spaces, dashes or brackets; keep the first that is an Indian mobile number.
  const phoneDigits =
    [...text.matchAll(/\+?\d[\d\s().-]{8,16}\d/g)]
      .map((m) => m[0].replace(/\D/g, ""))
      .map((d) =>
        d.length === 12 && d.startsWith("91")
          ? d.slice(2)
          : d.length === 11 && d.startsWith("0")
            ? d.slice(1)
            : d,
      )
      .find((d) => /^[6-9]\d{9}$/.test(d)) ?? null;
  const phone = phoneDigits ? `+91 ${phoneDigits.slice(0, 5)} ${phoneDigits.slice(5)}` : null;

  const name =
    lines
      .slice(0, 6)
      .map((l) => l.replace(/^(name\s*[:-]\s*)/i, ""))
      .find(
        (l) =>
          /^[A-Za-z][A-Za-z.' -]{2,48}$/.test(l) &&
          l.split(" ").length >= 2 &&
          l.split(" ").length <= 4 &&
          !/resume|curriculum|vitae|profile|summary|contact|email|phone|engineer|developer|manager/i.test(
            l,
          ),
      )
      ?.split(" ")
      .map((w) => (w.length > 1 ? w[0]?.toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
      .join(" ") ?? null;

  const currentTitle =
    lines
      .slice(0, 15)
      .find(
        (l) => ROLE_WORDS.test(l) && l.length <= 70 && !l.includes("@") && !EDUCATION.test(l),
      ) ?? null;

  const { years } = extractYears(text, now);
  if (!email) flags.push("No email found");
  if (years === null) flags.push("Check experience");
  if (!name) flags.push("Check name");
  return { name, email, phone, years, currentTitle, flags };
}
