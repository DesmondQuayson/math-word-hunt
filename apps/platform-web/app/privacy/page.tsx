import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  if (isProductionPlatformMode()) {
    return <Container className="page-stack"><PageHeader eyebrow="Minimum-data boundary" title="Account and subscription privacy" description="MathNexa uses only the minimum data required for authentication, security, billing, entitlement, support, and account deletion." />
      <Notice label="Information not collected" tone="information"><strong>No educational or gameplay-progress profile.</strong><p>MathNexa does not request teacher, student, school, class, roster, organization, assignment, result, score, lesson history, or cloud gameplay-progress information.</p></Notice>
      <section aria-labelledby="privacy-required"><h2 id="privacy-required">Required information</h2><p>Authentication uses an account UUID, email, confirmation and security state, and lifecycle timestamps. Subscription access later requires minimum Stripe customer/subscription references and server-owned entitlement evidence. Stripe—not MathNexa—handles payment-method details.</p></section>
      <section aria-labelledby="privacy-control"><h2 id="privacy-control">Your controls</h2><p>You can sign out, recover your password, review game-access status, and request account deletion. A deletion request immediately denies game access while required billing and support review is completed.</p></section>
    </Container>;
  }
  return <Container className="page-stack"><PageHeader eyebrow="Public privacy boundary" title="Play without creating an account" description="The initial public MathNexa site provides information and launches Math Vocabulary Hunt without Production authentication or saved teacher data." />
    <Notice label="Do not enter personal information" tone="warning"><strong>No student or organization data is requested.</strong><p>Do not enter student names, emails, IDs, rosters, work, grades, school names, district names, or other identifying information into game labels.</p></Notice>
    <section aria-labelledby="privacy-unavailable"><h2 id="privacy-unavailable">Unavailable Production services</h2><p>Account creation, sign-in, recovery, teacher workspaces, pilot participation, billing, invitations, transactional email, and account deletion are not connected to the public site.</p></section>
  </Container>;
}
