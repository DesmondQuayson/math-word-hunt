import { redirect } from "next/navigation";

import { openBillingPortalAction } from "@/app/billing-actions";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { createConsumerBillingRepository } from "@/lib/billing/consumer-service";

export async function SubscriberManagementPage({ rollbackSafe = false }: Readonly<{ rollbackSafe?: boolean }>) {
  const context = await resolveConsumerContext();
  if (context.status === "anonymous" || context.status === "unconfigured") {
    redirect(`/sign-in?next=${encodeURIComponent(rollbackSafe ? "/subscriber-management" : "/cancellation")}`);
  }
  const config = tryGetConsumerBillingConfiguration();
  const repository = config && context.userId ? createConsumerBillingRepository(config) : null;
  const subscription = repository && context.userId
    ? await repository.getLatestSubscription(context.userId).catch(() => null)
    : null;
  const restricted = context.status === "suspended" || context.status === "unconfirmed" || context.status === "missing-account";
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow={rollbackSafe ? "Stable subscriber access" : "Cancellation"} title="Manage or cancel your subscription" description={rollbackSafe ? "This route remains on the Production platform alias even if mathnexa.com is rolled back." : "Use authenticated Stripe billing management to cancel at the end of the current trial or billing period."} />
    {context.status === "deletion-pending" ? <Notice label="Deletion and billing" tone="warning"><strong>Billing management remains available.</strong><p>Your deletion request blocks game access and new Checkout, but this route remains available until cancellation is secured.</p></Notice> : null}
    {subscription ? <dl className="definition-grid">
      <div><dt>Subscription status</dt><dd>{subscription.status.replaceAll("_", " ")}</dd></div>
      <div><dt>Cancellation</dt><dd>{subscription.cancelAtPeriodEnd ? "Scheduled at period end" : "Not scheduled"}</dd></div>
      <div><dt>Access boundary</dt><dd>{subscription.trialEnd ?? subscription.currentPeriodEnd ?? "Unavailable"}</dd></div>
    </dl> : <Notice label="Subscription record" tone="information"><strong>No current subscription was found.</strong><p>No cancellation action is required unless support identifies an unresolved provider record.</p></Notice>}
    {subscription && config?.portalEnabled && !restricted
      ? <form action={openBillingPortalAction}><button className="button button-primary" type="submit">Open Stripe billing management</button></form>
      : <Notice label="Billing management" tone="warning"><strong>Stripe billing management is unavailable.</strong><p>No subscription change was made. Use MathNexa support if this persists.</p></Notice>}
    <p>Cancellation prevents future renewal. Access continues only through the authoritative trial or paid-period end shown by the server.</p>
    <div className="button-row"><LinkButton href="/support" variant="secondary">Contact support</LinkButton><LinkButton href="/account" variant="secondary">Return to account</LinkButton></div>
  </Container>;
}
