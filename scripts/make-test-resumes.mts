/**
 * Dev only: writes fictional resumes with known answers to .data/test-resumes,
 * for measuring matching accuracy (scripts/eval-matching.mts). No real people.
 *   pnpm test:resumes
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";

const OUT = path.resolve(".data/test-resumes");

// Years in the answer key are exact date arithmetic from each resume's own ranges (as of Oct 2026).
interface Truth {
  file: string;
  name: string | null;
  email: string | null;
  years: number | null;
  /** Canonical skills that must be found. */
  has: string[];
  /** Canonical skills that must NOT be found. */
  hasNot: string[];
  tier: "strong" | "medium" | "weak" | "unreadable" | "duplicate";
}

interface Spec extends Omit<Truth, "file"> {
  slug: string;
  format: "pdf" | "docx" | "scanned";
  lines: string[];
}

const job = (title: string, company: string, from: string, to: string, bullets: string[]) => [
  `${title}, ${company}    ${from} – ${to}`,
  ...bullets.map((b) => `• ${b}`),
  "",
];

const SPECS: Spec[] = [
  {
    slug: "ananya-strong-aliases",
    format: "pdf",
    name: "Ananya Rao",
    email: "ananya.rao@example.com",
    years: 6.8,
    has: ["React", "TypeScript", "JavaScript", "Web performance", "Design systems"],
    hasNot: ["Java"],
    tier: "strong",
    lines: [
      "ANANYA RAO",
      "Senior Frontend Engineer",
      "ananya.rao@example.com | +91 98765 43210 | Bengaluru",
      "",
      "SKILLS",
      "ReactJS, TS, JS (ES6), Next.js, Storybook, Lighthouse, Jest, CSS",
      "",
      "EXPERIENCE",
      ...job("Senior Frontend Engineer", "Zylo Commerce", "Jan 2022", "Present", [
        "Owned the checkout web app used by 2M monthly users",
        "Cut LCP from 4.1s to 1.6s; Lighthouse score 98",
        "Built a shared component library in Storybook used by 6 teams",
        "Reviewed AI-generated pull requests and caught security issues before release",
      ]),
      ...job("Frontend Developer", "Brightpay", "Jan 2020", "Dec 2021", [
        "React and Redux dashboards for merchants",
      ]),
      "EDUCATION",
      "B.Tech Computer Science, PES University, 2015 – 2019",
    ],
  },
  {
    slug: "rahul-strong-stated-years",
    format: "docx",
    name: "Rahul Menon",
    email: "rahul.menon@example.com",
    years: 7,
    has: ["React", "TypeScript", "Web performance", "Accessibility"],
    hasNot: [],
    tier: "strong",
    lines: [
      "Rahul Menon",
      "Frontend Lead",
      "rahul.menon@example.com · 9876501234",
      "Frontend engineer with 7+ years of experience building fast, accessible React apps in TypeScript.",
      "Core Web Vitals, WCAG 2.1, design systems, mentoring juniors.",
      ...job("Frontend Lead", "Hexa Retail", "Mar 2021", "Present", [
        "Led 4 engineers on the storefront",
      ]),
    ],
  },
  {
    slug: "divya-strong-typos",
    format: "pdf",
    name: "Divya Krishnan",
    email: "divya.k@example.com",
    years: 7.2,
    has: ["React", "JavaScript", "TypeScript", "Design systems"],
    hasNot: [],
    tier: "strong",
    lines: [
      "Divya Krishnan",
      "UI Engineer",
      "divya.k@example.com | +91-99887-76655",
      "Skills: React, Javascrpit, Typescirpt, design system, Figma handoff",
      ...job("UI Engineer", "Northstar Labs", "May 2021", "Present", [
        "Design system with 80 components",
        "Performance optimisation of the dashboard",
      ]),
      ...job("Web Developer", "Pixelcraft", "Jul 2019", "Apr 2021", ["Marketing sites in React"]),
    ],
  },
  {
    slug: "arjun-medium-angular",
    format: "pdf",
    name: "Arjun Mehta",
    email: "arjun.mehta@example.com",
    years: 7.9,
    has: ["Angular", "TypeScript", "JavaScript"],
    hasNot: ["React", "React Native"],
    tier: "medium",
    lines: [
      "Arjun Mehta",
      "Frontend Developer",
      "arjun.mehta@example.com | 9123456780",
      "Skills: Angular, TypeScript, RxJS, JavaScript, SCSS",
      ...job("Frontend Developer", "FinEdge", "Oct 2020", "Present", ["Angular apps for lending"]),
      ...job("Software Engineer", "Infotech Solutions", "Oct 2018", "Sep 2020", [
        "jQuery to Angular migration",
      ]),
    ],
  },
  {
    slug: "sneha-medium-react-native-only",
    format: "docx",
    name: "Sneha Pillai",
    email: "sneha.pillai@example.com",
    years: 5.8,
    has: ["React Native", "JavaScript"],
    hasNot: ["React"],
    tier: "medium",
    lines: [
      "Sneha Pillai",
      "Mobile Developer",
      "sneha.pillai@example.com | +91 90000 11111",
      "Skills: React Native, JavaScript, Redux, Android",
      ...job("Mobile Developer", "QuickCart", "Nov 2022", "Present", [
        "React Native app with 1M installs",
      ]),
      ...job("Junior Developer", "AppNest", "Nov 2020", "Oct 2022", ["Hybrid apps"]),
    ],
  },
  {
    slug: "imran-medium-junior",
    format: "pdf",
    name: "Imran Shaikh",
    email: "imran.s@example.com",
    years: 2,
    has: ["React", "JavaScript", "CSS"],
    hasNot: ["TypeScript"],
    tier: "medium",
    lines: [
      "Imran Shaikh",
      "Frontend Developer",
      "imran.s@example.com · 9988776655",
      "Skills: React, JavaScript, HTML, CSS, Tailwind",
      ...job("Frontend Developer", "Startly", "Oct 2024", "Present", [
        "Landing pages and admin panels in React",
      ]),
    ],
  },
  {
    slug: "kiran-weak-java",
    format: "pdf",
    name: "Kiran Kumar",
    email: "kiran.kumar@example.com",
    years: 8.1,
    has: ["Java", "Spring Boot", "PostgreSQL"],
    hasNot: ["JavaScript", "React", "TypeScript"],
    tier: "weak",
    lines: [
      "Kiran Kumar",
      "Backend Engineer",
      "kiran.kumar@example.com | 9876123450",
      "Skills: Core Java, Spring Boot, Hibernate, Postgres, Kafka",
      ...job("Backend Engineer", "PayBridge", "Aug 2020", "Present", [
        "Payments microservices in Java",
      ]),
      ...job("Software Engineer", "Tata Consultancy Services", "Aug 2018", "Jul 2020", [
        "Java EE maintenance",
      ]),
      "EDUCATION",
      "PG Diploma in Software Engineering, 2018",
    ],
  },
  {
    slug: "meera-weak-hr",
    format: "docx",
    name: "Meera Iyer",
    email: "meera.iyer@example.com",
    years: 7.7,
    has: ["Payroll", "Statutory compliance"],
    hasNot: ["React", "JavaScript", "R", "Go"],
    tier: "weak",
    lines: [
      "Meera Iyer",
      "HR Generalist",
      "meera.iyer@example.com | +91 91234 56789",
      "Ran payroll for 400 employees; PF, ESI and gratuity; led R&D team hiring and go-to-market onboarding.",
      ...job("HR Generalist", "Greenfield Foods", "Jan 2021", "Present", [
        "Payroll processing",
        "Employee onboarding",
      ]),
      ...job("HR Executive", "Nova Textiles", "Jan 2019", "Dec 2020", ["Recruitment"]),
    ],
  },
  {
    slug: "vikram-weak-sales",
    format: "pdf",
    name: "Vikram Singh",
    email: "vikram.singh@example.com",
    years: 5.9,
    has: ["CRM", "Prospecting"],
    hasNot: ["React", "Swift", "C"],
    tier: "weak",
    lines: [
      "Vikram Singh",
      "Sales Executive",
      "vikram.singh@example.com | 9871234560",
      "Lead generation, Salesforce CRM, closing deals; handled SWIFT payment queries for bank clients.",
      ...job("Sales Executive", "Cloudnine SaaS", "Sep 2022", "Present", ["Outbound prospecting"]),
      ...job("Sales Associate", "Brightway", "Oct 2020", "Aug 2022", [
        "Field sales, Grade C territory",
      ]),
    ],
  },
  {
    slug: "pooja-overlapping-jobs",
    format: "pdf",
    name: "Pooja Nair",
    email: "pooja.nair@example.com",
    years: 5.8,
    has: ["React", "TypeScript", "Node.js"],
    hasNot: [],
    tier: "strong",
    lines: [
      "Pooja Nair",
      "Full Stack Developer",
      "pooja.nair@example.com | 9845012345",
      "Skills: React, TypeScript, Node.js, PostgreSQL, web performance, Storybook design system",
      ...job("Full Stack Developer", "Trailmix", "Jan 2022", "Present", ["React + Node checkout"]),
      ...job("Freelance Developer", "Self-employed", "Jan 2021", "Dec 2022", [
        "Overlapping freelance React projects",
      ]),
      ...job("Developer", "Webwise", "Nov 2021", "Dec 2021", ["Short contract"]),
    ],
  },
  {
    slug: "scanned-image",
    format: "scanned",
    name: null,
    email: null,
    years: null,
    has: [],
    hasNot: [],
    tier: "unreadable",
    lines: [],
  },
  {
    slug: "ananya-duplicate",
    format: "docx",
    name: "Ananya Rao",
    email: "ananya.rao@example.com",
    years: 6.8,
    has: [],
    hasNot: [],
    tier: "duplicate",
    lines: [
      "Ananya Rao",
      "Senior Frontend Engineer",
      "ananya.rao@example.com",
      "Updated resume. React, TypeScript.",
    ],
  },
];

