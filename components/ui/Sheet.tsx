"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** id of the element that names the dialog */
  labelledBy: string;
  children: ReactNode;
  /** "panel": centered on desktop, full-screen sheet on mobile. "side": slides in from the right. */
  variant?: "panel" | "side" | "compact";
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: focus moves in and is trapped, Escape closes, focus returns to the trigger,
 * background scroll is locked. Becomes a full-height sheet on small screens.
 */
export function Sheet({ open, onClose, labelledBy, children, variant = "panel" }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // Portals need document; render nothing during SSR and the hydration pass.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbar}px`;
    const t = window.setTimeout(() => {
      const root = ref.current;
      const first =
        root?.querySelector<HTMLElement>("[data-autofocus]") ??
        root?.querySelector<HTMLElement>(`[data-sheet-content] :is(${FOCUSABLE})`) ??
        root?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = "";
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const panelClass =
    variant === "side"
      ? "fixed inset-y-0 right-0 w-full max-w-xl"
      : variant === "compact"
        ? "fixed inset-x-0 bottom-0 max-h-[85dvh] md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(540px,92vw)] md:-translate-x-1/2 md:-translate-y-1/2"
        : "fixed inset-0 md:inset-auto md:left-1/2 md:top-[4dvh] md:h-[92dvh] md:w-[min(1080px,94vw)] md:-translate-x-1/2";

  const enter = variant === "side" ? { x: "100%" } : { y: reduce ? 0 : 40, opacity: 0 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-[#080706]/80 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden
          />
          <div className={panelClass}>
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              initial={enter}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={{ ...enter, transition: { duration: 0.2 } }}
              transition={reduce ? { duration: 0.01 } : { type: "spring", stiffness: 260, damping: 30 }}
              className={`relative flex h-full flex-col overflow-hidden border-rule bg-umber shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)] md:border ${
                variant === "compact" ? "rounded-t-xl md:rounded-lg" : variant === "side" ? "border-l" : "md:rounded-lg"
              }`}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-ink/70 text-parchment backdrop-blur transition hover:bg-shelf hover:text-vellum md:right-4 md:top-4"
              >
                <X className="size-5" aria-hidden />
              </button>
              <div data-sheet-content className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
