import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { getMathNexaStructuredData, getPublicPageMetadata, MATHNEXA_ORIGIN } from "@/lib/seo";

import "./globals.css";

const publicProduction = isProductionPublicMode();

const publicHomeMetadata = getPublicPageMetadata("home");

export const metadata: Metadata = publicProduction ? {
  ...publicHomeMetadata,
  metadataBase: new URL(MATHNEXA_ORIGIN),
  applicationName: "MathNexa",
  title: { default: "MathNexa | Interactive Math Vocabulary Game", template: "%s | MathNexa" },
  category: "education",
  keywords: [
    "interactive math vocabulary game",
    "online math vocabulary practice",
    "browser-based math learning game",
    "Grade 6 math vocabulary game"
  ],
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  robots: { index: true, follow: true }
} : {
  title: { default: "Math Vocabulary Hunt", template: "%s | Math Vocabulary Hunt" },
  description: "A teacher-led classroom game for building fluency with the language of mathematics.",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        {publicProduction ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(getMathNexaStructuredData()).replaceAll("<", "\\u003c") }} /> : null}
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
