import {
  EMPTY_PREFERENCES,
  type FeedbackReason,
  type LikedBook,
  type Preferences,
} from "@/types/preferences";
import type { SessionContext } from "@/lib/recommendations/types";
import { AGES, AVOIDS, COMPLEXITY, ENDINGS, FEEDBACK_REASONS, FICTION_GENRE_OPTIONS, GOALS, INTENSITY, LENGTHS, MOODS, NONFICTION_GENRE_OPTIONS, PACE } from "./options";

/** Accept only known option ids and bounded strings. Used for request bodies and stored state. */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function pickList<T extends string>(v: unknown, allowed: readonly T[], max = 20): T[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<string>(allowed);
  return Array.from(new Set(v.filter((x): x is T => typeof x === "string" && set.has(x)))).slice(0, max);
}

function pickOne<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function likedBooks(v: unknown): LikedBook[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((b) => ({
      id: text(b.id, 40),
      title: text(b.title, 200),
      authors: Array.isArray(b.authors) ? b.authors.filter((a): a is string => typeof a === "string").slice(0, 4).map((a) => a.slice(0, 120)) : [],
      coverUrl: typeof b.coverUrl === "string" && /^https:\/\//.test(b.coverUrl) ? b.coverUrl.slice(0, 300) : undefined,
    }))
    .filter((b) => /^(OL\d+W|gb-[\w-]+)$/.test(b.id) && b.title)
    .slice(0, 8);
}

export function sanitizePreferences(v: unknown): Preferences {
  if (!isObj(v)) return { ...EMPTY_PREFERENCES };
  return {
    moods: pickList(v.moods, MOODS.map((m) => m.id)),
    customMood: text(v.customMood, 120),
    genres: pickList(v.genres, [...FICTION_GENRE_OPTIONS, ...NONFICTION_GENRE_OPTIONS].map((g) => g.id)),
    anyGenre: v.anyGenre === true,
    readingLength: pickOne(v.readingLength, [...LENGTHS.map((l) => l.id), "any" as const]) ?? "any",
    complexity: pickOne(v.complexity, COMPLEXITY.map((c) => c.id)),
    pace: pickOne(v.pace, PACE.map((p) => p.id)),
    emotionalIntensity: pickOne(v.emotionalIntensity, INTENSITY.map((i) => i.id)),
    endingPreference: pickOne(v.endingPreference, ENDINGS.map((e) => e.id)),
    agePreference: pickOne(v.agePreference, AGES.map((a) => a.id)),
    likedBooks: likedBooks(v.likedBooks),
    newReader: v.newReader === true,
    dislikedThemes: pickList(v.dislikedThemes, AVOIDS.map((a) => a.id)),
    avoidText: text(v.avoidText, 300),
    goals: pickList(v.goals, GOALS.map((g) => g.id)),
    freeText: text(v.freeText, 400),
  };
}

export function sanitizeFeedbackReason(v: unknown): FeedbackReason | undefined {
  return pickOne(v, FEEDBACK_REASONS.map((r) => r.id));
}

const BOOK_ID = /^(OL\d+W|gb-[\w-]{4,40})$/;

/** Session feedback sent with a request: bounded lists of known book ids and known reasons. */
export function sanitizeSession(v: unknown): SessionContext | undefined {
  if (!isObj(v)) return undefined;
  const rejected = Array.isArray(v.rejected)
    ? v.rejected
        .filter(isObj)
        .map((r) => ({ bookId: text(r.bookId, 40), reason: sanitizeFeedbackReason(r.reason) }))
        .filter((r) => BOOK_ID.test(r.bookId))
        .slice(0, 60)
    : [];
  const seen = Array.isArray(v.seen) ? v.seen.filter((x): x is string => typeof x === "string" && BOOK_ID.test(x)).slice(0, 120) : [];
  if (!rejected.length && !seen.length) return undefined;
  return { rejected, seen: seen.length ? seen : undefined };
}
