import { redirect } from "next/navigation";

import { GameAccessStatus } from "@/components/consumer/game-access-status";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { getGameAccessView } from "@/lib/game-access/server";
import { openBillingPortalAction } from "@/app/billing-actions";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { createConsumerBillingRepository } from "@/lib/billing/consumer-service";
import { CommercialConsentForm } from "@/components/consumer/commercial-consent-form";
import { Card } from "@/components/ui/card";
import { accessIntentHref, confirmationRequiredHref, safeAccessIntentDestination } from "@/lib/auth/access-intent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription status",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};
export const dynamic = "force-dynamic";

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ billing?: string; checkout?: string; consent?: string; next?: string }> }) {
  const view = await getGameAccessView();
  const params = await searchParams;
  const destination = safeAccessIntentDestination(params.next, "/subscription");
  if (view.source === "school-access") return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Authorized school access" title="No subscription is required for this session" description="Your temporary school access already includes MathNexa products." />
    <Notice label="Billing boundary" tone="information"><strong>Access provided through an authorized school code.</strong><p>No Stripe customer, subscription, trial, Checkout session, or invoice is created.</p></Notice>
    <div className="button-row"><LinkButton href={destination === "/subscription" ? "/games" : destination}>Continue to MathNexa</LinkButton><LinkButton href="/account" variant="secondary">View access status</LinkButton></div>
  </Container>;
  if (view.context.status === "anonymous" || view.context.status === "unconfigured") redirect(accessIntentHref("/subscription"));
  if (view.context.status === "unconfirmed" || view.decision.reason === "email-confirmation-required") redirect(confirmationRequiredHref(destination));
  const config = tryGetConsumerBillingConfiguration();
  const repository = view.context.userId && config ? createConsumerBillingRepository(config) : null;
  const subscription = repository && view.context.userId
    ? await repository.getLatestSubscription(view.context.userId).catch(() => null)
    : null;
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Subscription" title="$5.99 USD monthly MathNexa access" description="Trial access ends exactly 24 hours after activation. Billing begins after the trial and renews monthly until canceled; Stripe controls invoice and payment-attempt timing." />
    <Notice label="Included with your subscription" tone="information"><strong>One MathNexa subscription includes Games, MAP Prep, Homework, and Quizzes.</strong><p>Every included area uses the same server-verified trial or subscription. You will not be asked to subscribe again for another module.</p></Notice>
    {params.checkout === "canceled" ? <Notice label="Checkout status" tone="information" live><strong>Payment-method setup canceled.</strong><p>No trial, subscription, charge, or access change was made.</p></Notice> : null}
    {params.billing === "unavailable" ? <Notice label="Billing management" tone="warning" live><strong>Billing management is unavailable.</strong><p>No subscription or access change was made.</p></Notice> : null}
    {params.consent === "required" ? <Notice label="Subscription consent" tone="warning" live><strong>Affirmative consent is required.</strong><p>Review and accept every current commercial term before continuing to Stripe.</p></Notice> : null}
    {!config ? <Notice label="Checkout availability" tone="warning"><strong>Checkout is not active.</strong><p>Subscription setup remains safely unavailable until the server has a complete approved billing configuration.</p></Notice> : null}
    <GameAccessStatus decision={view.decision} />
    {view.context.status === "active" && !view.decision.allowed && view.decision.nextAction === "start-checkout" ? <Card variant="highlighted" className="subscription-review-card">
      <p className="card-kicker">MathNexa monthly subscription</p>
      <h2>$5.99 USD / month</h2>
      <ul>
        <li>A payment method is required in Stripe-hosted Checkout before trial activation.</li>
        <li>Eligible accounts receive one full, non-renewable 24-hour trial, timed exactly by the server.</li>
        <li>Trial access ends exactly 24 hours after activation. Billing begins after the trial.</li>
        <li>Stripe controls invoice creation and payment-attempt timing; MathNexa does not promise an exact card-charge minute.</li>
        <li>The subscription renews automatically for $5.99 USD monthly until canceled.</li>
        <li>Cancel before the verified trial end to prevent the first charge. First-charge refund requests made within seven days receive manual review.</li>
      </ul>
      <CommercialConsentForm returnDestination={destination} enabled={config?.checkoutEnabled === true} />
    </Card> : null}
    {subscription ? <dl className="definition-grid" data-testid="consumer-subscription-summary">
      <div><dt>Status</dt><dd>{subscription.status.replaceAll("_", " ")}</dd></div>
      <div><dt>Trial expiration</dt><dd>{subscription.trialEnd ? <time dateTime={subscription.trialEnd}>{new Date(subscription.trialEnd).toLocaleString("en-US", { timeZone: "America/Chicago" })}</time> : "Not applicable"}</dd></div>
      <div><dt>Current period end</dt><dd>{subscription.currentPeriodEnd ? <time dateTime={subscription.currentPeriodEnd}>{new Date(subscription.currentPeriodEnd).toLocaleString("en-US", { timeZone: "America/Chicago" })}</time> : "Unavailable"}</dd></div>
      <div><dt>Cancellation</dt><dd>{subscription.cancelAtPeriodEnd ? "Scheduled at period end" : "Not scheduled"}</dd></div>
    </dl> : null}
    <div className="button-row">
      {view.decision.allowed && destination !== "/subscription" ? <LinkButton href={destination}>Continue to your selected resource</LinkButton> : null}
      {subscription && config?.portalEnabled ? <form action={openBillingPortalAction}><button className="button button-primary" type="submit">Manage or cancel in Stripe</button></form> : null}
      <LinkButton href="/subscriber-management" variant="secondary">Stable billing-management route</LinkButton>
    </div>
    <Notice label="Stripe Customer Portal" tone="information"><strong>Self-service billing.</strong><p>The Portal supports payment-method updates, invoice history, and cancellation at period end. Deletion-pending subscribers retain this route until cancellation is secured.</p></Notice>
  </Container>;
}
