"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { BookModalProvider } from "./BookModalProvider";
import { DiscoveryProvider } from "./DiscoveryProvider";
import { ShelfProvider } from "./ShelfProvider";
import { ToastProvider } from "./ToastProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user": transform and layout animations are skipped when the OS asks for less motion.
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <ShelfProvider>
          <DiscoveryProvider>
            <BookModalProvider>{children}</BookModalProvider>
          </DiscoveryProvider>
        </ShelfProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
