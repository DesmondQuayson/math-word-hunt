import Link from "next/link";

import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import type { Metadata } from "next";
import { MONTHLY_PRICE_LABEL, TRIAL_HOURS, publicPageMetadata } from "@/lib/seo/public-pages";
import {
  MISSOURI_ALIGNMENT_NOTE,
  MISSOURI_NON_AFFILIATION,
  PLATFORM_HERO_AUDIENCE,
  PLATFORM_HOMEPAGE_DESCRIPTION,
  PLATFORM_PRODUCTS,
  PRAXIS_NON_AFFILIATION,
  ROADMAP_MIDDLE_SCHOOL_REVIEW
} from "@/lib/seo/platform-positioning";
import { PRODUCT_PAGE_FOR_ROUTE, PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata("/about") : { title: "About" };
}

/**
 * The production platform's About page is indexed (it sits in the sitemap), so
 * it has to say what the platform actually is. The previous copy described the
 * account-free public Math Vocabulary Hunt site, which mathnexa.com no longer
 * is. The public-site branch below is unchanged for that deployment mode.
 */
function PlatformAboutPage() {
  const [games, mathPrep, homework, quizzes] = PLATFORM_PRODUCTS;
  return <Container className="page-stack">
    <PageHeader eyebrow="About MathNexa" title="Online math resources for Grades 3–8 teachers and families" description={PLATFORM_HOMEPAGE_DESCRIPTION} />
    <section aria-labelledby="about-included">
      <h2 id="about-included">What one subscription includes</h2>
      <ul className="principle-list">
        <li><strong><Link href={PRODUCT_PAGE_FOR_ROUTE[mathPrep.href]}>{mathPrep.cardTitle}</Link></strong><span>Lessons, practice and review for Grades 3–8, with a worksheet generator for printing practice. {MISSOURI_ALIGNMENT_NOTE}</span></li>
        <li><strong><Link href={PRODUCT_PAGE_FOR_ROUTE[games.href]}>{games.cardTitle}</Link></strong><span>Math games for whole-class play and quick practice. <Link href={PRODUCT_PAGE_PATHS.mathTugOfWar}>Math Tug of War</Link> is free with any MathNexa account.</span></li>
        <li><strong><Link href={PRODUCT_PAGE_FOR_ROUTE[homework.href]}>{homework.cardTitle}</Link></strong><span>Printable homework by grade, topic, and lesson.</span></li>
        <li><strong><Link href={PRODUCT_PAGE_FOR_ROUTE[quizzes.href]}>{quizzes.cardTitle}</Link></strong><span>Printable topic quizzes for checking understanding.</span></li>
      </ul>
    </section>
    <section aria-labelledby="about-audience">
      <h2 id="about-audience">Who it is for</h2>
      <p>{PLATFORM_HERO_AUDIENCE}</p>
    </section>
    <section aria-labelledby="about-start">
      <h2 id="about-start">How to get started</h2>
      <ol>
        <li>Create a free MathNexa account and confirm your email address.</li>
        <li>Start the free {TRIAL_HOURS}-hour trial. Each eligible account gets one trial, and you add a payment method on Stripe’s secure checkout page before it starts.</li>
        <li>After the trial, the subscription renews at {MONTHLY_PRICE_LABEL} a month until you cancel. If you cancel before the trial ends, you are not charged.</li>
      </ol>
      <p>Have a code from your school? Enter it in the Authorize Code box on the home page.</p>
    </section>
    <section aria-labelledby="about-roadmap">
      <h2 id="about-roadmap">Coming soon</h2>
      <p>{ROADMAP_MIDDLE_SCHOOL_REVIEW}</p>
      <p className="truth-note">{PRAXIS_NON_AFFILIATION}</p>
    </section>
    <Notice label="Independent product" tone="information"><strong>Not an official state resource.</strong><p>{MISSOURI_NON_AFFILIATION}</p></Notice>
    <div className="button-row">
      <LinkButton href={mathPrep.href}>Open {mathPrep.label}</LinkButton>
      <LinkButton href={games.href} variant="secondary">Explore {games.label}</LinkButton>
    </div>
  </Container>;
}

export default function AboutPage() {
  if (isProductionPlatformMode()) return <PlatformAboutPage />;
  return <Container className="page-stack"><PageHeader eyebrow="About MathNexa" title="Language practice for mathematical thinking" description="MathNexa makes the preserved Math Vocabulary Hunt available as a public, teacher-led classroom resource." />
    <Notice label="Public service boundary" tone="information"><strong>No account is required.</strong><p>The public site does not provide teacher accounts, saved workspaces, billing, invitations, pilot participation, or student-data collection.</p></Notice>
    <section aria-labelledby="about-game"><h2 id="about-game">A discussion-first classroom game</h2><p>Teachers choose an available grade and lesson, then guide teams through vocabulary recognition and conversation using keyboard, pointer, touch, or a shared display.</p></section>
    <LinkButton href="/play">Play Math Vocabulary Hunt</LinkButton>
  </Container>;
}
