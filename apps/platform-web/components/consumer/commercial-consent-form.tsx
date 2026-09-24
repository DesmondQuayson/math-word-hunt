"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

import { startCheckoutAction } from "@/app/billing-actions";
import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";
import type { AccessIntentDestination } from "@/lib/auth/access-intent";

const consentItems = [
  ["subscriptionTermsAccepted", <>I accept the <Link href="/terms">subscription Terms</Link>.</>],
  ["automaticRenewalAccepted", <>I understand the subscription renews automatically every month until canceled.</>],
  ["trialAccepted", <>I accept one trial whose game access ends exactly 24 hours after activation.</>],
  ["monthlyPriceAccepted", <>I authorize billing at $5.99 USD monthly after the trial.</>],
  ["cancellationPolicyAccepted", <>I accept the <Link href="/cancellation">cancellation policy</Link>.</>],
  ["refundPolicyAccepted", <>I accept the <Link href="/refunds">refund-review policy</Link>.</>],
  ["privacyAndTermsAccepted", <>I have reviewed Privacy Notice {COMMERCIAL_POLICY.privacyVersion} and Terms {COMMERCIAL_POLICY.termsVersion}.</>]
] as const;

function SubmitButton({ enabled, label, onIdle }: Readonly<{ enabled: boolean; label: string; onIdle: () => void }>) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onIdle();
    wasPending.current = pending;
  }, [pending, onIdle]);
  return <button className="button button-primary button-large" type="submit" disabled={!enabled || pending} aria-busy={pending || undefined}>
    {pending ? <span className="button-spinner" aria-hidden="true" /> : null}
    <span>{pending ? "Opening secure checkout…" : label}</span>
  </button>;
}

/**
 * The affirmative-consent step before Stripe-hosted Checkout. The seven
 * consent statements and the server action are unchanged; this component only
 * adds one-submission-at-a-time protection and a truthful progress label.
 */
export function CommercialConsentForm({
  returnDestination = "/subscription",
  enabled = true,
  trialEligible = true
}: {
  returnDestination?: AccessIntentDestination;
  enabled?: boolean;
  /** Only an account that has never redeemed its trial is offered "Start free trial". */
  trialEligible?: boolean;
}) {
  const submitting = useRef(false);
  const release = useCallback(() => { submitting.current = false; }, []);

  // Returning from Stripe with the browser's Back button can restore this
  // page from the back/forward cache with the button still pending. Reload
  // so the server decides again what this account may do.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // A second tap that lands before React renders the pending state must
    // not queue a second Checkout request.
    if (submitting.current) {
      event.preventDefault();
      return;
    }
    submitting.current = true;
  };

  return <form action={startCheckoutAction} onSubmit={onSubmit} className="prototype-form consent-form" aria-labelledby="commercial-consent-heading">
    <input type="hidden" name="returnDestination" value={returnDestination} />
    <div className="consent-form-intro">
      <h3 id="commercial-consent-heading">Confirm the subscription terms</h3>
      <p>Please confirm each item. All boxes are required before MathNexa can open Stripe to save a payment method.</p>
    </div>
    <div className="consent-list">
      {consentItems.map(([name, label]) => <label className="checkbox-field" key={name}>
        <input name={name} type="checkbox" value="accepted" required />
        <span>{label}</span>
      </label>)}
    </div>
    <div className="consent-actions">
      <SubmitButton enabled={enabled} label={trialEligible ? "Start free trial" : "Continue to secure checkout"} onIdle={release} />
      <p className="secure-note">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9M4.5 9h11v8h-11z" /></svg>
        <span>Secure checkout by Stripe. Card details are entered on Stripe and are never stored by MathNexa.</span>
      </p>
    </div>
  </form>;
}
