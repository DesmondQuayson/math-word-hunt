export const BILLING_UI_STATES = [
  "free", "pro-active", "pro-trialing", "payment-issue", "canceling",
  "canceled", "setup-unavailable", "account-suspended", "deletion-requested",
  "temporarily-unavailable", "manual-review"
] as const;
export type BillingUiState = (typeof BILLING_UI_STATES)[number];

export type BillingUiCopy = Readonly<{ heading: string; message: string; tone: "neutral" | "success" | "warning" }>;

export const BILLING_UI_COPY: Readonly<Record<BillingUiState, BillingUiCopy>> = Object.freeze({
  free: { heading: "Free account", message: "Premium teacher features are not active.", tone: "neutral" },
  "pro-active": { heading: "Teacher Pro active", message: "Your approved Teacher Pro features are available.", tone: "success" },
  "pro-trialing": { heading: "Teacher Pro trial", message: "Trial access is available only when a trial has been approved.", tone: "neutral" },
  "payment-issue": { heading: "Payment needs attention", message: "Premium access is paused while billing is resolved.", tone: "warning" },
  canceling: { heading: "Subscription ending", message: "Access continues through the confirmed billing-period end.", tone: "warning" },
  canceled: { heading: "Subscription ended", message: "Premium teacher features are no longer active.", tone: "neutral" },
  "setup-unavailable": { heading: "Billing setup unavailable", message: "Billing has not been enabled for this environment.", tone: "neutral" },
  "account-suspended": { heading: "Account suspended", message: "Billing management and premium access are unavailable. Contact support.", tone: "warning" },
  "deletion-requested": { heading: "Deletion request pending", message: "New purchases and premium access are unavailable. Billing cancellation requires support.", tone: "warning" },
  "temporarily-unavailable": { heading: "Billing temporarily unavailable", message: "We cannot confirm billing status right now. Access remains safely limited.", tone: "warning" },
  "manual-review": { heading: "Billing review needed", message: "Your billing record needs support review before access can change.", tone: "warning" }
});
