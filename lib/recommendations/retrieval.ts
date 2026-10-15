import type { OpenLibrarySort } from "@/lib/api/openLibrary";
import { ADJACENT_TAGS } from "./concepts";
import { RETRIEVAL } from "./config";
import { addTags } from "./profile";
import { TAGS, type TagId, type WeightedTags } from "./taxonomy";
import type { Signals } from "./types";

/**
 * Retrieval planner. One request never depends on one query: every facet of the reader's taste
 * (each genre, the mood's themes, each liked book's concepts, the free text, a step sideways for
 * exploration) becomes its own targeted Open Library query. Results are merged and de-duplicated later.
 */

export type RetrievalRoute = "genre" | "genre+mood" | "mood" | "goal" | "liked" | "liked-concepts" | "latent" | "reference" | "freeText" | "freeText-terms" | "exploration" | "broad" | "focus";

export interface PlannedQuery {
  route: RetrievalRoute;
  q: string;
  sort?: OpenLibrarySort;
  limit: number;
  /** Plain-text version used if Open Library fails and Google Books is asked instead. */
  fallbackText?: string;
  /** Lower runs first when the plan has to be trimmed. */
  priority: number;
}

const quote = (s: string) => `subject:"${s.replace(/"/g, "")}"`;
const anyOf = (subjects: string[]) => (subjects.length === 1 ? quote(subjects[0]) : `(${subjects.map(quote).join(" OR ")})`);

