"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { DISCOVERY_STEPS, MOODS, MOOD_ACCENT_VAR } from "@/lib/discovery/options";
import { useDiscovery } from "@/components/providers/DiscoveryProvider";
import { AvoidStep, ExperienceStep, GenreStep, GoalsStep, HistoryStep, LengthStep, MoodStep, WordsStep, type StepProps } from "./steps";

const STEP_COMPONENTS: ComponentType<StepProps>[] = [MoodStep, GenreStep, LengthStep, ExperienceStep, HistoryStep, AvoidStep, GoalsStep, WordsStep];

/** Has the reader answered anything on this step? Drives "Skip" vs "Continue". */
function answered(step: number, p: ReturnType<typeof useDiscovery>["prefs"]): boolean {
  switch (step) {
    case 0: return p.moods.length > 0 || p.customMood.trim().length > 0;
    case 1: return p.genres.length > 0 || p.anyGenre;
    case 2: return p.readingLength !== "any";
    case 3: return !!(p.complexity || p.pace || p.emotionalIntensity || p.endingPreference || p.agePreference);
    case 4: return p.likedBooks.length > 0 || p.newReader;
    case 5: return p.dislikedThemes.length > 0 || p.avoidText.trim().length > 0;
    case 6: return p.goals.length > 0;
    default: return p.freeText.trim().length > 0;
  }
}

