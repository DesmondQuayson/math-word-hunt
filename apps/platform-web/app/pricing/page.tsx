import { BILLING_CATALOG, CAPABILITIES_BY_KEY, getProductPackage } from "@math-vocabulary-hunt/platform-core";

import { startCheckoutAction } from "@/app/billing-actions";
import { ExistingDataSafeNotice } from "@/components/capabilities/existing-data-safe-notice";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getCapabilityAccessView } from "@/lib/capabilities/server";
import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export const metadata = { title: "Pricing" };

const freePackage = getProductPackage("free");
const monthlyPackage = getProductPackage("teacher-pro-monthly");
const monthlyPlan = BILLING_CATALOG.find((plan) => plan.key === "teacher-pro-monthly");
const annualPlan = BILLING_CATALOG.find((plan) => plan.key === "teacher-pro-annual");

function money(amount: number | null, currency: string | null): string {
  if (amount === null || currency === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

function ConsumerPricingPage() {
  return <Container width="compact" className="page-stack">
    <PageHeader eyebrow="MathNexa subscription" title="$5.99 USD per month" description="The game itself is the subscription product. There is no role-based or annual plan." />
    <Card variant="highlighted">
      <p className="card-kicker">One monthly subscription</p>
      <h2>$5.99 USD / month</h2>
      <ul>
        <li>Stripe-hosted payment-method collection before access</li>
        <li>One full, non-renewable 24-hour trial per eligible account</li>
        <li>Automatic monthly billing after the trial</li>
        <li>Game access only during a verified trial or active subscription</li>
      </ul>
      <LinkButton href="/sign-up">Create an account</LinkButton>
    </Card>
    <Notice label="Phase 7B availability" tone="information"><strong>Checkout is not active yet.</strong><p>No payment method, trial, subscription, or charge can be created in this repository-only phase.</p></Notice>
    <Notice label="Data boundary" tone="information"><strong>No education or gameplay-progress profile.</strong><p>Only minimum account, security, subscription, entitlement, support, and deletion data is permitted.</p></Notice>
  </Container>;
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; billing?: string }> }) {
  if (isProductionPlatformMode()) return <ConsumerPricingPage />;
  const [params, access] = await Promise.all([searchParams, getCapabilityAccessView()]);
  const config = tryGetBillingConfiguration();
  const sandbox = config?.enabled && config.stripeMode === "test" && config.applicationEnvironment !== "production";
  const annualSavings = monthlyPlan?.amountMinorUnits && annualPlan?.amountMinorUnits
    ? monthlyPlan.amountMinorUnits * 12 - annualPlan.amountMinorUnits
    : null;

  return <Container width="wide" className="page-stack">
    <PageHeader eyebrow="Teacher plans" title="More planning capacity, not imaginary features" description="The current classroom game stays Free. Teacher Pro expands only the saved class and activity-draft capabilities that exist today." />
    {sandbox ? <Notice label="Sandbox pricing" tone="warning"><strong>Test mode only</strong><p>No real charge is created. These prices and limits still require owner approval before production.</p></Notice> : <Notice label="Pricing availability"><strong>Pricing unavailable</strong><p>Production pricing, Checkout, and payments remain disabled until separate owner approval.</p></Notice>}
    {params.checkout === "canceled" ? <Notice label="Checkout status"><strong>Checkout canceled</strong><p>No subscription or access change was confirmed.</p></Notice> : null}
    {params.billing === "unavailable" ? <Notice label="Billing status" tone="warning" live><strong>Billing unavailable</strong><p>No billing or access change was made. Existing saved work and the Free game are unaffected.</p></Notice> : null}
    {access.usage?.planKey !== "free" ? <Notice label="Current plan" tone="success"><strong>Your verified Teacher Pro access is active</strong><p>Expanded planning capacity is already available. Manage this test subscription from your account.</p></Notice> : null}

    <div className="pricing-grid">
      <Card>
        <p className="card-kicker">Free</p><h2>$0</h2>
        <p>Launch canonical v7, review curriculum readiness, and keep a small teacher-owned planning workspace.</p>
        <ul><li>Up to {freePackage?.activeClassLimit ?? 2} active classes</li><li>Up to {freePackage?.activeActivityLimit ?? 3} active activity drafts</li><li>No student accounts, rosters, or tracking</li></ul>
        <LinkButton href="/play">Launch v7</LinkButton>
      </Card>
      <Card variant="highlighted">
        <p className="card-kicker">Teacher Pro monthly · sandbox</p><h2>{sandbox ? `${money(monthlyPlan?.amountMinorUnits ?? null, monthlyPlan?.currency ?? null)} / month` : "Unavailable"}</h2>
        <p>Expanded capacity for the same implemented teacher-owned planning tools.</p>
        <ul><li>Up to {monthlyPackage?.activeClassLimit ?? 25} active classes</li><li>Up to {monthlyPackage?.activeActivityLimit ?? 100} active activity drafts</li><li>Existing owned records remain editable after downgrade</li></ul>
        {sandbox && access.decisions["billing.checkout"].reason !== "denied_no_entitlement" ? <form action={startCheckoutAction}><input type="hidden" name="planKey" value="teacher-pro-monthly"/><input type="hidden" name="returnDestination" value="/pricing"/><button className="button button-primary" type="submit">Test monthly Checkout</button></form> : null}
      </Card>
      <Card>
        <p className="card-kicker">Teacher Pro annual · sandbox</p><h2>{sandbox ? `${money(annualPlan?.amountMinorUnits ?? null, annualPlan?.currency ?? null)} / year` : "Unavailable"}</h2>
        <p>The same implemented Pro capacity billed annually in test mode. {sandbox && annualSavings !== null && annualSavings > 0 ? `The configured test amounts are ${money(annualSavings, annualPlan?.currency ?? null)} less than twelve monthly payments.` : "No production savings claim is approved."}</p>
        {sandbox && access.decisions["billing.checkout"].reason !== "denied_no_entitlement" ? <form action={startCheckoutAction}><input type="hidden" name="planKey" value="teacher-pro-annual"/><input type="hidden" name="returnDestination" value="/pricing"/><button className="button button-secondary" type="submit">Test annual Checkout</button></form> : null}
      </Card>
    </div>

    <section aria-labelledby="plan-comparison-heading">
      <h2 id="plan-comparison-heading">What is genuinely available</h2>
      <div className="data-table-wrap">
        <table className="capability-matrix"><thead><tr><th scope="col">Capability</th><th scope="col">Free</th><th scope="col">Teacher Pro</th></tr></thead><tbody>
          {["game.launch.canonical", "curriculum.view", "class.view", "class.create", "activity.view", "activity.create"].map((key) => {
            const capability = CAPABILITIES_BY_KEY[key as keyof typeof CAPABILITIES_BY_KEY];
            const freeText = key === "class.create" ? `${freePackage?.activeClassLimit ?? 2} active` : key === "activity.create" ? `${freePackage?.activeActivityLimit ?? 3} active` : "Included";
            const proText = key === "class.create" ? `${monthlyPackage?.activeClassLimit ?? 25} active` : key === "activity.create" ? `${monthlyPackage?.activeActivityLimit ?? 100} active` : "Included";
            return <tr key={key}><th scope="row">{capability.title}<span className="visually-hidden">: </span><small>{capability.description}</small></th><td data-label="Free">{freeText}</td><td data-label="Teacher Pro">{proText}</td></tr>;
          })}
        </tbody></table>
      </div>
    </section>

    <ExistingDataSafeNotice />
    <Notice label="Not included" tone="information"><strong>Planned features are not part of either plan.</strong><p>Managed sessions, remote participation, real reports, student accounts, assignments, analytics, and school or district administration remain unavailable.</p></Notice>
    {access.context.userId ? <LinkButton href="/account" variant="secondary">View account and billing status</LinkButton> : null}
  </Container>;
}
