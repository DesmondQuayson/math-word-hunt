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

export const metadata = { title: "Subscription status" };
export const dynamic = "force-dynamic";

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const view = await getGameAccessView();
  if (view.context.status === "anonymous" || view.context.status === "unconfigured") redirect("/sign-in?next=/subscription");
  const params = await searchParams;
  const config = tryGetConsumerBillingConfiguration();
  const repository = view.context.userId ? createConsumerBillingRepository() : null;
  const subscription = repository && view.context.userId
    ? await repository.getLatestSubscription(view.context.userId).catch(() => null)
    : null;
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Subscription" title="$5.99 USD monthly game access" description="One exact 24-hour trial follows successful Stripe payment-method setup, then billing renews automatically each month until canceled." />
    {params.billing === "unavailable" ? <Notice label="Billing management" tone="warning" live><strong>Billing management is unavailable.</strong><p>No subscription or access change was made.</p></Notice> : null}
    {!config ? <Notice label="Checkout availability" tone="warning"><strong>Checkout is not active.</strong><p>Subscription setup remains safely unavailable until the server has a complete Stripe Sandbox configuration.</p></Notice> : null}
    <GameAccessStatus decision={view.decision} />
    {subscription ? <dl className="definition-grid" data-testid="consumer-subscription-summary">
      <div><dt>Status</dt><dd>{subscription.status.replaceAll("_", " ")}</dd></div>
      <div><dt>Trial expiration</dt><dd>{subscription.trialEnd ? <time dateTime={subscription.trialEnd}>{new Date(subscription.trialEnd).toLocaleString("en-US", { timeZone: "America/Chicago" })}</time> : "Not applicable"}</dd></div>
      <div><dt>Current period end</dt><dd>{subscription.currentPeriodEnd ? <time dateTime={subscription.currentPeriodEnd}>{new Date(subscription.currentPeriodEnd).toLocaleString("en-US", { timeZone: "America/Chicago" })}</time> : "Unavailable"}</dd></div>
      <div><dt>Cancellation</dt><dd>{subscription.cancelAtPeriodEnd ? "Scheduled at period end" : "Not scheduled"}</dd></div>
    </dl> : null}
    <div className="button-row">
      {!subscription && view.context.status === "active" ? <LinkButton href="/pricing">Start subscription setup</LinkButton> : null}
      {subscription && config?.portalEnabled ? <form action={openBillingPortalAction}><button className="button button-primary" type="submit">Manage billing in Stripe</button></form> : null}
    </div>
    <Notice label="Stripe Customer Portal" tone="information"><strong>Self-service billing.</strong><p>The Portal supports payment-method updates, invoice history, and cancellation at period end. Restoration is available where Stripe permits it.</p></Notice>
  </Container>;
}
