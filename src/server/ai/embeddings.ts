import "server-only";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Local sentence embeddings (bge-small, quantised, ~35 MB) on our own CPU.
 * Resumes never leave the server, and there is no per-call cost. Runs in the
 * worker process only; the model loads once and is reused.
 */
const MODEL = "Xenova/bge-small-en-v1.5";
type Embedder = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;
let loading: Promise<Embedder> | undefined;

async function embedder(): Promise<Embedder> {
  loading ??= (async () => {
    const transformers = await import("@huggingface/transformers");
    transformers.env.cacheDir = path.resolve(env().MODEL_CACHE_DIR);
    return (await transformers.pipeline("feature-extraction", MODEL, {
      dtype: "q8",
    })) as unknown as Embedder;
  })();
  return loading;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const run = await embedder();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32).map((t) => t.slice(0, 1000));
    out.push(...(await run(batch, { pooling: "mean", normalize: true })).tolist());
  }
  return out;
}

/** Vectors are normalised, so the dot product is the cosine similarity. */
export const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);
