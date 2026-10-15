"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { MOODS, MOOD_ACCENT_VAR } from "@/lib/discovery/options";
import type { MoodId } from "@/types/preferences";
import { fetchExplore } from "@/lib/api/client";
import { useRemote } from "@/hooks/useRemote";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useDiscovery } from "@/components/providers/DiscoveryProvider";
import { ShelfRow } from "@/components/books/ShelfRow";
import { QuietLibrary } from "@/components/ui/States";
import type { ScoredBook } from "@/lib/recommendations/types";


/** The idea in one breath. */
export function ConceptSection() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-24 md:px-8 md:py-36">
      <p className="max-w-[24ch] font-display text-[clamp(2rem,4.4vw,3.9rem)] leading-[1.08] text-vellum">
        Search boxes ask what you want to find. <span className="text-parchment">We ask how you want to feel, what you loved, and what you&rsquo;d rather skip.</span>
      </p>
      <p className="mt-10 max-w-[56ch] text-lg leading-relaxed text-parchment">
        Your answers become signals: moods, themes, pace, length, and the books you already love. Libria pulls candidates from the Open Library catalog, scores each one against those signals, and tells you exactly why it made the cut.
      </p>
    </section>
  );
}

/** Real engine output: one live section of the catalog, captioned by the preference that produced it. */
export function ExampleShelf() {
  const { ref, near } = useNearViewport<HTMLElement>();
  const think = useRemote(near ? "landing:think" : null, (s) => fetchExplore("think", s));
  const lost = useRemote(near ? "landing:lost" : null, (s) => fetchExplore("lost", s));

  const items: ScoredBook[] | undefined =
    think.status === "success" && lost.status === "success"
      ? interleave(think.data.books.slice(0, 5), lost.data.books.slice(0, 5))
      : think.status === "error" && lost.status === "error"
        ? []
        : undefined;

  const thinkIds = new Set(think.status === "success" ? think.data.books.map((b) => b.book.id) : []);

  return (
    <section ref={ref} className="border-t border-rule py-20 md:py-28" aria-labelledby="example-shelf-title">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <div className="mb-10 max-w-2xl">
          <h2 id="example-shelf-title" className="display-lg">
            Tonight&rsquo;s shelf
          </h2>
          <p className="mt-4 text-lg text-parchment">Two real requests, run through the engine just now: &ldquo;make me think&rdquo; and &ldquo;give me a world to get lost in.&rdquo;</p>
        </div>
        {items && items.length === 0 ? (
          <QuietLibrary onRetry={() => (think.retry(), lost.retry())} />
        ) : (
          <ShelfRow
            items={items}
            label="Example recommendations"
            caption={(sb) => (thinkIds.has(sb.book.id) ? "For when you want to think" : "For getting lost in")}
          />
        )}
      </div>
    </section>
  );
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

const STEPS = [
  { n: "01", title: "Tell us what you're craving", body: "A mood, a few genres, how much time you have, books you loved and things to avoid. Skip anything you like." },
  { n: "02", title: "We search the library", body: "Your answers become a handful of targeted catalog searches. Every candidate is scored on mood, genre, similarity to your favorites, pace, length and reader ratings." },
  { n: "03", title: "Find your match", body: "The strongest few rise to the top, each with the reasons it fits. Say “not for me” and the rest re-rank instantly." },
];

export function HowItWorks() {
  const reduce = useReducedMotion();
  return (
    <section className="border-t border-rule py-20 md:py-28" aria-labelledby="how-title">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 md:grid-cols-[0.8fr_1.2fr] md:px-8">
        <h2 id="how-title" className="display-lg md:sticky md:top-32 md:self-start">
          How it works
        </h2>
        <ol className="relative space-y-14 border-l border-rule pl-8 md:pl-14">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              initial={reduce ? false : { y: 28, opacity: 0.25 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-15% 0px" }}
              transition={{ type: "spring", stiffness: 90, damping: 18, delay: i * 0.05 }}
              className="relative"
            >
              <span className="absolute -left-[calc(2rem+5px)] top-3 size-[9px] rounded-full bg-lamp shadow-[0_0_14px_var(--lamp)] md:-left-[calc(3.5rem+5px)]" aria-hidden />
              <p className="font-display text-6xl leading-none text-rule md:text-7xl">{s.n}</p>
              <h3 className="mt-3 font-display text-3xl text-vellum md:text-4xl">{s.title}</h3>
              <p className="mt-3 max-w-[52ch] text-lg leading-relaxed text-parchment">{s.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Explore by feeling: large typographic rows that start discovery with that mood chosen. */
export function MoodIndex() {
  const router = useRouter();
  const { update, setStep, prefs } = useDiscovery();
  const start = (id: MoodId) => {
    update({ moods: Array.from(new Set([...prefs.moods, id])) });
    setStep(1);
    router.push("/discover");
  };
  return (
    <section className="border-t border-rule py-20 md:py-28" aria-labelledby="moods-title">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <h2 id="moods-title" className="display-lg">
            Start with a feeling
          </h2>
          <Link href="/explore" className="text-parchment underline-offset-4 hover:text-vellum hover:underline">
            Or browse curated shelves
          </Link>
        </div>
        <ul className="divide-y divide-rule border-y border-rule">
          {MOODS.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => start(m.id)}
                className="group relative flex w-full items-center gap-5 overflow-hidden py-5 text-left md:gap-8 md:py-6"
                style={{ ["--accent" as string]: MOOD_ACCENT_VAR[m.accent] }}
              >
                <span className="absolute inset-0 -z-10 origin-left scale-x-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_70%)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100 group-focus-visible:scale-x-100" aria-hidden />
                <span className="w-10 text-2xl md:w-14 md:text-3xl" aria-hidden>
                  {m.emoji}
                </span>
                <span className="font-display text-[clamp(1.8rem,4vw,3.4rem)] leading-none text-vellum transition-transform duration-500 group-hover:translate-x-2">{m.title}</span>
                <span className="ml-auto hidden max-w-[34ch] text-sm text-parchment lg:block">{m.blurb}</span>
                <ArrowUpRight className="size-6 shrink-0 text-dim transition group-hover:rotate-45 group-hover:text-[var(--accent)]" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
