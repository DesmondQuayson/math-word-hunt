import { describeConsumerSubscription } from "@math-vocabulary-hunt/platform-core";

import { Notice } from "@/components/feedback/notice";
import type { ConsumerSubscriptionProjection } from "@/lib/billing/consumer-repository";

const CENTRAL_TIME = "America/Chicago";

function Stamp({ value }: { value: string | null }) {
  if (!value) return <>Unavailable</>;
  return <time dateTime={value}>{new Date(value).toLocaleString("en-US", { timeZone: CENTRAL_TIME })}</time>;
}

/**
 * The customer-facing description of the synchronized subscription. Copy comes
 * from the shared lifecycle mapper, so this component cannot infer billing
 * state on its own; it renders the canonical description and the raw
 * synchronized facts.
 */
export function ConsumerSubscriptionSummary({ subscription, now = new Date() }: Readonly<{ subscription: ConsumerSubscriptionProjection; now?: Date }>) {
  const presentation = describeConsumerSubscription({
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialEnd: subscription.trialEnd,
    updatedAt: subscription.updatedAt,
    endedAt: subscription.endedAt
  }, now);
  return <>
    <Notice label="Subscription status" tone={presentation.tone} live>
      <strong data-testid="consumer-subscription-label">{presentation.label}</strong>
      <p>{presentation.detail}</p>
      {presentation.boundaryAt ? <p>{presentation.boundaryLabel}: <Stamp value={presentation.boundaryAt} /></p> : null}
    </Notice>
    <dl className="definition-grid" data-testid="consumer-subscription-summary">
      <div><dt>Stripe status</dt><dd>{subscription.status.replaceAll("_", " ")}</dd></div>
      <div><dt>Trial expiration</dt><dd>{subscription.trialEnd ? <Stamp value={subscription.trialEnd} /> : "Not applicable"}</dd></div>
      <div><dt>Current period end</dt><dd><Stamp value={subscription.currentPeriodEnd} /></dd></div>
      <div><dt>Cancellation</dt><dd>{subscription.cancelAtPeriodEnd ? "Scheduled at period end" : "Not scheduled"}</dd></div>
      <div><dt>Last verified with Stripe</dt><dd>{subscription.lastSynchronizedAt ? <Stamp value={subscription.lastSynchronizedAt} /> : "Pending first synchronization"}</dd></div>
    </dl>
  </>;
}
