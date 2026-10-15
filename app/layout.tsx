import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist } from "next/font/google";
import { AppProviders } from "@/components/providers/AppProviders";
import { Suspense } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Wordmark } from "@/components/layout/Wordmark";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Libria · Find your next unforgettable book", template: "%s · Libria" },
  description: "Tell us what you want to feel, explore, or become. Libria finds the books that fit, using open library data.",
  applicationName: "Libria",
};

export const viewport: Viewport = {
  themeColor: "#12100d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cormorant.variable} ${geist.variable} antialiased`}>
      <body className="min-h-dvh">
        <AppProviders>
          {/* The header reads the current path, which is request-time data on dynamic routes. */}
          <Suspense fallback={<HeaderShell />}>
            <SiteHeader />
          </Suspense>
          <div id="main">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}

/** Static stand-in rendered in the prerendered shell until the interactive header streams in. */
function HeaderShell() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center px-4 md:h-[72px] md:px-8">
        <Link href="/" aria-label="Libria home">
          <Wordmark />
        </Link>
      </div>
    </header>
  );
}
