import type { Metadata } from "next";
import { ShelfView } from "@/components/shelf/ShelfView";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = { title: "My Shelf" };

export default function ShelfPage() {
  return (
    <main>
      <ShelfView />
      <SiteFooter />
    </main>
  );
}
