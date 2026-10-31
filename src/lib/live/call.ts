import { GoogleGenAI, type LiveServerMessage, Modality, type Session } from "@google/genai";
import {
  type CanvasEvent,
  type CanvasEventKind,
  canvasIds,
  MAX_NOTES_PER_CASE,
  NOTE_MAX_CHARS,
} from "@/lib/canvas";
import type { AnswerMetrics } from "@/lib/integrity";
import {
  caseBeingIntroduced,
  caseEnds,
  clockPhase,
  isRoomPart,
  MOMENT_MS,
  partEnds,
  type RevealedCase,
  ROOM_PARTS,
  type RoomPart,
  type RoomPlan,
  SILENCE_MS,
  SYNC_EVERY_MS,
  TOOL,
  timekeeper,
} from "@/lib/interview-room";
import { type Mic, openMic, Player } from "./audio";
import { TurnKeeper } from "./turns";
import { VoiceGate } from "./voice-gate";

export { MicError } from "./audio";

/**
 * One candidate's live interview in the browser. Connects to Gemini Live with
 * a single-use token from our server, streams the microphone, plays the
 * interviewer, keeps time from the server's clock, and saves the transcript
 * every few seconds. Survives dropped connections: Gemini's resumption handle
 * carries the conversation over, and our server gives back the lost time.
 *
 * Who decides what: the interviewer runs the interview from its notes (as in
 * truvet). It records each new part (next_section) and puts each case on the
 * screen (show_case, show_twist) before it talks about it; the browser answers
 * those calls only once the screen has changed. The browser keeps time: when
 * a part's minutes are up it tells the interviewer, which moves on. The voice
 * gate ends each answer, and the interviewer replies.
 */

export type CallStatus =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "ending"
  | "ended"
  | "elsewhere"
  | "moved"
  | "failed";

export interface CallSnapshot {
  status: CallStatus;
  error: string | null;
  part: RoomPart;
  /** Who is talking right now, for the orb. */
  speaking: "interviewer" | "candidate" | null;
  /**
   * The interviewer's last question, as captions. It stays on screen while the
   * candidate answers, until the interviewer says something new.
   */
  caption: string;
  /** What the interviewer heard the candidate say, live, for the current answer. */
  heard: string;
  /** Everything said so far, in order, as it was captured. */
  history: { speaker: "interviewer" | "candidate"; text: string }[];
  cases: RevealedCase[];
  activeCase: number | null;
  twist: string | null;
  endsAt: number | null;
  /** serverNow - Date.now(): add to the local clock for the server's time. */
  clockOffset: number;
  muted: boolean;
  /**
   * The candidate's mic: closed until the interviewer's greeting has played,
   * and paused whenever the interviewer speaks, so the room can't cut it off.
   */
  mic: "waiting" | "listening" | "paused";
  /** The room is loud enough to confuse the interviewer. */
  noisy: boolean;
  thinking: boolean;
  /** The interviewer hasn't greeted yet, well after it was asked to. */
  slowStart: boolean;
  /** The candidate finished; the interviewer's reply hasn't started yet. */
  awaitingReply: boolean;
  plan: RoomPlan | null;
  /** Parts of the active case the interviewer is pointing at. */
  lit: string[];
  /** The part the candidate tapped. */
  picked: string | null;
  /** The candidate's decisions, written on the canvas by the interviewer. */
  notes: { caseNumber: number; text: string }[];
}

type StartResponse = {
  token: string;
  model: string;
  resuming: boolean;
  restored: boolean;
  part: RoomPart;
  cases: RevealedCase[];
  twist: string | null;
  firstConnectAt: string;
  startedAt: string | null;
  endsAt: string | null;
  serverNow: string;
  nextSeq: number;
  nextEventSeq: number;
  notes: { caseNumber: number; text: string }[];
  history: { speaker: "interviewer" | "candidate"; text: string }[];
  plan: RoomPlan;
};

type Turn = {
  seq: number;
  speaker: "interviewer" | "candidate";
  part: RoomPart;
  text: string;
  atMs: number;
  metrics?: AnswerMetrics;
};

/** A quiet stretch this long inside an answer counts as a pause (~0.7 s of 40 ms chunks). */
const PAUSE_CHUNKS = 18;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const MAX_RECONNECTS = 8;
/** The interviewer's show_case waits this long for the case to be on screen before it carries on. */
const SCREEN_WAIT_MS = 4_000;
/** After the voice gate closes, this long before the turn is handed over (a last breath isn't a new answer). */
const SETTLE_MS = 300;
/** After the interviewer's voice stops, wait this long before listening (speaker echo dies away). */
const ECHO_TAIL_MS = 350;
/**
 * Gemini sometimes queues a session for a while before it speaks. Asking again would only queue a
 * second greeting, so the room says it's taking longer, and in the end lets the candidate start.
 */
/** Wait this long after the connection is ready before the opening note. */
const KICKOFF_DELAY_MS = 400;
const GREETING_SLOW_MS = 8_000;
/**
 * No greeting this long after the opening note: the session is probably
 * queued on Gemini's side, and a fresh one is usually served at once. Start
 * a new session (twice at most) instead of waiting on a stuck one.
 */
const GREETING_RESTART_MS = 6_000;
const MAX_GREETING_RESTARTS = 4;
/** Mid-call: no reply this long after the candidate finished (both nudges unanswered): new session. */
const STALL_RESTART_MS = 22_000;
const MAX_STALL_RESTARTS = 3;
const GREETING_GIVE_UP_MS = 45_000;
/** A noise floor above this is a loud room (people talking nearby, a TV). */
export const NOISY_FLOOR = 0.05;

const DEBUG = process.env.NODE_ENV !== "production";
/** Call events, in development. Warnings, because Next forwards those to the dev server log. */
const log = (...args: unknown[]) => {
  if (DEBUG) console.warn("[call]", ...args);
};
const backoff = (attempt: number) => Math.min(8_000, 500 * 2 ** attempt);

