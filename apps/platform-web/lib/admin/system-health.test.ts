import { describe, expect, it } from "vitest";

import {
  EMAIL_DEGRADED_FAILURES,
  EMAIL_UNCONFIRMED_SIGNUPS_ATTENTION,
  REQUIRED_PRIVATE_BUCKETS,
  SIGNUP_CONFIRMATION_GRACE_MINUTES,
  WEBHOOK_UNCLAIMED_MINUTES,
  aggregateApplication,
  evaluateEmail,
  evaluatePackages,
  evaluateReconciliation,
  evaluateStorage,
  evaluateSystemHealth,
  evaluatePdfQuarantine,
  evaluateWebhooks,
  healthTone,
  summarizeWebhookQueue,
  type HealthSignal,
  type SystemHealthEvidence
} from "./system-health";

const now = new Date("2026-10-07T04:30:00.000Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const daysAgo = (days: number) => ago(days * 24);

/** Every row positively verified. Individual tests override one section. */
function healthy(overrides: Partial<SystemHealthEvidence> = {}): SystemHealthEvidence {
  return {
    now,
    database: "reachable",
    email: {
      signals: [{ metricKey: "email-recovery-success", outcome: "success", occurredAt: daysAgo(2), quantity: 1 }],
      confirmations: [{ createdAt: ago(30), emailConfirmedAt: ago(29.9) }], signups: []
    },
    webhooks: {
      totalEvents: 20,
      recent: [{ state: "processed", receivedAt: daysAgo(1), processedAt: daysAgo(1) }],
      lastHandledAt: daysAgo(1),
      open: [],
      laterProcessed: [],
      projections: []
    },
    reconciliation: { expected: true, subscriptions: [{ status: "active", lastSynchronizedAt: ago(20), source: "reconciliation" }] },
    storage: { buckets: [...REQUIRED_PRIVATE_BUCKETS, "cms-media"] },
    packages: { states: ["published"] },
    pdfQuarantine: { files: [] },
    zipQuarantine: { events: [] },
    ...overrides
  };
}

const manualReview = (overrides: Partial<SystemHealthEvidence["webhooks"] & object> = {}) => ({
  totalEvents: 26,
  recent: [
    { state: "processed", receivedAt: daysAgo(1), processedAt: daysAgo(1) },
    { state: "manual_review", receivedAt: daysAgo(9), processedAt: null }
  ],
  lastHandledAt: daysAgo(1),
  open: [{
    eventType: "customer.subscription.created", state: "manual_review", failureClass: "trial_shape_conflict", environment: "live", leaseExpiresAt: null,
    objectKey: "sub_1ProductionLikeKey", eventCreatedAt: daysAgo(9), receivedAt: daysAgo(9), lastAttemptAt: daysAgo(9)
  }],
  laterProcessed: [],
  projections: [],
  ...overrides
});

describe("email health", () => {
  it("is healthy only when delivery is positively verified inside the window", () => {
    const signal = evaluateEmail(healthy());
    expect(signal.state).toBe("healthy");
    expect(signal.lastSuccessAt).toBe(ago(29.9));
  });

  it("treats an account confirming its emailed link as proof of delivery", () => {
    const signal = evaluateEmail(healthy({ email: { signals: [], confirmations: [{ createdAt: daysAgo(3), emailConfirmedAt: ago(71) }], signups: [] } }));
    expect(signal.state).toBe("healthy");
    expect(signal.details.join(" ")).toContain("1 account confirmed an emailed link");
  });

  it("does not count an automatic confirmation at sign-up as delivery evidence", () => {
    const created = daysAgo(3);
    const signal = evaluateEmail(healthy({ email: { signals: [], confirmations: [{ createdAt: created, emailConfirmedAt: new Date(Date.parse(created) + 2_000).toISOString() }], signups: [] } }));
    expect(signal.state).toBe("no-recent-signal");
  });

  it("reports no recent signal, not healthy, when the last evidence is stale", () => {
    const signal = evaluateEmail(healthy({ email: { signals: [{ metricKey: "email-confirmation-success", outcome: "success", occurredAt: daysAgo(45), quantity: 1 }], confirmations: [], signups: [] } }));
    expect(signal.state).toBe("no-recent-signal");
    expect(signal.reason).toMatch(/last confirmed delivery was/);
    expect(signal.reason).toMatch(/not a failure/);
  });

  it("reports no recent signal when nothing was ever recorded", () => {
    const signal = evaluateEmail(healthy({ email: { signals: [], confirmations: [], signups: [] } }));
    expect(signal.state).toBe("no-recent-signal");
    expect(signal.lastSuccessAt).toBeNull();
    expect(signal.reason).toMatch(/No email delivery has been recorded yet/);
  });

  it("is healthy when a failed send was followed by a confirmed delivery (the production case)", () => {
    const failedAt = "2026-10-04T21:45:14.964Z";
    const signal = evaluateEmail(healthy({
      email: {
        signals: [
          { metricKey: "email-confirmation-success", outcome: "success", occurredAt: "2026-09-28T13:42:49.067Z", quantity: 1 },
          { metricKey: "email-confirmation-failure", outcome: "failure", occurredAt: failedAt, quantity: 1 }
        ],
        confirmations: [{ createdAt: "2026-10-04T21:45:07.567Z", emailConfirmedAt: "2026-10-04T21:45:50.075Z" }], signups: []
      }
    }));
    expect(signal.state).toBe("healthy");
    expect(signal.lastFailureAt).toBe(failedAt);
    expect(signal.details.join(" ")).toMatch(/1 send attempt failed earlier and was followed by a confirmed delivery/);
  });

  it("needs attention for an unresolved failure", () => {
    const signal = evaluateEmail(healthy({ email: { signals: [
      { metricKey: "email-recovery-success", outcome: "success", occurredAt: daysAgo(5), quantity: 1 },
      { metricKey: "email-recovery-failure", outcome: "failure", occurredAt: daysAgo(1), quantity: 1 }
    ], confirmations: [], signups: [] } }));
    expect(signal.state).toBe("attention");
    expect(signal.lastFailureAt).toBe(daysAgo(1));
  });

  it("is degraded when repeated sends fail with no delivery since", () => {
    const signal = evaluateEmail(healthy({ email: { signals: Array.from({ length: EMAIL_DEGRADED_FAILURES }, (_, index) => ({
      metricKey: "email-confirmation-failure", outcome: "failure", occurredAt: ago(index + 1), quantity: 1
    })), confirmations: [], signups: [] } }));
    expect(signal.state).toBe("degraded");
  });

  it("is unavailable, never healthy, when the evidence cannot be read", () => {
    expect(evaluateEmail(healthy({ email: null })).state).toBe("unavailable");
  });
});

describe("webhook health", () => {
  it("is healthy after a recent successful event with nothing open", () => {
    const signal = evaluateWebhooks(healthy());
    expect(signal.state).toBe("healthy");
    expect(signal.lastSuccessAt).toBe(daysAgo(1));
  });

  it("needs attention for an unresolved manual-review record", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: manualReview() }));
    expect(signal.state).toBe("attention");
    expect(signal.reason).toMatch(/1 event awaiting manual review/);
    expect(signal.details.join(" ")).toMatch(/Needs review: customer\.subscription\.created .*trial length did not match the 24-hour trial/);
  });

  it("treats a review superseded by a later processed event for the same object as historical", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: manualReview({ laterProcessed: [{ environment: "live", objectKey: "sub_1ProductionLikeKey", at: ago(9 * 24 - 0.001) }] }) }));
    expect(signal.state).toBe("healthy");
    expect(signal.details.join(" ")).toMatch(/Historical review, no action needed/);
  });

  it("treats a review superseded by a later authoritative synchronization as historical", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: manualReview({ projections: [{ environment: "live", objectKey: "sub_1ProductionLikeKey", synchronizedAt: daysAgo(8), authoritativeAt: daysAgo(8) }] }) }));
    expect(signal.state).toBe("healthy");
  });

  it("does not accept a synchronization that observed only the record's own event", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: manualReview({ projections: [{ environment: "live", objectKey: "sub_1ProductionLikeKey", synchronizedAt: daysAgo(8), authoritativeAt: daysAgo(9) }] }) }));
    expect(signal.state).toBe("attention");
  });

  it("does not let later evidence for another object resolve a review", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: manualReview({ laterProcessed: [{ environment: "live", objectKey: "sub_1SomeoneElse", at: daysAgo(1) }] }) }));
    expect(signal.state).toBe("attention");
  });

  it("is degraded when a retryable failure is newer than the last success", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: { ...manualReview(), lastHandledAt: daysAgo(2), open: [{
      eventType: "invoice.paid", state: "retryable_failure", failureClass: "provider_unavailable", environment: "live", leaseExpiresAt: null, objectKey: "in_1Retrying", eventCreatedAt: ago(3), receivedAt: ago(3), lastAttemptAt: ago(1)
    }] } }));
    expect(signal.state).toBe("degraded");
    expect(signal.lastFailureAt).toBe(ago(1));
  });

  it("needs attention, not degraded, when processing has succeeded since a retryable failure", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: { ...manualReview(), lastHandledAt: ago(1), open: [{
      eventType: "invoice.paid", state: "retryable_failure", failureClass: "provider_unavailable", environment: "live", leaseExpiresAt: null, objectKey: "in_1Retrying", eventCreatedAt: ago(5), receivedAt: ago(5), lastAttemptAt: ago(4)
    }] } }));
    expect(signal.state).toBe("attention");
  });

  it("ignores a receipt still in flight but flags one stuck past the limit", () => {
    const inFlight = { eventType: "invoice.paid", state: "received", failureClass: null, environment: "live", leaseExpiresAt: null, objectKey: "in_1Fresh", eventCreatedAt: ago(0.02), receivedAt: ago(0.02), lastAttemptAt: null };
    expect(evaluateWebhooks(healthy({ webhooks: { ...manualReview(), open: [inFlight] } })).state).toBe("healthy");
    const stuck = { ...inFlight, receivedAt: ago(2), eventCreatedAt: ago(2) };
    expect(evaluateWebhooks(healthy({ webhooks: { ...manualReview(), open: [stuck] } })).state).toBe("degraded");
  });

  it("reports no recent signal, not a failure, when no event arrived in the window", () => {
    const quiet = evaluateWebhooks(healthy({ webhooks: { totalEvents: 4, recent: [], lastHandledAt: daysAgo(60), open: [], laterProcessed: [], projections: [] } }));
    expect(quiet.state).toBe("no-recent-signal");
    const never = evaluateWebhooks(healthy({ webhooks: { totalEvents: 0, recent: [], lastHandledAt: null, open: [], laterProcessed: [], projections: [] } }));
    expect(never.state).toBe("no-recent-signal");
    expect(never.reason).toMatch(/No Stripe webhook has been received yet/);
  });

  it("never prints the Stripe object identifier", () => {
    const signal = evaluateWebhooks(healthy({ webhooks: manualReview() }));
    expect(JSON.stringify(signal)).not.toContain("sub_1ProductionLikeKey");
  });
});

