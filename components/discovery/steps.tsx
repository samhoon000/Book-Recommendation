"use client";

import { AnimatePresence, motion } from "motion/react";
import { PenLine, X } from "lucide-react";
import { useState } from "react";
import type { Preferences } from "@/types/preferences";
import {
  AGES,
  AVOIDS,
  COMPLEXITY,
  ENDINGS,
  FICTION_GENRE_OPTIONS,
  GOALS,
  INTENSITY,
  LENGTHS,
  MOODS,
  MOOD_ACCENT_VAR,
  NONFICTION_GENRE_OPTIONS,
  PACE,
  type ScaleOption,
} from "@/lib/discovery/options";
import { BookCover } from "@/components/books/BookCover";
import { BookSearchField } from "@/components/search/BookSearchField";
import { arrowNav, Chip, OptionCard, StepHeading } from "./controls";

export interface StepProps {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  index: number;
  headingId: string;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/* ---------------------------------------------------------------- 1. Mood */

export function MoodStep({ prefs, update, index, headingId }: StepProps) {
  const [writing, setWriting] = useState(prefs.customMood.length > 0);
  const anySelected = prefs.moods.length > 0 || prefs.customMood.length > 0;
  return (
    <div>
      <StepHeading index={index} id={headingId} title="What are you in the mood for?" subtitle="Pick as many as you like. This shapes everything that follows." />
      <div role="group" aria-labelledby={headingId} onKeyDown={arrowNav} className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {MOODS.map((m) => (
          <OptionCard
            key={m.id}
            selected={prefs.moods.includes(m.id)}
            dimmed={anySelected}
            accent={MOOD_ACCENT_VAR[m.accent]}
            onToggle={() => update({ moods: toggle(prefs.moods, m.id) })}
            className="flex min-h-[148px] flex-col p-4 md:min-h-[188px] md:p-5"
          >
            <span className="text-3xl md:text-4xl" aria-hidden>
              {m.emoji}
            </span>
            <span className="mt-auto pt-4 font-display text-[1.45rem] leading-tight text-vellum md:text-[1.7rem]">{m.title}</span>
            <span className="mt-1.5 hidden text-sm leading-snug text-parchment sm:block">{m.blurb}</span>
          </OptionCard>
        ))}
      </div>
      <div className="mt-6">
        {writing ? (
          <div className="flex items-center gap-3 border-b border-rule pb-2 focus-within:border-lamp">
            <PenLine className="size-5 shrink-0 text-lamp" aria-hidden />
            <label htmlFor="custom-mood" className="sr-only">
              Describe another mood
            </label>
            <input
              id="custom-mood"
              autoFocus
              value={prefs.customMood}
              maxLength={120}
              onChange={(e) => update({ customMood: e.target.value })}
              placeholder="Something else... e.g. melancholy but funny"
              className="w-full bg-transparent py-2 font-display text-2xl text-vellum placeholder:text-dim focus:outline-none"
            />
            <button type="button" aria-label="Clear custom mood" onClick={() => (update({ customMood: "" }), setWriting(false))} className="text-dim hover:text-vellum">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setWriting(true)} className="inline-flex items-center gap-2 text-parchment underline decoration-rule underline-offset-[6px] hover:text-vellum hover:decoration-lamp">
            <PenLine className="size-4" aria-hidden /> Something else...
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 2. Genre */

export function GenreStep({ prefs, update, index, headingId }: StepProps) {
  const off = prefs.anyGenre;
  const group = (title: string, options: typeof FICTION_GENRE_OPTIONS) => (
    <div>
      <h2 className="mb-4 font-display text-2xl text-parchment">{title}</h2>
      <div role="group" aria-label={title} onKeyDown={arrowNav} className="flex flex-wrap gap-2.5">
        {options.map((g) => (
          <Chip key={g.id} selected={!off && prefs.genres.includes(g.id)} disabled={off} onToggle={() => update({ genres: toggle(prefs.genres, g.id) })}>
            {g.label}
          </Chip>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      <StepHeading index={index} id={headingId} title="Any shelves you're drawn to?" subtitle="Optional. Choose a few, or tell us genre doesn't matter." />
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        {group("Fiction", FICTION_GENRE_OPTIONS)}
        {group("Non-fiction", NONFICTION_GENRE_OPTIONS)}
      </div>
      <div className="mt-10 border-t border-rule pt-6">
        <Chip selected={prefs.anyGenre} onToggle={() => update({ anyGenre: !prefs.anyGenre })} size="lg">
          I don&rsquo;t care about genre
        </Chip>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- 3. Length */

export function LengthStep({ prefs, update, index, headingId }: StepProps) {
  return (
    <div>
      <StepHeading index={index} id={headingId} title="How much time do you have?" subtitle="We use page counts when the catalog lists them, and stay neutral when it doesn't." />
      <div role="radiogroup" aria-labelledby={headingId} onKeyDown={arrowNav} className="grid grid-cols-2 items-end gap-4 md:grid-cols-4 md:gap-6">
        {LENGTHS.map((l, i) => {
          const selected = prefs.readingLength === l.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-option
              onClick={() => update({ readingLength: selected ? "any" : l.id })}
              className="group flex flex-col items-center text-center"
            >
              {/* the book itself grows thicker with the choice */}
              <motion.span
                aria-hidden
                animate={{ y: selected ? -14 : 0, rotate: selected ? -3 : 0 }}
                whileHover={{ y: selected ? -14 : -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className={`relative flex h-40 items-end justify-center md:h-52`}
              >
                <span
                  className={`book-shape relative block transition-colors duration-300 ${selected ? "bg-lamp" : "bg-shelf group-hover:bg-[#2f2920]"}`}
                  style={{ width: 22 + l.thickness * 16, height: `${62 + i * 11}%` }}
                >
                  <span className={`absolute inset-x-[18%] top-[16%] h-px ${selected ? "bg-ink/50" : "bg-lamp/50"}`} />
                  <span className={`absolute inset-x-[18%] top-[20%] h-px ${selected ? "bg-ink/50" : "bg-lamp/50"}`} />
                  <span className="book-spine-shade absolute inset-0" />
                </span>
              </motion.span>
              <span className="mt-0 block h-1.5 w-full bg-[linear-gradient(180deg,#3a2c1f,#231a12)]" aria-hidden />
              <span className="mt-4 text-2xl" aria-hidden>
                {l.emoji}
              </span>
              <span className={`mt-1 font-display text-2xl leading-tight ${selected ? "text-lamp" : "text-vellum"}`}>{l.title}</span>
              <span className="mt-1 text-sm text-parchment">{l.detail}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-10">
        <Chip role="radio" selected={prefs.readingLength === "any"} onToggle={() => update({ readingLength: "any" })} size="lg">
          No preference
        </Chip>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- 4. Experience */

function Scale<T extends string>({ label, options, value, onChange }: { label: string; options: ScaleOption<T>[]; value: T | undefined; onChange: (v: T | undefined) => void }) {
  return (
    <div className="grid gap-3 border-t border-rule py-5 md:grid-cols-[180px_1fr] md:items-center md:gap-8">
      <p className="font-display text-2xl text-vellum" id={`scale-${label}`}>
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={`scale-${label}`} onKeyDown={arrowNav} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.id} role="radio" selected={value === o.id} onToggle={() => onChange(value === o.id ? undefined : o.id)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function ExperienceStep({ prefs, update, index, headingId }: StepProps) {
  return (
    <div>
      <StepHeading index={index} id={headingId} title="What kind of reading experience?" subtitle="Skip any row. Tap a choice again to clear it." />
      <div className="border-b border-rule">
        <Scale label="Complexity" options={COMPLEXITY} value={prefs.complexity} onChange={(v) => update({ complexity: v })} />
        <Scale label="Pace" options={PACE} value={prefs.pace} onChange={(v) => update({ pace: v })} />
        <Scale label="Intensity" options={INTENSITY} value={prefs.emotionalIntensity} onChange={(v) => update({ emotionalIntensity: v })} />
        <Scale label="Ending" options={ENDINGS} value={prefs.endingPreference} onChange={(v) => update({ endingPreference: v })} />
        <Scale label="Audience" options={AGES} value={prefs.agePreference} onChange={(v) => update({ agePreference: v })} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- 5. History */

export function HistoryStep({ prefs, update, index, headingId }: StepProps) {
  const ids = prefs.likedBooks.map((b) => b.id);
  return (
    <div>
      <StepHeading index={index} id={headingId} title="Books you already love" subtitle="These count the most. We look for what they share, not just the same author." />
      <div className="max-w-2xl">
        <BookSearchField
          label="Search for a book you've enjoyed"
          placeholder="Search for a book..."
          selectedIds={ids}
          size="lg"
          onSelect={(b) => {
            if (ids.includes(b.id) || prefs.likedBooks.length >= 8) return;
            update({ likedBooks: [...prefs.likedBooks, { id: b.id, title: b.title, authors: b.authors, coverUrl: b.coverUrl }], newReader: false });
          }}
        />
      </div>
      <ul className="mt-10 flex min-h-[170px] flex-wrap gap-5" aria-label="Books you've chosen">
        <AnimatePresence initial={false}>
          {prefs.likedBooks.map((b) => (
            <motion.li
              key={b.id}
              layout
              initial={{ opacity: 0, y: -30, rotate: -6 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative w-[96px] md:w-[112px]"
            >
              <BookCover book={b} size="fill" />
              <p className="mt-2 line-clamp-2 text-sm leading-tight text-vellum">{b.title}</p>
              <button
                type="button"
                onClick={() => update({ likedBooks: prefs.likedBooks.filter((x) => x.id !== b.id) })}
                aria-label={`Remove ${b.title}`}
                className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border border-rule bg-umber text-parchment transition hover:text-vellum"
              >
                <X className="size-4" aria-hidden />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {prefs.likedBooks.length === 0 && (
          <li className="flex items-center text-parchment">
            {prefs.newReader ? "No problem. We'll lean on your mood and goals instead." : "Try a few: a favorite, a recent read, the one you recommend to everyone."}
          </li>
        )}
      </ul>
      <div className="mt-6">
        <Chip selected={prefs.newReader} onToggle={() => update({ newReader: !prefs.newReader })} size="lg">
          I haven&rsquo;t read many books yet
        </Chip>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 6. Avoid */

export function AvoidStep({ prefs, update, index, headingId }: StepProps) {
  return (
    <div>
      <StepHeading index={index} id={headingId} title="What should we avoid?" subtitle="Anything here pushes matching books down the list." />
      <div role="group" aria-labelledby={headingId} onKeyDown={arrowNav} className="flex max-w-3xl flex-wrap gap-2.5">
        {AVOIDS.map((a) => (
          <Chip key={a.id} selected={prefs.dislikedThemes.includes(a.id)} onToggle={() => update({ dislikedThemes: toggle(prefs.dislikedThemes, a.id) })}>
            {a.label}
          </Chip>
        ))}
      </div>
      <div className="mt-10 max-w-2xl">
        <label htmlFor="avoid-text" className="mb-2 block text-parchment">
          Tell us anything else you don&rsquo;t want
        </label>
        <input
          id="avoid-text"
          value={prefs.avoidText}
          maxLength={300}
          onChange={(e) => update({ avoidText: e.target.value })}
          placeholder="e.g. war, animal deaths, unreliable narrators"
          className="w-full border-b border-rule bg-transparent py-3 font-display text-2xl text-vellum placeholder:text-dim focus:border-lamp focus:outline-none"
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 7. Goals */

export function GoalsStep({ prefs, update, index, headingId }: StepProps) {
  return (
    <div>
      <StepHeading index={index} id={headingId} title="When you finish this book, what do you want to have gained?" subtitle="Choose any that feel true." />
      <div role="group" aria-labelledby={headingId} onKeyDown={arrowNav} className="flex max-w-4xl flex-wrap gap-3">
        {GOALS.map((g) => (
          <Chip key={g.id} size="lg" selected={prefs.goals.includes(g.id)} onToggle={() => update({ goals: toggle(prefs.goals, g.id) })}>
            {g.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- 8. Words */

export function WordsStep({ prefs, update, index, headingId }: StepProps) {
  return (
    <div>
      <StepHeading index={index} id={headingId} title="Describe your perfect book in your own words." subtitle="Optional, and often the most useful part. Mention shows, books, moods, or what to leave out." />
      <label htmlFor="free-text" className="sr-only">
        Describe your perfect book
      </label>
      <textarea
        id="free-text"
        value={prefs.freeText}
        maxLength={400}
        rows={4}
        onChange={(e) => update({ freeText: e.target.value })}
        placeholder="I want something like Black Mirror meets philosophical thriller, but not too depressing..."
        className="w-full max-w-4xl resize-none rounded-md border border-rule bg-umber/60 p-5 font-display text-2xl leading-snug text-vellum placeholder:text-dim focus:border-lamp focus:outline-none md:p-7 md:text-3xl"
      />
      <p className="mt-2 text-right text-xs text-dim md:max-w-4xl" aria-live="polite">
        {prefs.freeText.length}/400
      </p>
    </div>
  );
}