export class InterviewCall {
  private snapshot: CallSnapshot = {
    status: "idle",
    error: null,
    part: "practice",
    speaking: null,
    caption: "",
    heard: "",
    history: [],
    cases: [],
    activeCase: null,
    twist: null,
    endsAt: null,
    clockOffset: 0,
    muted: false,
    mic: "waiting",
    noisy: false,
    thinking: false,
    slowStart: false,
    awaitingReply: false,
    plan: null,
    lit: [],
    picked: null,
    notes: [],
  };
  private listeners = new Set<() => void>();

  private mic: Mic | null = null;
  private player: Player | null = null;
  private session: Session | null = null;
  private ready = false;
  /** Gemini can report setup complete before connect() resolves; the opening note waits for both. */
  private kickoff: string | null = null;
  private kickoffSentAt: number | null = null;
  private greetingRestarts = 0;
  private stallRestarts = 0;
  /** Fresh sessions started in place of stuck ones; every third uses the fallback model. */
  private restarts = 0;
  /** Use the fallback Live model for the next session. */
  private useFallback = false;
  /** The next session should answer the candidate's last words (the previous one went quiet). */
  private refreshCue = false;
  /** The interviewer has spoken its greeting (this page); the mic may open. */
  private greeted = false;
  private greetingTurnEnded = false;
  private turnHasAudio = false;
  private droppingLogged = false;
  private lastPlaybackAt = 0;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  private gate = new VoiceGate();
  /** Who may speak when: one reply per cue, no unasked-for turns. */
  private turns = new TurnKeeper();
  /** Cues waiting for the floor (they'd otherwise cut in on the interviewer). */
  private cues: string[] = [];
  /** Context notes waiting for the interviewer to finish its turn. */
  private notes: string[] = [];
  private handle: string | null = null;
  private reconnects = 0;
  private closingOnPurpose = false;

  private firstConnectAt = 0;
  private seq = 0;
  private eventSeq = 0;
  private pendingEvents: CanvasEvent[] = [];
  /** The answer being given now, for its timing. */
  private answer: {
    floorAt: number;
    firstVoiceAt: number | null;
    lastVoiceAt: number | null;
    pauses: number;
    quietRun: number;
  } | null = null;
  private revealing: number | null = null;
  private screenCheckedAt = 0;
  /** Clock messages already sent (part ends, wrap-up). */
  private clockSent = new Set<string>();
  private pending: Turn[] = [];
  private inBuffer = "";
  /** This interviewer turn has replaced the caption (it said enough to be worth showing). */
  private captionIsThisTurn = false;
  private outBuffer = "";
  private partDirty = false;

  private nudged = new Set<string>();
  private lastSound = Date.now();
  private thinkingUntil = 0;
  private endAfterGoodbye = false;

  private hiddenCount = 0;
  private hiddenMs = 0;
  private hiddenSince: number | null = null;

  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(private readonly token: string) {}

  // ---- store (for useSyncExternalStore) ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  private set(patch: Partial<CallSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  /** Live audio levels, read every frame by the orb (kept out of React state). */
  levels() {
    return { candidate: this.mic?.level ?? 0, interviewer: this.player?.level ?? 0 };
  }

  now() {
    return Date.now() + this.snapshot.clockOffset;
  }

  // ---- lifecycle ----

  /**
   * Opens the speaker and microphone (from a click: browsers only allow audio
   * after a user gesture), for the setup check. The
   * call reuses them, so the browser asks for the microphone only once.
   * Throws MicError when the microphone can't be used.
   */
  async prepareAudio() {
    this.player ??= new Player();
    await this.player.resume();
    this.mic ??= await openMic();
    this.mic.onChunk = (data, level) => this.onMicChunk(data, level);
  }

  /** The room's background level (0..1), learned from the microphone. */
  noiseFloor() {
    return this.gate.floor;
  }

  /** The speaker check's chime. */
  chime() {
    this.player?.chime();
  }

  async begin(opts: { takeover?: boolean } = {}) {
    if (this.snapshot.status !== "idle" && this.snapshot.status !== "elsewhere") return;
    this.set({ status: "connecting", error: null });
    try {
      await this.prepareAudio();
      if (!this.mic) throw new Error("The microphone isn't available.");
      await this.connect(opts.takeover ?? false);
      this.startLoops();
    } catch (error) {
      this.fail(error);
    }
  }