describe("subscription sync (scheduled reconciliation)", () => {
  it("is healthy when every live subscription was re-read inside the window", () => {
    expect(evaluateReconciliation(healthy()).state).toBe("healthy");
  });

  it("needs attention when a live subscription has gone unsynchronized past the window", () => {
    const signal = evaluateReconciliation(healthy({ reconciliation: { expected: true, subscriptions: [
      { status: "active", lastSynchronizedAt: ago(10), source: "webhook" },
      { status: "active", lastSynchronizedAt: daysAgo(7), source: "webhook" },
      { status: "canceled", lastSynchronizedAt: daysAgo(30), source: "webhook" }
    ] } }));
    expect(signal.state).toBe("attention");
    expect(signal.reason).toMatch(/1 live subscription not re-read from Stripe/);
    expect(signal.lastSuccessAt).toBeNull();
  });

  it("is neutral with no live subscriptions or outside production", () => {
    expect(evaluateReconciliation(healthy({ reconciliation: { expected: true, subscriptions: [{ status: "canceled", lastSynchronizedAt: daysAgo(30), source: null }] } })).state).toBe("no-recent-signal");
    expect(evaluateReconciliation(healthy({ reconciliation: { expected: false, subscriptions: [{ status: "active", lastSynchronizedAt: daysAgo(30), source: null }] } })).state).toBe("no-recent-signal");
  });
});

