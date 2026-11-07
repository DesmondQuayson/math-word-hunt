import { formatAdminDateTime } from "./format";

/**
 * Super Admin "System health" state machine.
 *
 * Every row is decided from evidence, never from the absence of it:
 *
 *  - healthy           positively verified inside the row's freshness window;
 *  - attention         a real condition the owner should look at;
 *  - degraded          functionality confirmed to be failing right now;
 *  - unavailable       the evidence itself could not be read;
 *  - no-recent-signal  nothing to judge inside the window: neither healthy nor failing;
 *  - no-packages       neutral: there is nothing of that kind to validate.
 *
 * Application aggregates only confirmed states. "No recent signal" and "no
 * packages" never degrade it, and a historical failure that later evidence has
 * superseded never holds it down; an unresolved one always does.
 *
 * The module is pure and holds no provider identifiers in its output: Stripe
 * object ids are used only to match a review record to later evidence.
 */

export type HealthState = "healthy" | "attention" | "degraded" | "unavailable" | "no-recent-signal" | "no-packages";
/** clear: nothing held; review: something still awaits an owner decision; historical: only archived or replaced uploads remain. */
export type QuarantineSeverity = "clear" | "review" | "historical" | "unavailable";

export type HealthSignal = Readonly<{
  key: "application" | "email" | "webhooks" | "reconciliation" | "storage" | "packages";
  label: string;
  state: HealthState;
  reason: string;
  checkedAt: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  freshness: string;
  action: string;
  details: readonly string[];
}>;

export type QuarantineSignal = Readonly<{
  key: "pdf-quarantine" | "zip-quarantine";
  label: string;
  count: number | null;
  severity: QuarantineSeverity;
  reason: string;
  checkedAt: string;
  newestAt: string | null;
  action: string;
  details: readonly string[];
}>;

export type SystemHealthReport = Readonly<{
  checkedAt: string;
  application: HealthSignal;
  signals: readonly HealthSignal[];
  quarantine: readonly QuarantineSignal[];
}>;

export type EmailSignalEvidence = Readonly<{ metricKey: string; outcome: string; occurredAt: string; quantity: number }>;
export type AccountConfirmationEvidence = Readonly<{ createdAt: string; emailConfirmedAt: string }>;
export type WebhookLedgerEvidence = Readonly<{ state: string; receivedAt: string; processedAt: string | null }>;
export type WebhookOpenEvidence = Readonly<{
  eventType: string;
  state: string;
  failureClass: string | null;
  /** The billing environment ('live' or 'test'); evidence only overtakes a record from the same environment. */
  environment: string;
  /** Opaque matching key (the Stripe object id). Never rendered. */
  objectKey: string | null;
  eventCreatedAt: string;
  receivedAt: string;
  lastAttemptAt: string | null;
  /** When the current processing lease ends (processing rows); a lease that ended means the attempt stopped. */
  leaseExpiresAt: string | null;
}>;
export type ObjectFollowUpEvidence = Readonly<{ environment: string; objectKey: string; at: string }>;
export type SubscriptionProjectionEvidence = Readonly<{ environment: string; objectKey: string; synchronizedAt: string; authoritativeAt: string }>;
export type SignupEvidence = Readonly<{ createdAt: string; emailConfirmedAt: string | null }>;
export type QuarantinedFileEvidence = Readonly<{
  role: string;
  quarantinedAt: string;
  /** Publication state of the resource the upload belongs to (null when it could not be matched). */
  resourceState: string | null;
  /** A later upload for the same resource and role was accepted, so this one no longer blocks anything. */
  replaced: boolean;
}>;
export type SubscriptionSyncEvidence = Readonly<{ status: string; lastSynchronizedAt: string | null; source: string | null }>;

export type SystemHealthEvidence = Readonly<{
  now: Date;
  /** Whether the server could read the operational database at all. */
  database: "reachable" | "unavailable";
  email: Readonly<{
    signals: readonly EmailSignalEvidence[];
    confirmations: readonly AccountConfirmationEvidence[];
    /** Accounts created in the evidence window, confirmed or not: sign-ups that never confirm are the delivery signal. */
    signups: readonly SignupEvidence[];
  }> | null;
  webhooks: Readonly<{
    totalEvents: number;
    recent: readonly WebhookLedgerEvidence[];
    lastHandledAt: string | null;
    open: readonly WebhookOpenEvidence[];
    /** Later events for the same Stripe object that the canonical synchronizer accepted. */
    laterProcessed: readonly ObjectFollowUpEvidence[];
    /** The current projection of the subscription each record names. */
    projections: readonly SubscriptionProjectionEvidence[];
  }> | null;
  reconciliation: Readonly<{ expected: boolean; subscriptions: readonly SubscriptionSyncEvidence[] }> | null;
  storage: Readonly<{ buckets: readonly string[] }> | null;
  packages: Readonly<{ states: readonly string[] }> | null;
  pdfQuarantine: Readonly<{ files: readonly QuarantinedFileEvidence[] }> | null;
  zipQuarantine: Readonly<{ events: readonly Readonly<{ createdAt: string }>[] }> | null;
}>;

