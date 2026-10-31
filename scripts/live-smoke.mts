/**
 * Dev only: a whole interview against real Gemini Live, run as the browser runs it: our server's
 * start/sync/reveal/end, the locked token, the interviewer running the plan with its tools, and
 * the clock telling it when each part's time is up. The candidate speaks (macOS `say`, streamed as
 * 16 kHz audio), so transcription and turn-taking are real too. Prints each turn, how long the
 * reply took, when each case went on screen, and anything that went wrong.
 *
 *   pnpm live:smoke --invitation <id>   resets that FICTIONAL test invitation and interviews it
 *   SMOKE_SPEED=2                        the interview clock runs 2x (a full interview in ~8 min)
 *
 * Fictional candidates only (example.com / mock.werdict.test emails): the attempt is wiped.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoogleGenAI, type LiveServerMessage, Modality, type Session } from "@google/genai";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { candidates, interviewSessions, invitations } from "@/db/schema";
import {
  caseBeingIntroduced,
  caseEnds,
  clockPhase,
  isRoomPart,
  partEnds,
  ROOM_PARTS,
  type RoomPart,
  TOOL,
  timekeeper,
} from "@/lib/interview-room";
import { consent, endLive, reveal, startLive, syncLive } from "@/server/candidate-sessions";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const invitationId = arg("--invitation");
if (!invitationId) throw new Error("Usage: pnpm live:smoke --invitation <fictional invitation id>");
const SPEED = Number(process.env.SMOKE_SPEED ?? 2);
const device = "smoke-device-0123456789abcdefghijklmnop";

// ---- a fresh attempt on a fictional invitation ----
const [inv] = await db()
  .select({ id: invitations.id, email: candidates.email })
  .from(invitations)
  .innerJoin(candidates, eq(candidates.id, invitations.candidateId))
  .where(eq(invitations.id, invitationId));
if (!inv?.email || !/@(example\.com|mock\.werdict\.test|offerready\.test)$/.test(inv.email))
  throw new Error(
    "Only fictional test candidates (example.com, mock.werdict.test, offerready.test) can be used.",
  );
const token = randomBytes(32).toString("base64url");
await db().delete(interviewSessions).where(eq(interviewSessions.invitationId, inv.id));
await db()
  .update(invitations)
  .set({ tokenHash: hashToken(token), status: "sent", expiresAt: null })
  .where(eq(invitations.id, inv.id));

await consent(token);
const start = await startLive(token, device, { takeover: false, handle: null });
console.log(`start: ${start.model} · ${start.plan.firstName} · ${start.plan.roleTitle}`);

// ---- the candidate's voice ----
const voiceDir = mkdtempSync(join(tmpdir(), "werdict-smoke-"));
function speech(text: string): Buffer {
  const file = join(voiceDir, "a.wav");
  execFileSync("say", ["-v", "Samantha", "-o", file, "--data-format=LEI16@16000", text]);
  return readFileSync(file).subarray(44);
}
const silence = (ms: number) => Buffer.alloc(Math.round((ms / 1000) * 32_000));

// ---- the call ----
const t0 = Date.now();
const clock = () => t0 + (Date.now() - t0) * SPEED;
let endsAt: number | null = null;
let part: RoomPart = start.part;
let seq = start.nextSeq;
let session: Session | undefined;
let said = "";
let heard = "";
let audioBytes = 0;
let firstAudioAt = 0;
let askedAt = Date.now();
let ending = false;
let casesShown = 0;
let twistShown = false;
let answered = 0;
let closeAnswers = 0;
let safetyNet = false;
/** Times the screen followed the interviewer's words because it didn't call the tool. */
const nets: string[] = [];
const shownCases = new Set<number>();
let lastNetAt = 0;
const shown: string[] = [];
const sentClock = new Set<string>();
const problems: string[] = [];
const latencies: number[] = [];

/** What the candidate says: by part, with a half answer, a request to repeat and short answers along the way. */
function answerFor(): string {
  answered++;
  if (part === "practice") return "Hi! It's going well, thanks for asking.";
  if (answered === 2) return "Yeah, so";
  if (answered === 4) return "Sorry, can you repeat the question?";
  if (answered === 6) return "I'm not sure.";
  if (part === "close")
    return closeAnswers++ === 0
      ? "Looking back, I'd involve design earlier and write the tests before the refactor, not after."
      : "No questions from my side. Thank you.";
  if (part === "cases")
    return [
      "Okay, looking at it now. The first thing I notice is this part at the top. It doesn't look right, and it affects every user, so I'd check that first.",
      "I'd roll back first, then check the data, and only after that fix the root cause, because users are affected right now.",
      "With that change, I'd still protect the users first, but I'd tell the stakeholders today and push the lower priority work to next week.",
    ][answered % 3] as string;
  return [
    "The hardest call was moving our dashboard to server side rendering. First load got faster on slow phones, but caching got harder, so we measured real user data for two weeks before rolling it out.",
    "We had a team of five. I checked the speed up with real user monitoring, and the largest paint went from about four seconds to under two.",
    "cost",
  ][answered % 3] as string;
}

