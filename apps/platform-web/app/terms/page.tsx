import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return <Container className="page-stack">
    <PageHeader
      eyebrow="Subscription terms preview"
      title="Plain-language MathNexa subscription terms"
      description="This repository-only Phase 7B page documents the approved product model. Checkout and billing remain disabled."
    />
    <section aria-labelledby="terms-subscription">
      <h2 id="terms-subscription">Subscription</h2>
      <p>MathNexa game access is planned at $5.99 USD per month. After Stripe-hosted payment-method collection, one eligible account receives one non-renewable 24-hour trial before automatic monthly billing begins.</p>
    </section>
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
