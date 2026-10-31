/**
 * Records the demo video's clips from the real app (local dev server on :3100), one short
 * 1920×1080 MP4 per scene, into demo-video/. A real Chrome window drives the real product:
 * real research, real Gemini Live interviews and real scoring. The candidate is synthetic: her
 * answers are written by Gemini from the interviewer's actual question and what's on screen,
 * and spoken with Gemini text to speech into a simulated microphone (dev-only hook).
 *
 * Audio (interviewer, candidate, the coach's verdict) is captured inside the page, so Chrome
 * stays muted. Don't use the Chrome window while it records.
 *
 *   pnpm demo:record all            every step, in order (about 45 minutes)
 *   pnpm demo:record <step> [...]   one or more steps: account hook anyjob research level mock
 *                                   report plan proof defense result launch page ping close
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type BrowserContext, chromium, type Locator, type Page } from "playwright-core";
import pg from "pg";
import { z } from "zod";
import { type Canvas, describeCanvas } from "@/lib/canvas";
import { env } from "@/lib/env";
import { generateStructured, speak } from "@/server/ai/gemini";

const BASE = "http://localhost:3100";
const OUT = path.resolve("demo-video");
const STATE = path.join(OUT, "state.json");
const VOICE = "Leda";
mkdirSync(OUT, { recursive: true });

type State = { email?: string; password?: string; goalId?: string; slug?: string; linkCode?: string };
const state: State = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

/* ───────────── database (local) ───────────── */

