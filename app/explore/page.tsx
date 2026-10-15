import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreView } from "@/components/explore/ExploreView";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <main>
      {/* ExploreView reads ?like= from the URL, which is only known at request time. */}
      <Suspense fallback={<div className="min-h-dvh" />}>
        <ExploreView />
      </Suspense>
      <SiteFooter />
    </main>
  );
}