  private async connect(takeover: boolean) {
    const res = await this.post<StartResponse>("start", {
      takeover,
      handle: this.handle,
      fallback: this.useFallback,
    });
    this.firstConnectAt = Date.parse(res.firstConnectAt);
    if (this.seq < res.nextSeq) this.seq = res.nextSeq;
    if (this.eventSeq < res.nextEventSeq) this.eventSeq = res.nextEventSeq;
    if (!this.snapshot.notes.length && res.notes.length) this.set({ notes: res.notes });
    if (!this.snapshot.history.length && res.history.length) this.set({ history: res.history });
    const offset = Date.parse(res.serverNow) - Date.now();
    const part = this.snapshot.status === "connecting" ? res.part : this.snapshot.part;
    this.set({
      plan: res.plan,
      part,
      cases: res.cases.length >= this.snapshot.cases.length ? res.cases : this.snapshot.cases,
      activeCase: this.snapshot.activeCase ?? (res.cases.length ? res.cases.length : null),
      twist: res.twist ?? this.snapshot.twist,
      endsAt: res.endsAt ? Date.parse(res.endsAt) : null,
      clockOffset: offset,
    });

    const ai = new GoogleGenAI({ apiKey: res.token, httpOptions: { apiVersion: "v1alpha" } });
    this.ready = false;
    this.closingOnPurpose = false;

    // A fresh start greets; a reloaded page says welcome back; a connection swapped mid-call
    // on this page (Gemini recycles them about every 10 minutes) just carries on, silently.
    // Nothing said yet (a first start, or a fresh session because the greeting never came): greet.
    const kickoff =
      !res.resuming || res.nextSeq === 0
        ? timekeeper.greeting()
        : this.greeted
          ? this.refreshCue
            ? timekeeper.carryOn()
            : null
          : timekeeper.rejoin();
    this.refreshCue = false;
    // A fresh connection starts with the floor free. A reply the candidate was owed is still
    // owed, unless a new greeting is on its way (it would otherwise wait behind that reply forever).
    const owed = this.turns.owesReply && kickoff === null;
    this.turns = new TurnKeeper();
    this.cues = [];
    this.notes = [];
    if (owed) this.turns.cue(Date.now());
    log("connecting", { model: res.model, resuming: res.resuming, restored: res.restored });
    this.session = await ai.live.connect({
      model: res.model,
      // The real configuration is locked into the token on our server.
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (msg) => this.onMessage(msg, kickoff),
        onerror: (e) => console.error("[call] live connection error", e.message),
        onclose: (e) => {
          // A drop we didn't ask for is worth seeing (Next forwards warnings to the dev server log).
          if (this.closingOnPurpose) log("closed", e.code, e.reason);
          else console.warn("[call] connection closed", e.code, e.reason);
          this.onClose();
        },
      },
    });
    this.sendKickoff();
  }

  private sendKickoff() {
    if (!this.ready || !this.session || !this.kickoff) return;
    const text = this.kickoff;
    const session = this.session;
    this.kickoff = null;
    this.kickoffSentAt = Date.now();
    this.greetingTurnEnded = false;
    this.lastSound = Date.now();
    // Sent the instant the connection reports ready, the opening note is sometimes lost (no
    // greeting ever comes); a moment later it never is.
    setTimeout(() => {
      if (this.session !== session) return;
      this.say(text, true);
      log("opening note sent", this.cues.length ? "(waiting for the floor)" : "");
    }, KICKOFF_DELAY_MS);
  }

  private onClose() {
    this.session = null;
    this.ready = false;
    if (this.closingOnPurpose) return;
    // Dropped mid-sentence, perhaps: the next connection picks up where this one stopped.
    if (this.greeted) this.refreshCue = true;
    const s = this.snapshot.status;
    if (s === "ending" || s === "ended" || s === "moved" || s === "failed") return;
    void this.reconnect();
  }

  private async reconnect() {
    if (this.snapshot.status === "reconnecting") return;
    this.flushBuffers();
    this.player?.clear();
    this.set({ status: "reconnecting", speaking: null });
    while (this.reconnects < MAX_RECONNECTS) {
      await sleep(backoff(this.reconnects++));
      // Ended or failed while we waited.
      if (this.getSnapshot().status !== "reconnecting") return;
      try {
        await this.connect(false);
        return;
      } catch (error) {
        if (error instanceof HttpError && error.status < 500 && error.status !== 429) {
          this.fail(error);
          return;
        }
      }
    }
    this.fail(new Error("We lost the connection. Check your internet and open the link again."));
  }

  /**
   * A new Gemini session in place of one that stopped answering (before the
   * greeting, or mid-call). Mid-call, the conversation carries over as text and
   * the new session is asked to carry on where it left off.
   */
  private async restartSession(reason: "greeting" | "stalled") {
    this.closeSession();
    this.kickoffSentAt = null;
    // A stuck session is usually a queue on Gemini's side, and a fresh one on the same (better)
    // model is served at once. Only every third restart tries the fallback model.
    this.restarts++;
    this.useFallback = this.restarts % 3 === 0;
    // A resumption handle only works on the model that issued it.
    this.handle = null;
    this.refreshCue = reason === "stalled";
    try {
      await this.connect(false);
    } catch (error) {
      this.fail(error);
    }
  }

  private closeSession() {
    this.closingOnPurpose = true;
    try {
      this.session?.close();
    } catch {}
    this.session = null;
    this.ready = false;
  }

  // ---- messages from the interviewer ----

  private onMessage(msg: LiveServerMessage, kickoff: string | null) {
    if (msg.setupComplete) {
      log("setup complete");
      this.ready = true;
      this.reconnects = 0;
      this.kickoff = kickoff;
      this.set({ status: "live", error: null });
      this.sendKickoff();
      return;
    }
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      this.handle = msg.sessionResumptionUpdate.newHandle;
    }
    if (msg.goAway) {
      log("goAway", msg.goAway.timeLeft);
      // The connection is about to be recycled (about every 10 minutes): switch now, with the latest handle.
      this.closeSession();
      void this.reconnect();
      return;
    }
    if (msg.toolCall?.functionCalls?.length) {
      log(
        "tools",
        msg.toolCall.functionCalls.map((c) => c.name),
      );
      void this.onTools(msg.toolCall.functionCalls);
    }
    const content = msg.serverContent;
    if (!content) return;

    if (content.interrupted) {
      log("interrupted");
      this.player?.clear();
      this.endTurn();
    }
    if (content.inputTranscription?.text) {
      if (!this.turns.owesReply) log("heard the candidate:", content.inputTranscription.text);
      this.turns.candidateSpeaking();
      this.inBuffer += content.inputTranscription.text;
      this.screenCheck("candidate", this.inBuffer);
      this.set({ heard: tidy(this.inBuffer) });
      this.lastSound = Date.now();
      if (this.snapshot.thinking) this.set({ thinking: false });
      if (this.snapshot.speaking !== "candidate") this.set({ speaking: "candidate" });
    }
    // A turn nobody asked for (the model repeating itself after a tool answer) is never heard.
    const hasTurnContent =
      Boolean(content.outputTranscription?.text) ||
      (content.modelTurn?.parts ?? []).some((p) => p.inlineData?.data);
    const wasOpen = this.turns.speaking;
    const decision = hasTurnContent ? this.turns.turnStarted(Date.now()) : null;
    if (decision && !wasOpen)
      log("turn starts:", decision, {
        audio: (content.modelTurn?.parts ?? []).some((p) => p.inlineData?.data),
        text: content.outputTranscription?.text ?? "",
      });
    if (decision === "drop") {
      if (!this.droppingLogged) log("dropped a turn nobody asked for");
      this.droppingLogged = true;
      if (content.turnComplete) this.endTurn();
      return;
    }
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        if (!this.turnHasAudio)
          log(
            "interviewer speaking",
            this.kickoffSentAt
              ? `${Date.now() - this.kickoffSentAt} ms after the opening note`
              : "",
          );
        this.turnHasAudio = true;
        this.kickoffSentAt = null;
        if (this.snapshot.slowStart) this.set({ slowStart: false });
        this.flushCandidate();
        this.player?.enqueue(part.inlineData.data);
        this.lastSound = Date.now();
        if (this.snapshot.speaking !== "interviewer") this.set({ speaking: "interviewer" });
      }
    }
    if (content.outputTranscription?.text) {
      this.flushCandidate();
      this.outBuffer += content.outputTranscription.text;
      this.screenCheck("interviewer", this.outBuffer);
      // A new turn takes over the caption only once it says something (two words or more), so an
      // empty or one-word turn (after a tool call, say) never wipes the question off the screen.
      const said = tidy(spokenOnly(this.outBuffer));
      if (this.captionIsThisTurn || said.split(" ").length >= 2) {
        if (!this.captionIsThisTurn) this.set({ heard: "" });
        this.captionIsThisTurn = true;
        this.set({ caption: said });
      }
    }
    if (content.turnComplete) {
      log("turn complete", { audio: this.turnHasAudio });
      if (this.turnHasAudio) this.greetingTurnEnded = true;
      // Safety net: a goodbye in the close ends the call, even if end_interview wasn't called.
      if (this.snapshot.part === "close" && /\bgoodbye\b/i.test(tidy(this.outBuffer)))
        this.endAfterGoodbye = true;
      this.endTurn();
      if (this.endAfterGoodbye) void this.finishAfterPlayback();
    }
  }

  /** The interviewer's turn is over (complete, cut off or dropped): save it, free the floor. */
  private endTurn() {
    const said = tidy(spokenOnly(this.outBuffer));
    if (this.turns.speaking) this.turns.turnEnded(Date.now(), said);
    this.droppingLogged = false;
    this.turnHasAudio = false;
    this.captionIsThisTurn = false;
    this.flushInterviewer();
    this.lastSound = Date.now();
    this.set({ speaking: null });
    // Notes held back while it was talking can go now; cues wait for the audio to finish.
    for (const note of this.notes.splice(0)) this.send(note, false);
  }

  private async onTools(calls: { id?: string; name?: string; args?: Record<string, unknown> }[]) {
    const responses: { id?: string; name?: string; response: Record<string, unknown> }[] = [];
    for (const call of calls) {
      log("tool", call.name, call.args ?? {});
      let response: Record<string, unknown> = { ok: true };
      try {
        const args = call.args ?? {};
        if (call.name === TOOL.nextSection) response = await this.nextSection(args.to);
        else if (call.name === TOOL.showCase) response = await this.onScreen(Number(args.number));
        else if (call.name === TOOL.showTwist) response = await this.onScreen("twist");
        else if (call.name === TOOL.pointAt) response = this.pointAt(args.ids);
        else if (call.name === TOOL.note) response = this.note(args.text);
        else if (call.name === TOOL.end) {
          this.endAfterGoodbye = true;
          // The goodbye has usually played by now; if not, the end waits for it.
          if (!this.turns.speaking) void this.finishAfterPlayback();
        } else response = { ok: false, error: "Unknown tool." };
      } catch {
        response = { ok: false };
      }
      responses.push({ id: call.id, name: call.name, response });
    }
    try {
      // Blocking calls: the interviewer carries on speaking as soon as this answer lands. (A
      // scheduling hint is only valid for non-blocking calls; here it closes the connection.)
      this.session?.sendToolResponse({ functionResponses: responses });
    } catch {}
    // After a new section or a case, it goes on to speak: if its turn already ended, the next
    // one is expected (and let through), not taken for a turn nobody asked for.
    const speaksNext: string[] = [TOOL.nextSection, TOOL.showCase, TOOL.showTwist];
    if (!this.turns.speaking && calls.some((c) => speaksNext.includes(c.name ?? "")))
      this.turns.cue(Date.now());
  }

  /** The interviewer moved on to a new part of the interview. */
  private async nextSection(to: unknown): Promise<Record<string, unknown>> {
    if (!isRoomPart(to) || to === "practice") return { ok: false, error: "Unknown section." };
    this.movePart(to);
    // Safety net, as in truvet: the cases start with case 1 on screen, even if show_case is forgotten.
    if (to === "cases" && !this.snapshot.cases.length) return this.onScreen(1);
    return { ok: true };
  }

  /**
   * A case (or the twist) on the candidate's screen, before the interviewer
   * talks about it: its answer waits until it's there (or a few seconds pass).
   */
  private async onScreen(what: number | "twist"): Promise<Record<string, unknown>> {
    const shown = this.reveal(() => (what === "twist" ? this.showTwist() : this.showCase(what)));
    const inTime = await Promise.race([
      shown.then(() => true),
      sleep(SCREEN_WAIT_MS).then(() => false),
    ]);
    if (what === "twist") return { ok: Boolean(this.snapshot.twist) };
    const on = this.snapshot.cases.find((c) => c.number === what);
    return on && inTime
      ? { ok: true, onScreen: on.title }
      : { ok: false, error: "Still loading. Say it's coming up on their screen." };
  }

  /**
   * Safety nets (truvet has the same): what's said decides the screen too, so
   * a case is never talked about with nothing on it. The interviewer starting
   * a case's opening (recognised by its fingerprints) puts that case up; "some
   * thing has changed" puts up the twist; "take a look" or "your screen" with
   * nothing up puts up case 1; the candidate saying they can't see it brings
   * the current case back to the front.
   */
  private screenCheck(who: "interviewer" | "candidate", text: string) {
    if (this.revealing !== null) return;
    const t = text.toLowerCase();
    if (who === "candidate") {
      const cantSee =
        /\b(can'?t|cannot|can not|don'?t|do not|not)\s+(see|seeing|showing|visible)|nothing (is )?(on|in) (the|my) screen|(screen|it) is (blank|empty)\b/.test(
          t,
        );
      if (!cantSee || this.screenCheckedAt > Date.now() - 5_000) return;
      if (this.snapshot.part !== "cases" && !this.snapshot.cases.length) return;
      this.screenCheckedAt = Date.now();
      this.safetyNet(this.snapshot.activeCase ?? 1, "the candidate can't see it");
      return;
    }
    const plan = this.snapshot.plan;
    if (!plan) return;
    const shown = new Set(this.snapshot.cases.map((c) => c.number));
    const introducing = caseBeingIntroduced(plan.caseCues, shown, t);
    if (introducing) return this.safetyNet(introducing, "its opening");
    if (
      plan.twistCase !== null &&
      shown.has(plan.twistCase) &&
      !this.snapshot.twist &&
      /\b(something|one thing) (has |'s )?changed|there'?s been a change\b/.test(t)
    ) {
      if (this.screenCheckedAt > Date.now() - 5_000) return;
      this.screenCheckedAt = Date.now();
      log('safety net: the twist ("something has changed")');
      void this.reveal(() => this.showTwist());
      return;
    }
    // Past the warm start, "take a look" or "your screen" with nothing up means the cases began.
    if (
      !shown.size &&
      ROOM_PARTS.indexOf(this.snapshot.part) >= ROOM_PARTS.indexOf("projects") &&
      /\b(your|the) screen\b|\btake a look\b/.test(t)
    )
      this.safetyNet(1, '"take a look"');
  }

  private safetyNet(n: number, why: string) {
    if (this.snapshot.activeCase === n && this.snapshot.cases.some((c) => c.number === n)) return;
    log("safety net: case", n, `(${why})`);
    void this.reveal(() => this.showCase(n));
  }

  // ---- the canvas ----

  private async showCase(n: number) {
    if (!Number.isInteger(n) || n < 1 || n > 3) throw new Error("No such case.");
    // Already on its way (the interviewer's tool call and its words can both ask for it).
    if (this.revealing === n) return;
    if (this.snapshot.part !== "cases" && this.snapshot.part !== "close") this.movePart("cases");
    if (this.snapshot.activeCase === n && this.snapshot.cases.some((c) => c.number === n)) return;
    const known = this.snapshot.cases.find((c) => c.number === n);
    if (known) this.set({ activeCase: n, lit: [], picked: null });
    else {
      this.revealing = n;
      const { case: revealed } = await this.post<{ case: RevealedCase }>("reveal", {
        kind: "case",
        number: n,
      }).finally(() => {
        this.revealing = null;
      });
      this.set({
        cases: [...this.snapshot.cases.filter((c) => c.number !== n), revealed],
        activeCase: revealed.number,
        lit: [],
        picked: null,
      });
      this.event("case_shown", "interviewer", [], revealed.title);
    }
  }

  private async showTwist() {
    const { twist } = await this.post<{ twist: string }>("reveal", { kind: "twist" });
    if (!this.snapshot.twist) this.event("twist_shown", "interviewer", [], "");
    this.set({ twist, activeCase: 2 });
  }

  /** On screen before the interviewer introduces it; retried briefly if the server says "not yet". */
  private async reveal(what: () => Promise<void>): Promise<void> {
    // Long enough to outlast the server's spacing between new cases (15 s).
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await what();
        return;
      } catch (error) {
        log("reveal failed; retrying", error instanceof Error ? error.message : error);
        await sleep(1_500);
      }
    }
  }

  private activeIds() {
    const active = this.snapshot.cases.find((c) => c.number === this.snapshot.activeCase);
    return active ? canvasIds(active.canvas) : new Map<string, string>();
  }

  private pointAt(raw: unknown): Record<string, unknown> {
    const known = this.activeIds();
    const ids = (Array.isArray(raw) ? raw : [])
      .filter((id): id is string => typeof id === "string" && known.has(id))
      .slice(0, 3);
    if (!ids.length) return { ok: false, error: "Use ids from the case on screen." };
    this.set({ lit: ids });
    this.event("point", "interviewer", ids, "");
    return { ok: true, showing: ids.map((id) => known.get(id)) };
  }

  private note(raw: unknown): Record<string, unknown> {
    const caseNumber = this.snapshot.activeCase;
    const known = this.activeIds();
    // Notes are the candidate's words: an id that slipped in becomes the part's plain name.
    const text =
      typeof raw === "string"
        ? raw
            .replace(
              /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b(?:line|log|row|point|section)\d+\b/g,
              (id) => known.get(id) ?? id,
            )
            .replace(/[`*{}[\]]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, NOTE_MAX_CHARS)
        : "";
    if (!caseNumber || !text) return { ok: false };
    // A refined version of an earlier note ("...then fix" → "...then fix the root cause") replaces it.
    const same = (a: string, b: string) => {
      const x = a.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      const y = b.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      return x.startsWith(y) || y.startsWith(x);
    };
    const earlier = this.snapshot.notes.find(
      (n) => n.caseNumber === caseNumber && same(n.text, text),
    );
    if (earlier) {
      if (text.length > earlier.text.length)
        this.set({
          notes: this.snapshot.notes.map((n) => (n === earlier ? { caseNumber, text } : n)),
        });
      this.event("note", "interviewer", [], text);
      return { ok: true };
    }
    const mine = this.snapshot.notes.filter((n) => n.caseNumber === caseNumber);
    if (mine.length >= MAX_NOTES_PER_CASE)
      return { ok: false, error: "Enough notes for this case." };
    this.set({ notes: [...this.snapshot.notes, { caseNumber, text }] });
    this.event("note", "interviewer", [], text);
    return { ok: true };
  }

  /** The candidate copied text from the case: saved on the timeline (it carries the canary). */
  copied(chars: number) {
    this.event("copy", "candidate", [], `${chars} characters`);
  }

  /** The candidate tapped part of the case: light it up and tell the interviewer, quietly. */
  pick(id: string) {
    const caseNumber = this.snapshot.activeCase;
    const name = this.activeIds().get(id);
    if (!caseNumber || !name) return;
    if (this.snapshot.picked === id) {
      this.set({ picked: null });
      return;
    }
    this.set({ picked: id });
    this.event("point", "candidate", [id], "");
    this.say(timekeeper.pointing(caseNumber, id, name), false);
  }

  private event(kind: CanvasEventKind, by: CanvasEvent["by"], ids: string[], text: string) {
    this.pendingEvents.push({
      seq: this.eventSeq++,
      kind,
      caseNumber: this.snapshot.activeCase,
      by,
      ids,
      text: text.slice(0, NOTE_MAX_CHARS),
      atMs: this.atMs(),
    });
  }

  private movePart(part: RoomPart) {
    // Parts only move forward, as on the server.
    if (ROOM_PARTS.indexOf(part) <= ROOM_PARTS.indexOf(this.snapshot.part)) return;
    // The candidate's answer belongs to the part it was given in; the interviewer's sentence
    // that announces the new part isn't split, it's saved whole with the new part.
    this.flushCandidate();
    this.partDirty = true;
    this.set({ part });
    void this.sync();
  }

  // ---- transcript ----

  private atMs() {
    return Math.max(0, this.now() - this.firstConnectAt);
  }

  private push(speaker: Turn["speaker"], text: string, metrics?: AnswerMetrics) {
    const clean = tidy(speaker === "interviewer" ? spokenOnly(text) : text);
    if (!clean) return;
    this.set({ history: [...this.snapshot.history, { speaker, text: clean }] });
    this.pending.push({
      seq: this.seq++,
      speaker,
      part: this.snapshot.part,
      text: clean,
      atMs: this.atMs(),
      ...(metrics ? { metrics } : {}),
    });
  }
  private flushCandidate() {
    if (this.inBuffer.trim()) this.push("candidate", this.inBuffer, this.answerMetrics());
    this.inBuffer = "";
    this.answer = null;
  }

  /** How the answer that just ended was given: wait before speaking, length, pauses. */
  private answerMetrics(): AnswerMetrics | undefined {
    const a = this.answer;
    if (!a || a.firstVoiceAt === null) return undefined;
    return {
      latencyMs: Math.max(0, Math.round(a.firstVoiceAt - a.floorAt)),
      speechMs: Math.max(0, Math.round((a.lastVoiceAt ?? a.firstVoiceAt) - a.firstVoiceAt)),
      pauses: a.pauses,
    };
  }
  private flushInterviewer() {
    if (this.outBuffer.trim()) this.push("interviewer", this.outBuffer);
    this.outBuffer = "";
  }
  private flushBuffers() {
    this.flushCandidate();
    this.flushInterviewer();
  }

  // ---- sending ----

  /**
   * Every microphone chunk comes here. The candidate is heard only when it's
   * their turn: after the greeting, never while the interviewer is speaking
   * (or just after, while speaker echo dies away), and only through the voice
   * gate, so background voices and noise stay out.
   */
  private onMicChunk(data: string, level: number) {
    const playing = this.player?.playing ?? false;
    const now = Date.now();
    if (playing) this.lastPlaybackAt = now;
    if (!this.greeted && this.greetingTurnEnded && !playing) {
      this.greeted = true;
      log("greeting done; mic open");
    }
    const connected = this.ready && this.session !== null && this.kickoff === null;
    const interviewerTalking = playing || now - this.lastPlaybackAt < ECHO_TAIL_MS;
    const mic: CallSnapshot["mic"] = !this.greeted
      ? "waiting"
      : interviewerTalking
        ? "paused"
        : "listening";
    if (mic !== this.snapshot.mic) this.set({ mic });
    const noisy = this.gate.floor > NOISY_FLOOR;
    if (noisy !== this.snapshot.noisy) this.set({ noisy });
    const awaitingReply =
      this.greeted && !interviewerTalking && !this.gate.open && this.turns.owesReply;
    if (awaitingReply !== this.snapshot.awaitingReply) this.set({ awaitingReply });
    if (!interviewerTalking && !this.gate.open) this.flushCues();

    if (!connected || mic !== "listening" || this.snapshot.muted) {
      this.gate.observe(level);
      if (this.gate.shut()) this.answerEnded();
      return;
    }
    const event = this.gate.push(level, data);
    this.measureAnswer(event.kind, level);
    if (event.kind === "send") {
      if (!this.turns.owesReply) log("candidate started speaking (voice gate opened)");
      this.turns.candidateSpeaking();
      for (const chunk of event.chunks) this.sendAudio(chunk);
    } else if (event.kind === "close") {
      this.answerEnded();
    }
  }

  // ---- turns ----

  /**
   * The voice gate heard the candidate finish. Gemini is told the turn is over
   * at once (a moment later, so a last breath isn't a new answer), and replies.
   */
  private answerEnded() {
    this.turns.candidateDone(Date.now());
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = setTimeout(() => {
      this.answerTimer = null;
      this.endAudioTurn();
    }, SETTLE_MS);
  }

  /** Timing for the current answer, from the moment the candidate had the floor. */
  private measureAnswer(kind: "send" | "close" | "none", level: number) {
    const now = Date.now();
    // The floor became theirs when the interviewer's voice (and its echo) ended.
    this.answer ??= {
      floorAt: Math.max(this.lastPlaybackAt + ECHO_TAIL_MS, now),
      firstVoiceAt: null,
      lastVoiceAt: null,
      pauses: 0,
      quietRun: 0,
    };
    const a = this.answer;
    if (kind === "send" && a.firstVoiceAt === null) a.firstVoiceAt = now;
    if (!this.gate.open && kind !== "close") return;
    if (kind === "close") {
      a.quietRun = 0;
      return;
    }
    const quiet = level < Math.max(0.05, this.gate.floor * 2);
    if (quiet) {
      a.quietRun++;
      if (a.quietRun === PAUSE_CHUNKS) a.pauses++;
    } else {
      a.quietRun = 0;
      a.lastVoiceAt = now;
    }
  }

  private sendAudio(data: string) {
    try {
      this.session?.sendRealtimeInput({
        audio: { data, mimeType: `audio/pcm;rate=${this.mic?.sampleRate ?? 16_000}` },
      });
    } catch (error) {
      console.error("[call] couldn't send audio", error);
    }
  }

  /** The candidate stopped talking: tell Gemini now, so it answers without waiting for more audio. */
  private endAudioTurn() {
    try {
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {}
  }

  /**
   * A note from the interview system. One that needs an answer goes in as live input, which the
   * interviewer answers within a second (as a conversation turn it can take a minute). One that
   * doesn't is added to the context, for the interviewer's next reply, without interrupting.
   */
  private say(text: string, respond: boolean) {
    if (respond) {
      this.cues.push(text);
      this.flushCues();
    } else if (this.turns.speaking) this.notes.push(text);
    else this.send(text, false);
  }

  /**
   * Sends the next cue once the floor is free: the interviewer isn't talking or
   * playing, the candidate isn't talking, and no reply is already owed. So a
   * cue never cuts in, and never stacks a second reply on top of one coming.
   */
  private flushCues() {
    if (!this.cues.length || !this.ready || !this.session) return;
    if (!this.turns.idle() || this.player?.playing || this.gate.open) return;
    if (Date.now() - this.lastPlaybackAt < ECHO_TAIL_MS) return;
    const text = this.cues.shift();
    if (!text) return;
    this.turns.cue(Date.now());
    log("cue sent:", text.slice(0, 60));
    this.send(text, true);
  }

  private send(text: string, respond: boolean) {
    if (!this.ready || !this.session) return;
    try {
      if (respond) this.session.sendRealtimeInput({ text });
      else
        this.session.sendClientContent({
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: false,
        });
    } catch (error) {
      console.error("[call] couldn't send a note", error);
    }
  }

  // ---- the clock ----

  private startLoops() {
    if (this.timers.length) return;
    this.timers.push(setInterval(() => this.tick(), 1_000));
    this.timers.push(setInterval(() => void this.sync(), SYNC_EVERY_MS));
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
  }

  private stopLoops() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
  }

  private tick() {
    if (this.snapshot.status !== "live") return;
    // The greeting is late: say so, and in the end let the candidate say hello first.
    if (this.kickoffSentAt !== null && !this.greeted) {
      const waited = Date.now() - this.kickoffSentAt;
      if (
        waited > GREETING_RESTART_MS &&
        !this.turnHasAudio &&
        this.greetingRestarts < MAX_GREETING_RESTARTS
      ) {
        this.greetingRestarts++;
        log("no greeting after", waited, "ms; starting a fresh session", this.greetingRestarts);
        if (!this.snapshot.slowStart) this.set({ slowStart: true });
        void this.restartSession("greeting");
        return;
      }
      if (waited > GREETING_GIVE_UP_MS) {
        console.warn("[call] no greeting after", waited, "ms; opening the mic");
        this.kickoffSentAt = null;
        this.greeted = true;
        this.set({ slowStart: false });
      } else if (waited > GREETING_SLOW_MS && !this.snapshot.slowStart) {
        this.set({ slowStart: true });
      }
    }
    // The candidate finished and nothing came back: nudge the interviewer (twice at most), then
    // replace the session if it still says nothing.
    if (this.greeted && !this.player?.playing && this.turns.overdue(Date.now())) {
      log("reply overdue; nudging");
      this.send(timekeeper.waiting(), true);
    }
    if (
      this.greeted &&
      !this.player?.playing &&
      this.turns.owedFor(Date.now()) > STALL_RESTART_MS &&
      this.stallRestarts < MAX_STALL_RESTARTS
    ) {
      this.stallRestarts++;
      log("no reply after nudges; starting a fresh session", this.stallRestarts);
      void this.restartSession("stalled");
      return;
    }
    this.flushCues();
    const now = this.now();
    const phase = clockPhase(this.snapshot.endsAt, now);
    const once = (key: string, fn: () => void) => {
      if (this.nudged.has(key)) return;
      this.nudged.add(key);
      fn();
    };

    if (phase === "over") {
      void this.end("time_up");
      return;
    }
    if (phase === "time-up") {
      once("time-up", () => {
        if (this.endAfterGoodbye) return;
        this.movePart("close");
        this.say(timekeeper.timeUp(), true);
      });
      return;
    }
    this.clock(now);

    // A long silence: one gentle check-in, then wait again.
    const quietFor = Date.now() - this.lastSound;
    const limit =
      this.snapshot.thinking || Date.now() < this.thinkingUntil ? MOMENT_MS : SILENCE_MS;
    // Only once the conversation has begun: before the greeting, quiet is expected.
    if (
      this.greeted &&
      this.turns.idle() &&
      !this.player?.playing &&
      !this.gate.open &&
      quietFor > limit
    ) {
      this.lastSound = Date.now();
      this.say(timekeeper.silence(), true);
    }
  }

  /**
   * The interview clock, told to the interviewer as it runs (as in truvet):
   * when a part's minutes are up, it moves on at its next turn; near the end,
   * it goes to the close. Context only: nothing here asks for a reply.
   */
  private clock(now: number) {
    const endsAt = this.snapshot.endsAt;
    const plan = this.snapshot.plan;
    if (endsAt === null || !plan) return;
    const left = endsAt - now;
    const here = ROOM_PARTS.indexOf(this.snapshot.part);
    const tell = (key: string, text: string) => {
      if (this.clockSent.has(key)) return;
      this.clockSent.add(key);
      log("clock:", key);
      this.say(text, false);
    };
    if (clockPhase(endsAt, now) === "wrap-up") {
      if (here < ROOM_PARTS.indexOf("close")) tell("wrap-up", timekeeper.wrapUp());
      return;
    }
    for (const end of partEnds(plan.depth))
      if (left <= end.msLeft && here <= ROOM_PARTS.indexOf(end.part))
        tell(end.part, timekeeper.partOver(end.part, end.next, Math.round(end.msLeft / 60_000)));
    // Within the cases, each case's share, so the last ones aren't squeezed out.
    if (this.snapshot.part === "cases")
      for (const end of caseEnds(plan.depth, plan.cases))
        if (left <= end.msLeft && (this.snapshot.activeCase ?? 1) <= end.case)
          tell(`case${end.case}`, timekeeper.caseOver(end.case, Math.round(end.msLeft / 60_000)));
  }

  private async sync(final = false) {
    if (!["live", "reconnecting", "ending"].includes(this.snapshot.status) && !final) return;
    const turns = this.pending.slice(0, 60);
    const events = this.pendingEvents.slice(0, 60);
    const hidden = this.takeHidden();
    const body = {
      turns,
      events,
      part: this.partDirty ? this.snapshot.part : null,
      handle: this.handle,
      hidden,
    };
    try {
      const res = await this.post<{
        startedAt: string | null;
        endsAt: string | null;
        serverNow: string;
      }>("sync", body);
      this.pending = this.pending.filter((t) => !turns.includes(t));
      this.pendingEvents = this.pendingEvents.filter((e) => !events.includes(e));
      this.partDirty = false;
      this.set({
        endsAt: res.endsAt ? Date.parse(res.endsAt) : null,
        clockOffset: Date.parse(res.serverNow) - Date.now(),
      });
    } catch (error) {
      // Keep the lines and the hidden time for the next try.
      this.hiddenCount += hidden.count;
      this.hiddenMs += hidden.ms;
      if (error instanceof HttpError) this.onFatalStatus(error);
    }
  }

  private onFatalStatus(error: HttpError) {
    if (error.code === "moved") {
      this.shutdown();
      this.set({ status: "moved", error: error.message });
    } else if (error.code === "over") {
      this.shutdown();
      this.set({ status: "ended" });
    }
  }

  private takeHidden() {
    if (this.hiddenSince !== null) {
      this.hiddenMs += Date.now() - this.hiddenSince;
      this.hiddenSince = Date.now();
    }
    const out = { count: this.hiddenCount, ms: Math.round(this.hiddenMs) };
    this.hiddenCount = 0;
    this.hiddenMs = 0;
    return out;
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      this.hiddenCount++;
      this.hiddenSince = Date.now();
    } else if (this.hiddenSince !== null) {
      const away = Date.now() - this.hiddenSince;
      this.hiddenMs += away;
      this.hiddenSince = null;
      // On the timeline, so it can be read against what was happening ("right after case 2").
      if (["live", "reconnecting"].includes(this.snapshot.status) && away >= 1_000)
        this.event("tab_away", "candidate", [], String(Math.round(away)));
    }
  };

  /** Closing the tab: save what we have. The server gives the time back if they return. */
  private onPageHide = () => {
    this.flushBuffers();
    const body = JSON.stringify({
      turns: this.pending.slice(0, 60),
      events: this.pendingEvents.slice(0, 60),
      part: this.partDirty ? this.snapshot.part : null,
      handle: this.handle,
      hidden: this.takeHidden(),
    });
    navigator.sendBeacon(`/api/interview/${this.token}/sync`, body);
  };

  // ---- controls ----

  repeat() {
    // Stop what's playing and drop the rest of that turn; the repeat goes out once the floor is free.
    this.player?.clear();
    this.turns.dropCurrent();
    this.cues = this.cues.filter((c) => c !== timekeeper.repeat());
    this.say(timekeeper.repeat(), true);
  }

  askForMoment() {
    this.thinkingUntil = Date.now() + MOMENT_MS;
    this.set({ thinking: true });
    this.say(timekeeper.moment(), true);
  }

  setMuted(muted: boolean) {
    this.mic?.setMuted(muted);
    if (muted && this.gate.shut()) this.answerEnded();
    this.set({ muted });
  }

  async endByCandidate() {
    await this.end("candidate_ended");
  }

  private async finishAfterPlayback() {
    // Let the goodbye finish playing, but never wait forever.
    const deadline = Date.now() + 15_000;
    while (this.player?.playing && Date.now() < deadline) await sleep(250);
    await this.end("finished");
  }

  private async end(reason: "finished" | "time_up" | "candidate_ended") {
    if (["ending", "ended"].includes(this.snapshot.status)) return;
    this.set({ status: "ending", speaking: null });
    this.flushBuffers();
    this.closeSession();
    // Save every last line before closing.
    for (let i = 0; i < 3 && (this.pending.length || this.pendingEvents.length); i++)
      await this.sync(true);
    try {
      await this.post("end", { reason });
    } catch {}
    this.shutdown();
    this.set({ status: "ended" });
  }

  private shutdown() {
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = null;
    this.stopLoops();
    this.closeSession();
    this.mic?.close();
    this.mic = null;
    this.player?.close();
    this.player = null;
  }

  /** On unmount without ending: keep the attempt resumable. */
  dispose() {
    if (["live", "reconnecting"].includes(this.snapshot.status)) this.onPageHide();
    this.shutdown();
  }

  private fail(error: unknown) {
    if (error instanceof HttpError && error.code === "elsewhere") {
      this.set({ status: "elsewhere", error: error.message });
      return;
    }
    if (error instanceof HttpError && (error.code === "over" || error.code === "moved")) {
      this.onFatalStatus(error);
      return;
    }
    this.shutdown();
    this.set({
      status: "failed",
      error: error instanceof Error ? error.message : "Something went wrong.",
    });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`/api/interview/${this.token}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) throw new HttpError(res.status, json.error ?? "Something went wrong.", json.code);
    return json as T;
  }
}

/**
 * The interviewer's transcript minus anything that isn't speech: if the model
 * ever echoes its notes (markdown bullets, tool syntax), the saved transcript
 * keeps only what was said to the candidate.
 */
export function spokenOnly(text: string): string {
  const cut = text.search(/\s\*\s+\*\*|\*\*[^*]+:\*\*|`[a-z_]+\(/);
  return (cut === -1 ? text : text.slice(0, cut)).replace(/[*`#]/g, "");
}

/** Transcription chunks joined into readable text: single spaces, no space before punctuation. */
export function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])(?=\s|$)/g, "$1")
    .trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