const sync = async (turn?: { speaker: "interviewer" | "candidate"; text: string }) => {
  const r = await syncLive(token, device, {
    turns: turn ? [{ seq: seq++, ...turn, part, atMs: Date.now() - t0 }] : [],
    part,
    handle: null,
    hidden: { count: 0, ms: 0 },
    events: [],
  });
  // The server's clock, sped up like ours.
  if (r.endsAt && endsAt === null) endsAt = clock() + (Date.parse(r.endsAt) - Date.now());
};

async function show(what: { kind: "case"; number: number } | { kind: "twist" }) {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const r = await reveal(token, device, what);
      if (r.case) {
        casesShown = Math.max(casesShown, r.case.number);
        shownCases.add(r.case.number);
      }
      if (r.twist) twistShown = true;
      const title = r.case?.title ?? "the twist";
      console.log(`   🗂 on screen: ${title}`);
      shown.push(title);
      return true;
    } catch {
      // The server spaces new cases 15 s apart (real time): wait, as the browser does.
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
  problems.push(`couldn't show ${JSON.stringify(what)}`);
  return false;
}

/** The clock, as the browser tells it (context only, except time-up). */
function tellTime() {
  if (endsAt === null || ending) return;
  const now = clock();
  const left = endsAt - now;
  const here = ROOM_PARTS.indexOf(part);
  const tell = (key: string, text: string, respond = false) => {
    if (sentClock.has(key)) return;
    sentClock.add(key);
    console.log(`   ⏱ ${text}`);
    if (respond) session?.sendRealtimeInput({ text });
    else
      session?.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: false,
      });
  };
  const phase = clockPhase(endsAt, now);
  if (phase === "time-up" || phase === "over") return tell("time-up", timekeeper.timeUp(), true);
  if (phase === "wrap-up") {
    if (here < ROOM_PARTS.indexOf("close")) tell("wrap-up", timekeeper.wrapUp());
    return;
  }
  for (const end of partEnds(start.plan.depth))
    if (left <= end.msLeft && here <= ROOM_PARTS.indexOf(end.part))
      tell(end.part, timekeeper.partOver(end.part, end.next, Math.round(end.msLeft / 60_000)));
  if (part === "cases")
    for (const end of caseEnds(start.plan.depth, start.plan.cases))
      if (left <= end.msLeft && Math.max(1, casesShown) <= end.case)
        tell(`case${end.case}`, timekeeper.caseOver(end.case, Math.round(end.msLeft / 60_000)));
}
const clockTimer = setInterval(tellTime, 500);

async function speak(text: string) {
  console.log(`🧑 ${text}`);
  const audio = Buffer.concat([speech(text), silence(1_200)]);
  for (let i = 0; i < audio.length; i += 1_280) {
    session?.sendRealtimeInput({
      audio: {
        data: audio.subarray(i, i + 1_280).toString("base64"),
        mimeType: "audio/pcm;rate=16000",
      },
    });
    await new Promise((r) => setTimeout(r, 40));
  }
  // As the browser: the voice gate closed; a moment later, the turn is over.
  await new Promise((r) => setTimeout(r, 300));
  askedAt = Date.now();
  session?.sendRealtimeInput({ audioStreamEnd: true });
}

