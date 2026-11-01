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

const PATH = PRODUCT_PAGE_PATHS.homeworkPdfs;

// The grades and topics are read from the live library on request, never at build time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata(PATH) : {};
}

/** Public page for Homework PDFs (the gated /homework library). */
export default async function HomeworkPdfsPage() {
  if (!isProductionPlatformMode()) notFound();
  const summary = await loadPdfLibrarySummary("homework");
  const label = platformProductLabel("/homework");
  return <ProductLanding
    path={PATH}
    eyebrow={label}
    title="Printable math homework PDFs"
    description="Printable homework organized by grade, topic and lesson. Preview a lesson activity, then download its PDF to print."
    actions={<LinkButton href="/homework">Open {label}</LinkButton>}
    access="subscription"
    schoolAccessHours={SCHOOL_ACCESS_DURATION_SECONDS / 3600}
  >
    <section aria-labelledby="homework-included">
      <h2 id="homework-included">What you get</h2>
      <ul className="principle-list">
        <li><strong>By grade, topic and lesson</strong><span>Homework PDFs are filed by grade and topic, one for each lesson they cover.</span></li>
        <li><strong>Preview first</strong><span>See a preview of each lesson activity before you download its PDF.</span></li>
        {summary.everyItemHasAnswerKey ? <li><strong>Answer keys</strong><span>Every homework PDF has an answer key.</span></li> : null}
      </ul>
    </section>
    <PdfCatalogSummary id="homework-topics" title="Grades and topics" summary={summary} />
  </ProductLanding>;
}
