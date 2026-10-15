"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import type { ExploreSectionId } from "@/lib/recommendations/explore";
import type { ScoredBook } from "@/lib/recommendations/types";
import { fetchExplore, fetchSimilar } from "@/lib/api/client";
import { useRemote } from "@/hooks/useRemote";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useBookModal } from "@/components/providers/BookModalProvider";
import { useDiscovery } from "@/components/providers/DiscoveryProvider";
import { ShelfRow } from "@/components/books/ShelfRow";
import { BookCover } from "@/components/books/BookCover";
import { BookSearchField } from "@/components/search/BookSearchField";
import { QuietLibrary } from "@/components/ui/States";

const SECTIONS: Array<{ id: ExploreSectionId; title: string; blurb: string; caption?: (sb: ScoredBook) => string | undefined }> = [
  {
    id: "trending",
    title: "Trending discoveries",
    blurb: "What Open Library readers are adding to their shelves this week.",
    caption: (sb) => (sb.book.publishedYear ? `First published ${sb.book.publishedYear}` : undefined),
  },
  { id: "think", title: "Books that make you think", blurb: "Ideas, arguments and stories that keep working on you afterward." },
  {
    id: "hidden-gems",
    title: "Hidden gems",
    blurb: "Highly rated by the readers who found them, and not yet everywhere.",
    caption: (sb) => (sb.book.rating ? `${sb.book.rating.average.toFixed(1)} from ${sb.book.rating.count} ratings` : undefined),
  },
  { id: "short", title: "Short but unforgettable", blurb: "Under two hundred pages, and worth every one.", caption: (sb) => (sb.book.pageCount ? `About ${sb.book.pageCount} pages` : undefined) },
  { id: "lost", title: "Books worth getting lost in", blurb: "Big, immersive worlds for long evenings.", caption: (sb) => (sb.book.pageCount ? `About ${sb.book.pageCount} pages` : undefined) },
];

function ExploreSectionRow({ id, title, blurb, caption }: (typeof SECTIONS)[number]) {
  const { ref, near } = useNearViewport<HTMLElement>("600px");
  const state = useRemote(near ? `explore:${id}` : null, (s) => fetchExplore(id, s));
  return (
    <section ref={ref} className="border-t border-rule py-14 md:py-20" aria-labelledby={`sec-${id}`}>
      <div className="mb-8 max-w-2xl">
        <h2 id={`sec-${id}`} className="display-md">
          {title}
        </h2>
        <p className="mt-2 text-parchment">{blurb}</p>
      </div>
      {state.status === "error" ? (
        <QuietLibrary onRetry={state.retry} message={state.error.message} />
      ) : (
        <ShelfRow label={title} items={state.status === "success" ? state.data.books : undefined} caption={caption ? (sb) => caption(sb) : undefined} />
      )}
    </section>
  );
}

/** "If you liked X": pick any book, get six relatives with the reason each one is related. */
function IfYouLiked() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const params = useSearchParams();
  const likeId = params.get("like");
  const likeTitle = params.get("title") ?? "";
  const { openBook } = useBookModal();
  const { prefs, hydrated, hasAnswers } = useDiscovery();
  // With the reader's answers known, "like this" keeps 40% of their original profile in the mix.
  const personal = hydrated && hasAnswers;
  const similar = useRemote(likeId && hydrated ? `similar:${likeId}:${personal ? JSON.stringify(prefs) : ""}` : null, (s) => fetchSimilar(likeId!, s, personal ? prefs : undefined));

  const choose = (id: string, title: string) => router.replace(`/explore?like=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}#if-you-liked`, { scroll: false });

  return (
    <section id="if-you-liked" className="scroll-mt-24 border-t border-rule py-14 md:py-20" aria-labelledby="iyl-title">
      <h2 id="iyl-title" className="display-lg">
        {likeId ? (
          <>
            If you liked <span className="italic">{likeTitle || "that book"}</span>…
          </>
        ) : (
          "If you liked…"
        )}
      </h2>
      {likeId && personal && <p className="mt-3 text-sm text-parchment">Blended with the preferences you gave us, so these stay close to what you asked for.</p>}
      <div className="mt-8 flex max-w-2xl items-end gap-4">
        <div className="flex-1">
          <BookSearchField label="Pick a book you enjoyed" placeholder="Search for a book..." onSelect={(b) => choose(b.id, b.title)} size="lg" />
        </div>
        {likeId && (
          <button type="button" onClick={() => router.replace("/explore", { scroll: false })} aria-label="Clear selected book" className="mb-3 grid size-10 place-items-center rounded-full border border-rule text-parchment hover:text-vellum">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {likeId && (
        <div className="mt-12">
          {similar.status === "error" ? (
            <QuietLibrary onRetry={similar.retry} message={similar.error.message} />
          ) : similar.status === "success" ? (
            similar.data.length ? (
              <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {similar.data.map((sb, i) => {
                    const why = sb.reasons.find((r) => r.kind === "liked") ?? sb.reasons[0];
                    return (
                      <motion.li
                        key={sb.book.id}
                        initial={reduce ? false : { opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 160, damping: 20, delay: i * 0.06 }}
                      >
                        <button type="button" onClick={() => openBook(sb.book, { scored: sb })} className="group flex w-full gap-5 text-left">
                          <div className="w-[104px] shrink-0 transition-transform duration-500 group-hover:-translate-y-1.5">
                            <BookCover book={sb.book} size="fill" decorative />
                          </div>
                          <div className="min-w-0">
                            <p className="font-display text-2xl leading-tight text-vellum group-hover:text-lamp">{sb.book.title}</p>
                            <p className="mt-1 text-sm text-parchment">{sb.book.authors[0]}</p>
                            {why && <p className="mt-3 text-sm leading-relaxed text-vellum/75">{why.detail}</p>}
                          </div>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="text-parchment">We couldn&rsquo;t find close relatives for that book in the catalog. Try another favorite.</p>
            )
          ) : (
            <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading related books">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="flex gap-5">
                  <div className="shimmer book-shape aspect-[2/3] w-[104px] shrink-0" />
                  <div className="flex-1 space-y-3 pt-2">
                    <div className="shimmer h-5 w-3/4 rounded" />
                    <div className="shimmer h-3 w-1/2 rounded" />
                    <div className="shimmer h-3 w-full rounded" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function ExploreView() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-28 md:px-8 md:pt-36">
      <h1 className="display-xl">Explore</h1>
      <p className="mt-5 max-w-[52ch] text-lg text-parchment">Shelves assembled live from the Open Library catalog by the same engine that powers your recommendations.</p>
      <div className="mt-14">
        <IfYouLiked />
        {SECTIONS.map((s) => (
          <ExploreSectionRow key={s.id} {...s} />
        ))}
      </div>
    </div>
  );
}