// Fill out to ~40 with varied fictional profiles at each tier.
const FIRST = [
  "Aditi",
  "Rohan",
  "Kavya",
  "Nikhil",
  "Ishita",
  "Varun",
  "Neha",
  "Siddharth",
  "Lakshmi",
  "Harish",
  "Tanvi",
  "Manoj",
  "Farah",
  "Gaurav",
  "Bhavna",
  "Deepak",
  "Ritu",
  "Sameer",
  "Anjali",
  "Karthik",
  "Priyanka",
  "Yash",
  "Shreya",
  "Abhishek",
  "Nandini",
  "Rajesh",
  "Swati",
  "Ajay",
];
const LAST = [
  "Sharma",
  "Reddy",
  "Joshi",
  "Das",
  "Bose",
  "Gupta",
  "Kulkarni",
  "Naidu",
  "Verma",
  "Chopra",
  "Patel",
  "Rao",
  "Hegde",
  "Saxena",
];
const PROFILES = [
  {
    tier: "strong",
    title: "Senior Frontend Engineer",
    skills: "React, TypeScript, JavaScript, web performance, design systems, Jest",
    has: ["React", "TypeScript", "JavaScript", "Web performance", "Design systems"],
    hasNot: [],
    start: 2019,
  },
  {
    tier: "strong",
    title: "Frontend Engineer",
    skills: "ReactJS, TS, Next.js, Core Web Vitals, Storybook",
    has: ["React", "TypeScript", "Next.js", "Web performance", "Design systems"],
    hasNot: [],
    start: 2020,
  },
  {
    tier: "medium",
    title: "Frontend Developer",
    skills: "Vue.js, JavaScript, CSS, Webpack",
    has: ["Vue", "JavaScript", "CSS"],
    hasNot: ["React"],
    start: 2020,
  },
  {
    tier: "medium",
    title: "Full Stack Developer",
    skills: "React, Node.js, MongoDB, Express",
    has: ["React", "Node.js", "MongoDB"],
    hasNot: ["TypeScript"],
    start: 2022,
  },
  {
    tier: "weak",
    title: "Data Analyst",
    skills: "SQL, Python, R, Excel, Power BI, dashboards",
    has: ["SQL", "Python", "R", "Excel", "Power BI"],
    hasNot: ["React", "JavaScript"],
    start: 2021,
  },
  {
    tier: "weak",
    title: "QA Engineer",
    skills: "Selenium, manual testing, test planning, Java",
    has: ["Selenium", "Java"],
    hasNot: ["JavaScript", "React"],
    start: 2019,
  },
  {
    tier: "weak",
    title: "Accountant",
    skills: "Tally Prime, GST returns, TDS, bank reconciliation",
    has: ["Tally", "GST", "TDS", "Reconciliation"],
    hasNot: ["React", "Go"],
    start: 2018,
  },
] as const;

