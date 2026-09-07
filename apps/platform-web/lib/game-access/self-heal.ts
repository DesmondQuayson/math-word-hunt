import { MATHNEXA_ALL_ACCESS, parseGameEntitlementEvidence, type GameAccessDecision } from "@math-vocabulary-hunt/platform-core";

/**
 * The repository hands the gate the all-access envelope
 * (`{ capabilityKey, entitlement }`); the classification looks at the
 * entitlement inside it. A bare entitlement is accepted too.
 */
function unwrapEvidence(evidence: unknown): unknown {
  if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
    const envelope = evidence as { capabilityKey?: unknown; entitlement?: unknown };
    if (envelope.capabilityKey === MATHNEXA_ALL_ACCESS && "entitlement" in envelope) return envelope.entitlement;
  }
  return evidence;
}

/**
 * Why a denied decision should be confirmed with the billing provider before
 * it is shown to the customer.
 *
 *   clock-expired      The stored evidence said access was valid and only the
 *                      server clock passing the stored boundary made it a
 *                      denial. This is exactly what a missed renewal looks like
 *                      locally, so it MUST be confirmed with Stripe before the
 *                      customer is told anything ended.
 *   denied-recoverable The stored evidence already denies (past due, expired,
 *                      trial ended, nothing on file) but the provider may have
 *                      moved on: a recovered payment, a renewal, a new
 *                      subscription whose events never arrived.
 *   null               Nothing a provider re-check could change.
 */
export type EntitlementVerificationReason = "clock-expired" | "denied-recoverable";

const RECOVERABLE_DENIALS = new Set(["subscription-past-due", "subscription-expired", "trial-expired", "no-entitlement"]);

export function classifyEntitlementVerification(input: Readonly<{
  evidence: unknown;
  decision: GameAccessDecision;
  nowMs: number;
}>): EntitlementVerificationReason | null {
  if (input.decision.allowed) return null;
  const evidence = parseGameEntitlementEvidence(unwrapEvidence(input.evidence));
  if (!evidence) return null;
  switch (evidence.state) {
    case "subscription-active":
    case "subscription-canceled-through-period-end":
      return Date.parse(evidence.periodEndsAt) <= input.nowMs ? "clock-expired" : null;
    case "subscription-grace-period":
      return Date.parse(evidence.graceEndsAt) <= input.nowMs ? "clock-expired" : null;
    case "trial-active":
      return Date.parse(evidence.endsAt) <= input.nowMs ? "clock-expired" : null;
    default:
      return RECOVERABLE_DENIALS.has(evidence.state) ? "denied-recoverable" : null;
  }
}

/**
 * After a verification attempt for a clock-expired record: was the record
 * confirmed recently enough that the stored denial is trustworthy? When the
 * provider could not be reached and nothing confirmed the record inside the
 * throttle window, the honest answer is "could not verify", not "ended".
 */
export function verifiedRecently(lastSynchronizedAt: string | null, nowMs: number, windowSeconds: number): boolean {
  if (!lastSynchronizedAt) return false;
  const synchronized = Date.parse(lastSynchronizedAt);
  return Number.isFinite(synchronized) && nowMs - synchronized <= windowSeconds * 1000;
}
