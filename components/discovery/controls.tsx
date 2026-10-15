"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

/**
 * Arrow-key navigation between sibling options in a group (roving focus without trapping Tab).
 * Attach to the group container's onKeyDown.
 */
export function arrowNav(e: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
  if (!keys.includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-option]"));
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
  items[(i + delta + items.length) % items.length]?.focus();
}

interface OptionCardProps {
  selected: boolean;
  dimmed?: boolean;
  onToggle: () => void;
  accent?: string;
  children: ReactNode;
  className?: string;
  /** "checkbox" for multi-select groups, "radio" for single-select. */
  role?: "checkbox" | "radio";
}

/** Large selectable card. Selected cards lift and glow in their mood color; the rest recede. */
export function OptionCard({ selected, dimmed, onToggle, accent = "var(--lamp)", children, className = "", role = "checkbox" }: OptionCardProps) {
  return (
    <motion.button
      type="button"
      role={role}
      aria-checked={selected}
      data-option
      onClick={onToggle}
      animate={{ scale: selected ? 1.02 : 1, opacity: dimmed && !selected ? 0.55 : 1 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      style={{ ["--accent" as string]: accent }}
      className={`group relative overflow-hidden rounded-md border text-left transition-colors duration-300 ${
        selected
          ? "border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-[color-mix(in_srgb,var(--accent)_13%,var(--umber))] shadow-[0_20px_50px_-24px_var(--accent)]"
          : "border-rule bg-umber/70 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--rule))]"
      } ${className}`}
    >
      <span
        className={`absolute right-3 top-3 grid size-6 place-items-center rounded-full border transition-all duration-300 ${
          selected ? "scale-100 border-transparent bg-[var(--accent)] text-ink" : "scale-90 border-rule text-transparent"
        }`}
        aria-hidden
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      {children}
    </motion.button>
  );
}

interface ChipProps {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabled?: boolean;
  role?: "checkbox" | "radio";
  size?: "md" | "lg";
}

/** Pill toggle for genres, avoid-list items and scale steps. */
export function Chip({ selected, onToggle, children, disabled, role = "checkbox", size = "md" }: ChipProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      data-option
      onClick={() => !disabled && onToggle()}
      className={`inline-flex items-center gap-2 rounded-full border transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] ${
        size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2 text-[15px]"
      } ${
        selected
          ? "border-lamp bg-lamp text-ink"
          : disabled
            ? "cursor-not-allowed border-rule/50 text-dim"
            : "border-rule text-vellum hover:border-parchment/60 hover:bg-shelf"
      }`}
    >
      {selected && <Check className="-ml-1 size-4" strokeWidth={2.5} aria-hidden />}
      {children}
    </button>
  );
}

export function StepHeading({ index, title, subtitle, id }: { index: number; title: string; subtitle?: string; id: string }) {
  return (
    <header className="mb-8 md:mb-12">
      <h1 id={id} className="display-lg max-w-[22ch]" style={{ textWrap: "balance" }}>
        <span className="sr-only">Step {index + 1}. </span>
        {title}
      </h1>
      {subtitle && <p className="mt-4 max-w-[52ch] text-lg text-parchment">{subtitle}</p>}
    </header>
  );
}
