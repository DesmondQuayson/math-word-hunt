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
import { ConsumerSubscriptionSummary } from "@/components/consumer/subscription-summary";
import { SubscriptionTermsList } from "@/components/consumer/subscription-terms";
import { describeApprovedPlan } from "@/components/consumer/trial-plan-summary";
import { accessIntentHref, confirmationRequiredHref, safeAccessIntentDestination } from "@/lib/auth/access-intent";
import { SUBSCRIBER_DESTINATION } from "@/lib/consumer/header-cta";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription status",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};
export const dynamic = "force-dynamic";

function CheckoutNotices({ params, configured }: { params: { billing?: string; checkout?: string; consent?: string }; configured: boolean }) {
  return <>
    {params.checkout === "canceled" ? <Notice label="Checkout status" tone="information" live><strong>Payment-method setup canceled.</strong><p>No trial, subscription, charge, or access change was made.</p></Notice> : null}
    {params.billing === "unavailable" ? <Notice label="Billing management" tone="warning" live><strong>Billing management is unavailable.</strong><p>No subscription or access change was made.</p></Notice> : null}
    {params.consent === "required" ? <Notice label="Subscription consent" tone="warning" live><strong>Affirmative consent is required.</strong><p>Review and accept every current commercial term before continuing to Stripe.</p></Notice> : null}
    {!configured ? <Notice label="Checkout availability" tone="warning"><strong>Checkout is not active.</strong><p>Subscription setup remains safely unavailable until the server has a complete approved billing configuration.</p></Notice> : null}
  </>;
}

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ activated?: string; billing?: string; checkout?: string; consent?: string; next?: string }> }) {
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
  const plan = describeApprovedPlan();

  // Trial onboarding: a confirmed account that has never redeemed its trial.
  // The server decision alone selects this state.
  if (view.context.status === "active" && !view.decision.allowed && view.decision.nextAction === "start-checkout") {
    return <Container className="page-stack onboarding-page" width="compact">
      <header className="onboarding-header">
        <p className="eyebrow">MathNexa subscription</p>
        <h1>Start your free trial</h1>
        <p className="lede">Get full access to MathNexa math practice, games, learning tools, and premium resources.</p>
      </header>
      <CheckoutNotices params={params} configured={Boolean(config)} />
      <div className="onboarding-card">
        <section className="form-section" aria-labelledby="subscription-account-heading">
          <h2 className="form-section-title" id="subscription-account-heading">Account</h2>
          <p className="account-chip">
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
            <span>Signed in{view.context.email ? <> as <strong>{view.context.email}</strong></> : null}</span>
          </p>
        </section>
        <section className="plan-summary" aria-labelledby="subscription-plan-heading">
          <h2 className="form-section-title" id="subscription-plan-heading">Plan</h2>
          <div className="plan-summary-card">
            <div className="plan-summary-head">
              <p className="plan-summary-name">MathNexa monthly</p>
              <p className="plan-summary-price"><strong>{plan.price}</strong> <span>{plan.currency} / {plan.interval}</span></p>
            </div>
            <p className="plan-summary-includes">One MathNexa subscription includes Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, and Worksheet Generator.</p>
            <div className="plan-terms">
              <p className="plan-terms-title">Trial and billing terms</p>
              <SubscriptionTermsList />
            </div>
          </div>
        </section>
        <CommercialConsentForm returnDestination={destination} enabled={config?.checkoutEnabled === true} trialEligible />
      </div>
      <p className="form-switch onboarding-footer-link">Not ready yet? <a href="/account">Go to My Account</a></p>
    </Container>;
  }

  const repository = view.context.userId && config ? createConsumerBillingRepository(config) : null;
  const subscription = repository && view.context.userId
    ? await repository.getAuthoritativeSubscription(view.context.userId).catch(() => null)
    : null;
  const justActivated = params.activated === "1" && view.decision.allowed;
  return <Container className="page-stack" width="compact">
    {justActivated ? <section className="success-panel" aria-labelledby="activation-success-heading">
      <span className="success-panel-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"><path d="M5.5 12.5l4 4 9-9.5" /></svg>
      </span>
      <h1 id="activation-success-heading">You&apos;re all set!</h1>
      <p role="status">Your MathNexa access is ready.</p>
      <LinkButton href={SUBSCRIBER_DESTINATION} className="button-large">Go to Math Games</LinkButton>
      <a className="success-panel-secondary" href="/subscription">View subscription details</a>
    </section> : <PageHeader eyebrow="Subscription" title={`${plan.price} ${plan.currency} ${plan.intervalAdverb} MathNexa access`} description="Trial access ends exactly 24 hours after activation. Billing begins after the trial and renews monthly until canceled; Stripe controls invoice and payment-attempt timing." />}
    {justActivated ? null : <Notice label="Included with your subscription" tone="information"><strong>One MathNexa subscription includes Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, and Worksheet Generator.</strong><p>Every included area uses the same server-verified trial or subscription. You will not be asked to subscribe again for another module.</p></Notice>}
    {justActivated && subscription ? <ConsumerSubscriptionSummary subscription={subscription} /> : null}
    {justActivated ? null : <>
      <CheckoutNotices params={params} configured={Boolean(config)} />
      <GameAccessStatus decision={view.decision} hideSubscriptionLink />
      {subscription ? <ConsumerSubscriptionSummary subscription={subscription} /> : null}
      <div className="button-row">
        {view.decision.allowed && destination !== "/subscription" ? <LinkButton href={destination}>Continue to your selected resource</LinkButton> : null}
        {/* The one trial is used and access has ended: the existing Checkout
            (without a new trial) lives on Pricing, which also refuses it while
            a live subscription exists. */}
        {view.context.status === "active" && !view.decision.allowed && view.decision.nextAction === "manage-subscription" && view.decision.reason !== "payment-past-due" && view.decision.reason !== "subscription-verification-unavailable"
          ? <LinkButton href="/pricing">See subscription options</LinkButton>
          : null}
        {subscription && config?.portalEnabled ? <form action={openBillingPortalAction}><button className="button button-primary" type="submit">Manage or cancel in Stripe</button></form> : null}
        <LinkButton href="/subscriber-management" variant="secondary">Manage billing (backup link)</LinkButton>
      </div>
      <Notice label="Stripe Customer Portal" tone="information"><strong>Self-service billing.</strong><p>The Portal supports payment-method updates, invoice history, and cancellation at period end. Deletion-pending subscribers retain this route until cancellation is secured.</p></Notice>
      </>}
  </Container>;
}