export const EMAIL_WINDOW_DAYS = 30;
export const WEBHOOK_WINDOW_DAYS = 35;
/** The daily sweep re-reads every subscription not synchronized in 48 h, so 72 h plus scheduler jitter. */
export const RECONCILIATION_MAX_AGE_HOURS = 76;
/**
 * A received event still unclaimed after this long was never claimed: the webhook route claims every receipt right
 * after recording it, and five minutes exceeds the claim function's longest lease (the same rule as Super Admin V2).
 */
export const WEBHOOK_UNCLAIMED_MINUTES = 5;
/** Unresolved send failures at or above this count mean delivery is failing, not a one-off. */
export const EMAIL_DEGRADED_FAILURES = 3;
/** A sign-up gets this long to open its confirmation email before it counts as unconfirmed. */
export const SIGNUP_CONFIRMATION_GRACE_MINUTES = 30;
/**
 * Unconfirmed sign-ups since the last confirmed delivery at or above this count put Email on attention: the provider
 * accepted the messages, but nothing proves they reached an inbox (production 2026-10-15 to 2026-11-07: 3 of 3).
 */
export const EMAIL_UNCONFIRMED_SIGNUPS_ATTENTION = 2;
/** A confirmation this soon after sign-up is an automatic confirmation, not proof an email arrived. */
const CONFIRMATION_PROOF_DELAY_MS = 10_000;

export const REQUIRED_PRIVATE_BUCKETS = Object.freeze(["resource-files", "resource-quarantine", "game-packages", "game-package-quarantine"]);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TERMINAL_SUBSCRIPTION_STATES = new Set(["canceled", "incomplete_expired"]);

const FAILURE_CLASS_LABELS: Readonly<Record<string, string>> = {
  trial_shape_conflict: "trial length did not match the 24-hour trial",
  conflicting_current_subscription: "two current subscriptions for one customer",
  invoice_state_conflict: "invoice state disagreed with the event",
  ownership_conflict: "customer ownership did not match",
  invalid_owner: "no MathNexa owner for the customer",
  unknown_plan: "unknown price or plan",
  unknown_subscription_status: "unknown subscription status",
  projection_conflict: "local projection conflict",
  duplicate_subscription: "duplicate subscription",
  unsupported_payload: "unsupported payload",
  stale_event: "stale event",
  configuration: "billing configuration",
  environment_mismatch: "test/live environment mismatch",
  provider_unavailable: "Stripe unavailable",
  database_unavailable: "database unavailable",
  api_version_mismatch: "API version mismatch"
};

export const HEALTH_STATE_LABELS: Readonly<Record<HealthState, string>> = {
  healthy: "Healthy",
  attention: "Attention",
  degraded: "Degraded",
  unavailable: "Unavailable",
  "no-recent-signal": "No recent signal",
  "no-packages": "No packages"
};

export function healthTone(state: HealthState): "good" | "warning" | "danger" | "neutral" {
  if (state === "healthy") return "good";
  if (state === "attention" || state === "unavailable") return "warning";
  if (state === "degraded") return "danger";
  return "neutral";
}

const time = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
const latest = (values: readonly (string | null | undefined)[]): string | null => {
  let best: string | null = null;
  for (const value of values) if (Number.isFinite(time(value)) && (best === null || time(value) > time(best))) best = value!;
  return best;
};
const earliest = (values: readonly (string | null | undefined)[]): string | null => {
  let best: string | null = null;
  for (const value of values) if (Number.isFinite(time(value)) && (best === null || time(value) < time(best))) best = value!;
  return best;
};
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const when = (value: string | null) => value ? formatAdminDateTime(value) : "never";
const describeClass = (value: string | null) => value ? FAILURE_CLASS_LABELS[value] ?? value.replaceAll("_", " ") : "no reason recorded";

