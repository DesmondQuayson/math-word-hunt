import { startCheckoutAction } from "@/app/billing-actions";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { tryGetBillingConfiguration } from "@/lib/billing/config";

export const metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; billing?: string }> }) {
  const params = await searchParams;
  const config = tryGetBillingConfiguration();
  const sandbox = config?.enabled && config.stripeMode === "test" && config.applicationEnvironment !== "production";
  return <Container width="wide" className="page-stack">
    <PageHeader eyebrow="Teacher plans" title="Choose the access that fits your classroom" description="The standalone classroom game remains available. Teacher Pro billing below is a test-mode validation, not approved production pricing." />
    {sandbox ? <Notice label="Sandbox pricing" tone="warning"><strong>Test mode only</strong><p>No real charge is created. These prices are not approved for production.</p></Notice> : <Notice label="Pricing availability"><strong>Pricing unavailable</strong><p>Production billing is disabled until pricing and operations receive separate approval.</p></Notice>}
    {params.checkout === "canceled" ? <Notice label="Checkout status"><strong>Checkout canceled</strong><p>No subscription or access change was confirmed.</p></Notice> : null}
    {params.billing === "unavailable" ? <Notice label="Billing status" tone="warning" live><strong>Billing unavailable</strong><p>No billing or access change was made. Try again later or contact support.</p></Notice> : null}
    <div className="pricing-grid">
      <Card><p className="card-kicker">Free</p><h2>$0</h2><p>Launch the current v7 teacher-led classroom game with its approved vocabulary and accessibility behavior.</p><LinkButton href="/play">Play v7</LinkButton></Card>
      <Card variant="highlighted"><p className="card-kicker">Teacher Pro · sandbox</p><h2>{sandbox ? "$9.99 monthly" : "Unavailable"}</h2><p>Sandbox validation for the implemented local class and activity planning tools and the existing premium feature gates. Managed sessions, student accounts, analytics, and real reports are not included.</p>{sandbox ? <form action={startCheckoutAction}><input type="hidden" name="planKey" value="teacher-pro-monthly"/><input type="hidden" name="returnDestination" value="/pricing"/><button className="button button-primary" type="submit">Test monthly Checkout</button></form> : null}</Card>
      <Card><p className="card-kicker">Teacher Pro annual · sandbox</p><h2>{sandbox ? "$79.99 yearly" : "Unavailable"}</h2><p>The same implemented Pro capabilities with annual test billing. No trial, coupon, quantity, or automatic refund.</p>{sandbox ? <form action={startCheckoutAction}><input type="hidden" name="planKey" value="teacher-pro-annual"/><input type="hidden" name="returnDestination" value="/pricing"/><button className="button button-secondary" type="submit">Test annual Checkout</button></form> : null}</Card>
    </div>
  </Container>;
}
