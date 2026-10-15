import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule pb-28 pt-14 md:pb-14">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-parchment">
            Tell us what you want to feel. We&rsquo;ll find the book. Recommendations are computed in the open from catalog data, with no account needed.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="space-y-2.5 text-sm">
            <li><Link className="text-parchment hover:text-vellum" href="/discover">Find my next book</Link></li>
            <li><Link className="text-parchment hover:text-vellum" href="/explore">Explore</Link></li>
            <li><Link className="text-parchment hover:text-vellum" href="/shelf">My Shelf</Link></li>
            <li><Link className="text-parchment hover:text-vellum" href="/surprise">Surprise me</Link></li>
          </ul>
        </nav>
        <p className="text-sm leading-relaxed text-dim">
          Book data and cover images come from{" "}
          <a className="text-parchment underline underline-offset-4 hover:text-vellum" href="https://openlibrary.org" target="_blank" rel="noreferrer">
            Open Library
          </a>
          , a project of the Internet Archive, with optional gap-filling from Google Books. Your shelf is stored only in this browser.
        </p>
      </div>
    </footer>
  );
}
