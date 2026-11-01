import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Notice } from "@/components/feedback/notice";
import { ProductFigure, ProductLanding } from "@/components/public/product-landing";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { SCHOOL_ACCESS_DURATION_SECONDS } from "@/lib/school-access/session";
import { MISSOURI_ALIGNMENT_NOTE, MISSOURI_NON_AFFILIATION, platformProductLabel } from "@/lib/seo/platform-positioning";
import { PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";
import { publicPageMetadata } from "@/lib/seo/public-pages";

const PATH = PRODUCT_PAGE_PATHS.onlineMathPrep;

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata(PATH) : {};
}

/**
 * Public page for Online Math Prep (the gated /map-prep route). The method,
 * grade levels, tool training and worksheet generator are as the learning
 * app's own public home page describes them; the worked example is the one
 * the MathNexa homepage animates, written out.
 */
export default function OnlineMathPrepPage() {
  if (!isProductionPlatformMode()) notFound();
  const label = platformProductLabel("/map-prep");
  return <ProductLanding
    path={PATH}
    eyebrow={`${label} · Grades 3–8`}
    title="Online Math Prep for Grades 3–8"
    description="Visual lessons, guided and independent practice, and quick checks for Grades 3–8 math, plus a worksheet generator for printing practice."
    actions={<LinkButton href="/map-prep">Open {label}</LinkButton>}
    access="subscription"
    schoolAccessHours={SCHOOL_ACCESS_DURATION_SECONDS / 3600}
  >
    <ProductFigure src="/media/home/online-math-prep-preview.webp" alt="MathNexa Online Math Prep workspace with a graph, working board, and math tools" width={1200} height={800} />
    <section aria-labelledby="prep-method">
      <h2 id="prep-method">How each idea is taught</h2>
      <ol className="principle-list">
        <li><strong>Learn</strong><span>Animated, narrated lessons show each idea as a picture and build it step by step.</span></li>
        <li><strong>Guided practice</strong><span>Students try questions with hints and a math workspace for working them out.</span></li>
        <li><strong>Independent practice</strong><span>Fresh sets of 20 questions build fluency and independence.</span></li>
        <li><strong>Quick check</strong><span>A short check shows whether the idea has stuck.</span></li>
        <li><strong>Mastery</strong><span>Progress from a student’s own practice, kept on their device.</span></li>
      </ol>
    </section>
    <section aria-labelledby="prep-grades">
      <h2 id="prep-grades">Grades 3 to 8</h2>
      <p>Six grade levels, from Grade 3 to Grade 8. Each has lessons, guided and independent practice, quick checks and reviews.</p>
      <p>{MISSOURI_ALIGNMENT_NOTE}</p>
    </section>
    <section aria-labelledby="prep-example">
      <h2 id="prep-example">A worked example</h2>
      <p><strong>Grade 6 · Ratios.</strong> 3 cups of oats make 12 granola bars. How many cups make 20 bars?</p>
      <ol>
        <li>Find the unit rate: 12 bars ÷ 3 cups = 4 bars per cup.</li>
        <li>20 bars ÷ 4 = 5 cups.</li>
        <li>Check: 5 cups × 4 = 20 bars.</li>
      </ol>
    </section>
    <section aria-labelledby="prep-tools">
      <h2 id="prep-tools">Practice the tools first</h2>
      <p>Before a question needs them, students can practice each interaction: line matching, drag and drop, the number line, graphing, the ruler and the protractor.</p>
    </section>
    <section aria-labelledby="prep-worksheets">
      <h2 id="prep-worksheets">Worksheet Generator</h2>
      <p>Create printable worksheets from the same question system, for practice on paper.</p>
    </section>
    <Notice label="Independent product" tone="information">
      <strong>Formative practice, not an official assessment.</strong>
      <p>Online Math Prep helps students learn and build confidence. It is not an official assessment and does not predict test performance. {MISSOURI_NON_AFFILIATION}</p>
    </Notice>
  </ProductLanding>;
}
