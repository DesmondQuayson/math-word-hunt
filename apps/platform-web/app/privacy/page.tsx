import { AdMeasurementChoice } from "@/components/analytics/ad-measurement-choice";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";
import { StructuredCmsContent } from "@/components/cms/structured-cms-content";
import { loadPublishedCmsDocument } from "@/lib/cms/public";
import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/public-pages";

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata("/privacy") : { title: "Privacy" };
}

export const dynamic = "force-dynamic";
export default async function PrivacyPage() {
  const managed=await loadPublishedCmsDocument("privacy");
  if(managed)return <Container className="page-stack"><StructuredCmsContent document={managed}/></Container>;
  if (isProductionPlatformMode()) {
    return <Container className="page-stack"><PageHeader eyebrow={`Privacy Notice ${COMMERCIAL_POLICY.privacyVersion}`} title="Account and subscription privacy" description="MathNexa uses only the minimum data required for authentication, security, billing, entitlement, support, refund review, and account deletion." />
      <Notice label="Information not collected" tone="information"><strong>No educational or gameplay-progress profile.</strong><p>MathNexa does not request teacher, student, school, class, roster, organization, assignment, result, score, lesson history, or cloud gameplay-progress information.</p></Notice>
      <section aria-labelledby="privacy-required"><h2 id="privacy-required">Required information</h2><p>Authentication uses an account UUID, email, confirmation and security state, and lifecycle timestamps. When you start a trial or subscription, MathNexa also keeps your Stripe customer and subscription references and a server-side record of your trial or subscription status. Stripe—not MathNexa—handles payment-method details.</p></section>
      <section aria-labelledby="privacy-tug-rooms"><h2 id="privacy-tug-rooms">Math Tug of War online rooms</h2><p>An online match keeps the player names typed in (up to 20 characters), the room code, the state of the match, and a one-way code for each player’s account or school session, which also limits repeated failed join attempts. Rooms older than 24 hours are deleted automatically when new rooms are opened.</p></section>
      <section aria-labelledby="privacy-showme"><h2 id="privacy-showme">Online Math Prep access</h2><p>Online Math Prep and the Worksheet Generator open at showme.mathnexa.com. When MathNexa has confirmed your access, it places a cookie in your browser that lets those pages open for twelve hours. The cookie holds two times and nothing about you. It is removed when you sign out or exit authorized access.</p></section>
      <section aria-labelledby="privacy-providers"><h2 id="privacy-providers">Service providers</h2><p>Supabase processes authentication and minimum account records, Stripe processes payment and subscription records, Resend may deliver authentication email through Supabase, and Vercel hosts the application. Google measures MathNexa’s advertising, as described below. MathNexa does not sell personal information or use it to choose which ads you see.</p></section>
      <section aria-labelledby="privacy-ads"><h2 id="privacy-ads">Advertising measurement</h2><p>MathNexa advertises on Google and measures whether those ads work. Its pages load a Google tag, which tells Google that a page was visited and, where ad measurement is on, keeps advertising cookies in your browser. The pages where students join and play games do not load it.</p><p>If you arrive from a Google ad, MathNexa keeps that ad’s click identifier, first in a cookie and then with the account you create. When the account’s email address is confirmed, when its free trial starts, and when its first payment succeeds, MathNexa reports that event to Google Ads with the click identifier, the time, and the amount paid. It does not send your name, your email address, or anything you do in MathNexa. The click identifier is removed when you request account deletion.</p><p>Ad measurement is on only for visitors in the United States. It stays off if your browser sends a Global Privacy Control signal, or if you turn it off here.</p><AdMeasurementChoice /></section>
      <section aria-labelledby="privacy-evidence"><h2 id="privacy-evidence">Commercial evidence</h2><p>MathNexa keeps versioned acceptance, Checkout-binding hashes, webhook identifiers and hashes, entitlement state, cancellation state, and refund-review status. Raw webhook payloads and payment-method details are not stored.</p></section>
      <section aria-labelledby="privacy-retention"><h2 id="privacy-retention">Retention and deletion</h2><p>A deletion request immediately blocks access to MathNexa resources and new Checkout. Minimum billing evidence may be retained while cancellation, refunds, disputes, legal obligations, and the owner-approved retention schedule are resolved. Permanent deletion is not represented as complete until those checks finish.</p></section>
      <section aria-labelledby="privacy-control"><h2 id="privacy-control">Your controls</h2><p>You can sign out, recover your password, review your access status, and request account deletion. A deletion request immediately denies access to MathNexa resources while required billing and support review is completed.</p></section>
    </Container>;
  }
  return <Container className="page-stack"><PageHeader eyebrow="Public privacy boundary" title="Play without creating an account" description="The initial public MathNexa site provides information and launches Math Vocabulary Hunt without Production authentication or saved teacher data." />
    <Notice label="Do not enter personal information" tone="warning"><strong>No student or organization data is requested.</strong><p>Do not enter student names, emails, IDs, rosters, work, grades, school names, district names, or other identifying information into game labels.</p></Notice>
    <section aria-labelledby="privacy-unavailable"><h2 id="privacy-unavailable">Unavailable Production services</h2><p>Account creation, sign-in, recovery, teacher workspaces, pilot participation, billing, invitations, transactional email, and account deletion are not connected to the public site.</p></section>
  </Container>;
}
