import "server-only";
import { recordSecurityEvent } from "@/lib/observability/security-events";

import { createHash } from "node:crypto";

import { isTerminalConsumerSubscriptionStatus } from "@math-vocabulary-hunt/platform-core";

import type { ConsumerBillingConfiguration } from "./consumer-config";
import { emitBillingLifecycleEvent, redactProviderReference } from "./consumer-observability";
import type { ConsumerBillingProvider } from "./consumer-provider";
import type { SupabaseConsumerBillingRepository } from "./consumer-repository";
import { activateConsumerSetupCheckout } from "./consumer-service";
import { synchronizeCustomerSubscriptions, validateAuthoritativeSubscription } from "./consumer-synchronizer";
import { safeBillingLog } from "./security";

/**
 * Events this endpoint acts on. Everything else is acknowledged and ignored.
 * `invoice.payment_succeeded` is the older name of `invoice.paid`; endpoints
 * configured with either (or both) converge on the same renewal handling.
 */
const EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.deleted"
]);

const INVOICE_PAID_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded"]);

type Result = Readonly<{ status: number; body: { received: boolean; state: string } }>;

export async function processConsumerBillingWebhook(input: Readonly<{
  payload: string;
  signature: string | null;
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
}>): Promise<Result> {
  if (!input.config.webhookEnabled) return { status: 503, body: { received: false, state: "webhook-disabled" } };
  if (!input.signature) {
    await recordSecurityEvent("WEBHOOK_SIGNATURE_INVALID", { reason: "absent" });
    return { status: 400, body: { received: false, state: "invalid-signature" } };
  }
  let event;
  try {
    event = input.provider.constructVerifiedEvent(input.payload, input.signature, input.config.webhookSecret);
  } catch {
    // The payload and signature are never recorded, only the refusal.
    await recordSecurityEvent("WEBHOOK_SIGNATURE_INVALID", { reason: "verification-failed" });
    return { status: 400, body: { received: false, state: "invalid-signature" } };
  }
  const expectedLivemode = input.config.stripeMode === "live";
  if (event.livemode !== expectedLivemode) {
    return {
      status: 400,
      body: { received: false, state: expectedLivemode ? "test-event-rejected" : "live-event-rejected" }
    };
  }
  if (!EVENTS.has(event.type)) return { status: 200, body: { received: true, state: "ignored" } };
  if (event.apiVersion !== input.config.apiVersion) {
    // Formerly a hard 400, which turned an endpoint pinned to another API
    // version into a permanent, silent renewal-sync outage. Nothing below reads
    // version-sensitive payload fields — every authoritative object is
    // re-fetched with the SDK's pinned version — so the drift is reported and
    // processing continues.
    emitBillingLifecycleEvent("WEBHOOK_API_VERSION_DRIFT", {
      eventType: event.type,
      receivedVersion: event.apiVersion,
      expectedVersion: input.config.apiVersion
    }, event.id);
  }

  let receipt;
  try {
    receipt = await input.repository.registerEvent(
      event,
      createHash("sha256").update(input.payload).digest("hex")
    );
  } catch {
    return { status: 503, body: { received: false, state: "database-unavailable" } };
  }
  if (receipt.conflict) return { status: 409, body: { received: false, state: "manual-review" } };
  if (receipt.duplicate && ["processed", "ignored", "manual_review"].includes(receipt.state)) {
    // Idempotency already refuses this; the event makes a replay attempt visible
    // instead of it being silently absorbed.
    await recordSecurityEvent("WEBHOOK_REPLAY_DETECTED", { state: receipt.state });
    return { status: 200, body: { received: true, state: receipt.state } };
  }
  try {
    if (!await input.repository.claimEvent(receipt.id)) {
      return { status: 200, body: { received: true, state: "already-processing" } };
    }
  } catch {
    return { status: 503, body: { received: false, state: "database-unavailable" } };
  }

  const review = async (failureClass: string): Promise<Result> => {
    await input.repository.finishEvent(receipt.id, "manual_review", failureClass);
    emitBillingLifecycleEvent("WEBHOOK_MANUAL_REVIEW", {
      eventType: event.type,
      objectSuffix: redactProviderReference(event.objectId),
      failureClass,
      retryable: false
    }, event.id);
    return { status: 200, body: { received: true, state: "manual-review" } };
  };

  try {
    let customerId = event.customerId;
    let subscriptionId = event.subscriptionId;
    let session = null;
    let invoice = null;
    if (event.type === "checkout.session.completed" && event.objectId) {
      session = await input.provider.retrieveSetupCheckout(event.objectId);
      customerId = session.customerId;
      const activated = await activateConsumerSetupCheckout({
        session,
        eventCreatedAt: event.createdAt,
        config: input.config,
        provider: input.provider,
        repository: input.repository
      });
      subscriptionId = activated.id;
    }
    if ((INVOICE_PAID_EVENTS.has(event.type) || event.type === "invoice.payment_failed") && event.objectId) {
      invoice = await input.provider.retrieveInvoice(event.objectId);
      if (invoice.livemode !== expectedLivemode ||
        (INVOICE_PAID_EVENTS.has(event.type) && !invoice.paid) ||
        (event.type === "invoice.payment_failed" && invoice.paid)) {
        return review("invoice_state_conflict");
      }
      customerId = invoice.customerId;
      subscriptionId = invoice.subscriptionId;
    }
    if (event.type === "customer.deleted") {
      if (!event.objectId) throw new Error("missing-customer");
      const mapping = await input.repository.getMappingByCustomer(event.objectId);
      if (!mapping) return review("invalid_owner");
      const state = await input.repository.revokeCustomer(
        receipt.id,
        mapping.ownerUserId,
        event.createdAt
      );
      return { status: 200, body: { received: true, state } };
    }
    if (!customerId || !subscriptionId) return review("unsupported_payload");
    const mapping = await input.repository.getMappingByCustomer(customerId);
    if (!mapping || (event.ownerUserId && event.ownerUserId !== mapping.ownerUserId) ||
      (session?.ownerUserId && session.ownerUserId !== mapping.ownerUserId)) {
      return review("ownership_conflict");
    }
    const [customer, subscription, subscriptions] = await Promise.all([
      input.provider.retrieveCustomer(customerId),
      input.provider.retrieveSubscription(subscriptionId),
      input.provider.listCustomerSubscriptions(customerId)
    ]);
    const failure = validateAuthoritativeSubscription({
      subscription, customer, ownerUserId: mapping.ownerUserId, customerId, config: input.config
    });
    if (failure) {
      if (failure === "unknown_subscription_status") {
        emitBillingLifecycleEvent("SUBSCRIPTION_STATUS_UNKNOWN", {
          eventType: event.type, subscriptionSuffix: redactProviderReference(subscription.id), source: "webhook"
        }, event.id);
      }
      return review(failure);
    }
    const live = subscriptions.filter((candidate) => !isTerminalConsumerSubscriptionStatus(candidate.status));
    if (live.length > 1) return review("duplicate_subscription");

    const canonicalType = INVOICE_PAID_EVENTS.has(event.type) ? "invoice.paid" : event.type;
    const result = await synchronizeCustomerSubscriptions({
      source: "webhook",
      ownerUserId: mapping.ownerUserId,
      customerId,
      customer,
      subscriptions,
      primary: { subscription, eventRecordId: receipt.id, eventType: canonicalType, observedAt: event.createdAt },
      latestInvoice: invoice,
      config: input.config,
      repository: input.repository,
      correlationId: event.id
    });
    if (result.state === null) return review(result.skipped[subscription.id] ?? "projection_conflict");
    safeBillingLog("consumer-webhook-processed", { state: result.state, eventAllowed: true });
    return { status: 200, body: { received: true, state: result.state } };
  } catch {
    emitBillingLifecycleEvent("WEBHOOK_PROCESSING_FAILED", {
      eventType: event.type,
      objectSuffix: redactProviderReference(event.objectId),
      failureClass: "provider_unavailable",
      retryable: true
    }, event.id);
    try {
      await input.repository.finishEvent(receipt.id, "retryable_failure", "provider_unavailable");
    } catch {
      // The processing lease preserves a safe retry path.
    }
    return { status: 503, body: { received: false, state: "retryable-failure" } };
  }
}