function unavailableSignal(key: HealthSignal["key"], label: string, checkedAt: string, freshness: string): HealthSignal {
  return {
    key, label, state: "unavailable", checkedAt, freshness, lastSuccessAt: null, lastFailureAt: null, details: [],
    reason: "The evidence for this check could not be read, so its health is unknown.",
    action: "Reload the dashboard. If it stays unavailable, check the Supabase project status and the server logs."
  };
}

export function evaluateEmail(evidence: SystemHealthEvidence): HealthSignal {
  const checkedAt = evidence.now.toISOString();
  const freshness = `Delivery evidence from the last ${EMAIL_WINDOW_DAYS} days: accounts that confirmed an emailed link, sign-ups that did not, and resend or recovery outcomes.`;
  if (!evidence.email) return unavailableSignal("email", "Email", checkedAt, freshness);
  const now = evidence.now.getTime();
  const windowStart = now - EMAIL_WINDOW_DAYS * DAY;
  const inWindow = (value: string) => time(value) >= windowStart && time(value) <= now + 5 * 60_000;
  const sendSuccesses = evidence.email.signals.filter((signal) => signal.outcome === "success" && signal.metricKey.endsWith("-success"));
  // Only a failure outcome is a failed send. A refusal under the provider's per-address pacing limit is recorded as
  // 'unavailable': the earlier email had been sent, so it is reported as pacing, never as a failure.
  const failures = evidence.email.signals.filter((signal) => signal.outcome === "failure" && signal.metricKey.endsWith("-failure"));
  const paced = evidence.email.signals.filter((signal) => signal.outcome === "unavailable" && signal.metricKey.endsWith("-failure"));
  // An address confirmed well after its account was created proves a
  // confirmation email reached a real inbox. That is the end-to-end signal the
  // send counters alone cannot give: Supabase Auth sends the first message
  // itself, and only resends and recoveries are counted by the application.
  const proofs = evidence.email.confirmations.filter((row) => time(row.emailConfirmedAt) - time(row.createdAt) >= CONFIRMATION_PROOF_DELAY_MS);
  const lastProofAt = latest(proofs.map((row) => row.emailConfirmedAt));
  const lastSuccessAt = latest([...sendSuccesses.map((signal) => signal.occurredAt), ...proofs.map((row) => row.emailConfirmedAt)]);
  const lastFailureAt = latest(failures.map((signal) => signal.occurredAt));
  const recentSends = sendSuccesses.filter((signal) => inWindow(signal.occurredAt)).reduce((sum, signal) => sum + signal.quantity, 0);
  const recentProofs = proofs.filter((row) => inWindow(row.emailConfirmedAt)).length;
  const recentPaced = paced.filter((signal) => inWindow(signal.occurredAt)).reduce((sum, signal) => sum + signal.quantity, 0);
  const recentFailures = failures.filter((signal) => inWindow(signal.occurredAt));
  const unresolved = recentFailures.filter((signal) => lastSuccessAt === null || time(signal.occurredAt) > time(lastSuccessAt));
  const unresolvedCount = unresolved.reduce((sum, signal) => sum + signal.quantity, 0);
  const recoveredCount = recentFailures.reduce((sum, signal) => sum + signal.quantity, 0) - unresolvedCount;
  // Sign-ups that never confirmed (after a grace period to open the email) since the last proof of delivery. The
  // provider accepting a message is not proof it arrived; several such sign-ups in a row is the visible symptom of
  // confirmation emails going missing, bouncing or landing in spam.
  const recentSignups = evidence.email.signups.filter((row) => inWindow(row.createdAt));
  const unconfirmed = recentSignups.filter((row) => row.emailConfirmedAt === null && now - time(row.createdAt) >= SIGNUP_CONFIRMATION_GRACE_MINUTES * 60_000);
  const unconfirmedSinceProof = unconfirmed.filter((row) => lastProofAt === null || time(row.createdAt) > time(lastProofAt));
  const details = [
    `${plural(recentProofs, "account")} confirmed an emailed link in the last ${EMAIL_WINDOW_DAYS} days (last ${when(lastProofAt)}).`,
    `${plural(recentSignups.length, "sign-up")} in the last ${EMAIL_WINDOW_DAYS} days; ${unconfirmed.length} not confirmed after ${SIGNUP_CONFIRMATION_GRACE_MINUTES} minutes.`,
    `${plural(recentSends, "resend or recovery email")} accepted by the provider in the last ${EMAIL_WINDOW_DAYS} days.`,
    ...(recentPaced > 0 ? [`${plural(recentPaced, "resend")} refused by the provider's per-address pacing limit in the last ${EMAIL_WINDOW_DAYS} days; the earlier email had been sent, so this is not a failure.`] : []),
    ...(recoveredCount > 0 ? [`${plural(recoveredCount, "send attempt")} failed earlier and ${recoveredCount === 1 ? "was" : "were"} followed by a confirmed delivery (before this release, a repeated resend inside the provider's 60-second limit was recorded this way).`] : [])
  ];
  const base = { key: "email" as const, label: "Email", checkedAt, freshness, lastSuccessAt, lastFailureAt, details };
  if (unresolvedCount >= EMAIL_DEGRADED_FAILURES) {
    return { ...base, state: "degraded", reason: `${plural(unresolvedCount, "email send")} failed since the last confirmed delivery (${when(lastSuccessAt)}).`, action: "Check Supabase Auth email settings and the SMTP provider dashboard for rejected or rate-limited sends, then send yourself a password-recovery email to confirm delivery." };
  }
  const silentSignups = unconfirmedSinceProof.length >= EMAIL_UNCONFIRMED_SIGNUPS_ATTENTION;
  if (unresolvedCount > 0 || silentSignups) {
    const parts = [
      ...(silentSignups ? [`${plural(unconfirmedSinceProof.length, "sign-up")} since the last confirmed delivery (${when(lastProofAt)}) ${unconfirmedSinceProof.length === 1 ? "has" : "have"} not confirmed`] : []),
      ...(unresolvedCount > 0 ? [`${plural(unresolvedCount, "email send")} failed (last ${when(lastFailureAt)}) with no confirmed delivery since`] : [])
    ];
    return {
      ...base, state: "attention", reason: `${parts.join("; ")}. Delivery to inboxes is unverified.`,
      action: "Check the email provider's delivery log and the Supabase Auth logs for these sends (delivered, bounced or missing). If they bounced or are missing, check the sending domain and the Auth SMTP settings. A test sign-up or password reset to your own inbox confirms delivery."
    };
  }
  if (recentSends + recentProofs === 0) {
    return { ...base, state: "no-recent-signal", reason: lastSuccessAt ? `No email activity in the last ${EMAIL_WINDOW_DAYS} days; the last confirmed delivery was ${when(lastSuccessAt)}. This is not a failure.` : "No email delivery has been recorded yet. This is not a failure.", action: "No action needed. To verify on demand, request a password-recovery email for your own account." };
  }
  return { ...base, state: "healthy", reason: `Email delivery verified: last confirmed ${when(lastSuccessAt)}.`, action: "No action needed." };
}

