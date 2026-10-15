import type { Book } from "@/types/book";
import { normalizeSubjects } from "../taxonomy";
import { EMBEDDINGS } from "../config";

/**
 * Normalized textual representation of a book for the embedding model.
 * Stable for the same metadata, so it doubles as the cache key material.
 */
export function bookDocument(book: Book): string {
  const subjects = normalizeSubjects([...book.subjects, ...book.categories], 24);
  const description = (book.description ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  const lines = [`Title: ${book.title}${book.subtitle ? `: ${book.subtitle}` : ""}`, `Author: ${book.authors.slice(0, 2).join(", ")}`];
  if (description) lines.push(`Description: ${description}`);
  if (subjects.length) lines.push(`Subjects: ${subjects.join(", ")}`);
  if (book.categories.length) lines.push(`Categories: ${book.categories.slice(0, 6).join(", ")}`);
  if (book.firstSentence && !description) lines.push(`Opens: ${book.firstSentence.slice(0, 200)}`);
  return lines.join("\n").slice(0, EMBEDDINGS.maxDocumentChars);
}

/** Cheap, stable hash of a document so a changed description re-embeds while an unchanged one hits the cache. */
export function documentHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x9e3779b1) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

export function bookEmbeddingKey(book: Book): string {
  return `${book.id}:${documentHash(bookDocument(book))}`;
}
