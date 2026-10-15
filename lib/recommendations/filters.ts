import type { Book } from "@/types/book";
import { normalizeTitle } from "@/lib/api/dedupe";
import { tagAssociation } from "./profile";
import { TAGS, type TagId } from "./taxonomy";
import type { BookProfile, Signals } from "./types";

/** Tags that mark a book as written for adults even when a school edition earned it a "juvenile" heading. */
const ADULT_MARKERS: TagId[] = ["thriller", "crime", "horror", "dark", "literary", "philosophy", "politics", "war", "erotica", "violence", "business", "economics", "history", "psychology", "classics"];

/** Clearly a children's book: several juvenile headings, no adult markers, and short. */
export function isChildrensBook(profile: BookProfile, pageCount: number | undefined): boolean {
  const kids = tagAssociation(profile, "children");
  if (kids < 0.9) return false;
  if (ADULT_MARKERS.some((t) => tagAssociation(profile, t) >= 0.55)) return false;
  return pageCount === undefined || pageCount < 200;
}

/**
 * Hard filters: constraints that eliminate a candidate instead of lowering its score.
 * Everything softer belongs in scoring.ts.
 */

export interface FilterResult<T> {
  kept: T[];
  dropped: Array<{ item: T; reason: string }>;
}

export function hardFilterReason(book: Book, profile: BookProfile, s: Signals): string | undefined {
  if (!book.title?.trim()) return "missing title";
  if (!book.authors.length) return "missing author";
  const h = s.hard;
  if (h.excludeIds.includes(book.id)) return "already listed, read or rejected";
  const title = normalizeTitle(book.title);
  if (title.length >= 3 && h.excludeTitles.includes(title)) return "same title as a book you listed";
  for (const ex of h.excludeTags) {
    if (tagAssociation(profile, ex.tag) >= ex.threshold) return `strongly ${TAGS[ex.tag].label} (you asked to avoid ${ex.label.toLowerCase()})`;
  }
  if (h.maxPages && book.pageCount && book.pageCount > h.maxPages) return `far longer than you asked for (${book.pageCount} pages)`;
  if (h.excludeChildren && isChildrensBook(profile, book.pageCount)) return "a children's book";
  if (h.adultOnly && tagAssociation(profile, "children") >= 0.9) return "written for children";
  if (h.excludeTerms.length) {
    const hay = profile.subjects.join(" | ");
    const hit = h.excludeTerms.find((t) => hay.includes(t));
    if (hit) return `catalogued under "${hit}", which you asked to avoid`;
  }
  return undefined;
}

export function applyHardFilters<T extends { book: Book; profile: BookProfile }>(items: T[], s: Signals): FilterResult<T> {
  const kept: T[] = [];
  const dropped: FilterResult<T>["dropped"] = [];
  for (const item of items) {
    const reason = hardFilterReason(item.book, item.profile, s);
    if (reason) dropped.push({ item, reason });
    else kept.push(item);
  }
  return { kept, dropped };
}