type ReviewOutcome = Readonly<{ item: WebhookOpenEvidence; supersededAt: string | null }>;

/**
 * A receipt that is not a manual review and still needs processing: a retryable failure, a processing attempt whose
 * lease ended (exactly the rows the claim function would reclaim), or a receipt never claimed after
 * WEBHOOK_UNCLAIMED_MINUTES. A receipt received moments ago, or one inside its lease, is in flight and not counted.
 */
function isLiveWebhookWork(item: WebhookOpenEvidence, now: number): boolean {
  const unclaimedAfter = WEBHOOK_UNCLAIMED_MINUTES * 60_000;
  if (item.state === "retryable_failure") return true;
  if (item.state === "processing") return item.leaseExpiresAt === null ? now - time(item.receivedAt) > unclaimedAfter : time(item.leaseExpiresAt) < now;
  return item.state === "received" && now - time(item.receivedAt) > unclaimedAfter;
}

function supersession(item: WebhookOpenEvidence, laterProcessed: readonly ObjectFollowUpEvidence[], projections: readonly SubscriptionProjectionEvidence[]): string | null {
  if (!item.objectKey) return null;
  // A later event for the same Stripe object passed every check the
  // synchronizer applies against fresh provider state, so the state this
  // record could not apply has since been applied authoritatively.
  // Only evidence from the same billing environment counts (the Super Admin V2 rule).
  const processed = laterProcessed.filter((row) => row.environment === item.environment && row.objectKey === item.objectKey && time(row.at) > time(item.eventCreatedAt));
  // The subscription the record names now carries Stripe state observed
  // strictly after the record's event (reconciliation, an owner Sync with
  // Stripe, or a later event). Equal is not enough: a sync inside the same
  // processing attempt observes the record's own event time.
  const synchronized = projections.filter((row) => row.environment === item.environment && row.objectKey === item.objectKey && time(row.authoritativeAt) > time(item.eventCreatedAt));
  // The first such evidence is when the record stopped mattering.
  return earliest([...processed.map((row) => row.at), ...synchronized.map((row) => row.synchronizedAt)]);
}

