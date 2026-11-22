"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

import { startCheckoutAction } from "@/app/billing-actions";
import { COMMERCIAL_CONSENT_PRESENTATION_VERSION, COMMERCIAL_POLICY } from "@/lib/commercial/policy";
import type { AccessIntentDestination } from "@/lib/auth/access-intent";
import { describeApprovedPlan } from "./trial-plan-summary";

const noSubscription = () => () => {};
const noServerValue = () => null;

/** A trial started now would end at this time, to the minute, in the reader's own time zone. */
function trialEndIfStartedNow(): string | null {
  try {
    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })
      .format(new Date(minute + COMMERCIAL_POLICY.trialSeconds * 1000));
  } catch {
    return null;
  }
}

/**
 * The calendar date and time a trial started now would end, so the cancel-by
 * date and the first-charge date are known before agreeing. The server cannot
 * know the reader's time zone, so the sentence appears once the page is
 * running in the browser; until then it is simply absent.
 */
function TrialEndIfStartedNow() {
  const ends = useSyncExternalStore(noSubscription, trialEndIfStartedNow, noServerValue);
  return ends ? <> If you start now, the trial ends and the first charge is due on <strong data-testid="trial-end-estimate">{ends}</strong>; cancel before then to pay nothing.</> : null;
}

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
 * The material terms, stated once, right above the two agreements: what
 * happens today, when and how much is charged, that it renews automatically,
 * how to cancel, and the refund rule. The wording comes from the same
 * commercial policy that Checkout and the recorded acceptance bind to.
 */
export function CheckoutKeyTerms({ trialEligible }: Readonly<{ trialEligible: boolean }>) {
  const plan = describeApprovedPlan();
  const amount = `${plan.price} ${plan.currency}`;
  return <dl className="checkout-key-terms" aria-label="Key subscription terms">
    {trialEligible ? <>
      <div><dt>Today</dt><dd>You add a card on Stripe&apos;s secure page and your {plan.trialLabel} free trial starts. You are not charged today. One free trial per account.</dd></div>
      <div><dt>When the trial ends</dt><dd>Stripe charges your card {amount}, then {amount} every month, automatically, until you cancel.<TrialEndIfStartedNow /> Stripe sets the exact minute of each charge.</dd></div>
    </> : <>
      <div><dt>Today</dt><dd>Your account has already used its free trial. You add a card on Stripe&apos;s secure page and are charged {amount} today.</dd></div>
      <div><dt>Every month</dt><dd>Stripe charges your card {amount} every month, automatically, until you cancel. Stripe sets the exact minute of each charge.</dd></div>
    </>}
    <div><dt>How to cancel</dt><dd>Any time: open <Link href="/subscription">Subscription</Link> in your MathNexa account and choose &ldquo;Manage or cancel in Stripe&rdquo;.{trialEligible ? " Cancel before the trial ends and you won’t be charged." : ""} After a charge, canceling stops future charges and your access continues to the end of the month you paid for.</dd></div>
    <div><dt>Refunds</dt><dd>Ask within seven days of your first charge and we review a refund by hand. Refunds are not automatic or guaranteed. Questions: <Link href="/support">MathNexa Support</Link>.</dd></div>
  </dl>;
}

/**
 * The affirmative-consent step before Stripe-hosted Checkout: two separate,
 * unticked, required agreements. The first covers only the automatic-renewal
 * terms (trial, price, renewal until canceled); the second covers the
 * Subscription Terms, the cancellation and refund policies and the Privacy
 * Notice. The server records the same seven acceptances as before.
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
  const plan = describeApprovedPlan();
  const amount = `${plan.price} ${plan.currency}`;
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

  return <form action={startCheckoutAction} onSubmit={onSubmit} className="prototype-form consent-form" aria-labelledby="commercial-consent-heading" data-consent-presentation={COMMERCIAL_CONSENT_PRESENTATION_VERSION}>
    <input type="hidden" name="returnDestination" value={returnDestination} />
    <div className="consent-form-intro">
      <h3 id="commercial-consent-heading">Before you continue</h3>
      <p>Please read these terms, then tick both boxes.</p>
    </div>
    <CheckoutKeyTerms trialEligible={trialEligible} />
    <div className="consent-list">
      <label className="checkbox-field">
        <input name="automaticRenewalConsent" type="checkbox" value="accepted" required />
        <span>{trialEligible
          ? <>I agree to the automatic renewal terms above and authorize MathNexa to charge my card {amount} when my {plan.trialLabel} free trial ends and then every month until I cancel.</>
          : <>I agree to the automatic renewal terms above and authorize MathNexa to charge my card {amount} today and then every month until I cancel. My account has already used its free trial.</>}</span>
      </label>
      <label className="checkbox-field">
        <input name="subscriptionTermsConsent" type="checkbox" value="accepted" required />
        <span>I agree to the <Link href="/terms">Subscription Terms</Link>, including the <Link href="/cancellation">cancellation policy</Link> and <Link href="/refunds">refund policy</Link>, and I have read the <Link href="/privacy">Privacy Notice</Link>.</span>
      </label>
    </div>
    <div className="consent-actions">
      <SubmitButton enabled={enabled} label={trialEligible ? "Start free trial" : "Continue to secure checkout"} onIdle={release} />
      <p className="consent-enrollment-note">{trialEligible
        ? "By starting your free trial, you enroll in a MathNexa subscription that renews automatically every month until you cancel."
        : "By continuing, you enroll in a MathNexa subscription that renews automatically every month until you cancel."}</p>
      <p className="secure-note">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 9V6.5a4 4 0 0 1 8 0V9M4.5 9h11v8h-11z" /></svg>
        <span>Secure checkout by Stripe. Card details are entered on Stripe and are never stored by MathNexa.</span>
      </p>
    </div>
  </form>;
}
