import type { Metadata } from "next";
import { Suspense } from "react";
import { BookPageClient } from "@/components/books/BookPageClient";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = { title: "Book" };

async function BookPageLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookPageClient id={decodeURIComponent(id)} />;
}

export default function BookPage({ params }: PageProps<"/book/[id]">) {
  return (
    <main>
      <Suspense fallback={<div className="min-h-dvh" />}>
        <BookPageLoader params={params} />
      </Suspense>
      <SiteFooter />
    </main>
  );
}
