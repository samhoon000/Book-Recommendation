"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Library, Search, Shuffle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useShelf } from "@/components/providers/ShelfProvider";
import { SearchOverlay } from "@/components/search/SearchOverlay";
import { Wordmark } from "./Wordmark";

const NAV = [
  { href: "/discover", label: "Discover", icon: Sparkles },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/shelf", label: "My Shelf", icon: Library },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { entries } = useShelf();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const typing = target?.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/discover" && pathname === "/results");

  return (
    <>
      <a href="#main" className="sr-only z-[80] rounded bg-lamp px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ${
          scrolled ? "border-b border-rule/70 bg-ink/80 backdrop-blur-md" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 md:h-[72px] md:px-8">
          <Link href="/" className="shrink-0" aria-label="Libria home">
            <Wordmark />
          </Link>

          <nav aria-label="Main" className="ml-6 hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`relative rounded-full px-4 py-2 text-sm transition-colors ${isActive(item.href) ? "text-vellum" : "text-parchment hover:text-vellum"}`}
                  >
                    {isActive(item.href) && (
                      <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-shelf" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                    )}
                    {item.label}
                    {item.href === "/shelf" && entries.length > 0 && <span className="ml-1.5 tabular-nums text-lamp">{entries.length}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-full border border-rule px-3 py-2 text-sm text-parchment transition hover:border-parchment/50 hover:text-vellum md:pr-2"
              aria-label="Search books"
            >
              <Search className="size-4" aria-hidden />
              <span className="hidden lg:inline">Search books</span>
              <kbd className="hidden rounded border border-rule px-1.5 text-[11px] text-dim lg:inline">Ctrl K</kbd>
            </button>
            <Link
              href="/surprise"
              className="group hidden items-center gap-2 rounded-full bg-vellum px-4 py-2 text-sm font-medium text-ink transition hover:bg-lamp active:scale-[0.98] md:flex"
            >
              <Shuffle className="size-4 transition-transform duration-500 group-hover:rotate-180" aria-hidden />
              Surprise Me
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-ink/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="grid grid-cols-4">
          {[...NAV, { href: "/surprise", label: "Surprise", icon: Shuffle } as const].map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? "text-lamp" : "text-parchment"}`}
                >
                  <Icon className="size-5" aria-hidden />
                  {item.label === "My Shelf" ? "Shelf" : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
