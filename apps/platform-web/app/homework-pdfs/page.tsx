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
    <section aria-labelledby="homework-practice">
      <h2 id="homework-practice">How can I use a math homework PDF at home?</h2>
      <p>Choose one topic your child is working on. Ask them to explain an example, try a related problem on their own, and check the reasoning together. If they get stuck, return to a drawing or a simpler example before adding more questions.</p>
      <p>You can try the original practice below on paper. It is a public example, separate from the subscription PDF library.</p>
    </section>
    <section aria-labelledby="practice-example">
      <h2 id="practice-example">Worked example: subtract fractions with different denominators</h2>
      <p><strong>3/4 − 1/8 = 5/8.</strong> The denominators describe different-sized parts of the same whole, so first rewrite the fractions using equal-sized parts.</p>
      <ol>
        <li>Draw one rectangle divided into eight equal parts. Shade six parts to show that 3/4 = 6/8.</li>
        <li>Cross out one shaded part for 1/8. Five shaded parts remain: 6/8 − 1/8 = 5/8.</li>
        <li>Check by adding back: 5/8 + 1/8 = 6/8 = 3/4.</li>
      </ol>
      <p><strong>A mistake to discuss:</strong> do not subtract the denominators. The parts are still eighths after one eighth is removed. Ask, “Why did the denominator stay 8?”</p>
      <h3>Try it, then explain your answer</h3>
      <ul>
        <li>1/2 + 1/4 = ?</li>
        <li>5/6 − 1/3 = ?</li>
        <li>7/8 − 1/4 = ?</li>
      </ul>
      <details>
        <summary>Check the answers and reasoning</summary>
        <p>1/2 + 1/4 = 2/4 + 1/4 = 3/4.</p>
        <p>5/6 − 1/3 = 5/6 − 2/6 = 3/6 = 1/2.</p>
        <p>7/8 − 1/4 = 7/8 − 2/8 = 5/8.</p>
        <p>If an answer differs, ask the learner to label the equal parts in a drawing and explain each step before trying again.</p>
      </details>
    </section>
  </ProductLanding>;
}
