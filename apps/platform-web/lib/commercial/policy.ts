export const COMMERCIAL_POLICY = Object.freeze({
  productKey: "mathnexa-monthly",
  amountMinorUnits: 599,
  currency: "usd",
  interval: "month",
  trialSeconds: 86_400,
  termsVersion: "2026-08-01",
  privacyVersion: "2026-08-01",
  cancellationVersion: "2026-08-01",
  refundVersion: "2026-08-01"
} as const);

export const COMMERCIAL_CONSENT_FIELDS = Object.freeze([
  "subscriptionTermsAccepted",
  "automaticRenewalAccepted",
  "trialAccepted",
  "monthlyPriceAccepted",
  "cancellationPolicyAccepted",
  "refundPolicyAccepted",
  "privacyAndTermsAccepted"
] as const);

export type CommercialConsentField = (typeof COMMERCIAL_CONSENT_FIELDS)[number];

export type CommercialConsentDecision = Readonly<Record<CommercialConsentField, true>>;

/**
 * The checkout asks for two separate, unticked agreements (since 2026-11-22):
 * one for the automatic-renewal terms on their own, and one for the
 * Subscription Terms with the cancellation and refund policies and the
 * Privacy Notice. Each box's wording names every term it records, so the
 * seven recorded acceptances keep their meaning and the evidence table
 * needs no change.
 */
export const COMMERCIAL_CONSENT_INPUTS = Object.freeze({
  automaticRenewalConsent: Object.freeze(["automaticRenewalAccepted", "trialAccepted", "monthlyPriceAccepted"] as const),
  subscriptionTermsConsent: Object.freeze([
    "subscriptionTermsAccepted",
    "cancellationPolicyAccepted",
    "refundPolicyAccepted",
    "privacyAndTermsAccepted"
  ] as const)
} satisfies Record<string, readonly CommercialConsentField[]>);

export type CommercialConsentInput = keyof typeof COMMERCIAL_CONSENT_INPUTS;

/** The date the two-agreement wording took effect; recorded in release notes and shown nowhere else. */
export const COMMERCIAL_CONSENT_PRESENTATION_VERSION = "2026-11-22";

export function parseCommercialConsentForm(formData: FormData): CommercialConsentDecision | null {
  const inputs = Object.keys(COMMERCIAL_CONSENT_INPUTS) as CommercialConsentInput[];
  if (inputs.some((input) => formData.get(input) !== "accepted")) return null;
  const recorded = inputs.flatMap((input) => COMMERCIAL_CONSENT_INPUTS[input]);
  if (COMMERCIAL_CONSENT_FIELDS.some((field) => !recorded.includes(field))) return null;
  return Object.freeze(Object.fromEntries(COMMERCIAL_CONSENT_FIELDS.map((field) => [field, true]))) as CommercialConsentDecision;
}