export function evaluateWebhooks(evidence: SystemHealthEvidence): HealthSignal {
  const checkedAt = evidence.now.toISOString();
  const freshness = `Stripe events received in the last ${WEBHOOK_WINDOW_DAYS} days, plus every record still awaiting review or retry.`;
  if (!evidence.webhooks) return unavailableSignal("webhooks", "Webhooks", checkedAt, freshness);
  const { webhooks } = evidence;
  const now = evidence.now.getTime();
  // Supersession applies to manual reviews only. A retryable failure, a stopped processing attempt and a receipt
  // that was never claimed are live work the claim function still takes, so they always count.
  const outcomes: ReviewOutcome[] = webhooks.open.map((item) => ({ item, supersededAt: item.state === "manual_review" ? supersession(item, webhooks.laterProcessed, webhooks.projections) : null }));
  const reviews = outcomes.filter(({ item }) => item.state === "manual_review");
  const unresolvedReviews = reviews.filter(({ supersededAt }) => supersededAt === null);
  const supersededReviews = reviews.filter(({ supersededAt }) => supersededAt !== null);
  const failing = outcomes.filter(({ item }) => isLiveWebhookWork(item, now));
  const lastSuccessAt = webhooks.lastHandledAt;
  const lastFailureAt = latest([...unresolvedReviews, ...failing].map(({ item }) => item.lastAttemptAt ?? item.receivedAt));
  const handledRecently = webhooks.recent.filter((row) => row.state === "processed" || row.state === "ignored").length;
  const details = [
    `${plural(handledRecently, "event")} processed in the last ${WEBHOOK_WINDOW_DAYS} days (${plural(webhooks.recent.length, "event")} received).`,
    ...unresolvedReviews.map(({ item }) => `Needs review: ${item.eventType} received ${when(item.receivedAt)} (${describeClass(item.failureClass)}).`),
    ...failing.map(({ item }) => `Not yet processed: ${item.eventType} received ${when(item.receivedAt)} (${item.state === "retryable_failure" ? `retrying: ${describeClass(item.failureClass)}` : item.state === "processing" ? "the processing attempt stopped before it finished" : `never claimed in ${WEBHOOK_UNCLAIMED_MINUTES} minutes`}).`),
    ...supersededReviews.map(({ item, supersededAt }) => `Historical review, no action needed: ${item.eventType} received ${when(item.receivedAt)} (${describeClass(item.failureClass)}); Stripe's later state for the same subscription was applied ${when(supersededAt)}.`)
  ];
  const base = { key: "webhooks" as const, label: "Webhooks", checkedAt, freshness, lastSuccessAt, lastFailureAt, details };
  const newestFailure = latest(failing.map(({ item }) => item.lastAttemptAt ?? item.receivedAt));
  if (failing.length > 0 && (lastSuccessAt === null || time(newestFailure) > time(lastSuccessAt))) {
    return { ...base, state: "degraded", reason: `${plural(failing.length, "Stripe event")} failed or stalled, and nothing has been processed since ${when(lastSuccessAt)}.`, action: "Open Stripe ▸ Developers ▸ Webhooks for the delivery errors and check the server logs for /api/billing/webhook. Stripe retries failed deliveries for up to three days." };
  }
  if (unresolvedReviews.length > 0 || failing.length > 0) {
    const parts = [
      ...(unresolvedReviews.length ? [`${plural(unresolvedReviews.length, "event")} awaiting manual review`] : []),
      ...(failing.length ? [`${plural(failing.length, "event")} not yet processed`] : [])
    ];
    return { ...base, state: "attention", reason: `${parts.join(" and ")}; processing has otherwise succeeded (last ${when(lastSuccessAt)}).`, action: "Compare each listed subscription with Stripe in Admin ▸ Users and use Sync with Stripe if they disagree. Do not replay events by hand." };
  }
  if (handledRecently === 0) {
    return { ...base, state: "no-recent-signal", reason: webhooks.totalEvents === 0 ? "No Stripe webhook has been received yet. This is not a failure." : `No Stripe event in the last ${WEBHOOK_WINDOW_DAYS} days; the last was processed ${when(lastSuccessAt)}. This is not a failure.`, action: "No action needed. Stripe sends events only when billing changes." };
  }
  return { ...base, state: "healthy", reason: `Stripe events are being processed: last ${when(lastSuccessAt)}, none awaiting review or retry.`, action: "No action needed." };
}

