import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";
import { StructuredCmsContent } from "@/components/cms/structured-cms-content";
import { loadPublishedCmsDocument } from "@/lib/cms/public";

export const metadata = { title: "Terms" };

export const dynamic = "force-dynamic";
export default async function TermsPage() {
  const managed=await loadPublishedCmsDocument("terms");
  if(managed)return <Container className="page-stack"><StructuredCmsContent document={managed}/></Container>;
  return <Container className="page-stack">
    <PageHeader
      eyebrow={`Terms version ${COMMERCIAL_POLICY.termsVersion}`}
      title="MathNexa subscription terms"
      description="These plain-language terms describe the monthly subscription contract presented for affirmative acceptance before Stripe Setup Checkout."
    />
    <section aria-labelledby="terms-subscription">
      <h2 id="terms-subscription">Subscription</h2>
      <p>MathNexa game access costs $5.99 USD each month. A payment method is required before an eligible account receives one non-renewable trial. Trial access ends exactly 24 hours after activation, then monthly billing begins automatically.</p>
    </section>
    <section aria-labelledby="terms-timing"><h2 id="terms-timing">Billing timing and renewal</h2><p>Stripe controls invoice creation and payment-attempt timing after the trial. MathNexa does not promise an exact card-charge minute. The subscription renews monthly until canceled.</p></section>
    <section aria-labelledby="terms-cancellation"><h2 id="terms-cancellation">Cancellation and refunds</h2><p>Authenticated subscribers can cancel at period end through Stripe billing management. Cancellation prevents future renewal but does not extend access. First-charge refund requests submitted within seven days receive manual review; refunds are not automatic or guaranteed.</p></section>
    <section aria-labelledby="terms-deletion"><h2 id="terms-deletion">Deletion requests</h2><p>A deletion request blocks game access and new purchases. Authenticated billing management remains available until cancellation is secured and required billing, refund, dispute, and retention work is complete.</p></section>
    <section aria-labelledby="terms-support"><h2 id="terms-support">Support</h2><p>Use the published MathNexa support route for account, billing, cancellation, refund, or deletion help. Commercial activation remains blocked until the owner supplies the final business identity and monitored support contact.</p></section>
    <section aria-labelledby="terms-access">
      <h2 id="terms-access">Access</h2>
      <p>Game access is available only during a server-verified trial or active subscription period. Account creation, browser state, or a Checkout redirect cannot grant access.</p>
    </section>
    <section aria-labelledby="terms-data">
      <h2 id="terms-data">Data boundary</h2>
      <p>Do not submit teacher, student, school, class, roster, organization, assignment, or learning-progress information. MathNexa stores no cloud gameplay progress.</p>
    </section>
  </Container>;
}
