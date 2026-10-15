import type { Metadata } from "next";
import { DiscoveryWizard } from "@/components/discovery/DiscoveryWizard";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <main>
      <DiscoveryWizard />
    </main>
  );
}