for (let i = 0; SPECS.length < 40; i++) {
  const p = PROFILES[i % PROFILES.length] as (typeof PROFILES)[number];
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
  const email = `${name.toLowerCase().replace(" ", ".")}${i}@example.com`;
  const startMonth = (i * 5) % 12;
  const years = Math.round(((2026 * 12 + 9 - (p.start * 12 + startMonth)) / 12) * 10) / 10;
  SPECS.push({
    slug: `gen-${i}-${p.tier}`,
    format: i % 4 === 0 ? "docx" : "pdf",
    name,
    email,
    years,
    has: [...p.has],
    hasNot: [...p.hasNot],
    tier: p.tier,
    lines: [
      name,
      p.title,
      `${email} | +91 9${String(800000000 + i * 7919).slice(0, 9)}`,
      `Skills: ${p.skills}`,
      ...job(
        p.title,
        `Company ${i + 1}`,
        `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][startMonth]} ${p.start}`,
        "Present",
        [`Day-to-day work as ${p.title.toLowerCase()} using ${p.skills.split(",")[0]}`],
      ),
      "EDUCATION",
      `B.E., Sample University, ${p.start - 4} – ${p.start}`,
    ],
  });
}

async function pdf(lines: string[], scanned = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  if (scanned) {
    // No text layer at all, like a photographed resume.
    page.drawRectangle({ x: 60, y: 600, width: 400, height: 160, borderWidth: 1 });
    return doc.save();
  }
  let y = 790;
  for (const line of lines) {
    page.drawText(
      line.replace(/[–•·]/g, (c) => ({ "–": "-", "•": "-", "·": "|" })[c] ?? c),
      { x: 50, y, size: 10.5, font },
    );
    y -= 16;
  }
  return doc.save();
}

function docx(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = lines
    .map((l) => `<w:p><w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`)
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
}

await mkdir(OUT, { recursive: true });
const truth: Truth[] = [];
const zipEntries: Record<string, Uint8Array> = {};
for (const spec of SPECS) {
  const ext = spec.format === "docx" ? "docx" : "pdf";
  const file = `${spec.slug}.${ext}`;
  const bytes =
    spec.format === "docx" ? docx(spec.lines) : await pdf(spec.lines, spec.format === "scanned");
  await writeFile(path.join(OUT, file), bytes);
  zipEntries[`resumes/${file}`] = bytes;
  const { slug: _s, format: _f, lines: _l, ...rest } = spec;
  truth.push({ file, ...rest });
}
await writeFile(path.join(OUT, "truth.json"), JSON.stringify(truth, null, 2));
await writeFile(path.join(OUT, "all-resumes.zip"), zipSync(zipEntries));
console.log(`Wrote ${truth.length} fictional resumes and all-resumes.zip to ${OUT}`);
