"use client";

import { useBookModal } from "@/components/providers/BookModalProvider";
import { BookDetail } from "./BookDetail";

/** A shareable page for one book; data loads client-side through the same detail component as the sheet. */
export function BookPageClient({ id }: { id: string }) {
  const { openBook } = useBookModal();
  return (
    <div className="mx-auto max-w-[1200px] pb-24 pt-16 md:pt-24">
      <BookDetail initial={{ id, title: "", authors: [] }} titleId="book-page-title" page onOpenBook={(b) => openBook(b)} />
    </div>
  );
}
