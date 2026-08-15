export const ADMIN_ACCOUNT_OPERATIONS = [
  "resend-confirmation", "revoke-sessions", "suspend", "restore",
  "open-portal", "cancel-at-period-end", "submit-refund-review", "deny-refund-review",
  "grant-complimentary", "remove-complimentary", "emergency-revoke"
] as const;

export type AdminAccountOperation = (typeof ADMIN_ACCOUNT_OPERATIONS)[number];

export const HIGH_RISK_ADMIN_ACCOUNT_OPERATIONS: readonly AdminAccountOperation[] = [
  "revoke-sessions", "suspend", "restore", "deny-refund-review",
  "grant-complimentary", "remove-complimentary", "emergency-revoke"
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{16,160}$/;

export type AdminAccountActionInput = Readonly<{
  operation: AdminAccountOperation;
  targetUserId: string;
  idempotencyKey: string;
  reason: string | null;
  durationDays: number | null;
  refundRequestId: string | null;
}>;

export function parseAdminAccountAction(input: Readonly<Record<string, unknown>>): AdminAccountActionInput | null {
  const operation = typeof input.operation === "string" && ADMIN_ACCOUNT_OPERATIONS.includes(input.operation as AdminAccountOperation)
    ? input.operation as AdminAccountOperation : null;
  const targetUserId = typeof input.targetUserId === "string" && UUID.test(input.targetUserId) ? input.targetUserId : null;
  const idempotencyKey = typeof input.idempotencyKey === "string" && IDEMPOTENCY_KEY.test(input.idempotencyKey)
    ? input.idempotencyKey : null;
  if (!operation || !targetUserId || !idempotencyKey) return null;

  const rawReason = typeof input.reason === "string" ? input.reason.trim() : "";
  const reason = rawReason ? rawReason : null;
  if (reason && (reason.length < 3 || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason))) return null;
  if (HIGH_RISK_ADMIN_ACCOUNT_OPERATIONS.includes(operation) && !reason) return null;

  const durationDays = operation === "grant-complimentary" && typeof input.durationDays === "string" && /^\d{1,2}$/.test(input.durationDays)
    ? Number(input.durationDays) : null;
  if (operation === "grant-complimentary" && (!durationDays || durationDays < 1 || durationDays > 90)) return null;

  const refundRequestId = typeof input.refundRequestId === "string" && UUID.test(input.refundRequestId)
    ? input.refundRequestId : null;
  if (operation === "deny-refund-review" && !refundRequestId) return null;
  return Object.freeze({ operation, targetUserId, idempotencyKey, reason, durationDays, refundRequestId });
}
