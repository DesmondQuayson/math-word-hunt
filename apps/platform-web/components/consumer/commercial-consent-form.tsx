import Link from "next/link";

import { startCheckoutAction } from "@/app/billing-actions";
import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";

const consentItems = [
  ["subscriptionTermsAccepted", <>I accept the <Link href="/terms">subscription Terms</Link>.</>],
  ["automaticRenewalAccepted", <>I understand the subscription renews automatically every month until canceled.</>],
  ["trialAccepted", <>I accept one trial whose game access ends exactly 24 hours after activation.</>],
  ["monthlyPriceAccepted", <>I authorize billing at $5.99 USD monthly after the trial.</>],
  ["cancellationPolicyAccepted", <>I accept the <Link href="/cancellation">cancellation policy</Link>.</>],
  ["refundPolicyAccepted", <>I accept the <Link href="/refunds">refund-review policy</Link>.</>],
  ["privacyAndTermsAccepted", <>I have reviewed Privacy Notice {COMMERCIAL_POLICY.privacyVersion} and Terms {COMMERCIAL_POLICY.termsVersion}.</>]
] as const;

export function CommercialConsentForm() {
  return <form action={startCheckoutAction} className="prototype-form" aria-labelledby="commercial-consent-heading">
    <div>
      <h3 id="commercial-consent-heading">Confirm the subscription terms</h3>
      <p>All boxes are required before MathNexa can open Stripe to save a payment method.</p>
    </div>
    {consentItems.map(([name, label]) => <label className="checkbox-field" key={name}>
      <input name={name} type="checkbox" value="accepted" required />
      <span>{label}</span>
    </label>)}
    <button className="button button-primary" type="submit">Accept terms and continue to Stripe</button>
  </form>;
}
