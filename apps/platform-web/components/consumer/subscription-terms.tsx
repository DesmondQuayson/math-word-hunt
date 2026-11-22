/**
 * The commercial subscription terms as a reader sees them where no checkout
 * is offered (the public plan, and /pricing for an account that cannot start
 * Checkout). Where Checkout is offered, the consent form states the same terms
 * itself, directly above its two agreements (CheckoutKeyTerms).
 */
export const SUBSCRIPTION_TERMS: readonly string[] = [
  "A payment method is required in Stripe-hosted Checkout before trial activation.",
  "Eligible accounts receive one full, non-renewable 24-hour trial, timed exactly by the server.",
  "Trial access ends exactly 24 hours after activation. Billing begins after the trial.",
  "Stripe controls invoice creation and payment-attempt timing; MathNexa does not promise an exact card-charge minute.",
  "The subscription renews automatically for $5.99 USD monthly until canceled.",
  "Cancel any time from Subscription in your MathNexa account by choosing “Manage or cancel in Stripe”.",
  "Cancel before the verified trial end to prevent the first charge. First-charge refund requests made within seven days receive manual review."
];

export function SubscriptionTermsList() {
  return (
    <ul>
      {SUBSCRIPTION_TERMS.map((term) => (
        <li key={term}>{term}</li>
      ))}
    </ul>
  );
}