export type WebhookQueueSummary = Readonly<{
  /** Receipts that need something: unresolved manual reviews, retryable failures, stopped or never-claimed receipts. */
  open: number;
  /** Manual reviews that later evidence has already overtaken: kept for the record, no action needed. */
  historical: number;
}>;

/** The webhook queue in the same terms as the Webhooks row, for the Settings page (null when the ledger is unreadable). */
export function summarizeWebhookQueue(evidence: SystemHealthEvidence): WebhookQueueSummary | null {
  const { webhooks } = evidence;
  if (!webhooks) return null;
  const now = evidence.now.getTime();
  let open = 0;
  let historical = 0;
  for (const item of webhooks.open) {
    if (item.state === "manual_review") {
      if (supersession(item, webhooks.laterProcessed, webhooks.projections) === null) open += 1; else historical += 1;
    } else if (isLiveWebhookWork(item, now)) {
      open += 1;
    }
  }
  return { open, historical };
}

export function evaluateReconciliation(evidence: SystemHealthEvidence): HealthSignal {
  const checkedAt = evidence.now.toISOString();
  const freshness = `Every live subscription must be re-read from Stripe at least every ${RECONCILIATION_MAX_AGE_HOURS - 4} hours (daily reconciliation, webhooks, or Sync with Stripe).`;
  if (!evidence.reconciliation) return unavailableSignal("reconciliation", "Subscription sync", checkedAt, freshness);
  const live = evidence.reconciliation.subscriptions.filter((row) => !TERMINAL_SUBSCRIPTION_STATES.has(row.status));
  const lastSuccessAt = latest(evidence.reconciliation.subscriptions.filter((row) => row.source === "reconciliation").map((row) => row.lastSynchronizedAt));
  const freshest = latest(live.map((row) => row.lastSynchronizedAt));
  const stale = live.filter((row) => !Number.isFinite(time(row.lastSynchronizedAt)) || evidence.now.getTime() - time(row.lastSynchronizedAt) > RECONCILIATION_MAX_AGE_HOURS * HOUR);
  const oldest = earliest(stale.map((row) => row.lastSynchronizedAt));
  // "Last failure" is the moment the oldest subscription became overdue.
  const overdueSince = oldest === null ? null : new Date(time(oldest) + (RECONCILIATION_MAX_AGE_HOURS - 4) * HOUR).toISOString();
  const details = [
    `${plural(live.length, "live subscription")}; ${plural(live.length - stale.length, "subscription")} re-read from Stripe in the last ${RECONCILIATION_MAX_AGE_HOURS - 4} hours.`,
    `Last change applied by the scheduled reconciliation: ${when(lastSuccessAt)}.`
  ];
  const base = { key: "reconciliation" as const, label: "Subscription sync", checkedAt, freshness, lastSuccessAt, details };
  if (!evidence.reconciliation.expected) {
    return { ...base, state: "no-recent-signal", lastFailureAt: null, reason: "Scheduled reconciliation runs only on the production deployment.", action: "No action needed outside production." };
  }
  if (live.length === 0) {
    return { ...base, state: "no-recent-signal", lastFailureAt: null, reason: "No live subscription needs to be kept in sync. This is not a failure.", action: "No action needed." };
  }
  if (stale.length > 0) {
    return { ...base, state: "attention", lastFailureAt: overdueSince, reason: `${plural(stale.length, "live subscription")} not re-read from Stripe in ${RECONCILIATION_MAX_AGE_HOURS - 4} hours (last read ${when(oldest)}): the daily reconciliation has not refreshed ${stale.length === 1 ? "it" : "them"}.`, action: "Check the Vercel cron for /api/internal/billing/reconcile: it must return 200. Until it does, a lost webhook would not be repaired automatically; Sync with Stripe in Admin ▸ Users repairs one account on demand." };
  }
  return { ...base, state: "healthy", lastFailureAt: null, reason: `Every live subscription matches a Stripe read from the last ${RECONCILIATION_MAX_AGE_HOURS - 4} hours (latest ${when(freshest)}).`, action: "No action needed." };
}

