import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { isProductionPublicMode } from "@/lib/environment/production-public";

import "./globals.css";

const publicProduction = isProductionPublicMode();
const productionPlatform = isProductionPlatformMode();
const mathNexa = publicProduction || productionPlatform;

export const metadata: Metadata = {
  // Without metadataBase + a canonical, Google may elect a *.vercel.app or www
  // variant as the canonical host — the reported "Google result opens the
  // wrong/stale MathNexa" failure. "./" resolves per route.
  metadataBase: mathNexa ? new URL("https://mathnexa.com") : undefined,
  alternates: mathNexa ? { canonical: "./" } : undefined,
  title: {
    default: mathNexa ? "MathNexa" : "Math Vocabulary Hunt",
    template: mathNexa ? "%s · MathNexa" : "%s · Math Vocabulary Hunt"
  },
  description: productionPlatform
    ? "Teacher-led math resources in one platform: interactive games, Missouri MAP Prep, image-rich homework PDFs, and classroom-ready quizzes."
    : "A teacher-led classroom game for building fluency with the language of mathematics.",
  openGraph: mathNexa
    ? { siteName: "MathNexa", type: "website" }
    : undefined,
  robots: publicProduction || productionPlatform
    ? { index: true, follow: true }
    : { index: false, follow: false, noarchive: true, nocache: true }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
