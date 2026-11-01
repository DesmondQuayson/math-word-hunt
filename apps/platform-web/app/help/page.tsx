import Link from "next/link";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import type { Metadata } from "next";
import { SCHOOL_ACCESS_DURATION_SECONDS } from "@/lib/school-access/session";
import { PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";
import { TRIAL_HOURS, publicPageMetadata } from "@/lib/seo/public-pages";

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata("/help") : { title: "Help" };
}

export default function HelpPage() {
  if (isProductionPlatformMode()) {
    return <Container className="page-stack"><PageHeader eyebrow="MathNexa help" title="Help with your account and access" description="To open MathNexa resources, you need a confirmed account with an active trial or subscription, or a code from your school." />
      <section aria-labelledby="help-steps"><h2 id="help-steps">Get access</h2><ol><li>Create an account with your email address and a password.</li><li>Confirm your email address with the link we send you, then sign in.</li><li>Read and accept the subscription terms, then add a payment method on Stripe’s secure checkout page to start your free {TRIAL_HOURS}-hour trial.</li><li>While your trial or subscription is active, every MathNexa resource opens for you.</li></ol></section>
      <section aria-labelledby="help-free-game"><h2 id="help-free-game">Play a game for free</h2><p><Link href={PRODUCT_PAGE_PATHS.mathTugOfWar}>Math Tug of War</Link> is free with any MathNexa account. You do not need a trial or subscription to play it.</p></section>
      <section aria-labelledby="help-school-code"><h2 id="help-school-code">Use a school access code</h2><p>If your school gave you a code, enter it in the Authorize Code box on the home page. It opens MathNexa resources in that browser for up to {SCHOOL_ACCESS_DURATION_SECONDS / 3600} hours, without an account.</p></section>
      <section aria-labelledby="help-safety"><h2 id="help-safety">Keep student information private</h2><p>Please do not enter or send information about teachers, students, schools, classes, rosters or organizations, or any assignments, results or game progress. MathNexa does not need it.</p></section>
      <div className="button-row"><LinkButton href="/game-access">Check game access</LinkButton><LinkButton href="/subscriber-management" variant="secondary">Manage subscription</LinkButton><LinkButton href="/support" variant="secondary">Support</LinkButton></div>
    </Container>;
  }
  return <Container className="page-stack"><PageHeader eyebrow="Public help" title="Start a Math Vocabulary Hunt" description="The game runs without an account and keeps classroom play on the teacher-led shared screen." />
    <section aria-labelledby="help-steps"><h2 id="help-steps">Quick start</h2><ol><li>Open the game gateway and launch Math Vocabulary Hunt.</li><li>Choose a grade and an available lesson.</li><li>Choose the game settings and start the round.</li><li>Trace words with Pointer Events or use the documented keyboard controls.</li></ol></section>
    <section aria-labelledby="help-safety"><h2 id="help-safety">Keep personal information out</h2><p>The public game does not need names, email addresses, rosters, organization labels, student work, grades, or account information.</p></section>
    <div className="button-row"><LinkButton href="/play">Open the game gateway</LinkButton><LinkButton href="/accessibility" variant="secondary">Accessibility help</LinkButton></div>
  </Container>;
}
