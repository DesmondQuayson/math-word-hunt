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
  title: {
    default: mathNexa ? "MathNexa" : "Math Vocabulary Hunt",
    template: mathNexa ? "%s · MathNexa" : "%s · Math Vocabulary Hunt"
  },
  description: productionPlatform
    ? "Subscription access to the MathNexa mathematics vocabulary game."
    : "A teacher-led classroom game for building fluency with the language of mathematics.",
  robots: publicProduction ? { index: true, follow: true } : { index: false, follow: false, noarchive: true, nocache: true }
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