export function DiscoveryWizard() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { prefs, update, step, setStep, hydrated, reset, hasAnswers } = useDiscovery();
  const [direction, setDirection] = useState(1);
  const mainRef = useRef<HTMLDivElement>(null);
  const last = DISCOVERY_STEPS.length - 1;
  const Step = STEP_COMPONENTS[step] ?? MoodStep;

  const go = useCallback(
    (next: number) => {
      if (next > last) {
        router.push("/results");
        return;
      }
      setDirection(next >= step ? 1 : -1);
      setStep(Math.max(0, next));
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    },
    [last, reduce, router, setStep, step],
  );

  // Move focus to the new question so screen readers announce it.
  useEffect(() => {
    if (!hydrated) return;
    const t = window.setTimeout(() => mainRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }), 350);
    return () => window.clearTimeout(t);
  }, [step, hydrated]);

  // Keyboard: Enter continues (outside text fields), Alt+Arrow moves between steps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : document.body;
      const inField = el.closest("input, textarea, select");
      if (e.altKey && e.key === "ArrowRight") go(step + 1);
      else if (e.altKey && e.key === "ArrowLeft" && step > 0) go(step - 1);
      else if (e.key === "Enter" && !inField && !el.closest("button, a") && !e.defaultPrevented) go(step + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step]);

  // The room's light takes on the colors of the chosen moods.
  const glow = useMemo(() => {
    const colors = prefs.moods.map((id) => MOOD_ACCENT_VAR[MOODS.find((m) => m.id === id)!.accent]).slice(0, 3);
    if (!colors.length) colors.push("var(--lamp)");
    const spots = ["18% 22%", "82% 30%", "50% 88%"];
    return colors.map((c, i) => `radial-gradient(42% 46% at ${spots[i]}, color-mix(in srgb, ${c} 26%, transparent), transparent 70%)`).join(",");
  }, [prefs.moods]);

  const isAnswered = answered(step, prefs);
  const progress = (step + (isAnswered ? 1 : 0.4)) / DISCOVERY_STEPS.length;

  return (
    <div className="relative isolate min-h-dvh overflow-hidden pb-40 pt-24 md:pt-28">
      <motion.div className="pointer-events-none absolute inset-0 -z-10" animate={{ background: glow }} transition={{ duration: 1.2, ease: "easeOut" }} aria-hidden />
      <FloatingPages />

      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        {/* Progress */}
        <nav aria-label="Discovery progress" className="mb-10 md:mb-14">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-display text-2xl tabular-nums text-vellum" aria-live="polite">
              {String(step + 1).padStart(2, "0")}
              <span className="text-dim"> / {String(DISCOVERY_STEPS.length).padStart(2, "0")}</span>
              <span className="sr-only">, {DISCOVERY_STEPS[step].label}</span>
            </p>
            {hasAnswers && (
              <button type="button" onClick={() => (reset(), setDirection(-1))} className="inline-flex items-center gap-1.5 text-sm text-dim hover:text-vellum">
                <RotateCcw className="size-3.5" aria-hidden /> Start over
              </button>
            )}
          </div>
          <div className="relative mt-4 h-[3px] overflow-hidden rounded-full bg-rule">
            <motion.div className="absolute inset-y-0 left-0 rounded-full bg-lamp shadow-[0_0_12px_var(--lamp)]" animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 22 }} />
          </div>
          <ol className="mt-4 hidden gap-1 md:flex">
            {DISCOVERY_STEPS.map((s, i) => (
              <li key={s.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={`w-full truncate text-left text-xs transition-colors ${i === step ? "text-lamp" : answered(i, prefs) ? "text-vellum hover:text-lamp" : "text-dim hover:text-parchment"}`}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Question */}
        <div ref={mainRef} className="[&_h1]:outline-none" tabIndex={-1}>
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.section
              key={step}
              custom={direction}
              aria-labelledby={`step-${step}-title`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 70, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -50, filter: "blur(4px)", transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 170, damping: 24 }}
            >
              {hydrated ? <Step prefs={prefs} update={update} index={step} headingId={`step-${step}-title`} /> : <div className="h-[60vh]" />}
            </motion.section>
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="fixed inset-x-0 bottom-[calc(4.1rem+env(safe-area-inset-bottom))] z-30 border-t border-rule/70 bg-ink/85 backdrop-blur-md md:bottom-0">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3 md:px-8 md:py-4">
          <button
            type="button"
            onClick={() => (step === 0 ? router.push("/") : go(step - 1))}
            className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm text-parchment transition hover:text-vellum"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
          <div className="ml-auto flex items-center gap-2">
            {step < last && !isAnswered && (
              <button type="button" onClick={() => go(step + 1)} className="rounded-full px-4 py-3 text-sm text-parchment underline-offset-4 hover:text-vellum hover:underline">
                Skip
              </button>
            )}
            {step < last && hasAnswers && (
              <button type="button" onClick={() => go(last + 1)} className="hidden rounded-full px-4 py-3 text-sm text-parchment hover:text-vellum sm:block">
                See books now
              </button>
            )}
            <button
              type="button"
              onClick={() => go(step + 1)}
              className={`group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition active:scale-[0.98] ${
                isAnswered || step === last ? "bg-lamp text-ink shadow-[0_10px_30px_-10px_rgba(224,170,72,0.7)] hover:bg-[#ebb95a]" : "bg-shelf text-vellum hover:bg-[#2f2920]"
              }`}
            >
              {step === last ? "Find my books" : "Continue"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A few loose pages drifting very slowly in the dark. Pure CSS transform animation, off for reduced motion. */
function FloatingPages() {
  const reduce = useReducedMotion();
  const pages = [
    { left: "6%", top: "62%", r: -14, d: 26, s: 1 },
    { left: "88%", top: "18%", r: 11, d: 31, s: 0.8 },
    { left: "72%", top: "78%", r: -6, d: 37, s: 0.6 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {pages.map((p, i) => (
        <motion.div
          key={i}
          className="absolute h-24 w-[4.2rem] rounded-[2px] border border-vellum/[0.06] bg-vellum/[0.025]"
          style={{ left: p.left, top: p.top, scale: p.s }}
          initial={{ rotate: p.r }}
          animate={reduce ? undefined : { y: [0, -24, 0], rotate: [p.r, p.r + 6, p.r] }}
          transition={{ duration: p.d, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="m-2 space-y-1.5">
            {Array.from({ length: 6 }, (_, j) => (
              <div key={j} className="h-px bg-vellum/10" style={{ width: `${70 + ((j * 13) % 30)}%` }} />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
