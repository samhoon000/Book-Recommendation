import "server-only";
import type { Book } from "@/types/book";
import { tidyGoogleImage } from "@/lib/utils/covers";
import { normalizeTitle } from "./dedupe";
import { fetchJson, UpstreamError } from "./http";
import { cleanDescription, isRecord, num, pickIsbn, str, strArray, tidyTitle, uniq, year, type Json } from "./validate";

/**
 * Optional secondary source. Works without a key when Google's anonymous quota allows it;
 * set GOOGLE_BOOKS_API_KEY (server-side only) for a dedicated quota.
 * After a quota or auth error the client backs off for a while instead of hammering the API.
 */

const BASE = "https://www.googleapis.com/books/v1/volumes";
const COOLDOWN_MS = 15 * 60 * 1000;
let disabledUntil = 0;

export function googleBooksAvailable(): boolean {
  return Date.now() > disabledUntil;
}

async function request(params: Record<string, string>): Promise<Json | undefined> {
  if (!googleBooksAvailable()) return undefined;
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (key) url.searchParams.set("key", key);
  try {
    return await fetchJson<Json>(url.toString(), { ttlMs: 24 * 3600_000, timeoutMs: 6000, retries: 0 });
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 429 || err.status === 403 || err.status === 0)) {
      disabledUntil = Date.now() + COOLDOWN_MS;
    }
    return undefined;
  }
}

export async function searchGoogleBooks(q: string, maxResults = 10): Promise<Book[]> {
  const json = await request({ q, maxResults: String(maxResults), printType: "books", langRestrict: "en" });
  if (!isRecord(json) || !Array.isArray(json.items)) return [];
  return json.items.map(normalizeVolume).filter((b): b is Book => b !== undefined);
}

/** Best-effort lookup used to fill gaps (description, page count, categories) in an Open Library record. */
export async function findGoogleMatch(book: Pick<Book, "title" | "authors" | "isbn">): Promise<Book | undefined> {
  const title = normalizeTitle(book.title);
  const surname = book.authors[0]?.split(" ").slice(-1)[0]?.toLowerCase();
  // Accept a candidate only if the title matches and (when we know it) the author's surname does too.
  const isMatch = (r: Book) => {
    const t = normalizeTitle(r.title);
    const titleOk = t === title || t.startsWith(title) || title.startsWith(t);
    const authorOk = !surname || r.authors.some((a) => a.toLowerCase().includes(surname));
    return titleOk && authorOk && t.length > 0;
  };

  // Plain keywords first: fast, and some keys get zero results for every qualified query (isbn:, intitle:, inauthor:).
  const plain = await searchGoogleBooks(`${book.title}${surname ? ` ${surname}` : ""}`, 6);
  const hit = plain.find(isMatch);
  if (hit) return hit;
  const [byIsbn, qualified] = await Promise.all([
    book.isbn ? searchGoogleBooks(`isbn:${book.isbn}`, 1) : Promise.resolve([]),
    searchGoogleBooks(`intitle:${book.title}${surname ? ` inauthor:${surname}` : ""}`, 3),
  ]);
  return byIsbn[0] ?? qualified.find(isMatch);
}

export function normalizeVolume(raw: Json): Book | undefined {
  if (!isRecord(raw)) return undefined;
  const id = str(raw.id);
  const info = isRecord(raw.volumeInfo) ? raw.volumeInfo : undefined;
  if (!id || !info) return undefined;
  const title = str(info.title, 300);
  if (!title) return undefined;

  const ids = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers.filter(isRecord) : [];
  const isbns = ids.map((i) => str(i.identifier)).filter((s): s is string => !!s);
  const images = isRecord(info.imageLinks) ? info.imageLinks : undefined;
  const thumb = tidyGoogleImage(str(images?.thumbnail) ?? str(images?.smallThumbnail), 1);
  const avg = num(info.averageRating);
  const count = num(info.ratingsCount);
  const pages = num(info.pageCount);
  const categories = uniq(strArray(info.categories).flatMap((c) => c.split("/").map((p) => p.trim())).filter(Boolean));

  return {
    id: `gb-${id}`,
    title: tidyTitle(title),
    subtitle: str(info.subtitle, 300),
    authors: strArray(info.authors, 6),
    description: cleanDescription(str(info.description)),
    coverUrl: thumb,
    coverUrlLarge: tidyGoogleImage(str(images?.thumbnail), 2) ?? thumb,
    publishedYear: year(info.publishedDate),
    publisher: str(info.publisher),
    isbn: pickIsbn(isbns),
    pageCount: pages && pages > 20 ? Math.round(pages) : undefined,
    subjects: [],
    categories,
    rating: avg !== undefined && count ? { average: avg, count } : undefined,
    source: "googlebooks",
    sourceId: id,
    sourceUrl: str(info.infoLink) ?? str(info.canonicalVolumeLink),
  };
}

export async function getGoogleVolume(volumeId: string): Promise<Book | undefined> {
  if (!googleBooksAvailable()) return undefined;
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  try {
    const json = await fetchJson<Json>(`${BASE}/${encodeURIComponent(volumeId)}${key ? `?key=${key}` : ""}`, {
      ttlMs: 24 * 3600_000,
      retries: 0,
    });
    return normalizeVolume(json);
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 429 || err.status === 403)) disabledUntil = Date.now() + COOLDOWN_MS;
    return undefined;
  }
}