describe("storage and packages", () => {
  it("is degraded when a required private bucket is missing", () => {
    const signal = evaluateStorage(healthy({ storage: { buckets: ["resource-files"] } }));
    expect(signal.state).toBe("degraded");
    expect(signal.reason).toContain("resource-quarantine");
  });

  it("keeps no packages neutral", () => {
    const signal = evaluatePackages(healthy({ packages: { states: [] } }));
    expect(signal.state).toBe("no-packages");
    expect(healthTone(signal.state)).toBe("neutral");
  });

  it("is healthy when packages passed validation and flags one stuck in validation", () => {
    expect(evaluatePackages(healthy({ packages: { states: ["published", "archived"] } })).state).toBe("healthy");
    expect(evaluatePackages(healthy({ packages: { states: ["published", "validating"] } })).state).toBe("attention");
  });
});

describe("quarantine counts", () => {
  it("shows zero as clear and a positive count as review without raising Application", () => {
    const clear = evaluateSystemHealth(healthy());
    expect(clear.quarantine.map((row) => [row.key, row.count, row.severity])).toEqual([["pdf-quarantine", 0, "clear"], ["zip-quarantine", 0, "clear"]]);
    const held = evaluateSystemHealth(healthy({ pdfQuarantine: { files: [
      { role: "primary_pdf", quarantinedAt: "2026-08-06T22:07:12Z", resourceState: "draft", replaced: false },
      { role: "thumbnail", quarantinedAt: "2026-08-22T04:31:06Z", resourceState: "draft", replaced: false }
    ] } }));
    const pdf = held.quarantine.find((row) => row.key === "pdf-quarantine")!;
    expect([pdf.count, pdf.severity]).toEqual([2, "review"]);
    expect(pdf.details.slice(-2)).toEqual(["1 PDF", "1 thumbnail image"]);
    expect(pdf.details[0]).toBe("2 awaiting a decision on unarchived resources.");
    expect(held.application.state).toBe("healthy");
  });

  it("is unavailable when the quarantine cannot be read", () => {
    const report = evaluateSystemHealth(healthy({ zipQuarantine: null }));
    expect(report.quarantine.find((row) => row.key === "zip-quarantine")).toMatchObject({ count: null, severity: "unavailable" });
  });
});

