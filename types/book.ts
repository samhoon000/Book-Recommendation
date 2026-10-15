export type BookSource = "openlibrary" | "googlebooks";

/**
 * The normalized book shape used everywhere in the UI.
 * Components never see raw Open Library or Google Books payloads.
 */
export interface Book {
  /** Stable internal id. Open Library works use their work id (OL123W); Google volumes use "gb-<volumeId>". */
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  /** Open Library author keys (OL123A), one per entry of `authors`, when the record came from Open Library. */
  authorKeys?: string[];
  description?: string;
  coverUrl?: string;
  coverUrlLarge?: string;
  publishedYear?: number;
  publisher?: string;
  isbn?: string;
  pageCount?: number;
  subjects: string[];
  categories: string[];
  rating?: { average: number; count: number };
  /** Reader interest signal (want-to-read + already-read counts) when the source provides it. */
  readerCount?: number;
  firstSentence?: string;
  /** Volume number when the catalog title says so ("… Series Book 3"), even if the display title drops it. */
  seriesVolume?: number;
  source: BookSource;
  sourceId: string;
  sourceUrl?: string;
}

/** Minimal shape used for autocomplete lists. */
export interface BookSummary {
  id: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  publishedYear?: number;
}
