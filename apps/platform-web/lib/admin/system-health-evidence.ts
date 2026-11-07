import "server-only";

import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";

import { EMAIL_WINDOW_DAYS, WEBHOOK_WINDOW_DAYS, type QuarantinedFileEvidence, type SystemHealthEvidence } from "./system-health";

/**
 * The evidence behind the Super Admin "System health" rows (lib/admin/system-health.ts), read with the service role on
 * the server only. The Overview panel and the Analytics and Settings evidence pages read the same evidence, so they
 * cannot disagree. Every read is bounded (a window, an open-state filter or a small key list), and a read that fails
 * leaves its row "unavailable" instead of guessing. Stripe object ids are read only to match a review record to later
 * evidence; they never leave this module's evidence object (the evaluated report carries no identifiers).
 */

type ServiceClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
type Row = Record<string, unknown>;

const DAY = 86_400_000;
const text = (value: unknown): string => typeof value === "string" ? value : "";
const nullableText = (value: unknown): string | null => typeof value === "string" && value ? value : null;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];

/** The receipt states that can still need work; the processing-state CHECK allows no other open state. */
const OPEN_WEBHOOK_STATES = ["manual_review", "retryable_failure", "received", "processing"] as const;

export function unavailableSystemHealthEvidence(now: Date): SystemHealthEvidence {
  return { now, database: "unavailable", email: null, webhooks: null, reconciliation: null, storage: null, packages: null, pdfQuarantine: null, zipQuarantine: null };
}

async function loadEmailEvidence(client: ServiceClient, now: Date): Promise<SystemHealthEvidence["email"]> {
  // Three windows of history, so a failure can be matched to a later delivery
  // and "last confirmed" can be shown even when the window itself is quiet.
  const since = new Date(now.getTime() - 3 * EMAIL_WINDOW_DAYS * DAY).toISOString();
  const [signals, confirmations, signups] = await Promise.all([
    client.from("platform_analytics_events").select("metric_key,outcome,occurred_at,quantity").like("metric_key", "email-%").gte("occurred_at", since),
    client.from("consumer_accounts").select("created_at,email_confirmed_at").gte("email_confirmed_at", since),
    client.from("consumer_accounts").select("created_at,email_confirmed_at").gte("created_at", since)
  ]);
  if (signals.error || confirmations.error || signups.error) return null;
  return {
    signals: rows(signals.data).map((row) => ({ metricKey: text(row.metric_key), outcome: text(row.outcome), occurredAt: text(row.occurred_at), quantity: Number(row.quantity) || 1 })),
    confirmations: rows(confirmations.data).map((row) => ({ createdAt: text(row.created_at), emailConfirmedAt: text(row.email_confirmed_at) })),
    signups: rows(signups.data).map((row) => ({ createdAt: text(row.created_at), emailConfirmedAt: nullableText(row.email_confirmed_at) }))
  };
}