export function evaluateStorage(evidence: SystemHealthEvidence): HealthSignal {
  const checkedAt = evidence.now.toISOString();
  const freshness = "Checked on every dashboard load.";
  if (!evidence.storage) return unavailableSignal("storage", "Private storage", checkedAt, freshness);
  const missing = REQUIRED_PRIVATE_BUCKETS.filter((bucket) => !evidence.storage!.buckets.includes(bucket));
  const base = { key: "storage" as const, label: "Private storage", checkedAt, freshness, lastFailureAt: null, details: [`Required private buckets: ${REQUIRED_PRIVATE_BUCKETS.join(", ")}.`] };
  if (missing.length > 0) {
    return { ...base, state: "degraded", lastSuccessAt: null, lastFailureAt: checkedAt, reason: `Missing required private ${missing.length === 1 ? "bucket" : "buckets"}: ${missing.join(", ")}. Uploads and downloads that use ${missing.length === 1 ? "it" : "them"} fail.`, action: "Restore the bucket from the storage migration before publishing or uploading content." };
  }
  return { ...base, state: "healthy", lastSuccessAt: checkedAt, reason: "All required private buckets are present.", action: "No action needed." };
}

export function evaluatePackages(evidence: SystemHealthEvidence): HealthSignal {
  const checkedAt = evidence.now.toISOString();
  const freshness = "Every imported game package, checked on every dashboard load.";
  if (!evidence.packages) return unavailableSignal("packages", "Game package validation", checkedAt, freshness);
  const states = evidence.packages.states;
  const validating = states.filter((state) => state === "validating").length;
  const published = states.filter((state) => state === "published").length;
  const base = { key: "packages" as const, label: "Game package validation", checkedAt, freshness, lastSuccessAt: null, lastFailureAt: null, details: [`${plural(states.length, "package")}; ${published} published.`] };
  if (states.length === 0) {
    return { ...base, state: "no-packages", reason: "No ZIP game packages have been imported. Every current game ships with the platform. This is neutral.", action: "No action needed." };
  }
  if (validating > 0) {
    return { ...base, state: "attention", reason: `${plural(validating, "package")} stopped part-way through validation.`, action: "Open Admin ▸ Games and re-import or archive the package." };
  }
  return { ...base, state: "healthy", reason: `All ${plural(states.length, "package")} passed validation.`, action: "No action needed." };
}

function quarantine(key: QuarantineSignal["key"], label: string, checkedAt: string, timestamps: readonly string[] | null, roles: readonly string[], action: string): QuarantineSignal {
  if (timestamps === null) {
    return { key, label, count: null, severity: "unavailable", checkedAt, newestAt: null, details: [], reason: "The quarantine could not be read.", action: "Reload the dashboard." };
  }
  const newestAt = latest(timestamps);
  const oldestAt = earliest(timestamps);
  const kinds = new Map<string, number>();
  for (const role of roles) kinds.set(role, (kinds.get(role) ?? 0) + 1);
  const details = [...kinds].map(([role, count]) => `${count} ${role}`);
  if (timestamps.length === 0) return { key, label, count: 0, severity: "clear", checkedAt, newestAt: null, details, reason: "Nothing is quarantined.", action: "No action needed." };
  return {
    key, label, count: timestamps.length, severity: "review", checkedAt, newestAt, details,
    reason: `${plural(timestamps.length, "rejected upload")} held privately and never served (${timestamps.length === 1 ? `on ${when(newestAt)}` : `${when(oldestAt)} to ${when(newestAt)}`}). The validator worked as designed; this is not an outage.`,
    action
  };
}

const ROLE_LABELS: Readonly<Record<string, string>> = { primary_pdf: "PDF", answer_key_pdf: "answer-key PDF", thumbnail: "thumbnail image", preview_image: "preview image" };

/**
 * PDF quarantine with each upload placed in one of three groups:
 *  - awaiting a decision: the resource is not archived and no later upload for the same role was accepted;
 *  - replaced: a later upload for the same resource and role was accepted, so the rejected one blocks nothing;
 *  - historical: the resource is archived.
 * Severity is "review" only while something awaits a decision; otherwise the remaining records are historical.
 * Quarantine never lowers Application: a rejected upload is the validator working, not an outage.
 */
