import { normalizeBillingSubscriptionStatus } from "@math-vocabulary-hunt/platform-core";

import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import {
  mutateFixtureSubscription,
  readFixtureSubscription,
  recordFixtureInvoice
} from "@/lib/billing/consumer-fixture-provider";
import type { ConsumerBillingInvoice, ConsumerBillingSubscription } from "@/lib/billing/consumer-models";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = Response.json({ error: "not-found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

const iso = (value: unknown): string | null | undefined =>
  value === null ? null : typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;

/**
 * Lifecycle control for the deterministic local rehearsal ONLY.
 *
 * The fixture provider stands in for Stripe, so a renewal, a failed payment or
 * a cancellation has to be simulated by changing its in-memory state. This
 * route exists solely for that. It answers 404 unless the resolved billing
 * configuration uses the fixture provider, which the configuration parser
 * admits only for a loopback rehearsal in test mode. It cannot mint access:
 * it changes what the pretend provider reports, and the canonical synchronizer
 * still decides what that means.
 */
export async function POST(request: Request) {
  if (!isProductionPlatformMode()) return NOT_FOUND;
  const config = tryGetConsumerBillingConfiguration();
  if (!config || config.provider !== "fixture") return NOT_FOUND;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid-body" }, { status: 400 });
  }
  if (body.action === "read-subscription" && typeof body.subscriptionId === "string") {
    const subscription = readFixtureSubscription(body.subscriptionId);
    return subscription ? Response.json(subscription) : NOT_FOUND;
  }
  if (body.action === "mutate-subscription" && typeof body.subscriptionId === "string" && body.patch && typeof body.patch === "object") {
    const raw = body.patch as Record<string, unknown>;
    const patch: { -readonly [Key in keyof ConsumerBillingSubscription]?: ConsumerBillingSubscription[Key] } = {};
    if ("status" in raw) {
      const status = normalizeBillingSubscriptionStatus(raw.status);
      if (!status && raw.status !== "__unknown__") return Response.json({ error: "invalid-status" }, { status: 400 });
      // "__unknown__" lets a test prove an unrecognized provider status is
      // reviewed, never coerced.
      patch.status = raw.status === "__unknown__" ? null : status;
    }
    for (const key of ["currentPeriodStart", "currentPeriodEnd", "canceledAt", "endedAt", "trialStart", "trialEnd"] as const) {
      if (key in raw) {
        const value = iso(raw[key]);
        if (value === undefined) return Response.json({ error: `invalid-${key}` }, { status: 400 });
        patch[key] = value;
      }
    }
    if ("cancelAtPeriodEnd" in raw) patch.cancelAtPeriodEnd = raw.cancelAtPeriodEnd === true;
    if ("latestInvoiceId" in raw) patch.latestInvoiceId = typeof raw.latestInvoiceId === "string" ? raw.latestInvoiceId : null;
    const subscription = mutateFixtureSubscription(body.subscriptionId, patch);
    return subscription ? Response.json(subscription) : NOT_FOUND;
  }
  if (body.action === "record-invoice" && body.invoice && typeof body.invoice === "object") {
    const raw = body.invoice as Record<string, unknown>;
    if (typeof raw.id !== "string" || !/^in_[A-Za-z0-9]+$/.test(raw.id)) return Response.json({ error: "invalid-invoice" }, { status: 400 });
    const invoice: ConsumerBillingInvoice = {
      id: raw.id,
      customerId: typeof raw.customerId === "string" ? raw.customerId : null,
      subscriptionId: typeof raw.subscriptionId === "string" ? raw.subscriptionId : null,
      livemode: false,
      paid: raw.paid === true,
      status: typeof raw.status === "string" ? raw.status : raw.paid === true ? "paid" : "open",
      paidAt: iso(raw.paidAt) ?? null,
      amountPaidMinorUnits: typeof raw.amountPaidMinorUnits === "number" ? raw.amountPaidMinorUnits : raw.paid === true ? 599 : 0
    };
    return Response.json(recordFixtureInvoice(invoice));
  }
  return Response.json({ error: "unsupported-action" }, { status: 400 });
}
