import "server-only";
import {
  EndSensitivity,
  type FunctionDeclaration,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  Type,
} from "@google/genai";
import { env } from "@/lib/env";
import { TOOL } from "@/lib/interview-room";
import { AiUnavailableError } from "./gemini";

/**
 * Short-lived Gemini Live tokens for the candidate's browser. The audio goes
 * straight from the browser to Google, so our servers never carry it. The
 * API key never leaves the server, and each token is single-use, expires
 * quickly and has the interviewer's instructions locked in: the browser
 * can't change what the interviewer is told.
 */

// The interviewer runs the interview (as in truvet): it records each new part and puts each case
// on the candidate's screen before it talks about it. Ordinary (blocking) calls: the interviewer
// waits for the browser's answer, which comes once the screen has changed, so a case is never
// introduced before it's there. (Non-blocking ones made the model say stray words: "text".)
const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: TOOL.nextSection,
    description: "Records that the interview moved on to a new section.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, enum: ["warmup", "projects", "cases", "close"] },
      },
      required: ["to"],
    },
  },
  {
    name: TOOL.showCase,
    description:
      "Puts a case on the candidate's screen. Call it before you say anything about the case, every time.",
    parameters: {
      type: Type.OBJECT,
      properties: { number: { type: Type.INTEGER, description: "The case number: 1, 2 or 3." } },
      required: ["number"],
    },
  },
  {
    name: TOOL.showTwist,
    description: "Puts the twist on the candidate's screen, before you mention it.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: TOOL.pointAt,
    description:
      "Lights up parts of the case on the candidate's screen: what you're talking about, or what they're talking about.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "1 to 3 ids from the case's canvas, e.g. pay_button, line12, row3.",
        },
      },
      required: ["ids"],
    },
  },
  {
    name: TOOL.note,
    description: "Writes the candidate's decision or plan on their screen, in their words.",
    parameters: {
      type: Type.OBJECT,
      properties: { text: { type: Type.STRING, description: "Under 12 words." } },
      required: ["text"],
    },
  },
  {
    name: TOOL.end,
    description: "Ends the interview, after your goodbye.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];
const TOOLS = DECLARATIONS;

/** Long enough for the whole interview plus reconnects; the server's clock still decides when it ends. */
const TOKEN_LIFETIME_MS = 30 * 60_000;
/** The browser has this long to open the connection after asking for a token. */
const CONNECT_WITHIN_MS = 2 * 60_000;

export interface LiveToken {
  token: string;
  model: string;
}

/** The Live model a session uses: the main one, or the fallback. */
export function liveModel(fallback: boolean): string {
  const { GEMINI_LIVE_MODEL, GEMINI_LIVE_FALLBACK_MODEL } = env();
  return fallback ? GEMINI_LIVE_FALLBACK_MODEL : GEMINI_LIVE_MODEL;
}

export async function mintLiveToken(input: {
  instruction: string;
  resumeHandle: string | null;
  /** Names and terms from this interview, so they're transcribed right. */
  vocabulary: string[];
  /** Use the fallback model (the main one didn't answer). */
  fallback: boolean;
}): Promise<LiveToken> {
  const { GEMINI_API_KEY, GEMINI_LIVE_VOICE, GEMINI_LIVE_THINKING_BUDGET, GEMINI_LIVE_LANGUAGES } =
    env();
  if (!GEMINI_API_KEY) throw new AiUnavailableError("The interviewer isn't set up yet.");
  // Ephemeral tokens are v1alpha in this SDK.
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  const now = Date.now();
  const model = liveModel(input.fallback);
  const created = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + TOKEN_LIFETIME_MS).toISOString(),
      newSessionExpireTime: new Date(now + CONNECT_WITHIN_MS).toISOString(),
      liveConnectConstraints: {
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: input.instruction,
          tools: [{ functionDeclarations: TOOLS }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_LIVE_VOICE } } },
          // A spoken conversation can't wait: by default the model thinks for 20 to 80 seconds
          // before each reply. The plan was already worked out ahead of the call.
          // (Main model only: the fallback's defaults are already fast.)
          ...(input.fallback
            ? {}
            : { thinkingConfig: { thinkingBudget: GEMINI_LIVE_THINKING_BUDGET } }),
          // The transcript is the evidence HR reads: tell the recogniser the accent and the
          // terms to expect. Verbatim (the default), so nothing the candidate said is smoothed over.
          inputAudioTranscription: {
            languageCodes: GEMINI_LIVE_LANGUAGES,
            customVocabulary: input.vocabulary,
          },
          outputAudioTranscription: { customVocabulary: input.vocabulary },
          // The browser's voice gate ends each answer (after ~2.2 s of quiet: candidates pause to
          // think) and says so at once. Gemini's own end-of-speech wait is longer, so it never cuts
          // an answer short on a pause.
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              prefixPaddingMs: 200,
              silenceDurationMs: 3_500,
            },
          },
          // A connection lasts about 10 minutes: resumption carries the conversation over,
          // and compression keeps a 15-minute audio session under the context limit.
          sessionResumption: { handle: input.resumeHandle ?? undefined },
          contextWindowCompression: { slidingWindow: {} },
          // No proactive audio: it lets the model decide not to answer, which candidates hear as
          // dead air. The browser's voice gate already keeps background voices out.
        },
      },
      // No lockAdditionalFields: Gemini then locks every field, not just the ones set here.
    },
  });
  if (!created.name) throw new AiUnavailableError("Couldn't start the interviewer. Try again.");
  return { token: created.name, model };
}
