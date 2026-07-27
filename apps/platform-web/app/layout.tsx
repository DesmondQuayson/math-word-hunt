import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Math Vocabulary Hunt",
    template: "%s · Math Vocabulary Hunt"
  },
  description:
    "A teacher-led classroom game for building fluency with the language of mathematics.",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
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