async function loadWebhookEvidence(client: ServiceClient, now: Date): Promise<SystemHealthEvidence["webhooks"]> {
  const since = new Date(now.getTime() - WEBHOOK_WINDOW_DAYS * DAY).toISOString();
  const [total, recent, handled, open] = await Promise.all([
    client.from("billing_webhook_events").select("id", { count: "exact", head: true }),
    client.from("billing_webhook_events").select("processing_state,received_at,processed_at").gte("received_at", since),
    client.from("billing_webhook_events").select("received_at,processed_at").in("processing_state", ["processed", "ignored"]).order("received_at", { ascending: false }).limit(1),
    // Retryable failures, stopped processing attempts and never-claimed receipts are included: the pre-2026-11 panel
    // never counted them. `failed` is not a state the ledger can hold (the processing-state CHECK refuses it).
    client.from("billing_webhook_events")
      .select("event_type,processing_state,failure_class,stripe_environment,stripe_object_id,event_created_at,received_at,last_attempt_at,lease_expires_at")
      .in("processing_state", [...OPEN_WEBHOOK_STATES]).order("received_at", { ascending: true }).limit(200)
  ]);
  if (total.error || recent.error || handled.error || open.error) return null;
  const openRows = rows(open.data);
  const objectKeys = [...new Set(openRows.map((row) => text(row.stripe_object_id)).filter(Boolean))];
  const subscriptionKeys = objectKeys.filter((key) => key.startsWith("sub_"));
  const [processed, projections] = await Promise.all([
    objectKeys.length
      ? client.from("billing_webhook_events").select("stripe_environment,stripe_object_id,event_created_at").eq("processing_state", "processed").in("stripe_object_id", objectKeys)
      : Promise.resolve({ data: [], error: null }),
    subscriptionKeys.length
      ? client.from("billing_subscriptions").select("stripe_environment,stripe_subscription_id,last_synchronized_at,latest_authoritative_event_created_at").in("stripe_subscription_id", subscriptionKeys)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (processed.error || projections.error) return null;
  const latestHandled = rows(handled.data)[0];
  return {
    totalEvents: total.count ?? 0,
    recent: rows(recent.data).map((row) => ({ state: text(row.processing_state), receivedAt: text(row.received_at), processedAt: nullableText(row.processed_at) })),
    lastHandledAt: latestHandled ? nullableText(latestHandled.processed_at) ?? nullableText(latestHandled.received_at) : null,
    open: openRows.map((row) => ({
      eventType: text(row.event_type), state: text(row.processing_state), failureClass: nullableText(row.failure_class),
      environment: text(row.stripe_environment), objectKey: nullableText(row.stripe_object_id), eventCreatedAt: text(row.event_created_at),
      receivedAt: text(row.received_at), lastAttemptAt: nullableText(row.last_attempt_at), leaseExpiresAt: nullableText(row.lease_expires_at)
    })),
    laterProcessed: rows(processed.data).map((row) => ({ environment: text(row.stripe_environment), objectKey: text(row.stripe_object_id), at: text(row.event_created_at) })),
    projections: rows(projections.data).filter((row) => row.last_synchronized_at).map((row) => ({
      environment: text(row.stripe_environment), objectKey: text(row.stripe_subscription_id),
      synchronizedAt: text(row.last_synchronized_at), authoritativeAt: text(row.latest_authoritative_event_created_at)
    }))
  };
}

async function loadPdfQuarantineEvidence(client: ServiceClient): Promise<readonly QuarantinedFileEvidence[] | null> {
  const files = await client.from("resource_files").select("resource_id,file_role,quarantined_at").eq("validation_state", "quarantined");
  if (files.error) return null;
  const quarantined = rows(files.data);
  const resourceIds = [...new Set(quarantined.map((row) => text(row.resource_id)).filter(Boolean))];
  if (resourceIds.length === 0) return [];
  const [resources, accepted] = await Promise.all([
    client.from("content_resources").select("id,publication_state").in("id", resourceIds),
    client.from("resource_files").select("resource_id,file_role,created_at").eq("validation_state", "accepted").in("resource_id", resourceIds)
  ]);
  if (resources.error || accepted.error) return null;
  const stateById = new Map(rows(resources.data).map((row) => [text(row.id), text(row.publication_state)]));
  const acceptedRows = rows(accepted.data);
  return quarantined.map((row) => {
    const resourceId = text(row.resource_id);
    const role = text(row.file_role);
    const quarantinedAt = text(row.quarantined_at);
    return {
      role, quarantinedAt, resourceState: stateById.get(resourceId) ?? null,
      // Only an accepted upload made after the rejected one replaces it.
      replaced: acceptedRows.some((file) => text(file.resource_id) === resourceId && text(file.file_role) === role && Date.parse(text(file.created_at)) > Date.parse(quarantinedAt))
    };
  });
}

/** Reads every piece of System health evidence in parallel; a section that cannot be read is null. */
export async function loadSystemHealthEvidence(client: ServiceClient, now: Date, database: SystemHealthEvidence["database"]): Promise<SystemHealthEvidence> {
  if (database === "unavailable") return unavailableSystemHealthEvidence(now);
  const [email, webhooks, subscriptions, buckets, packages, pdfQuarantine, zipQuarantine] = await Promise.all([
    loadEmailEvidence(client, now).catch(() => null),
    loadWebhookEvidence(client, now).catch(() => null),
    client.from("billing_subscriptions").select("subscription_status,last_synchronized_at,last_synchronization_source").not("owner_consumer_id", "is", null),
    client.storage.listBuckets(),
    client.from("game_packages").select("publication_state"),
    loadPdfQuarantineEvidence(client).catch(() => null),
    client.from("game_package_quarantine_events").select("created_at")
  ]);
  return {
    now, database, email, webhooks,
    reconciliation: subscriptions.error ? null : {
      expected: isProductionPlatformMode(),
      subscriptions: rows(subscriptions.data).map((row) => ({ status: text(row.subscription_status), lastSynchronizedAt: nullableText(row.last_synchronized_at), source: nullableText(row.last_synchronization_source) }))
    },
    storage: buckets.error ? null : { buckets: (buckets.data ?? []).map((bucket) => bucket.id) },
    packages: packages.error ? null : { states: rows(packages.data).map((row) => text(row.publication_state)) },
    pdfQuarantine: pdfQuarantine === null ? null : { files: pdfQuarantine },
    zipQuarantine: zipQuarantine.error ? null : { events: rows(zipQuarantine.data).map((row) => ({ createdAt: text(row.created_at) })) }
  };
}