const finished = new Promise<void>((resolve) => {
  const onMessage = async (msg: LiveServerMessage) => {
    if (msg.setupComplete) {
      setTimeout(() => {
        askedAt = Date.now();
        session?.sendRealtimeInput({ text: timekeeper.greeting() });
      }, 400);
      return;
    }
    const calls = msg.toolCall?.functionCalls ?? [];
    if (calls.length) {
      const responses = [];
      for (const call of calls) {
        const args = call.args ?? {};
        console.log(`   ⚙ ${call.name}(${JSON.stringify(args)})`);
        let response: Record<string, unknown> = { ok: true };
        if (call.name === TOOL.nextSection && isRoomPart(args.to)) {
          if (ROOM_PARTS.indexOf(args.to) > ROOM_PARTS.indexOf(part)) part = args.to;
          await sync();
          // As the browser: the cases start with case 1 on screen.
          if (args.to === "cases" && !casesShown)
            response = { ok: await show({ kind: "case", number: 1 }) };
        } else if (call.name === TOOL.showCase)
          response = { ok: await show({ kind: "case", number: Number(args.number) }) };
        else if (call.name === TOOL.showTwist) response = { ok: await show({ kind: "twist" }) };
        else if (call.name === TOOL.end) ending = true;
        responses.push({ id: call.id, name: call.name, response });
      }
      session?.sendToolResponse({ functionResponses: responses });
    }
    const c = msg.serverContent;
    if (c?.inputTranscription?.text) heard += c.inputTranscription.text;
    for (const p of c?.modelTurn?.parts ?? [])
      if (p.inlineData?.data) {
        if (!audioBytes) firstAudioAt = Date.now();
        audioBytes += p.inlineData.data.length;
      }
    if (c?.outputTranscription?.text) {
      said += c.outputTranscription.text;
      // As the browser: the screen follows what's said when the tool wasn't called.
      const net = (why: string, what: { kind: "case"; number: number } | { kind: "twist" }) => {
        if (Date.now() - lastNetAt < 5_000) return;
        lastNetAt = Date.now();
        safetyNet = true;
        nets.push(why);
        console.log(`   (safety net: ${why})`);
        void show(what);
      };
      const t = said.toLowerCase();
      const n = caseBeingIntroduced(start.plan.caseCues, shownCases, t);
      if (n) net(`case ${n} from its opening`, { kind: "case", number: n });
      else if (
        start.plan.twistCase !== null &&
        shownCases.has(start.plan.twistCase) &&
        !twistShown &&
        /\b(something|one thing) (has |'s )?changed|there'?s been a change\b/.test(t)
      )
        net("the twist from its words", { kind: "twist" });
      else if (
        !shownCases.size &&
        ROOM_PARTS.indexOf(part) >= ROOM_PARTS.indexOf("projects") &&
        /\b(your|the) screen\b|\btake a look\b/.test(t)
      )
        net('case 1 from "take a look"', { kind: "case", number: 1 });
    }
    if (!c?.turnComplete) return;
    const text = said.replace(/\s+/g, " ").trim();
    const bytes = audioBytes;
    said = "";
    audioBytes = 0;
    if (!text) return;
    if (heard.trim()) await sync({ speaker: "candidate", text: heard.replace(/\s+/g, " ").trim() });
    heard = "";
    latencies.push(firstAudioAt - askedAt);
    console.log(`\n🎙 [${part}] (+${((firstAudioAt - askedAt) / 1000).toFixed(1)}s) ${text}`);
    // A case talked about before any was on screen: the failure this run exists to catch.
    if (/\b(your|the) screen\b/i.test(text) && casesShown === 0 && !twistShown && !safetyNet)
      problems.push(`talked about the screen with nothing on it: ${text}`);
    if (/[a-z_]+\([^)]*\)/.test(text)) problems.push(`said a tool call aloud: ${text}`);
    await sync({ speaker: "interviewer", text });
    // As the browser: a goodbye in the close ends the call, even without end_interview.
    if (part === "close" && /\bgoodbye\b/i.test(text) && !ending) {
      ending = true;
      console.log("   (goodbye without end_interview: the browser ends the call)");
    }
    // Listen to the whole turn (24 kHz, 16-bit, base64) before answering.
    await new Promise((r) => setTimeout(r, ((bytes * 0.75) / 48_000) * 1_000));
    if (ending) return resolve();
    // A bare acknowledgement ("Thanks.") is followed by more: wait for it.
    if (!/\?/.test(text) && text.split(" ").length <= 4 && !/go on|take your time/i.test(text))
      return;
    await speak(answerFor());
  };
  void ai()
    .live.connect({
      model: start.model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (m) => void onMessage(m).catch((e) => problems.push(String(e))),
        onerror: (e) => problems.push(`error: ${e.message}`),
        onclose: (e) => {
          if (!ending) problems.push(`closed early: ${e.code} ${e.reason}`);
          resolve();
        },
      },
    })
    .then((s) => {
      session = s;
    });
});

function ai() {
  return new GoogleGenAI({ apiKey: start.token, httpOptions: { apiVersion: "v1alpha" } });
}

await Promise.race([finished, new Promise((r) => setTimeout(r, 14 * 60_000))]);
clearInterval(clockTimer);
session?.close();
await endLive(token, device, "finished").catch(() => {});
rmSync(voiceDir, { recursive: true, force: true });
if (casesShown < start.plan.cases)
  problems.push(`only ${casesShown} of ${start.plan.cases} cases shown`);
if (start.plan.cases >= 2 && !twistShown) problems.push("the twist was never shown");
if (!ending) problems.push("the interview never ended");
const sorted = [...latencies].sort((a, b) => a - b);
console.log(
  `\n— safety nets used: ${nets.length ? nets.join("; ") : "none"}\n— ${latencies.length} interviewer turns · reply start median ${((sorted[Math.floor(sorted.length / 2)] ?? 0) / 1000).toFixed(1)}s, worst ${((sorted.at(-1) ?? 0) / 1000).toFixed(1)}s · on screen: ${shown.join(" → ") || "nothing"}`,
);
console.log(
  problems.length ? `⚠️  ${problems.length} problem(s):\n${problems.join("\n")}` : "✓ no problems",
);
process.exit(0);
