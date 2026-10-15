import { Hero } from "@/components/hero/Hero";
import { ConceptSection, ExampleShelf, HowItWorks, MoodIndex } from "@/components/landing/LandingSections";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function Home() {
  return (
    <main>
      <Hero />
      <ConceptSection />
      <ExampleShelf />
      <HowItWorks />
      <MoodIndex />
      <SiteFooter />
    </main>
  );
}
