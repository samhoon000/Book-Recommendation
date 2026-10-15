"use client";

import { AnimatePresence, motion } from "motion/react";
import { BookMarked, Check, Feather, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastIcon = "saved" | "removed" | "feedback" | "info";

interface Toast {
  id: number;
  message: string;
  icon: ToastIcon;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  notify: (message: string, opts?: { icon?: ToastIcon; action?: Toast["action"] }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastIcon, ReactNode> = {
  saved: <BookMarked className="size-4 text-lamp" aria-hidden />,
  removed: <X className="size-4 text-parchment" aria-hidden />,
  feedback: <Feather className="size-4 text-lamp" aria-hidden />,
  info: <Check className="size-4 text-lamp" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback<ToastApi["notify"]>(
    (message, opts) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, icon: opts?.icon ?? "info", action: opts?.action }]);
      window.setTimeout(() => dismiss(id), opts?.action ? 5200 : 3200);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-center gap-3 rounded-full border border-rule bg-umber/95 py-2.5 pl-4 pr-3 text-sm text-vellum shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur"
              role="status"
            >
              {ICONS[t.icon]}
              <span>{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="ml-1 rounded-full px-2.5 py-1 text-lamp underline-offset-4 hover:underline"
                >
                  {t.action.label}
                </button>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
