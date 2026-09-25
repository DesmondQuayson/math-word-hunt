import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { WORKSHEET_GENERATOR_URL } from "@/lib/navigation/banner";

export const metadata: Metadata = {
  title: "Worksheet Generator",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};
export const dynamic = "force-dynamic";

/**
 * Fallback only: the layout above redirects every request (to the access /
 * subscription flow or to the worksheet generator itself) before this
 * renders.
 */
export default function WorksheetsPage() {
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="MathNexa" title="Worksheet Generator" description="Your access is verified. Continue to the ShowMe Math worksheet generator." />
    <div className="button-row"><LinkButton href={WORKSHEET_GENERATOR_URL}>Open the worksheet generator</LinkButton></div>
  </Container>;
}
