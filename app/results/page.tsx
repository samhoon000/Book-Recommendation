import type { Metadata } from "next";
import { ResultsView } from "@/components/recommendations/ResultsView";

export const metadata: Metadata = { title: "Your books" };

export default function ResultsPage() {
  return (
    <main>
      <ResultsView />
    </main>
  );
}