describe("Application aggregation", () => {
  const child = (key: HealthSignal["key"], state: HealthSignal["state"]): HealthSignal => ({
    key, label: key, state, reason: "", checkedAt: now.toISOString(), lastSuccessAt: null, lastFailureAt: null, freshness: "", action: "", details: []
  });

  it("is healthy when every child is verified", () => {
    expect(evaluateSystemHealth(healthy()).application.state).toBe("healthy");
  });

  it("is not lowered by neutral or quiet children", () => {
    const application = aggregateApplication({ now, database: "reachable" }, [child("email", "no-recent-signal"), child("webhooks", "no-recent-signal"), child("packages", "no-packages"), child("storage", "healthy")]);
    expect(application.state).toBe("healthy");
    expect(application.reason).toMatch(/without recent activity/);
  });

  it("inherits attention and degraded from confirmed children only", () => {
    expect(aggregateApplication({ now, database: "reachable" }, [child("email", "attention"), child("storage", "healthy")]).state).toBe("attention");
    expect(aggregateApplication({ now, database: "reachable" }, [child("email", "attention"), child("storage", "degraded")]).state).toBe("degraded");
  });

  it("does not call unverifiable evidence healthy", () => {
    const application = aggregateApplication({ now, database: "reachable" }, [child("email", "unavailable"), child("storage", "healthy")]);
    expect(application.state).toBe("attention");
    expect(application.reason).toMatch(/could not be verified: email/);
  });

  it("is unavailable when the database cannot be read", () => {
    const report = evaluateSystemHealth({ now, database: "unavailable", email: null, webhooks: null, reconciliation: null, storage: null, packages: null, pdfQuarantine: null, zipQuarantine: null });
    expect(report.application.state).toBe("unavailable");
    expect(report.signals.every((row) => row.state === "unavailable")).toBe(true);
  });

  it("reproduces production on 2026-10-07: only the stalled reconciliation needs attention", () => {
    const production = healthy({
      email: {
        signals: [
          { metricKey: "email-recovery-success", outcome: "success", occurredAt: "2026-08-04T02:12:51.855Z", quantity: 1 },
          { metricKey: "email-confirmation-success", outcome: "success", occurredAt: "2026-09-28T13:42:49.067Z", quantity: 1 },
          { metricKey: "email-confirmation-failure", outcome: "failure", occurredAt: "2026-10-04T21:45:14.964Z", quantity: 1 }
        ],
        confirmations: [{ createdAt: "2026-10-04T21:45:07.567Z", emailConfirmedAt: "2026-10-04T21:45:50.075Z" }], signups: []
      },
      webhooks: {
        totalEvents: 26,
        recent: [{ state: "processed", receivedAt: "2026-10-06T23:18:29.652Z", processedAt: "2026-10-06T23:18:30.694Z" }],
        lastHandledAt: "2026-10-06T23:18:30.694Z",
        open: [
          { eventType: "customer.subscription.created", state: "manual_review", failureClass: "trial_shape_conflict", environment: "live", leaseExpiresAt: null, objectKey: "sub_A", eventCreatedAt: "2026-09-28T13:59:59Z", receivedAt: "2026-09-28T14:00:00.217Z", lastAttemptAt: "2026-09-28T14:00:00.333Z" },
          { eventType: "customer.subscription.created", state: "manual_review", failureClass: "trial_shape_conflict", environment: "live", leaseExpiresAt: null, objectKey: "sub_B", eventCreatedAt: "2026-09-28T22:22:50Z", receivedAt: "2026-09-28T22:22:50.709Z", lastAttemptAt: "2026-09-28T22:22:50.813Z" }
        ],
        laterProcessed: [{ environment: "live", objectKey: "sub_A", at: "2026-09-28T14:00:01Z" }, { environment: "live", objectKey: "sub_A", at: "2026-09-29T14:00:36Z" }, { environment: "live", objectKey: "sub_B", at: "2026-09-28T22:22:51Z" }],
        projections: [{ environment: "live", objectKey: "sub_A", synchronizedAt: "2026-09-29T14:00:39.680Z", authoritativeAt: "2026-09-29T14:00:36Z" }, { environment: "live", objectKey: "sub_B", synchronizedAt: "2026-09-29T23:24:19.842Z", authoritativeAt: "2026-09-29T23:24:17Z" }]
      },
      reconciliation: { expected: true, subscriptions: [
        { status: "active", lastSynchronizedAt: "2026-10-06T23:18:30.694Z", source: "webhook" },
        { status: "active", lastSynchronizedAt: "2026-09-29T23:24:19.842Z", source: "webhook" },
        { status: "canceled", lastSynchronizedAt: "2026-09-29T14:00:39.680Z", source: "webhook" }
      ] },
      packages: { states: [] },
      pdfQuarantine: { files: Array.from({ length: 10 }, () => ({ role: "primary_pdf", quarantinedAt: "2026-08-22T19:37:55Z", resourceState: "archived", replaced: false })) }
    });
    const report = evaluateSystemHealth(production);
    const state = Object.fromEntries(report.signals.map((row) => [row.key, row.state]));
    expect(state).toEqual({ email: "healthy", webhooks: "healthy", reconciliation: "attention", storage: "healthy", packages: "no-packages" });
    expect(report.application.state).toBe("attention");
    expect(report.application.reason).toBe("Core services are up; needs attention: Subscription sync.");
    // Once the daily reconciliation runs again, nothing else holds Application down.
    const repaired = evaluateSystemHealth({ ...production, reconciliation: { expected: true, subscriptions: [{ status: "active", lastSynchronizedAt: ago(5), source: "reconciliation" }, { status: "active", lastSynchronizedAt: ago(5), source: "reconciliation" }] } });
    expect(repaired.application.state).toBe("healthy");
    expect(JSON.stringify(report)).not.toMatch(/sub_[AB]\b/);
  });
});

