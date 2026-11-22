import "server-only";

import type { ConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingSubscription } from "./consumer-models";
import { emitBillingLifecycleEvent, redactProviderReference } from "./consumer-observability";
import { renderSubscriptionConfirmation, type ConfirmationKind } from "./subscription-confirmation-template";

/**
 * Sends the subscription confirmation (trial started, or paid subscription
 * started) once per subscription, after the webhook has answered Stripe.
 *
 * Off unless MVH_BILLING_EMAILS=enabled and a Resend key is present. Sending
 * never throws and never changes billing or access: a failure is logged
 * (without the address) and the subscription carries on. Resend's
 * Idempotency-Key, derived from the subscription id, makes a retried webhook
 * send nothing new.
 */

export const RESEND_API_BASE_URL = "https://api.resend.com";
const DEFAULT_FROM = "MathNexa <billing@auth.mathnexa.com>";
const SEND_TIMEOUT_MS = 8_000;

export type BillingEmailConfiguration = Readonly<{ apiKey: string; from: string; apiBaseUrl: string }>;
type Source = Readonly<Record<string, string | undefined>>;

const LOOPBACK = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;
const SENDER = /^[A-Za-z0-9 .'-]{1,60} <[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}>$/;

/**
 * The switch, the key, the sender and the provider address. The provider is
 * Resend itself, or a loopback address for local capture in browser tests, and
 * nothing else, so a mistaken setting cannot send customer email elsewhere.
 */
export function parseBillingEmailConfiguration(source: Source = process.env): BillingEmailConfiguration | null {
  if (source.MVH_BILLING_EMAILS?.trim() !== "enabled") return null;
  const apiKey = source.RESEND_API_KEY?.trim() ?? "";
  if (!/^re_[A-Za-z0-9_]{16,}$/.test(apiKey)) return null;
  const from = source.MVH_BILLING_EMAIL_FROM?.trim() || DEFAULT_FROM;
  if (!SENDER.test(from)) return null;
  const apiBaseUrl = (source.MVH_EMAIL_API_BASE_URL?.trim() || RESEND_API_BASE_URL).replace(/\/$/, "");
  if (apiBaseUrl !== RESEND_API_BASE_URL && !LOOPBACK.test(apiBaseUrl)) return null;
  return Object.freeze({ apiKey, from, apiBaseUrl });
}

/** Which confirmation a subscription gets, if any: a running trial, or a paid subscription that started without one. */
export function confirmationKind(subscription: ConsumerBillingSubscription): ConfirmationKind | null {
  if (subscription.status === "trialing" && subscription.trialStart && subscription.trialEnd) return "trial";
  if (subscription.status === "active" && !subscription.trialEnd) return "subscription";
  return null;
}

export type ConfirmationOutcome = "sent" | "skipped" | "failed";

type Dependencies = Readonly<{
  fetch: typeof fetch;
  recipientFor: (ownerUserId: string) => Promise<string | null>;
  source: Source;
}>;

async function defaultRecipient(ownerUserId: string): Promise<string | null> {
  const { createServiceSupabaseClient } = await import("@/lib/supabase/service");
  const client = createServiceSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.admin.getUserById(ownerUserId);
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  return data.user.email;
}

export async function sendSubscriptionConfirmationEmail(
  input: Readonly<{ ownerUserId: string; subscription: ConsumerBillingSubscription; config: ConsumerBillingConfiguration; correlationId: string }>,
  dependencies: Partial<Dependencies> = {}
): Promise<ConfirmationOutcome> {
  const deps: Dependencies = { fetch: globalThis.fetch.bind(globalThis), recipientFor: defaultRecipient, source: process.env, ...dependencies };
  const subscriptionSuffix = redactProviderReference(input.subscription.id);
  const report = (outcome: ConfirmationOutcome, reason: string, kind: ConfirmationKind | null) => {
    emitBillingLifecycleEvent(outcome === "sent" ? "CONFIRMATION_EMAIL_SENT" : outcome === "skipped" ? "CONFIRMATION_EMAIL_SKIPPED" : "CONFIRMATION_EMAIL_FAILED",
      { kind, reason, subscriptionSuffix }, input.correlationId);
    return outcome;
  };
  try {
    const kind = confirmationKind(input.subscription);
    if (!kind) return report("skipped", "not-confirmable", null);
    const settings = parseBillingEmailConfiguration(deps.source);
    if (!settings) return report("skipped", "disabled", kind);
    const recipient = await deps.recipientFor(input.ownerUserId);
    if (!recipient) return report("skipped", "no-confirmed-address", kind);
    const message = renderSubscriptionConfirmation({
      kind,
      startedAt: (kind === "trial" ? input.subscription.trialStart : input.subscription.currentPeriodStart) ?? new Date().toISOString(),
      trialEndsAt: kind === "trial" ? input.subscription.trialEnd : null,
      applicationOrigin: input.config.applicationBaseUrl,
      supportEmail: input.config.supportEmail
    });
    if (!message) return report("failed", "render-refused", kind);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const response = await deps.fetch(`${settings.apiBaseUrl}/emails`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `mathnexa-subscription-confirmation/${input.subscription.id}`
        },
        body: JSON.stringify({
          from: settings.from,
          to: [recipient],
          ...(input.config.supportEmail ? { reply_to: input.config.supportEmail } : {}),
          subject: message.subject,
          text: message.text,
          html: message.html
        })
      });
      return response.ok ? report("sent", "accepted", kind) : report("failed", `provider-${response.status}`, kind);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return report("failed", "unavailable", null);
  }
}
