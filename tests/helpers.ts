import type { Book } from "@/types/book";
import { EMPTY_PREFERENCES, type Preferences } from "@/types/preferences";
import { recommendBooks, type Embedder, type EngineOptions } from "@/lib/recommendations/engine";
import { buildSignals, type SignalOptions } from "@/lib/recommendations/preferenceMapper";
import type { RecommendationResult, ScoredBook } from "@/lib/recommendations/types";
import { CATALOG, byTitle } from "./fixtures/books";

export const prefs = (p: Partial<Preferences>): Preferences => ({ ...EMPTY_PREFERENCES, ...p });

export const liked = (...titles: string[]) => titles.map((t) => ({ id: byTitle(t).id, title: t, authors: byTitle(t).authors }));

/**
 * A deterministic stand-in for the sentence-transformer: hashed bag-of-words vectors.
 * Texts that share vocabulary end up closer, which is enough to exercise the semantic path.
 */
export const fakeEmbedder: Embedder = {
  model: "fake-bow-v1",
  async embed(texts) {
    return texts.map((text) => {
      const v = new Array(128).fill(0);
      const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
      for (const w of words) {
        if (["the", "and", "with", "that", "for", "from", "title", "author", "subjects", "description", "fiction", "general", "reader", "wants"].includes(w)) continue;
        let h = 2166136261;
        for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619) >>> 0;
        v[h % 128] += 1;
        v[(h >>> 7) % 128] += 0.5;
      }
      const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
      return v.map((x) => x / norm);
    });
  },
};

export interface RunOptions extends EngineOptions {
  signalOptions?: SignalOptions;
  catalog?: Book[];
}

/** Run the pure engine on the synthetic catalog. Liked books are resolved from the fixtures. */
export async function run(p: Partial<Preferences>, opts: RunOptions = {}): Promise<RecommendationResult> {
  const preferences = prefs(p);
  const likedBooks = preferences.likedBooks.map((l) => CATALOG.find((b) => b.id === l.id)!).filter(Boolean);
  const signals = buildSignals(preferences, likedBooks, opts.signalOptions);
  const { signalOptions: _s, catalog, ...engineOpts } = opts;
  void _s;
  return recommendBooks(signals, catalog ?? CATALOG, { debug: true, ...engineOpts });
}

export const titles = (r: RecommendationResult | ScoredBook[]) => (Array.isArray(r) ? r : r.recommendations).map((sb) => sb.book.title);
export const authors = (r: RecommendationResult) => r.recommendations.map((sb) => sb.book.authors[0]);

export function candidate(r: RecommendationResult, title: string) {
  const c = r.debug?.candidates.find((x) => x.title === title);
  if (!c) throw new Error(`no candidate named ${title}`);
  return c;
}

/** Primary genre-ish cluster of a pick, for diversity assertions. */
export function cluster(sb: ScoredBook): string {
  const order = ["horror", "romance", "mystery", "thriller", "crime", "scifi", "fantasy", "historical", "literary", "contemporary", "selfhelp", "psychology", "business", "history", "science", "philosophy", "memoir", "biography"] as const;
  let best: string = "other";
  let bestV = 0.45;
  for (const id of order) {
    const v = sb.profile.tags[id] ?? 0;
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return best;
}
