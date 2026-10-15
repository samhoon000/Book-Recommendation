import "server-only";

/**
 * Server-side HTTP helper shared by every upstream book API.
 * - identifies the app with a User-Agent (Open Library asks for this)
 * - caches successful JSON responses in memory with a TTL
 * - de-duplicates identical in-flight requests
 * - limits concurrency per host so we stay polite with rate limits
 * - times out slow upstream calls
 */

export const USER_AGENT =
  process.env.LIBRIA_USER_AGENT ??
  "Libria/0.1 (open-source book discovery app; https://github.com/libria-app)";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly host: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface CacheEntry {
  value: unknown;
  expires: number;
}

const MAX_CACHE_ENTRIES = 800;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function cacheGet(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: unknown, ttlMs: number) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Tiny per-host semaphore. */
const hostQueues = new Map<string, { active: number; waiting: Array<() => void> }>();
const MAX_CONCURRENT_PER_HOST = 4;

async function withHostSlot<T>(host: string, task: () => Promise<T>): Promise<T> {
  let q = hostQueues.get(host);
  if (!q) {
    q = { active: 0, waiting: [] };
    hostQueues.set(host, q);
  }
  const queue = q;
  if (queue.active >= MAX_CONCURRENT_PER_HOST) {
    await new Promise<void>((resolve) => queue.waiting.push(resolve));
  }
  queue.active++;
  try {
    return await task();
  } finally {
    queue.active--;
    queue.waiting.shift()?.();
  }
}

export interface FetchJsonOptions {
  ttlMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Retries for 429/5xx/network errors. */
  retries?: number;
}

const HOUR = 60 * 60 * 1000;

export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { ttlMs = 6 * HOUR, timeoutMs = 9000, headers = {}, retries = 1 } = opts;
  const cached = cacheGet(url);
  if (cached !== undefined) return cached as T;

  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const host = new URL(url).host;
  // Lets you rehearse the outage experience locally: LIBRIA_SIMULATE_OUTAGE=1 npm run dev
  if (process.env.LIBRIA_SIMULATE_OUTAGE === "1") throw new UpstreamError(`${host} unavailable (simulated)`, 503, host);
  const run = async (): Promise<T> => {
    let attempt = 0;
    while (true) {
      try {
        const res = await withHostSlot(host, () =>
          fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
          }),
        );
        if (!res.ok) {
          const retryable = res.status === 429 || res.status >= 500;
          if (retryable && attempt < retries) {
            attempt++;
            await sleep(400 * attempt);
            continue;
          }
          throw new UpstreamError(`${host} responded ${res.status}`, res.status, host);
        }
        const json = (await res.json()) as T;
        if (ttlMs > 0) cacheSet(url, json, ttlMs);
        return json;
      } catch (err) {
        if (err instanceof UpstreamError) throw err;
        if (attempt < retries) {
          attempt++;
          await sleep(400 * attempt);
          continue;
        }
        const message = err instanceof Error ? err.message : "network error";
        throw new UpstreamError(`${host} unreachable: ${message}`, 0, host);
      }
    }
  };

  const promise = run().finally(() => inflight.delete(url));
  inflight.set(url, promise);
  return promise;
}

/** Memoize any async computation in the same TTL cache (used for expensive multi-call pipelines). */
export async function memo<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const cacheKey = `memo:${key}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached as T;
  const pending = inflight.get(cacheKey);
  if (pending) return pending as Promise<T>;
  const promise = compute()
    .then((value) => {
      cacheSet(cacheKey, value, ttlMs);
      return value;
    })
    .finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, promise);
  return promise;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run async tasks with bounded parallelism, keeping input order. Failed tasks resolve to undefined. */
export async function mapSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return results;
}
