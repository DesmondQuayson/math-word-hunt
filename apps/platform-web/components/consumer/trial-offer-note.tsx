import Link from "next/link";

import { describeApprovedPlan } from "@/components/consumer/trial-plan-summary";

/**
 * The one-line offer shown beside a "Start free trial" button on public pages
 * (homepage hero, Online Math Prep). Price, currency, interval and trial length
 * come from the commercial policy through describeApprovedPlan, the same values
 * the consent form and Checkout bind to, so the line can never quote a
 * different offer. It states the card requirement and the cancel-before-trial-
 * end rule up front, as the subscription terms do.
 */
export function TrialOfferNote({ className = "trial-offer-note", pricingLink = true }: Readonly<{ className?: string; pricingLink?: boolean }>) {
  const plan = describeApprovedPlan();
  return <p className={className}>
    <strong>{plan.trialLabel} free trial</strong>, then {plan.price} {plan.currency} a {plan.interval}. A card is needed to start, and you won’t be charged if you cancel before the trial ends.
    {pricingLink ? <> <Link href="/pricing">See pricing</Link></> : null}
  </p>;
}