const db = new pg.Pool({ connectionString: env().DATABASE_URL, max: 2 });
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}
async function until<T>(label: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 420_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(3_000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/* ───────────── in-page helpers (cursor, mic, audio taps, recorder) ───────────── */

const INIT = `(() => {
  // tsx keeps function names with a __name() helper inside page.evaluate callbacks.
  window.__name = window.__name || ((f) => f);
  if (window.__demo) return;
  const origConnect = AudioNode.prototype.connect;
  const mix = new AudioContext({ sampleRate: 48000 });
  const mixDest = mix.createMediaStreamDestination();
  // A silent tone keeps the audio track ticking, so the recording's timeline matches real time.
  const hum = mix.createOscillator();
  const humGain = mix.createGain();
  humGain.gain.value = 0;
  hum.connect(humGain);
  humGain.connect(mixDest);
  hum.start();
  const taps = new WeakMap();
  const tapFor = (ctx) => {
    let d = taps.get(ctx);
    if (d) return d;
    d = ctx.createMediaStreamDestination();
    taps.set(ctx, d);
    origConnect.call(mix.createMediaStreamSource(d.stream), mixDest);
    return d;
  };
  // Every sound the page plays is also routed into the recording (Chrome itself is muted).
  AudioNode.prototype.connect = function (target, ...rest) {
    const r = origConnect.call(this, target, ...rest);
    try {
      if (target instanceof AudioDestinationNode && this.context !== mix) origConnect.call(this, tapFor(this.context));
    } catch (e) {}
    return r;
  };
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      if (!this.__tapped && this.tagName === "AUDIO") {
        this.__tapped = true;
        const c = new AudioContext();
        c.createMediaElementSource(this).connect(c.destination);
      }
    } catch (e) {}
    return origPlay.call(this);
  };
  // The synthetic candidate's microphone.
  const micCtx = new AudioContext({ sampleRate: 48000 });
  const micDest = micCtx.createMediaStreamDestination();
  window.__demoMic = micDest.stream;

  const cursor = document.createElement("div");
  cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7.2 1.6L9.6 20z" fill="#111827" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, { position: "fixed", left: "0px", top: "0px", zIndex: 2147483647, pointerEvents: "none", transition: "transform 0.55s cubic-bezier(0.22,0.8,0.25,1)", transform: "translate(720px, 520px)", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" });
  const ring = document.createElement("div");
  Object.assign(ring.style, { position: "fixed", width: "34px", height: "34px", borderRadius: "999px", border: "3px solid rgba(99,82,255,0.7)", zIndex: 2147483646, pointerEvents: "none", opacity: "0", transition: "opacity 0.25s, transform 0.35s", left: "0px", top: "0px" });
  const mount = () => { if (document.body && !cursor.isConnected) { document.body.appendChild(cursor); document.body.appendChild(ring); } };
  // The init script runs before the document exists: mount the cursor once there's a body.
  const tick = setInterval(() => { if (document.body) { mount(); clearInterval(tick); } }, 50);

  let display = null, rec = null, chunks = [], lastBlob = null, pos = [720, 520];
  window.__demo = {
    cursorTo(x, y) { mount(); pos = [x, y]; cursor.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)"; },
    pulse() {
      ring.style.transform = "translate(" + (pos[0] - 17) + "px," + (pos[1] - 17) + "px) scale(0.6)";
      ring.style.opacity = "1";
      requestAnimationFrame(() => { ring.style.transform = "translate(" + (pos[0] - 17) + "px," + (pos[1] - 17) + "px) scale(1.3)"; });
      setTimeout(() => (ring.style.opacity = "0"), 320);
    },
    async say(b64) {
      await micCtx.resume();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = await micCtx.decodeAudioData(bytes.buffer);
      const src = micCtx.createBufferSource();
      src.buffer = buf;
      const gain = micCtx.createGain();
      gain.gain.value = 1.6;
      src.connect(gain);
      origConnect.call(gain, micDest);
      gain.connect(micCtx.destination);
      src.start();
      await new Promise((r) => (src.onended = r));
      return buf.duration;
    },
    async capture() {
      if (display && display.getVideoTracks()[0]?.readyState === "live") return true;
      display = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: 30 }, audio: false, preferCurrentTab: true });
      return true;
    },
    async recStart() {
      await mix.resume();
      if (mix.state !== "running") throw new Error("audio mixer is " + mix.state);
      const stream = new MediaStream([...display.getVideoTracks(), ...mixDest.stream.getAudioTracks()]);
      chunks = [];
      rec = new MediaRecorder(stream, { mimeType: "video/mp4;codecs=avc1,mp4a.40.2", videoBitsPerSecond: 9000000 });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(1000);
    },
    async recStop() {
      if (!rec) return 0;
      const r = rec;
      rec = null;
      await new Promise((res) => { r.onstop = res; r.stop(); });
      lastBlob = new Blob(chunks, { type: "video/mp4" });
      return lastBlob.size;
    },
    recording() { return !!rec; },
    async slice(start, end) {
      const buf = new Uint8Array(await lastBlob.slice(start, end).arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
  };
})();`;

let context!: BrowserContext;
let page!: Page;

async function open() {
  context = await chromium.launchPersistentContext(path.join(OUT, ".chrome-profile"), {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: [
      "--auto-accept-this-tab-capture",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--disable-spell-checking",
      "--window-size=1440,1018",
      "--window-position=40,40",
    ],
  });
  await context.addInitScript(INIT);
  page = context.pages()[0] ?? (await context.newPage());
}

async function go(url: string) {
  await page.goto(url.startsWith("http") ? url : `${BASE}${url}`, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(600);
}

async function capture() {
  await page.evaluate(() => (window as unknown as { __demo: { capture(): Promise<boolean> } }).__demo.capture());
  await sleep(900);
}

async function recStart() {
  await capture();
  await page.evaluate(() => (window as unknown as { __demo: { recStart(): Promise<void> } }).__demo.recStart());
}

async function recStop(name: string) {
  const size = await page.evaluate(() => (window as unknown as { __demo: { recStop(): Promise<number> } }).__demo.recStop());
  const parts: Buffer[] = [];
  const STEP = 4 * 1024 * 1024;
  for (let i = 0; i < size; i += STEP) {
    const b64 = await page.evaluate(
      ([a, b]) => (window as unknown as { __demo: { slice(a: number, b: number): Promise<string> } }).__demo.slice(a, b),
      [i, Math.min(size, i + STEP)] as const,
    );
    parts.push(Buffer.from(b64, "base64"));
  }
  const file = path.join(OUT, `${name}.mp4`);
  writeFileSync(file, Buffer.concat(parts));
  log(`saved ${path.basename(file)} (${(size / 1e6).toFixed(1)} MB)`);
}

async function clip(name: string, scene: () => Promise<void>) {
  log(`● recording ${name}`);
  await recStart();
  await sleep(500);
  try {
    await scene();
  } finally {
    await sleep(600);
    await recStop(name);
  }
}

/* ───────────── human-like input ───────────── */

async function point(target: Locator) {
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const box = await target.boundingBox();
  if (!box) return;
  const x = box.x + Math.min(box.width / 2, 120);
  const y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => (window as unknown as { __demo: { cursorTo(x: number, y: number): void } }).__demo.cursorTo(x, y), [x, y] as const);
  await sleep(650);
}

async function click(target: Locator, pause = 500) {
  await point(target);
  await page.evaluate(() => (window as unknown as { __demo: { pulse(): void } }).__demo.pulse());
  await target.click();
  await sleep(pause);
}

async function typeInto(target: Locator, text: string, delay = 22) {
  await click(target, 200);
  await target.pressSequentially(text, { delay });
}

/** Smooth scroll by a distance, over a duration, with easing. */
async function scroll(by: number, ms = 1600) {
  await page.evaluate(
    ([by, ms]) =>
      new Promise<void>((res) => {
        const start = window.scrollY;
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / ms);
          const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
          window.scrollTo(0, start + by * e);
          if (p < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      }),
    [by, ms] as const,
  );
  await sleep(300);
}

async function scrollTo(target: Locator, offset = 120, ms = 1400) {
  const y = await target.evaluate((el) => el.getBoundingClientRect().top);
  await scroll(y - offset, ms);
}

const button = (name: string | RegExp) => page.getByRole("button", { name }).first();

/* ───────────── the synthetic candidate ───────────── */

const RULES = `Answer the interviewer's latest message as spoken words in a voice interview: natural, first person, 3 to 5 sentences (about 25 to 40 seconds aloud). If a case is on screen, refer to specific things in it. If it's small talk, keep it to one or two sentences. No lists, no markdown, no stage directions. Never say you are an AI.`;

async function personaContext() {
  const [g] = await q<{ resume_text: string; company_name: string; role_title: string }>(
    "select resume_text, company_name, role_title from goals where id=$1",
    [state.goalId],
  );
  const [p] = await q<{ summary: string; idea: { headline: string; build: string }; trail: unknown }>(
    "select summary, idea, trail from proof_projects where goal_id=$1",
    [state.goalId],
  );
  return { goal: g, project: p ?? null };
}

const PERSONAS = {
  developing: (c: Awaited<ReturnType<typeof personaContext>>) =>
    `You are Riya Sharma, a final-year computer science student in Bengaluru, in a practice interview for ${c.goal.role_title} at ${c.goal.company_name}. Your resume:\n${c.goal.resume_text.slice(0, 2500)}\n\nYou're promising but not polished yet: you think out loud and usually reach a sensible answer, you catch the most obvious problem in a piece of work but miss subtler ones, you sometimes jump to a fix before checking the data, and you rarely put numbers on things. ${RULES}`,
  strong: (c: Awaited<ReturnType<typeof personaContext>>) =>
    `You are Riya Sharma, a final-year computer science student in Bengaluru, defending the proof project you built for ${c.goal.company_name}: "${c.project?.idea.headline}". What you built and found: ${c.project?.summary || c.project?.idea.build}. Decisions you logged: ${JSON.stringify(c.project?.trail ?? [])}. Your resume:\n${c.goal.resume_text.slice(0, 1500)}\n\nYou're now a strong candidate: you lead with your answer, use concrete specifics from the project (500 parallel duplicate webhooks, zero duplicate credits, Redis locks with idempotency keys, exponential backoff with jitter and a dead-letter queue, the lock TTL versus throughput trade-off), weigh alternatives, name risks and second-order effects, and re-decide calmly when constraints change. ${RULES}`,
};

type Snap = {
  status: string;
  part: string;
  speaking: string | null;
  mic: string;
  awaitingReply: boolean;
  history: { speaker: string; text: string }[];
  activeCase: number | null;
  twist: string | null;
  cases: { number: number; title: string; canvas: Canvas }[];
};

async function snapshot(): Promise<Snap | null> {
  return page
    .evaluate(() => {
      const call = (window as unknown as { __call?: { getSnapshot(): Snap } }).__call;
      if (!call) return null;
      const s = call.getSnapshot();
      return {
        status: s.status,
        part: s.part,
        speaking: s.speaking,
        mic: s.mic,
        awaitingReply: s.awaitingReply,
        history: s.history,
        activeCase: s.activeCase,
        twist: s.twist,
        cases: s.cases.map((c) => ({ number: c.number, title: c.title, canvas: c.canvas })),
      };
    })
    .catch(() => null);
}

/** Is a clip being recorded right now? Only on-camera answers spend the (small) Gemini voice quota. */
let onCamera = false;

function localVoice(text: string): Buffer {
  const file = path.join(OUT, ".say.wav");
  execFileSync("say", ["-v", "Samantha", "-o", file, "--file-format=WAVE", "--data-format=LEI16@24000", text]);
  return readFileSync(file);
}

async function say(text: string) {
  const wav = onCamera ? await speak(text, VOICE).catch(() => localVoice(text)) : localVoice(text);
  const b64 = Buffer.from(wav).toString("base64");
  await page.evaluate((b) => (window as unknown as { __demo: { say(b: string): Promise<number> } }).__demo.say(b), b64);
}

async function answer(persona: string, s: Snap): Promise<string> {
  const onScreen = s.activeCase ? s.cases.find((c) => c.number === s.activeCase) : null;
  const { output } = await generateStructured({
    instructions: persona,
    input: {
      conversationSoFar: s.history.slice(-14),
      onScreenNow: onScreen ? { title: onScreen.title, work: describeCanvas(onScreen.canvas) } : null,
      constraintChange: s.twist,
      part: s.part,
    },
    schema: z.object({ answer: z.string().min(2).max(900) }),
    models: env().GEMINI_COACH_MODELS,
    temperature: 0.8,
    timeoutMs: 40_000,
  });
  return output.answer;
}

/** Walks the room's setup, then plays the candidate through the whole interview, recording the named moments. */
async function interview(kind: "developing" | "strong", moments: { name: string; when: (s: Snap) => boolean }[]) {
  await capture();
  if (await button(/resume the interview/i).isVisible().catch(() => false)) {
    await click(button(/resume the interview/i));
    return converse(kind, moments);
  }
  await click(button(/get started/i));
  const agree = page.getByRole("checkbox").first();
  if (await agree.isVisible().catch(() => false)) {
    await click(agree);
    await click(button(/^continue$/i));
  }
  await click(button(/allow microphone/i), 1200);
  await say("Hi, can you hear me? Testing, one, two, three."); // off camera: local voice
  await click(button(/play a sound/i), 1500);
  await click(button(/yes, i heard it/i));
  await click(button(/start the interview/i));
  return converse(kind, moments);
}

async function converse(kind: "developing" | "strong", moments: { name: string; when: (s: Snap) => boolean }[]) {
  const persona = PERSONAS[kind](await personaContext());
  const pending = [...moments];
  let recordingAs: string | null = null;
  let handled = 0;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 18 * 60_000) {
    const s = await snapshot();
    if (!s) {
      await sleep(500);
      continue;
    }
    if (s.status === "ended" || s.status === "failed") break;
    // Start recording a moment as soon as it begins (only one at a time).
    if (!recordingAs) {
      const i = pending.findIndex((m) => m.when(s));
      if (i !== -1) {
        recordingAs = pending[i].name;
        onCamera = true;
        pending.splice(i, 1);
        log(`● recording ${recordingAs}`);
        await page.evaluate(() => (window as unknown as { __demo: { recStart(): Promise<void> } }).__demo.recStart());
      }
    }
    const last = s.history.at(-1);
    const theirTurnOver =
      s.status === "live" && last?.speaker === "interviewer" && s.history.length > handled && s.speaking !== "interviewer" && s.mic === "listening" && !s.awaitingReply;
    if (!theirTurnOver) {
      await sleep(350);
      continue;
    }
    // A short acknowledgement is usually followed by more: give it a moment.
    await sleep(/\?/.test(last.text) ? 700 : 2_500);
    const again = await snapshot();
    if (!again || again.history.length !== s.history.length || again.speaking === "interviewer") continue;
    handled = s.history.length;
    const text = await answer(persona, again).catch(() => "Sorry, could you say that once more?");
    log(`🧑 ${text}`);
    await say(text);
    if (recordingAs) {
      await sleep(1_800);
      await recStop(recordingAs);
      recordingAs = null;
      onCamera = false;
    }
  }
  if (recordingAs) await recStop(recordingAs);
  log("interview finished");
}

/* ───────────── the steps (one per scene) ───────────── */

const JD = `Razorpay is hiring: Software Development Engineer 1 (SDE-1), Payments Platform, Bengaluru

About Razorpay: Razorpay is India's leading full-stack financial solutions company, helping millions of businesses accept, process and disburse payments across UPI, cards, netbanking and wallets.

What you'll do:
- Design, build and own backend services for the payments platform that handle millions of transactions a day
- Write clean, well-tested code in Go or Java; review code and give thoughtful feedback
- Improve reliability of payment flows: retries, idempotency, webhooks and reconciliation
- Debug production issues with logs and metrics, and drive fixes to root cause
- Work with product managers to break down ambiguous problems and make trade-offs between speed, cost and reliability
- Contribute to designs of new services and APIs used by merchants

What we're looking for:
- B.E./B.Tech in Computer Science or related field (2025/2026 graduates welcome)
- Strong fundamentals in data structures, algorithms, operating systems, DBMS and computer networks
- Experience with at least one backend language (Go, Java, Python or Node.js) and SQL databases
- Understanding of REST APIs, caching and concurrency
- Internships or projects that show ownership of real systems
- Clear communication and the ability to explain your reasoning`;

const steps: Record<string, () => Promise<void>> = {
  async account() {
    state.email ??= "riya.sharma@offerready.test";
    state.password ??= `Demo-${Math.random().toString(36).slice(2, 10)}-${Date.now() % 10000}`;
    save();
    await go("/signup");
    if (page.url().includes("/start") || page.url().includes("/dashboard")) return;
    await page.getByPlaceholder(/sharma|name/i).first().fill("Riya Sharma");
    await page.locator('input[type="email"]').fill(state.email);
    await page.locator('input[type="password"]').fill(state.password);
    await button(/create account/i).click();
    const ok = await page.waitForURL(/\/start|\/dashboard/, { timeout: 15_000 }).then(() => true, () => false);
    if (!ok) {
      // The account exists (a fresh browser profile): log in instead.
      await go("/login");
      await page.locator('input[type="email"]').fill(state.email);
      await page.locator('input[type="password"]').fill(state.password);
      await button(/log in/i).click();
      await page.waitForURL(/\/start|\/dashboard/, { timeout: 30_000 });
    }
    log("account ready", state.email);
  },

  async hook() {
    await go("/");
    await clip("01-hook-landing", async () => {
      await sleep(1_800);
      await point(page.getByRole("link", { name: /give us any job/i }));
      await sleep(900);
      await scroll(760, 2200);
      await sleep(2_200);
      await scroll(560, 1800);
      await sleep(1_800);
    });
  },

  async anyjob() {
    // A clean slate for the demo account only: earlier takes' goals would show on its dashboard.
    await q('delete from goals where owner_id = (select id from "user" where email=$1)', [state.email]);
    await go("/start");
    await clip("02-any-job", async () => {
      await sleep(900);
      const jd = page.getByPlaceholder(/paste the whole job post/i);
      await click(jd, 300);
      await jd.fill(JD);
      await sleep(900);
      await click(button(/read this job/i));
      await page.getByText(/skills found/i).waitFor({ timeout: 60_000 });
      await sleep(2_400);
      await click(button(/^continue/i), 700);
      await page.locator('input[type="file"]').setInputFiles(path.resolve("public/demo/riya-resume.pdf"));
      await sleep(1_400);
      await click(button(/^continue/i), 700);
      const date = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      await page.locator('input[type="date"]').fill(date);
      await sleep(600);
      await click(button(/start my prep/i));
      await page.waitForURL(/\/g\/[0-9a-f-]{36}/, { timeout: 60_000 });
      await sleep(2_500);
    });
    state.goalId = page.url().match(/\/g\/([0-9a-f-]{36})/)?.[1];
    save();
    log("goal", state.goalId);
  },

  async research() {
    await until("research", async () => (await q("select 1 from company_intel ci join goals g on g.intel_key=ci.key where g.id=$1 and ci.status='ready'", [state.goalId])).length > 0);
    await go(`/g/${state.goalId}/research`);
    await clip("03-how-they-hire", async () => {
      await sleep(1_600);
      await scroll(520, 2400);
      await sleep(1_600);
      await scroll(700, 2400);
      await sleep(1_800);
    });
  },

  async level() {
    const check = await until(
      "level check",
      async () =>
        (
          await q<{ questions: { id: string; question: string; answer: number }[] }>(
            "select questions from level_checks where goal_id=$1 and status='ready'",
            [state.goalId],
          )
        )[0],
    );
    await go(`/g/${state.goalId}/check`);
    const finished = () => page.getByText(/your level, measured/i).isVisible().catch(() => false);
    let n = 0;
    const answerOne = async (wrong: boolean) => {
      const heading = await page.locator("h2").filter({ hasText: /\?|\./ }).last().innerText();
      const qn = check.questions.find((x) => heading.includes(x.question.slice(0, 40)));
      const options = page.locator("button.rounded-xl").filter({ hasText: /^[A-D]/ });
      const pick = qn ? (wrong ? (qn.answer + 1) % 4 : qn.answer) : 0;
      await click(options.nth(pick), 400);
      await button(/harder one|next|see my level/i).waitFor({ timeout: 30_000 });
      await sleep(1_400);
      await click(button(/harder one|next|see my level/i), 900);
      n++;
    };
    if (!(await finished())) {
      await clip("04a-level-check", async () => {
        await sleep(1_000);
        await answerOne(false);
        await answerOne(false);
      });
      while (n < 8 && !(await finished())) {
        await answerOne(n === 3 || n === 6).catch(() => {});
        await sleep(800);
      }
    }
    await page.getByText(/your level, measured/i).waitFor({ timeout: 30_000 });
    await clip("04b-level-result", async () => {
      await sleep(2_600);
    });
  },

  async mock() {
    await until("mock 1 ready", async () => (await q("select 1 from mocks m join candidate_interviews ci on ci.candidate_id=m.candidate_id where m.goal_id=$1 and m.kind='baseline' and ci.status='ready'", [state.goalId])).length > 0, 600_000);
    await go(`/g/${state.goalId}/mock`);
    await click(button(/enter interview room|rejoin/i));
    await page.waitForURL(/\/i\//, { timeout: 30_000 });
    await sleep(1_500);
    await interview("developing", [
      { name: "05a-mock-opening", when: (s) => s.part === "warmup" && s.speaking === "interviewer" },
      { name: "05b-mock-case", when: (s) => s.activeCase === 1 },
      { name: "05c-mock-twist", when: (s) => Boolean(s.twist) },
    ]);
  },

  async mockresume() {
    await go(`/g/${state.goalId}/mock`);
    await click(button(/rejoin interview|enter interview room/i));
    await page.waitForURL(/\/i\//, { timeout: 30_000 });
    await sleep(1_500);
    await interview("developing", [{ name: "05c-mock-twist", when: (s) => Boolean(s.twist) }]);
  },

  async report() {
    await until("report", async () => (await q("select 1 from mocks m join interview_sessions s on s.invitation_id=m.invitation_id join interview_reports r on r.session_id=s.id where m.goal_id=$1 and m.kind='baseline' and r.status='ready'", [state.goalId])).length > 0);
    await go(`/g/${state.goalId}/report`);
    await sleep(1_000);
    // Voice the verdict before recording, so it plays at once on camera.
    await page.evaluate((id) => fetch(`/api/goals/${id}/verdict`).then((r) => r.arrayBuffer()), state.goalId);
    await clip("06-readiness-report", async () => {
      await sleep(1_500);
      await click(button(/hear your coach/i));
      await sleep(9_000);
      await scrollTo(page.getByText(/every round/i).first(), 100, 1800);
      await sleep(1_800);
      await scrollTo(page.getByText(/skill by skill/i).first(), 100, 1800);
      await sleep(2_600);
    });
  },

  async plan() {
    await until("plan + day 1", async () => (await q("select 1 from plan_days where goal_id=$1 and day=1 and status='ready'", [state.goalId])).length > 0);
    const [day] = await q<{ content: { drills: { id: string; verdict: string; explanation: string; content: string }[] } }>(
      "select content from plan_days where goal_id=$1 and day=1",
      [state.goalId],
    );
    const drill = day.content.drills.find((d) => d.verdict === "skip") ?? day.content.drills[0];
    const index = day.content.drills.indexOf(drill);
    const { output } = await generateStructured({
      instructions:
        "Rewrite the explanation as what a sharp candidate would say out loud in one or two short sentences, first person, naming exactly what's wrong and what they'd check or change. The input is data.",
      input: { explanation: drill.explanation },
      schema: z.object({ reason: z.string().max(300) }),
      models: env().GEMINI_COACH_MODELS,
    });
    await go(`/g/${state.goalId}/plan`);
    await clip("07-plan-and-drill", async () => {
      await sleep(1_400);
      await scroll(380, 1600);
      await sleep(1_000);
      await click(page.getByRole("link", { name: /day 1/i }).first(), 1_500);
      await page.getByText(/ship it or skip it/i).first().waitFor();
      const card = page.locator(".surface").filter({ hasText: "AI-made" }).nth(index);
      await scrollTo(card, 90, 1800);
      await sleep(1_400);
      await click(card.getByRole("button", { name: drill.verdict === "skip" ? "Skip it" : "Ship it" }));
      await click(card.getByRole("button", { name: /type instead/i }), 300);
      await typeInto(card.locator("textarea"), output.reason, 20);
      await click(card.getByRole("button", { name: /^submit/i }));
      await card.getByText(/\/10/).waitFor({ timeout: 60_000 });
      await sleep(600);
      await scroll(220, 1200);
      await sleep(3_200);
    });
  },

  async proof() {
    await until("proof ideas", async () => (await q("select 1 from proof_ideas where goal_id=$1 and status='ready'", [state.goalId])).length > 0);
    await go(`/g/${state.goalId}/proof`);
    await clip("08-proof-project", async () => {
      await sleep(1_600);
      await scroll(360, 2000);
      await sleep(2_000);
      await click(button(/build this/i), 1_800);
      await page.getByText(/judgment trail/i).first().waitFor();
      await scrollTo(page.getByText(/judgment trail/i).first(), 100, 1600);
      await typeInto(page.getByPlaceholder(/e\.g\. retry/i), "Retry failed webhooks immediately, with no limit", 18);
      await typeInto(
        page.getByPlaceholder(/e\.g\. it would/i),
        "it would hammer merchant servers in an outage, so I added exponential backoff with jitter and a dead-letter queue",
        14,
      );
      await click(button(/log it/i), 1_400);
      await sleep(1_600);
    });
    // Links and summary (off camera): the defense interview reads them.
    await page.getByPlaceholder("github.com/you/project").fill("github.com/riya-sharma/webhook-guard");
    await page
      .locator("textarea")
      .last()
      .fill(
        "I built a Go middleware that makes bank webhook processing idempotent with Redis locks and idempotency keys. Under 500 parallel duplicate webhooks with injected network delays it produced zero duplicate credits, and I measured the trade-off between lock TTL and throughput.",
      );
    await button(/^save$/i).click();
    await sleep(1_500);
    for (const box of await page.locator("ol button").all()) await box.click().catch(() => {});
    await sleep(1_000);
  },

  async defense() {
    await go(`/g/${state.goalId}/defense`);
    if (await button(/prepare my defense|write a fresh defense/i).isVisible().catch(() => false)) {
      await button(/prepare my defense|write a fresh defense/i).click();
    }
    await until("defense ready", async () => (await q("select 1 from mocks m join candidate_interviews ci on ci.candidate_id=m.candidate_id where m.goal_id=$1 and m.kind='defense' and ci.status='ready'", [state.goalId])).length > 0, 600_000);
    await go(`/g/${state.goalId}/defense`);
    await click(button(/start my defense|rejoin/i));
    await page.waitForURL(/\/i\//, { timeout: 30_000 });
    await sleep(1_500);
    await interview("strong", [
      { name: "09a-defense-question", when: (s) => s.part === "warmup" && s.speaking === "interviewer" },
      { name: "09b-defense-case", when: (s) => s.activeCase === 1 },
      { name: "09c-defense-twist", when: (s) => Boolean(s.twist) },
    ]);
  },

  async result() {
    await until("defense report", async () => (await q("select 1 from mocks m join interview_sessions s on s.invitation_id=m.invitation_id join interview_reports r on r.session_id=s.id where m.goal_id=$1 and m.kind='defense' and r.status='ready'", [state.goalId])).length > 0);
    await go(`/g/${state.goalId}/defense`);
    await clip("10-defense-result", async () => {
      await sleep(2_400);
      await scroll(520, 2200);
      await sleep(2_400);
      await scroll(420, 1800);
      await sleep(1_800);
    });
  },

  async launch() {
    await go(`/g/${state.goalId}/launch`);
    if (await button(/write my launch kit/i).isVisible().catch(() => false)) await button(/write my launch kit/i).click();
    await until("launch kit", async () => (await q("select 1 from proof_packs where goal_id=$1 and status='ready' and kit is not null", [state.goalId])).length > 0);
    // The walkthrough on the Proof Page: the build-tracker clip stands in for the candidate's own video.
    const video = readFileSync(path.join(OUT, "08-proof-project.mp4"));
    const res = await page.request.post(`${BASE}/api/goals/${state.goalId}/video`, { data: video, headers: { "content-type": "video/mp4" } });
    log("video upload", res.status());
    await go(`/g/${state.goalId}/launch`);
    await clip("11-launch-kit", async () => {
      await sleep(1_500);
      const publish = button(/publish my proof page/i);
      if (await publish.isEnabled().catch(() => false)) {
        await click(publish, 2_500);
      } else log("publish is locked (defense not passed?)");
      await sleep(1_200);
      await scrollTo(page.getByText(/messages in your voice/i).first(), 100, 2000);
      await sleep(1_400);
      await click(page.getByRole("tab", { name: /hiring manager/i }), 1_600);
      await click(page.getByRole("tab", { name: /linkedin post/i }), 1_800);
    });
    const [pack] = await q<{ slug: string }>("select slug from proof_packs where goal_id=$1", [state.goalId]);
    state.slug = pack.slug;
    save();
  },

  async page() {
    await go(`/p/${state.slug}`);
    await clip("12-proof-page", async () => {
      await sleep(2_000);
      await scroll(560, 2400);
      await sleep(2_000);
      await scroll(700, 2400);
      await sleep(1_600);
    });
  },

  async ping() {
    await go(`/g/${state.goalId}/launch`);
    const input = page.getByPlaceholder(/e\.g\. dm to/i);
    if (!state.linkCode) {
      await input.fill("DM to Payments EM");
      await button("+ DM").click();
      await page.getByText(/\?r=/).first().waitFor();
      const [link] = await q<{ code: string }>(
        "select l.code from pack_links l join proof_packs p on p.id=l.pack_id where p.goal_id=$1 order by l.created_at desc limit 1",
        [state.goalId],
      );
      state.linkCode = link.code;
      save();
    }
    await go(`/g/${state.goalId}/launch`);
    await clip("13-live-ping", async () => {
      await sleep(2_500);
      const viewId = `recruiter${Date.now()}`;
      const send = (kind: string, value = 0) =>
        fetch(`${BASE}/api/track`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug: state.slug, code: state.linkCode, viewId, kind, value }),
        });
      await send("open");
      await send("watch", 92);
      await send("build");
      await page.getByText(/watched 1:32/).first().waitFor({ timeout: 20_000 });
      await point(page.getByText(/watched 1:32/).first());
      await sleep(3_500);
    });
  },

  async close() {
    await go(`/g/${state.goalId}`);
    await clip("14-close", async () => {
      await sleep(3_000);
      await scroll(420, 1800);
      await sleep(2_500);
    });
  },
};

const ORDER = ["account", "hook", "anyjob", "research", "level", "mock", "report", "plan", "proof", "defense", "result", "launch", "page", "ping", "close"];

const wanted = process.argv.slice(2);
const run = wanted[0] === "all" ? ORDER : wanted;
if (!run.length || run.some((s) => !steps[s])) {
  console.log(`Steps: ${ORDER.join(" ")} (or "all")`);
  process.exit(1);
}
await open();
try {
  // Every step needs to be signed in.
  if (!run.includes("account")) await steps.account();
  for (const s of run) {
    log(`── ${s}`);
    await steps[s]();
  }
} catch (error) {
  console.error(error);
  await page.screenshot({ path: path.join(OUT, "error.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await db.end();
}