export function topTags(tags: WeightedTags, n: number, kind?: "genre" | "theme", lean = 0, min = 0.45): TagId[] {
  return (Object.entries(tags) as Array<[TagId, number]>)
    .filter(([id, w]) => w >= min && TAGS[id].olSubjects.length > 0 && (!kind || TAGS[id].kind === kind))
    // When the reader is clearly after stories, don't anchor queries on non-fiction subjects (and vice versa).
    .filter(([id]) => (lean >= 0.5 ? !TAGS[id].nonfiction : lean <= -0.5 ? TAGS[id].nonfiction || TAGS[id].kind === "theme" : true))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

export function subjectsFor(tags: TagId[]): string[] {
  return Array.from(new Set(tags.flatMap((t) => TAGS[t].olSubjects.slice(0, 2))));
}

const GENERIC = /fiction|general|novel|literature|english|american|large type|accessible|protected|in library|reading level|open library|wishlist|overdrive|ebook|translations|award|bestseller|nyt|series|\d{4}/;

/** A liked book's most distinctive catalog subjects: short phrases that are not library housekeeping. */
export function distinctiveSubjects(subjects: string[], n = 4): string[] {
  return subjects.filter((x) => x.split(" ").length <= 3 && x.length >= 4 && !GENERIC.test(x)).slice(0, n);
}

export function planRetrieval(s: Signals): PlannedQuery[] {
  const queries: PlannedQuery[] = [];
  // Open Library rejects range filters on ratings_average, so quality is filtered by count and ranked by sort=rating.
  const base = "language:eng";
  const quality = s.qualityMode === "hidden" ? "ratings_count:[8 TO 120]" : "ratings_count:[6 TO *]";
  // Length stays a soft score for most routes; only the primary genre/mood queries are pre-filtered, and loosely.
  const lengthFilter = s.length ? `number_of_pages_median:[${Math.max(1, s.length.min - 60)} TO ${s.length.max + 140}]` : undefined;

  const avoidClause = s.hard.excludeTags
    .filter((ex) => TAGS[ex.tag].olSubjects.length > 0 && TAGS[ex.tag].kind === "genre")
    .map((ex) => `NOT ${quote(TAGS[ex.tag].olSubjects[0])}`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" ");

  const push = (route: RetrievalRoute, core: string, opts: { sort?: OpenLibrarySort; length?: boolean; limit?: number; fallbackText?: string; priority?: number } = {}) => {
    const parts = [core, base, quality];
    if (opts.length && lengthFilter) parts.push(lengthFilter);
    let q = parts.join(" AND ");
    if (avoidClause) q += ` ${avoidClause}`;
    if (!queries.some((x) => x.q === q)) queries.push({ route, q, sort: opts.sort, limit: opts.limit ?? RETRIEVAL.defaultLimit, fallbackText: opts.fallbackText, priority: opts.priority ?? 5 });
  };

  const moodTags: WeightedTags = {};
  for (const m of s.moods) addTags(moodTags, m.tags);
  const themeTags = topTags(moodTags, 4, "theme");
  const moodGenreTags = topTags(moodTags, 3, "genre");
  const lean = s.fictionLean;

  /* 0. "More like this": the chosen book dominates retrieval. */
  if (s.focus) {
    const f = s.focus;
    const genre = topTags(f.profile.tags, 1, "genre")[0];
    const themes = topTags(f.profile.tags, 3, "theme");
    const distinctive = distinctiveSubjects(f.profile.subjects, 5);
    if (genre && distinctive.length) push("focus", `${quote(TAGS[genre].olSubjects[0])} AND ${anyOf(distinctive)}`, { sort: "readinglog", limit: RETRIEVAL.likedLimit, priority: 1, fallbackText: `${f.title} ${TAGS[genre].label}` });
    if (genre && themes.length) push("focus", `${quote(TAGS[genre].olSubjects[0])} AND ${anyOf(subjectsFor(themes))}`, { sort: "rating", limit: RETRIEVAL.likedLimit, priority: 1 });
    if (distinctive.length >= 2) push("focus", anyOf(distinctive.slice(0, 3)), { sort: "rating", limit: 30, priority: 2 });
  }

  /* 1. Each chosen genre: popular first, then refined by the mood's themes. */
  const genreTagIds = s.genres.flatMap((g) => topTags(g.tags, 1));
  genreTagIds.slice(0, 3).forEach((tag, i) => {
    const subj = TAGS[tag].olSubjects;
    push("genre", anyOf(subj.slice(0, 2)), { sort: i % 2 === 0 ? "readinglog" : "rating", length: i === 0, fallbackText: subj[0], priority: 2 });
    const refine = [...themeTags, ...moodGenreTags.filter((t) => t !== tag)].slice(0, 3);
    if (refine.length) push("genre+mood", `${quote(subj[0])} AND ${anyOf(subjectsFor(refine))}`, { sort: "rating", priority: 2 });
    // Genre × the reader's latent themes (from liked books): "science fiction AND (politics OR ecology)".
    const latentThemes = topTags(s.latent, 3, "theme").filter((t) => !refine.includes(t));
    if (latentThemes.length) push("latent", `${quote(subj[0])} AND ${anyOf(subjectsFor(latentThemes))}`, { sort: "rating", priority: 3 });
  });

  /* 2. Moods on their own: with no genres they drive the pool, with genres they widen it. */
  if (genreTagIds.length > 0 && themeTags.length) {
    push("mood", anyOf(subjectsFor(themeTags.slice(0, 3))), { sort: "rating", limit: 20, priority: 4 });
  }
  if (genreTagIds.length === 0 && s.moods.length) {
    if (moodGenreTags.length) push("mood", anyOf(subjectsFor(moodGenreTags.slice(0, 3))), { sort: "readinglog", length: true, fallbackText: TAGS[moodGenreTags[0]].label, priority: 2 });
    if (themeTags.length) push("mood", anyOf(subjectsFor(themeTags)), { sort: "rating", priority: 3 });
    if (moodGenreTags.length && themeTags.length) push("mood", `${anyOf(subjectsFor(moodGenreTags.slice(0, 2)))} AND ${anyOf(subjectsFor(themeTags.slice(0, 2)))}`, { sort: "readinglog", priority: 3 });
  }

  /* 3. Books the reader loved: distinctive subjects anchored by genre, then the book's concepts. */
  for (const liked of s.liked.filter((l) => l.origin !== "focus").slice(0, 3)) {
    const route: RetrievalRoute = liked.origin === "reference" ? "reference" : "liked";
    const genre = topTags(liked.profile.tags, 1, "genre")[0];
    const distinctive = distinctiveSubjects(liked.profile.subjects, 4);
    if (genre && distinctive.length) {
      push(route, `${quote(TAGS[genre].olSubjects[0])} AND ${anyOf(distinctive)}`, { sort: "readinglog", limit: RETRIEVAL.likedLimit, fallbackText: `${liked.title} ${TAGS[genre].label}`, priority: 1 });
    } else if (distinctive.length) {
      push(route, anyOf(distinctive), { sort: "readinglog", limit: 30, priority: 2 });
    } else if (genre) {
      push(route, quote(TAGS[genre].olSubjects[0]), { sort: "rating", limit: 30, priority: 3 });
    }
    // Concept route: the book's themes (political intrigue + ecology + power) rather than its exact subjects.
    const themes = topTags(liked.profile.tags, 3, "theme", 0, 0.5);
    if (genre && themes.length >= 2) push("liked-concepts", `${quote(TAGS[genre].olSubjects[0])} AND ${anyOf(subjectsFor(themes))}`, { sort: "rating", limit: 30, priority: 2 });
  }

  /* 4. Latent profile across several liked books (what Dune, Foundation and Hyperion share). */
  if (s.liked.length >= 2) {
    const sharedGenres = topTags(s.latent, 2, "genre");
    const sharedThemes = topTags(s.latent, 3, "theme", 0, 0.4);
    if (sharedGenres.length && sharedThemes.length) push("latent", `${anyOf(subjectsFor(sharedGenres))} AND ${anyOf(subjectsFor(sharedThemes))}`, { sort: "readinglog", limit: 30, priority: 2 });
  }

  /* 5. The reader's own words. */
  if (s.freeText) {
    const genreish = topTags(s.freeText.tags, 2, "genre", lean);
    const themes = topTags(s.freeText.tags, 3, "theme");
    if (genreish.length && themes.length) push("freeText", `${anyOf(subjectsFor(genreish))} AND ${anyOf(subjectsFor(themes))}`, { sort: "rating", fallbackText: s.freeText.text, priority: 1 });
    else if (genreish.length || themes.length) push("freeText", anyOf(subjectsFor([...genreish, ...themes])), { sort: "readinglog", fallbackText: s.freeText.text, priority: 2 });
    if (s.freeText.terms.length) {
      const q = s.freeText.terms.slice(0, 3).map((t) => `subject:${t.replace(/[^a-z0-9-]/g, "")}`).join(" OR ");
      push("freeText-terms", `(${q})`, { sort: "readinglog", limit: 20, priority: 4 });
    }
  }

  /* 6. Goals, when the pool might otherwise be thin. */
  if (s.goals.length && queries.length < 6) {
    const goalTags: WeightedTags = {};
    for (const g of s.goals) addTags(goalTags, g.tags);
    const ids = topTags(goalTags, 3, undefined, lean);
    if (ids.length) push("goal", anyOf(subjectsFor(ids)), { sort: "rating", priority: 4 });
  }

  /* 7. Exploration: one step sideways from the strongest positive genre, never a random jump. */
  const explicitTags: WeightedTags = {};
  for (const g of s.genres) addTags(explicitTags, g.tags);
  for (const m of s.moods) addTags(explicitTags, m.tags);
  if (s.freeText) addTags(explicitTags, s.freeText.tags);
  const anchors = topTags(Object.keys(explicitTags).length ? explicitTags : s.positiveTags, 2, "genre", lean, 0.6);
  for (const anchor of anchors.slice(0, 2)) {
    const adjacent = (Object.entries(ADJACENT_TAGS[anchor] ?? {}) as Array<[TagId, number]>)
      .filter(([tag]) => !(s.positiveTags[tag] ?? 0) && !(s.avoidTags[tag] ?? 0) && TAGS[tag].olSubjects.length)
      .filter(([tag]) => (lean >= 0.5 ? !TAGS[tag].nonfiction : lean <= -0.5 ? TAGS[tag].nonfiction || TAGS[tag].kind === "theme" : true))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tag]) => tag);
    // Exploration leans on better-known books: a sideways step should land somewhere readers vouch for.
    if (adjacent.length) push("exploration", `${anyOf(subjectsFor(adjacent))} AND ratings_count:[20 TO *]`, { sort: "rating", limit: RETRIEVAL.explorationLimit, priority: 6 });
  }

  /* 8. Length or experience alone, or nothing at all: start from widely loved books. */
  if (queries.length === 0) {
    if (lean >= 0) push("broad", `subject:"fiction" AND ratings_count:[80 TO *]`, { sort: "rating", length: true, limit: 40, fallbackText: "acclaimed novels", priority: 1 });
    if (lean <= 0) push("broad", `(subject:"popular works" OR subject:"history" OR subject:"psychology" OR subject:"science") AND ratings_count:[40 TO *]`, { sort: "rating", length: true, limit: 30, fallbackText: "acclaimed nonfiction", priority: 1 });
    push("broad", `ratings_count:[150 TO *]`, { sort: "readinglog", length: true, limit: 30, priority: 2 });
  }

  return queries.sort((a, b) => a.priority - b.priority).slice(0, RETRIEVAL.maxQueries);
}

/** Legacy name used by older call sites. */
export const buildCandidateQueries = planRetrieval;
