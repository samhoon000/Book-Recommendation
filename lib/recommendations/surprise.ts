import "server-only";
import type { Book, BookSummary } from "@/types/book";
import { getBook, isUsableBook, toSummary } from "@/lib/api/bookSearch";
import { searchOpenLibrary } from "@/lib/api/openLibrary";

export type SurpriseKind = "fiction" | "nonfiction" | "any";

/** Corners of the catalog that make for good wildcards. */
const FICTION_SUBJECTS = [
  "magical realism",
  "space opera",
  "gothic fiction",
  "epistolary fiction",
  "time travel",
  "heists",
  "cozy mystery",
  "alternative histories",
  "sea stories",
  "mythology",
  "cyberpunk",
  "psychological fiction",
  "humorous fiction",
  "ghost stories",
  "political fiction",
  "dystopias",
  "fairy tales",
  "artificial intelligence",
  "historical fiction",
  "literary fiction",
];

const NONFICTION_SUBJECTS = [
  "natural history",
  "popular science",
  "exploration",
  "philosophy",
  "astronomy",
  "archaeology",
  "linguistics",
  "oceanography",
  "true crime",
  "memoir",
  "economics",
  "psychology",
  "art history",
  "mathematics",
  "food habits",
  "cities and towns",
];

export interface SurpriseResult {
  book: Book;
  subject: string;
  decoys: BookSummary[];
}

export async function surprise(kind: SurpriseKind, seed: number): Promise<SurpriseResult | undefined> {
  const subjects = kind === "fiction" ? FICTION_SUBJECTS : kind === "nonfiction" ? NONFICTION_SUBJECTS : [...FICTION_SUBJECTS, ...NONFICTION_SUBJECTS];
  // Try a couple of subjects in case one corner of the catalog comes back thin.
  for (let attempt = 0; attempt < 3; attempt++) {
    const subject = subjects[(seed + attempt * 7) % subjects.length];
    const { books } = await searchOpenLibrary({
      q: `subject:"${subject}" AND ratings_count:[12 TO *] AND language:eng`,
      sort: `random_${seed % 100000}`,
      limit: 24,
      ttlMs: 60_000,
    });
    const usable = books.filter((b) => isUsableBook(b) && b.coverUrl && (b.rating?.average ?? 0) >= 3.7);
    if (usable.length === 0) continue;
    const pick = usable[0];
    const full = (await getBook(pick.id).catch(() => undefined)) ?? pick;
    return { book: full, subject, decoys: usable.slice(1, 8).map(toSummary) };
  }
  return undefined;
}
