import "server-only";

import { createHash } from "node:crypto";

import { deriveBillingEntitlement } from "@math-vocabulary-hunt/platform-core";

import type { BillingConfiguration } from "./config";
import { BILLING_EVENT_ALLOWLIST, isAllowlistedBillingEvent } from "./contracts";
import type { BillingProvider } from "./provider";
import type { SupabaseBillingRepository } from "./repository";
import { safeBillingLog } from "./security";
import { validateCustomerOwnership, validateSubscription } from "./validation";

type Result = Readonly<{ status: number; body: { received: boolean; state: string } }>;

export async function processBillingWebhook(input: Readonly<{ payload: string; signature: string | null; config: Extract<BillingConfiguration, { enabled: true }>; provider: BillingProvider; repository: SupabaseBillingRepository }>): Promise<Result> {
  if (!input.config.webhookEnabled) return { status: 503, body: { received: false, state: "webhook-disabled" } };
  if (!input.signature) return { status: 400, body: { received: false, state: "invalid-signature" } };
  let event;
  try { event = input.provider.constructVerifiedEvent(input.payload, input.signature, input.config.webhookSecret); }
  catch { return { status: 400, body: { received: false, state: "invalid-signature" } }; }
  if (event.livemode !== (input.config.stripeMode === "live")) return { status: 400, body: { received: false, state: "environment-mismatch" } };
  if (!isAllowlistedBillingEvent(event.type)) return { status: 200, body: { received: true, state: "ignored" } };
  if (event.apiVersion !== input.config.apiVersion) return { status: 400, body: { received: false, state: "api-version-mismatch" } };

  const hash = createHash("sha256").update(input.payload).digest("hex");
  let receipt;
  try { receipt = await input.repository.registerEvent(event, hash); }
  catch { return { status: 503, body: { received: false, state: "database-unavailable" } }; }
  if (receipt.conflict) return { status: 409, body: { received: false, state: "manual-review" } };
  if (receipt.duplicate && (receipt.state === "processed" || receipt.state === "ignored" || receipt.state === "manual_review")) return { status: 200, body: { received: true, state: receipt.state } };
  try { if (!await input.repository.claimEvent(receipt.id)) return { status: 200, body: { received: true, state: "already-processing" } }; }
  catch { return { status: 503, body: { received: false, state: "database-unavailable" } }; }

  try {
    let customerId = event.customerId;
    let subscriptionId = event.subscriptionId;
    if (event.type === "checkout.session.completed" && event.objectId) {
      const session = await input.provider.retrieveCheckoutSession(event.objectId);
      customerId = session.customerId; subscriptionId = session.subscriptionId;
    }
    if ((event.type === "invoice.paid" || event.type === "invoice.payment_failed") && event.objectId && !subscriptionId) {
      const invoice = await input.provider.retrieveInvoice(event.objectId);
      customerId = invoice.customerId; subscriptionId = invoice.subscriptionId;
    }
    if (!customerId || !subscriptionId) {
      await input.repository.finishEvent(receipt.id, "manual_review", "unsupported_payload");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const mapping = await input.repository.getMappingByCustomer(customerId, input.config.stripeMode);
    if (!mapping) {
      await input.repository.finishEvent(receipt.id, "manual_review", "invalid_owner");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    if (event.ownerReference && event.ownerReference !== mapping.ownerTeacherId) {
      await input.repository.finishEvent(receipt.id, "manual_review", "ownership_conflict");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const [customer, subscription, accountStatus, authoritativeSubscriptions] = await Promise.all([
      input.provider.retrieveCustomer(customerId), input.provider.retrieveSubscription(subscriptionId), input.repository.getOwnerAccountStatus(mapping.ownerTeacherId),
      input.provider.listCustomerSubscriptions(customerId)
    ]);
    if (!validateCustomerOwnership(customer, mapping.ownerTeacherId) || (subscription.ownerReference && subscription.ownerReference !== mapping.ownerTeacherId)) {
      await input.repository.finishEvent(receipt.id, "manual_review", "ownership_conflict");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const planEntry = Object.entries(input.config.priceIds).find(([, priceId]) => priceId === subscription.price?.id);
    if (!planEntry) {
      await input.repository.finishEvent(receipt.id, "manual_review", "unknown_plan");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const planKey = planEntry[0] as "teacher-pro-monthly" | "teacher-pro-annual";
    if (!validateSubscription(subscription, { customerId, planKey, productId: input.config.productId })) {
      await input.repository.finishEvent(receipt.id, "manual_review", "projection_conflict");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const current = authoritativeSubscriptions.filter((candidate) => candidate.status !== "canceled" && candidate.status !== "incomplete_expired");
    if (current.length !== 1 || current[0]?.id !== subscription.id) {
      await input.repository.finishEvent(receipt.id, "manual_review", "duplicate_subscription");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const entitlement = deriveBillingEntitlement({
      accountStatus: accountStatus === "deletion_requested" ? "deletion-requested" : accountStatus === "active" || accountStatus === "suspended" ? accountStatus : "closed",
      planKey, planApproved: true, environmentMatches: true, subscriptionStatus: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd, duplicateActiveSubscriptions: current.length > 1,
      emergencyDefaultDeny: input.config.emergencyDefaultDeny
    });
    const projection = await input.repository.applyProjection({ eventRecordId: receipt.id, eventCreatedAt: event.createdAt, ownerTeacherId: mapping.ownerTeacherId, environment: input.config.stripeMode, customerId, subscription, planKey, eligible: entitlement.access === "allow" });
    if (projection === "stale_ignored") return { status: 200, body: { received: true, state: "stale-ignored" } };
    safeBillingLog("webhook-processed", { status: entitlement.access, eventTypeAllowed: BILLING_EVENT_ALLOWLIST.includes(event.type as never) });
    return { status: 200, body: { received: true, state: entitlement.access === "allow" ? "active" : "denied" } };
  } catch {
    try { await input.repository.finishEvent(receipt.id, "retryable_failure", "provider_unavailable"); } catch { /* original failure remains retryable by lease */ }
    return { status: 503, body: { received: false, state: "retryable-failure" } };
  }
}
