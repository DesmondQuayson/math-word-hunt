import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PdfCatalogSummary } from "@/components/public/pdf-catalog-summary";
import { ProductLanding } from "@/components/public/product-landing";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { SCHOOL_ACCESS_DURATION_SECONDS } from "@/lib/school-access/session";
import { loadPdfLibrarySummary } from "@/lib/seo/catalog-summaries";
import { platformProductLabel } from "@/lib/seo/platform-positioning";
import { PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";
import { publicPageMetadata } from "@/lib/seo/public-pages";

const PATH = PRODUCT_PAGE_PATHS.quizPdfs;

// The grades and topics are read from the live library on request, never at build time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata(PATH) : {};
}

/** Public page for Quiz PDFs (the gated /quizzes library). */
export default async function QuizPdfsPage() {
  if (!isProductionPlatformMode()) notFound();
  const summary = await loadPdfLibrarySummary("quizzes");
  const label = platformProductLabel("/quizzes");
  return <ProductLanding
    path={PATH}
    eyebrow={label}
    title="Printable math quizzes by topic"
    description="Printable quizzes for checking understanding after a unit: one PDF for each topic, organized by grade."
    actions={<LinkButton href="/quizzes">Open {label}</LinkButton>}
    access="subscription"
    schoolAccessHours={SCHOOL_ACCESS_DURATION_SECONDS / 3600}
  >
    <section aria-labelledby="quiz-included">
      <h2 id="quiz-included">What you get</h2>
      <ul className="principle-list">
        <li><strong>One quiz per topic</strong><span>Quizzes are filed by grade and topic, one PDF for each topic they cover.</span></li>
        <li><strong>Ready to print</strong><span>Download a quiz and print it for class, review or assessment.</span></li>
        {summary.everyItemHasAnswerKey ? <li><strong>Answer keys</strong><span>Every quiz PDF has an answer key.</span></li> : null}
      </ul>
    </section>
    <PdfCatalogSummary id="quiz-topics" title="Grades and topics" summary={summary} />
  </ProductLanding>;
}
