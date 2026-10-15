import type { Metadata } from "next";
import { SurpriseView } from "@/components/surprise/SurpriseView";

export const metadata: Metadata = { title: "Surprise me" };

export default function SurprisePage() {
  return (
    <main>
      <SurpriseView />
    </main>
  );
}
