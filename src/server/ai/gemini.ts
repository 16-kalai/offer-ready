import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Structured text generation with Gemini. Output is constrained to a JSON
 * schema and validated again with zod. Busy or rate-limited models are retried
 * with backoff, then the next model in GEMINI_TEXT_MODELS is tried.
 */

export class AiUnavailableError extends Error {}

/** Gemini rejects schemas with many length/count limits; send the shape, keep zod as the judge. */
const PROVIDER_UNSUPPORTED = new Set([
  "$schema",
  "additionalProperties",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "pattern",
  "format",
]);

function providerSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(providerSchema);
  if (schema === null || typeof schema !== "object") return schema;
  const source = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (PROVIDER_UNSUPPORTED.has(key)) continue;
    out[key] =
      key === "properties" && value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, providerSchema(v)]))
        : providerSchema(value);
  }
  // Limits that were removed are stated in words, which the model follows.
  const words = [
    typeof source.maxLength === "number" && `At most ${source.maxLength} characters.`,
    typeof source.minItems === "number" &&
      typeof source.maxItems === "number" &&
      `${source.minItems} to ${source.maxItems} items.`,
    typeof source.minItems !== "number" &&
      typeof source.maxItems === "number" &&
      `At most ${source.maxItems} items.`,
  ].filter(Boolean);
  if (words.length) out.description = [source.description, ...words].filter(Boolean).join(" ");
  return out;
}

const RETRYABLE =
  /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|overloaded|high demand|aborted|timeout|timed out/i;

let client: GoogleGenAI | undefined;

export async function generateStructured<T>(request: {
  instructions: string;
  input: unknown;
  schema: z.ZodType<T>;
  temperature?: number;
  timeoutMs?: number;
  /** Models to try in order; the interview models by default. */
  models?: string[];
  /** Media sent alongside the input (a recorded answer). */
  media?: { mimeType: string; data: string };
}): Promise<{ output: T; model: string }> {
  const { GEMINI_API_KEY, GEMINI_TEXT_MODELS } = env();
  if (!GEMINI_API_KEY) throw new AiUnavailableError("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const jsonSchema = providerSchema(z.toJSONSchema(request.schema));

  let lastError: unknown;
  for (const model of request.models ?? GEMINI_TEXT_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await client.models.generateContent({
          model,
          // Input is data, never instructions: it goes in as JSON, the rules as the system prompt.
          contents: [
            {
              role: "user",
              parts: [
                { text: JSON.stringify(request.input) },
                ...(request.media ? [{ inlineData: request.media }] : []),
              ],
            },
          ],
          config: {
            systemInstruction: request.instructions,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            temperature: request.temperature ?? 0.4,
            abortSignal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
          },
        });
        const parsed = request.schema.safeParse(JSON.parse(response.text ?? "null"));
        if (!parsed.success)
          throw new Error(`invalid output: ${parsed.error.message.slice(0, 300)}`);
        return { output: parsed.data, model };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!RETRYABLE.test(message) && !message.startsWith("invalid output")) break;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  throw new AiUnavailableError(lastError instanceof Error ? lastError.message : String(lastError));
}

export function gemini(): GoogleGenAI {
  const { GEMINI_API_KEY } = env();
  if (!GEMINI_API_KEY) throw new AiUnavailableError("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return client;
}

/**
 * Research with Google Search grounding: free text plus the pages it was
 * grounded in. Pair it with generateStructured to get typed data out (search
 * tools and JSON schemas don't mix on every model).
 */
export async function generateGrounded(request: {
  instructions: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<{ text: string; sources: { title: string; url: string }[]; model: string }> {
  let lastError: unknown;
  for (const model of env().GEMINI_RESEARCH_MODELS)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await gemini().models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          config: {
            systemInstruction: request.instructions,
            tools: [{ googleSearch: {} }],
            temperature: 0.3,
            abortSignal: AbortSignal.timeout(request.timeoutMs ?? 120_000),
          },
        });
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const seen = new Set<string>();
        const sources = chunks
          .map((c) => ({ title: c.web?.title ?? c.web?.domain ?? "Source", url: c.web?.uri ?? "" }))
          .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
        return { text: response.text ?? "", sources, model };
      } catch (error) {
        // Busy or out of search quota on this model: the next one has its own.
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!RETRYABLE.test(message)) break;
        // Out of quota won't change on a retry; a 500 or timeout often does.
        if (/429|RESOURCE_EXHAUSTED/.test(message)) break;
        await new Promise((r) => setTimeout(r, 1_500));
      }
    }
  throw new AiUnavailableError(lastError instanceof Error ? lastError.message : String(lastError));
}

/** Gemini text to speech, as a WAV file the browser can play (it returns raw 24 kHz PCM). */
export async function speak(text: string): Promise<Uint8Array> {
  const { GEMINI_TTS_MODEL, GEMINI_TTS_VOICE } = env();
  const response = await gemini().models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
      abortSignal: AbortSignal.timeout(60_000),
    },
  });
  const data = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
    ?.data;
  if (!data) throw new AiUnavailableError("No audio came back.");
  return wav(Buffer.from(data, "base64"), 24_000);
}

function wav(pcm: Buffer, sampleRate: number): Uint8Array {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return new Uint8Array(Buffer.concat([header, pcm]));
}