export function evaluatePdfQuarantine(checkedAt: string, files: readonly QuarantinedFileEvidence[] | null): QuarantineSignal {
  const action = "Review the files in the Homework and Quizzes libraries. Re-export any you still need without scripts or form actions and upload them as a new version; archive drafts you no longer need. Quarantined files are never released.";
  if (files === null) return quarantine("pdf-quarantine", "PDF quarantine", checkedAt, null, [], action);
  if (files.length === 0) return quarantine("pdf-quarantine", "PDF quarantine", checkedAt, [], [], action);
  const historical = files.filter((file) => file.resourceState === "archived").length;
  const replaced = files.filter((file) => file.resourceState !== "archived" && file.replaced).length;
  const awaiting = files.length - historical - replaced;
  const onPublished = files.filter((file) => file.resourceState === "published" && !file.replaced).length;
  const base = quarantine("pdf-quarantine", "PDF quarantine", checkedAt, files.map((file) => file.quarantinedAt), files.map((file) => ROLE_LABELS[file.role] ?? file.role), action);
  const groups = [
    `${awaiting} awaiting a decision on ${awaiting === 1 ? "an unarchived resource" : "unarchived resources"}`,
    `${replaced} replaced by a later accepted upload`,
    `${historical} on archived resources (historical)`
  ];
  return {
    ...base,
    severity: awaiting > 0 ? "review" : "historical",
    details: [...groups.map((group) => `${group[0]!.toUpperCase()}${group.slice(1)}.`), ...base.details],
    reason: `${base.reason} ${groups.join("; ")}. ${onPublished === 0 ? "None blocks a published resource." : `${plural(onPublished, "rejected upload")} belong${onPublished === 1 ? "s" : ""} to a published resource whose earlier accepted version is still served.`}`
  };
}

export function evaluateSystemHealth(evidence: SystemHealthEvidence): SystemHealthReport {
  const checkedAt = evidence.now.toISOString();
  const signals = [evaluateEmail(evidence), evaluateWebhooks(evidence), evaluateReconciliation(evidence), evaluateStorage(evidence), evaluatePackages(evidence)];
  const zip = evidence.zipQuarantine;
  const quarantined = [
    evaluatePdfQuarantine(checkedAt, evidence.pdfQuarantine ? evidence.pdfQuarantine.files : null),
    quarantine("zip-quarantine", "ZIP quarantine", checkedAt, zip ? zip.events.map((event) => event.createdAt) : null,
      zip ? zip.events.map(() => "rejected package") : [],
      "Review the findings in Admin ▸ Games before importing the package again.")
  ];
  return { checkedAt, application: aggregateApplication(evidence, signals), signals, quarantine: quarantined };
}

/** Application = the platform itself plus every confirmed child condition. Neutral and unknown-but-quiet children never lower it. */
export function aggregateApplication(evidence: Pick<SystemHealthEvidence, "now" | "database">, signals: readonly HealthSignal[]): HealthSignal {
  const checkedAt = evidence.now.toISOString();
  const freshness = "Derived from the rows below on every dashboard load.";
  if (evidence.database === "unavailable") {
    return { key: "application", label: "Application", state: "unavailable", checkedAt, freshness, lastSuccessAt: null, lastFailureAt: null, details: [], reason: "The operational database could not be read, so no health can be confirmed.", action: "Check the Supabase project status and the server logs; the dashboard shows no estimated values meanwhile." };
  }
  const named = (rows: readonly HealthSignal[]) => rows.map((row) => row.label).join(", ");
  const degraded = signals.filter((row) => row.state === "degraded");
  const attention = signals.filter((row) => row.state === "attention");
  const unknown = signals.filter((row) => row.state === "unavailable");
  const quiet = signals.filter((row) => row.state === "no-recent-signal" || row.state === "no-packages");
  const details = [
    "Database: reachable; this dashboard's queries completed.",
    ...signals.map((row) => `${row.label}: ${HEALTH_STATE_LABELS[row.state].toLowerCase()}.`),
    ...(quiet.length ? [`${named(quiet)} ${quiet.length === 1 ? "has" : "have"} nothing to judge right now and ${quiet.length === 1 ? "does" : "do"} not lower Application.`] : [])
  ];
  const flagged = [...degraded, ...attention];
  const base = { key: "application" as const, label: "Application", checkedAt, freshness, lastSuccessAt: null, lastFailureAt: latest(flagged.map((row) => row.lastFailureAt)), details };
  if (degraded.length > 0) {
    return { ...base, state: "degraded", reason: `Confirmed failing: ${named(degraded)}.`, action: "Open the degraded row below for its evidence and recommended action." };
  }
  if (attention.length > 0 || unknown.length > 0) {
    const parts = [...(attention.length ? [`needs attention: ${named(attention)}`] : []), ...(unknown.length ? [`could not be verified: ${named(unknown)}`] : [])];
    return { ...base, state: "attention", reason: `Core services are up; ${parts.join("; ")}.`, action: "Open the flagged row below for its evidence and recommended action." };
  }
  return { ...base, lastSuccessAt: checkedAt, state: "healthy", reason: quiet.length ? `Core services verified; ${named(quiet)} without recent activity.` : "Core services verified; no confirmed failures.", action: "No action needed." };
}
