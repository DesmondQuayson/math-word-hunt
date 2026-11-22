import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";

type CheckoutPolicy = Readonly<{ amountMinorUnits: number; currency: string; interval: string; trialSeconds: number }>;

/**
 * The line Stripe shows beside the button on its card page (Checkout
 * `custom_text.submit`). Setup-mode Checkout carries no line items, so without
 * this line Stripe's page names no price and no trial (2026-11 funnel audit:
 * a third of the people who reached that page left it).
 *
 * Built from the commercial policy the consent form binds to, and used only
 * after createConsumerSetupCheckout has verified that the Stripe price matches
 * that policy. An account whose one trial is used is never promised a trial.
 */
export function setupCheckoutSubmitMessage(
  { trialEligible }: Readonly<{ trialEligible: boolean }>,
  policy: CheckoutPolicy = COMMERCIAL_POLICY
): string {
  const currency = policy.currency.toUpperCase();
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(policy.amountMinorUnits / 100);
  const hours = policy.trialSeconds / 3600;
  return trialEligible
    ? `Saving your card starts your ${hours}-hour free trial. After the trial, MathNexa renews at ${price} ${currency} a ${policy.interval} until you cancel. Cancel before the trial ends and you won't be charged.`
    : `MathNexa is ${price} ${currency} a ${policy.interval} and renews until you cancel. This account has already used its free trial.`;
}
