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

export function parseCommercialConsentForm(formData: FormData): CommercialConsentDecision | null {
  const values = Object.fromEntries(COMMERCIAL_CONSENT_FIELDS.map((field) => [field, formData.get(field)]));
  if (COMMERCIAL_CONSENT_FIELDS.some((field) => values[field] !== "accepted")) return null;
  return Object.freeze(Object.fromEntries(COMMERCIAL_CONSENT_FIELDS.map((field) => [field, true]))) as CommercialConsentDecision;
}
