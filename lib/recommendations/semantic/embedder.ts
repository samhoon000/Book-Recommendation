import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EMBEDDINGS } from "../config";

/**
 * Local, free embedding engine built on transformers.js (ONNX, CPU). No API keys, no network
 * beyond the one-time model download into `.cache/transformers`.
 *
 * Everything here is optional: if the package is missing, the model fails to load or a call
 * times out, callers get `undefined` and score with metadata only.
 */

export interface Embedder {
  readonly model: string;
  /** Embed texts in one batch. Vectors are unit-normalized. */
  embed(texts: string[]): Promise<number[][]>;
}

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let loading: Promise<Embedder | undefined> | undefined;
let loaded: Embedder | undefined;
let failed = false;
let lastError: string | undefined;

async function load(): Promise<Embedder | undefined> {
  if (!EMBEDDINGS.enabled) return undefined;
  try {
    const moduleName = "@huggingface/transformers";
    // Variable specifier keeps bundlers from trying to inline the package; see next.config serverExternalPackages.
    const mod = (await import(/* webpackIgnore: true */ moduleName)) as {
      pipeline: (task: "feature-extraction", model: string, opts: Record<string, unknown>) => Promise<Extractor>;
      env: { cacheDir?: string; allowLocalModels?: boolean };
    };
    mod.env.cacheDir = path.resolve(process.cwd(), EMBEDDINGS.cacheDir, "transformers");
    mod.env.allowLocalModels = false;
    const extractor = await mod.pipeline("feature-extraction", EMBEDDINGS.model, { dtype: "q8" });
    const embedder: Embedder = {
      model: EMBEDDINGS.model,
      async embed(texts) {
        if (!texts.length) return [];
        const out = await extractor(texts, { pooling: "mean", normalize: true });
        return out.tolist().map((v) => v.map((x) => Math.round(x * 10000) / 10000));
      },
    };
    // Warm the kernels so the first real request doesn't pay for them.
    await embedder.embed(["warm up"]);
    loaded = embedder;
    return embedder;
  } catch (err) {
    failed = true;
    lastError = err instanceof Error ? err.message : String(err);
    console.warn(`[libria] semantic engine unavailable, scoring with metadata only: ${lastError}`);
    return undefined;
  }
}

/** Start loading in the background (idempotent). */
export function warmEmbedder(): void {
  if (!loading && !failed && EMBEDDINGS.enabled) loading = load();
}

/**
 * The embedder if it is ready within `waitMs`, otherwise undefined (loading continues in the background).
 */
export async function getEmbedder(waitMs: number): Promise<Embedder | undefined> {
  if (loaded) return loaded;
  if (failed || !EMBEDDINGS.enabled) return undefined;
  warmEmbedder();
  if (!loading) return undefined;
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), waitMs));
  return Promise.race([loading, timeout]);
}

export function embedderStatus(): { enabled: boolean; ready: boolean; failed: boolean; error?: string; model: string } {
  return { enabled: EMBEDDINGS.enabled, ready: !!loaded, failed, error: lastError, model: EMBEDDINGS.model };
}

/* ----------------------------------------------------------------- vector cache */

/**
 * Embeddings keyed by a stable book identifier + document hash. Memory first, then a JSON-lines
 * file under `.cache/libria` so restarts (and other users) reuse the work.
 */
class EmbeddingCache {
  private memory = new Map<string, number[]>();
  private pending: string[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private loadedFromDisk: Promise<void> | undefined;
  hits = 0;
  misses = 0;

  constructor(private readonly file: string) {}

  private async loadDisk(): Promise<void> {
    try {
      const text = await fs.readFile(this.file, "utf8");
      for (const line of text.split("\n")) {
        if (!line) continue;
        try {
          const { k, v } = JSON.parse(line) as { k: string; v: number[] };
          if (k && Array.isArray(v)) this.set(k, v, false);
        } catch {
          /* skip corrupt line */
        }
      }
    } catch {
      /* no cache yet */
    }
  }

  ready(): Promise<void> {
    if (!this.loadedFromDisk) this.loadedFromDisk = this.loadDisk();
    return this.loadedFromDisk;
  }

  get(key: string): number[] | undefined {
    const v = this.memory.get(key);
    if (v) {
      this.hits++;
      // refresh LRU position
      this.memory.delete(key);
      this.memory.set(key, v);
    } else this.misses++;
    return v;
  }

  set(key: string, value: number[], persist = true): void {
    this.memory.set(key, value);
    while (this.memory.size > EMBEDDINGS.maxMemoryEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
    if (persist) {
      this.pending.push(JSON.stringify({ k: key, v: value }));
      if (!this.flushTimer) this.flushTimer = setTimeout(() => void this.flush(), 2000);
    }
  }

  async flush(): Promise<void> {
    this.flushTimer = undefined;
    if (!this.pending.length) return;
    const lines = this.pending.splice(0).join("\n") + "\n";
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.appendFile(this.file, lines, "utf8");
    } catch {
      /* cache is best-effort */
    }
  }

  get size(): number {
    return this.memory.size;
  }
}

let cache: EmbeddingCache | undefined;

export function embeddingCache(model = EMBEDDINGS.model): EmbeddingCache {
  if (!cache) {
    const safe = model.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    cache = new EmbeddingCache(path.resolve(process.cwd(), EMBEDDINGS.cacheDir, "libria", `embeddings-${safe}.jsonl`));
  }
  return cache;
}

/**
 * Embed keyed documents, reading the cache first and embedding only the misses in one batch.
 * Returns whatever finished within the budget; a timeout never throws.
 */
export async function embedKeyed(embedder: Embedder, items: Array<{ key: string; text: string }>, budgetMs: number): Promise<{ vectors: Map<string, number[]>; cacheHits: number; embedded: number }> {
  const c = embeddingCache(embedder.model);
  await c.ready();
  const vectors = new Map<string, number[]>();
  const misses: Array<{ key: string; text: string }> = [];
  let cacheHits = 0;
  for (const item of items) {
    const hit = c.get(item.key);
    if (hit) {
      vectors.set(item.key, hit);
      cacheHits++;
    } else if (!misses.some((m) => m.key === item.key)) misses.push(item);
  }
  let embedded = 0;
  if (misses.length) {
    const work = embedder.embed(misses.map((m) => m.text)).then((vs) => {
      vs.forEach((v, i) => {
        c.set(misses[i].key, v);
        vectors.set(misses[i].key, v);
        embedded++;
      });
    });
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, budgetMs));
    await Promise.race([work.catch(() => undefined), timeout]);
  }
  return { vectors, cacheHits, embedded };
}
