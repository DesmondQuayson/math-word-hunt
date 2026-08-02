import "server-only";

import { createHash } from "node:crypto";

import type { ConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingProvider } from "./consumer-provider";
import type { SupabaseConsumerBillingRepository } from "./consumer-repository";
import { activateConsumerSetupCheckout } from "./consumer-service";
import { safeBillingLog } from "./security";

const EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.deleted"
]);

type Result = Readonly<{ status: number; body: { received: boolean; state: string } }>;

export async function processConsumerBillingWebhook(input: Readonly<{
  payload: string;
  signature: string | null;
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
}>): Promise<Result> {
  if (!input.config.webhookEnabled) return { status: 503, body: { received: false, state: "webhook-disabled" } };
  if (!input.signature) return { status: 400, body: { received: false, state: "invalid-signature" } };
  let event;
  try {
    event = input.provider.constructVerifiedEvent(input.payload, input.signature, input.config.webhookSecret);
  } catch {
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
    return { status: 400, body: { received: false, state: "api-version-mismatch" } };
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
    return { status: 200, body: { received: true, state: receipt.state } };
  }
  try {
    if (!await input.repository.claimEvent(receipt.id)) {
      return { status: 200, body: { received: true, state: "already-processing" } };
    }
  } catch {
    return { status: 503, body: { received: false, state: "database-unavailable" } };
  }

  try {
    let customerId = event.customerId;
    let subscriptionId = event.subscriptionId;
    let session = null;
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
    if ((event.type === "invoice.paid" || event.type === "invoice.payment_failed") &&
      event.objectId) {
      const invoice = await input.provider.retrieveInvoice(event.objectId);
      if (invoice.livemode !== expectedLivemode ||
        (event.type === "invoice.paid" && !invoice.paid) ||
        (event.type === "invoice.payment_failed" && invoice.paid)) {
        await input.repository.finishEvent(receipt.id, "manual_review", "invoice_state_conflict");
        return { status: 200, body: { received: true, state: "manual-review" } };
      }
      customerId = invoice.customerId;
      subscriptionId = invoice.subscriptionId;
    }
    if (event.type === "customer.deleted") {
      if (!event.objectId) throw new Error("missing-customer");
      const mapping = await input.repository.getMappingByCustomer(event.objectId);
      if (!mapping) {
        await input.repository.finishEvent(receipt.id, "manual_review", "invalid_owner");
        return { status: 200, body: { received: true, state: "manual-review" } };
      }
      const state = await input.repository.revokeCustomer(
        receipt.id,
        mapping.ownerUserId,
        event.createdAt
      );
      return { status: 200, body: { received: true, state } };
    }
    if (!customerId || !subscriptionId) {
      await input.repository.finishEvent(receipt.id, "manual_review", "unsupported_payload");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const mapping = await input.repository.getMappingByCustomer(customerId);
    if (!mapping || (event.ownerUserId && event.ownerUserId !== mapping.ownerUserId) ||
      (session?.ownerUserId && session.ownerUserId !== mapping.ownerUserId)) {
      await input.repository.finishEvent(receipt.id, "manual_review", "ownership_conflict");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const [customer, subscription, subscriptions] = await Promise.all([
      input.provider.retrieveCustomer(customerId),
      input.provider.retrieveSubscription(subscriptionId),
      input.provider.listCustomerSubscriptions(customerId)
    ]);
    if (customer.deleted || customer.livemode !== expectedLivemode || customer.ownerUserId !== mapping.ownerUserId ||
      subscription.ownerUserId !== mapping.ownerUserId ||
      subscription.customerId !== customerId ||
      subscription.livemode !== expectedLivemode ||
      subscription.price?.livemode !== expectedLivemode ||
      subscription.quantity !== 1 ||
      !subscription.price ||
      subscription.price.id !== input.config.priceId ||
      subscription.price.productId !== input.config.productId ||
      subscription.price.currency !== "usd" ||
      subscription.price.amountMinorUnits !== 599 ||
      subscription.price.interval !== "month" ||
      subscription.price.intervalCount !== 1 ||
      subscription.price.usageType !== "licensed") {
      await input.repository.finishEvent(receipt.id, "manual_review", "projection_conflict");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const current = subscriptions.filter((candidate) =>
      candidate.status !== "canceled" && candidate.status !== "incomplete_expired"
    );
    if (current.length > 1 || (current.length === 1 && current[0]?.id !== subscription.id)) {
      await input.repository.finishEvent(receipt.id, "manual_review", "duplicate_subscription");
      return { status: 200, body: { received: true, state: "manual-review" } };
    }
    const state = await input.repository.applyProjection({
      eventRecordId: receipt.id,
      eventType: event.type,
      eventCreatedAt: event.createdAt,
      ownerUserId: mapping.ownerUserId,
      customerId,
      subscription,
      graceDays: input.config.renewalGraceDays,
      emergencyDefaultDeny: input.config.emergencyDefaultDeny
    });
    safeBillingLog("consumer-webhook-processed", { state, eventAllowed: true });
    return { status: 200, body: { received: true, state } };
  } catch {
    try {
      await input.repository.finishEvent(receipt.id, "retryable_failure", "provider_unavailable");
    } catch {
      // The processing lease preserves a safe retry path.
    }
    return { status: 503, body: { received: false, state: "retryable-failure" } };
  }
}