/**
 * Production evidence read on 2026-11-07 (read-only, docs/releases/mathnexa-v1.2.39-system-health-diagnosis.md),
 * reduced to the fields the rules read. Identifiers are synthetic.
 */
describe("production evidence 2026-11-07 and the rules aligned with Super Admin V2", () => {
  const novNow = new Date("2026-11-07T15:00:00.000Z");
  const minutesAgo = (minutes: number) => new Date(novNow.getTime() - minutes * 60_000).toISOString();
  const production = (overrides: Partial<SystemHealthEvidence> = {}): SystemHealthEvidence => ({
    now: novNow,
    database: "reachable",
    email: {
      signals: [
        { metricKey: "email-confirmation-success", outcome: "success", occurredAt: "2026-10-12T01:28:00Z", quantity: 1 },
        { metricKey: "email-confirmation-success", outcome: "success", occurredAt: "2026-10-15T11:10:05Z", quantity: 1 },
        { metricKey: "email-confirmation-failure", outcome: "failure", occurredAt: "2026-10-04T21:45:14Z", quantity: 1 },
        { metricKey: "email-confirmation-failure", outcome: "failure", occurredAt: "2026-10-22T20:34:43Z", quantity: 1 }
      ],
      confirmations: [
        { createdAt: "2026-10-15T00:49:56Z", emailConfirmedAt: "2026-10-15T00:50:28Z" },
        { createdAt: "2026-10-15T12:57:23Z", emailConfirmedAt: "2026-10-15T12:57:42Z" }
      ],
      signups: [
        { createdAt: "2026-10-15T00:49:56Z", emailConfirmedAt: "2026-10-15T00:50:28Z" },
        { createdAt: "2026-10-15T12:57:23Z", emailConfirmedAt: "2026-10-15T12:57:42Z" },
        { createdAt: "2026-10-22T20:34:33Z", emailConfirmedAt: null },
        { createdAt: "2026-10-27T00:22:53Z", emailConfirmedAt: null },
        { createdAt: "2026-11-07T14:04:31Z", emailConfirmedAt: null }
      ]
    },
    webhooks: {
      totalEvents: 37,
      recent: [
        { state: "processed", receivedAt: "2026-11-06T22:18:49Z", processedAt: "2026-11-06T22:18:50Z" },
        { state: "processed", receivedAt: "2026-11-06T23:19:40Z", processedAt: "2026-11-06T23:19:41Z" },
        { state: "manual_review", receivedAt: "2026-10-15T11:16:18Z", processedAt: null }
      ],
      lastHandledAt: "2026-11-06T23:19:41Z",
      open: [
        { eventType: "customer.subscription.created", state: "manual_review", failureClass: "trial_shape_conflict", environment: "live", objectKey: "sub_A", eventCreatedAt: "2026-09-28T13:59:59Z", receivedAt: "2026-09-28T14:00:00Z", lastAttemptAt: "2026-09-28T14:00:00Z", leaseExpiresAt: null },
        { eventType: "customer.subscription.created", state: "manual_review", failureClass: "trial_shape_conflict", environment: "live", objectKey: "sub_B", eventCreatedAt: "2026-09-28T22:22:50Z", receivedAt: "2026-09-28T22:22:50Z", lastAttemptAt: "2026-09-28T22:22:50Z", leaseExpiresAt: null },
        { eventType: "customer.subscription.created", state: "manual_review", failureClass: "trial_shape_conflict", environment: "live", objectKey: "sub_C", eventCreatedAt: "2026-10-15T11:16:18Z", receivedAt: "2026-10-15T11:16:18Z", lastAttemptAt: "2026-10-15T11:16:18Z", leaseExpiresAt: null }
      ],
      laterProcessed: [
        { environment: "live", objectKey: "sub_A", at: "2026-09-28T14:00:01Z" },
        { environment: "live", objectKey: "sub_B", at: "2026-09-28T22:22:51Z" },
        { environment: "live", objectKey: "sub_C", at: "2026-10-15T11:16:19Z" }
      ],
      projections: [
        { environment: "live", objectKey: "sub_B", synchronizedAt: "2026-11-07T06:17:44Z", authoritativeAt: "2026-11-07T06:17:42Z" },
        { environment: "live", objectKey: "sub_C", synchronizedAt: "2026-11-06T06:17:45Z", authoritativeAt: "2026-11-06T06:17:42Z" }
      ]
    },
    reconciliation: { expected: true, subscriptions: [
      { status: "active", lastSynchronizedAt: "2026-11-07T06:17:44Z", source: "reconciliation" },
      { status: "active", lastSynchronizedAt: "2026-11-06T23:19:41Z", source: "webhook" },
      { status: "active", lastSynchronizedAt: "2026-11-06T06:17:45Z", source: "reconciliation" },
      { status: "canceled", lastSynchronizedAt: "2026-09-29T14:00:39Z", source: "webhook" }
    ] },
    storage: { buckets: [...REQUIRED_PRIVATE_BUCKETS, "cms-media", "admin-assets"] },
    packages: { states: [] },
    pdfQuarantine: { files: [
      ...Array.from({ length: 7 }, () => ({ role: "primary_pdf", quarantinedAt: "2026-08-22T19:37:55Z", resourceState: "archived", replaced: false })),
      { role: "primary_pdf", quarantinedAt: "2026-08-06T22:07:12Z", resourceState: "ready_for_review", replaced: false },
      { role: "primary_pdf", quarantinedAt: "2026-08-22T04:23:18Z", resourceState: "draft", replaced: false },
      { role: "thumbnail", quarantinedAt: "2026-08-22T04:31:06Z", resourceState: "draft", replaced: false }
    ] },
    zipQuarantine: { events: [] },
    ...overrides
  });
  const successOnly = (evidence: SystemHealthEvidence) => evidence.email!.signals.filter((row) => row.outcome === "success");

  it("reports what is really wrong: Email needs attention, nothing is degraded, and the webhook reviews are historical", () => {
    const report = evaluateSystemHealth(production());
    const state = Object.fromEntries(report.signals.map((row) => [row.key, row.state]));
    expect(state).toEqual({ email: "attention", webhooks: "healthy", reconciliation: "healthy", storage: "healthy", packages: "no-packages" });
    expect(report.application.state).toBe("attention");
    expect(report.application.reason).toBe("Core services are up; needs attention: Email.");
    const webhooks = report.signals.find((row) => row.key === "webhooks")!;
    expect(webhooks.details.filter((line) => line.startsWith("Historical review, no action needed"))).toHaveLength(3);
    expect(JSON.stringify(report)).not.toMatch(/sub_[ABC]\b/);
  });

  it("names the unconfirmed sign-ups since the last confirmed delivery, and the unresolved failure", () => {
    const email = evaluateEmail(production());
    expect(email.state).toBe("attention");
    expect(email.reason).toMatch(/^3 sign-ups since the last confirmed delivery \(.+\) have not confirmed; 1 email send failed \(last .+\) with no confirmed delivery since\. Delivery to inboxes is unverified\.$/);
    expect(email.lastFailureAt).toBe("2026-10-22T20:34:43Z");
    expect(email.details.join(" ")).toMatch(/5 sign-ups in the last 30 days; 3 not confirmed after 30 minutes/);
    expect(email.action).toMatch(/delivery log/);
  });

  it("gives a new sign-up time to confirm before counting it", () => {
    const evidence = production();
    const fresh = minutesAgo(SIGNUP_CONFIRMATION_GRACE_MINUTES - 1);
    const signups = [{ createdAt: "2026-10-15T12:57:23Z", emailConfirmedAt: "2026-10-15T12:57:42Z" }, { createdAt: fresh, emailConfirmedAt: null }];
    expect(evaluateEmail({ ...evidence, email: { ...evidence.email!, signals: successOnly(evidence), signups } }).state).toBe("healthy");
  });

  it("needs at least two unconfirmed sign-ups in a row before it calls delivery into question", () => {
    expect(EMAIL_UNCONFIRMED_SIGNUPS_ATTENTION).toBe(2);
    const evidence = production();
    const one = { ...evidence.email!, signals: successOnly(evidence), signups: evidence.email!.signups.slice(0, 3) };
    expect(evaluateEmail({ ...evidence, email: one }).state).toBe("healthy");
    const two = { ...one, signups: evidence.email!.signups.slice(0, 4) };
    expect(evaluateEmail({ ...evidence, email: two }).state).toBe("attention");
  });

  it("clears as soon as a new sign-up confirms its emailed link", () => {
    const evidence = production();
    const confirmedToday = { createdAt: "2026-11-07T14:50:00Z", emailConfirmedAt: "2026-11-07T14:51:10Z" };
    const email = evaluateEmail({ ...evidence, email: {
      signals: successOnly(evidence),
      confirmations: [...evidence.email!.confirmations, confirmedToday],
      signups: [...evidence.email!.signups, confirmedToday]
    } });
    expect(email.state).toBe("healthy");
  });

  it("never counts provider pacing (outcome unavailable) as a failure, and says so", () => {
    const evidence = production();
    const paced = { ...evidence.email!, signals: [
      ...successOnly(evidence),
      { metricKey: "email-confirmation-failure", outcome: "unavailable", occurredAt: "2026-11-01T10:00:00Z", quantity: 2 }
    ], signups: evidence.email!.signups.slice(0, 2) };
    const email = evaluateEmail({ ...evidence, email: paced });
    expect(email.state).toBe("healthy");
    expect(email.lastFailureAt).toBeNull();
    expect(email.details.join(" ")).toMatch(/2 resends refused by the provider's per-address pacing limit/);
  });

  it("only lets evidence from the same billing environment overtake a review", () => {
    const evidence = production();
    const testOnly = { ...evidence.webhooks!, open: [evidence.webhooks!.open[2]!],
      laterProcessed: [{ environment: "test", objectKey: "sub_C", at: "2026-10-15T11:16:19Z" }],
      projections: [{ environment: "test", objectKey: "sub_C", synchronizedAt: "2026-11-06T06:17:45Z", authoritativeAt: "2026-11-06T06:17:42Z" }] };
    expect(evaluateWebhooks({ ...evidence, webhooks: testOnly }).state).toBe("attention");
  });

  it("never treats a retryable failure as superseded: it is live work", () => {
    const evidence = production();
    const retrying = { ...evidence.webhooks!, open: [{ ...evidence.webhooks!.open[2]!, state: "retryable_failure", failureClass: "provider_unavailable", lastAttemptAt: "2026-11-07T14:00:00Z" }] };
    expect(evaluateWebhooks({ ...evidence, webhooks: retrying }).state).toBe("degraded");
  });

  it("treats a processing receipt as stopped only after its lease ends, and a received one after five unclaimed minutes", () => {
    const evidence = production();
    const base = { eventType: "invoice.paid", failureClass: null, environment: "live", objectKey: "in_1", eventCreatedAt: "2026-11-07T14:00:00Z", lastAttemptAt: null };
    const withOpen = (open: NonNullable<SystemHealthEvidence["webhooks"]>["open"]) => ({ ...evidence, webhooks: { ...evidence.webhooks!, open } });
    // A retried receipt can be old and still inside a fresh lease: in flight, not stalled.
    expect(evaluateWebhooks(withOpen([{ ...base, state: "processing", receivedAt: minutesAgo(600), leaseExpiresAt: minutesAgo(-2) }])).state).toBe("healthy");
    expect(evaluateWebhooks(withOpen([{ ...base, state: "processing", receivedAt: minutesAgo(600), leaseExpiresAt: minutesAgo(1) }])).state).toBe("degraded");
    expect(evaluateWebhooks(withOpen([{ ...base, state: "received", receivedAt: minutesAgo(WEBHOOK_UNCLAIMED_MINUTES - 1), leaseExpiresAt: null }])).state).toBe("healthy");
    expect(evaluateWebhooks(withOpen([{ ...base, state: "received", receivedAt: minutesAgo(WEBHOOK_UNCLAIMED_MINUTES + 1), leaseExpiresAt: null }])).state).toBe("degraded");
  });

  it("summarises the queue in the same terms for the Settings page", () => {
    expect(summarizeWebhookQueue(production())).toEqual({ open: 0, historical: 3 });
    const evidence = production();
    const withRetry = { ...evidence.webhooks!, open: [...evidence.webhooks!.open, { ...evidence.webhooks!.open[0]!, state: "retryable_failure", objectKey: "in_9" }] };
    expect(summarizeWebhookQueue({ ...evidence, webhooks: withRetry })).toEqual({ open: 1, historical: 3 });
    expect(summarizeWebhookQueue({ ...evidence, webhooks: null })).toBeNull();
  });

  it("splits quarantined PDFs into awaiting a decision, replaced and historical", () => {
    const report = evaluateSystemHealth(production());
    const pdf = report.quarantine.find((row) => row.key === "pdf-quarantine")!;
    expect([pdf.count, pdf.severity]).toEqual([10, "review"]);
    expect(pdf.reason).toMatch(/3 awaiting a decision on unarchived resources; 0 replaced by a later accepted upload; 7 on archived resources \(historical\)\. None blocks a published resource\./);
    expect(pdf.details.slice(0, 3)).toEqual(["3 awaiting a decision on unarchived resources.", "0 replaced by a later accepted upload.", "7 on archived resources (historical)."]);
    expect(report.application.reason).not.toMatch(/quarantine/i);
  });

  it("calls the quarantine historical once nothing awaits a decision", () => {
    const historical = evaluatePdfQuarantine(novNow.toISOString(), [
      { role: "primary_pdf", quarantinedAt: "2026-08-22T19:37:55Z", resourceState: "archived", replaced: false },
      { role: "primary_pdf", quarantinedAt: "2026-08-22T04:23:18Z", resourceState: "draft", replaced: true }
    ]);
    expect(historical.severity).toBe("historical");
    expect(historical.reason).toMatch(/0 awaiting a decision/);
    const published = evaluatePdfQuarantine(novNow.toISOString(), [{ role: "primary_pdf", quarantinedAt: "2026-08-22T04:23:18Z", resourceState: "published", replaced: false }]);
    expect(published.severity).toBe("review");
    expect(published.reason).toMatch(/1 rejected upload belongs to a published resource whose earlier accepted version is still served/);
  });
});
