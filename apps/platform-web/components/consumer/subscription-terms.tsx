/**
 * The single source of the six commercial subscription terms. /pricing and
 * /subscription previously restated them with drifting wording; the consent
 * checkboxes remain the third, legally-affirmative surface by design.
 */
export const SUBSCRIPTION_TERMS: readonly string[] = [
  "A payment method is required in Stripe-hosted Checkout before trial activation.",
  "Eligible accounts receive one full, non-renewable 24-hour trial, timed exactly by the server.",
  "Trial access ends exactly 24 hours after activation. Billing begins after the trial.",
  "Stripe controls invoice creation and payment-attempt timing; MathNexa does not promise an exact card-charge minute.",
  "The subscription renews automatically for $5.99 USD monthly until canceled.",
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
