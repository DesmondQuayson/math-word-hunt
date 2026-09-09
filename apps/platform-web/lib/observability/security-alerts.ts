import "server-only";

import { randomBytes } from "node:crypto";

import { isPublicInternetAddress } from "@/lib/security/internet-address";

import { securityEnvironmentBanner, type SecurityEnvironment } from "./security-environment";
import { containsCredentialShape } from "./security-redaction";
import { isSecurityEventType, type SecurityEventType, type SecuritySeverity } from "./security-schema";

/**
 * Actionable alert rules over the security event store.
 *
 * Each rule answers one question: how many events of these types, in this
 * window, is enough that the owner should hear about it? The thresholds below
 * are set against what this product's normal traffic looks like — a school
 * morning puts a whole classroom behind one address and produces a steady
 * trickle of mistyped passwords — so single rejected sign-ins never page
 * anyone, while a single refused scheduler call or a single SSRF block does,
 * because nothing legitimate produces those at all.
 *
 * Every rule carries a cooldown. Once it has fired it stays quiet for that
 * long no matter how many more events arrive: a hundred identical attacks
 * produce one message that says "a hundred", not a hundred messages.
 */
export type SecurityAlertRule = Readonly<{
  key: string;
  title: string;
  eventTypes: readonly SecurityEventType[];
  /** Optional containment filter on the event metadata (`metadata @> filter`). */
  metadataFilter?: Readonly<Record<string, string | number | boolean>> | undefined;
  severity: SecuritySeverity;
  threshold: number;
  windowSeconds: number;
  cooldownSeconds: number;
  ownerAction: string;
}>;

const rule = (input: SecurityAlertRule): SecurityAlertRule => Object.freeze({ ...input, eventTypes: Object.freeze([...input.eventTypes]) });

export const SECURITY_ALERT_RULES: readonly SecurityAlertRule[] = Object.freeze([
  rule({
    key: "limiter-unavailable",
    title: "Sign-in rate limiter unavailable — production authentication is failing closed",
    eventTypes: ["rate-limiter-unavailable"],
    severity: "critical", threshold: 1, windowSeconds: 300, cooldownSeconds: 900,
    ownerAction: "Check Supabase availability and the limiter secret configuration; every sign-in is refused while this persists."
  }),
  rule({
    key: "security-configuration",
    title: "A security control is misconfigured or its dependency is unavailable",
    eventTypes: ["staging-configuration-invalid", "security-config-error", "security-dependency-unavailable"],
    severity: "critical", threshold: 1, windowSeconds: 300, cooldownSeconds: 3600,
    ownerAction: "Open Security Health, read the component in the event metadata, and correct that configuration before the next deployment."
  }),
  rule({
    key: "credential-spray",
    title: "Credential spray suspected: one address failing against many accounts",
    eventTypes: ["auth-spray-suspected"],
    severity: "high", threshold: 1, windowSeconds: 900, cooldownSeconds: 1800,
    ownerAction: "Review sign-in failure volume; consider an edge rule for the source only if it is not a school network."
  }),
  rule({
    key: "ssrf-attempt",
    title: "An outbound destination was blocked by SSRF protection",
    eventTypes: ["ssrf-blocked"],
    severity: "high", threshold: 1, windowSeconds: 3600, cooldownSeconds: 3600,
    ownerAction: "Only an authenticated admin can reach this path. Confirm the admin session is yours and review the destination class recorded."
  }),
  rule({
    key: "scheduler-auth",
    title: "A scheduler route refused a caller",
    eventTypes: ["scheduler-auth-failed"],
    severity: "high", threshold: 1, windowSeconds: 3600, cooldownSeconds: 3600,
    ownerAction: "Verify CRON_SECRET matches the platform scheduler; an unknown caller is probing internal routes."
  }),
  rule({
    key: "admin-auth-attack",
    title: "Repeated admin authentication failures",
    eventTypes: ["admin-auth-failed", "admin-auth-rate-limited"],
    severity: "high", threshold: 3, windowSeconds: 900, cooldownSeconds: 1800,
    ownerAction: "If these are not your own attempts, review the admin audit log and consider revoking admin sessions."
  }),
  rule({
    key: "admin-csrf",
    title: "Repeated admin CSRF rejections",
    eventTypes: ["admin-csrf-rejected"],
    severity: "medium", threshold: 3, windowSeconds: 900, cooldownSeconds: 3600,
    ownerAction: "Expired admin pages cause single rejections; repeated ones suggest a forged cross-site request."
  }),
  rule({
    key: "authorization-anomaly",
    title: "Authorization anomalies: authenticated callers reaching surfaces they do not own",
    eventTypes: ["authorization-denied"],
    metadataFilter: { anomaly: true },
    severity: "high", threshold: 3, windowSeconds: 3600, cooldownSeconds: 3600,
    ownerAction: "Review the surface and reason recorded; a forged entitlement ticket or an admin-surface probe by a signed-in account."
  }),
  rule({
    key: "webhook-signature-spike",
    title: "Repeated invalid webhook signatures",
    eventTypes: ["webhook-signature-invalid"],
    severity: "high", threshold: 5, windowSeconds: 600, cooldownSeconds: 3600,
    ownerAction: "Review the webhook delivery source and the endpoint signing secret; Stripe never sends unsigned events."
  }),
  rule({
    key: "webhook-replay",
    title: "Repeated webhook replays",
    eventTypes: ["webhook-replay-detected"],
    severity: "medium", threshold: 5, windowSeconds: 600, cooldownSeconds: 3600,
    ownerAction: "Idempotency refused them. Check Stripe's delivery attempts for the endpoint."
  }),
  rule({
    key: "webhook-processing",
    title: "Repeated webhook processing failures",
    eventTypes: ["webhook-processing-failed", "webhook-manual-review"],
    severity: "high", threshold: 3, windowSeconds: 3600, cooldownSeconds: 3600,
    ownerAction: "Open Subscriptions in the admin workspace and review parked events; renewals may be waiting."
  }),
  rule({
    key: "entitlement-invariant",
    title: "An entitlement invariant failed and was not repaired",
    eventTypes: ["entitlement-mismatch-unresolved", "subscription-status-unknown"],
    severity: "high", threshold: 1, windowSeconds: 86_400, cooldownSeconds: 21_600,
    ownerAction: "Run Sync with Stripe for the affected account from the admin workspace and review the reconciliation reason."
  }),
  rule({
    key: "network-throttle",
    title: "Sustained network-level sign-in throttling",
    eventTypes: ["auth-rate-limited"],
    metadataFilter: { dimension: "request" },
    severity: "medium", threshold: 12, windowSeconds: 900, cooldownSeconds: 3600,
    ownerAction: "A school network can hit this on a bad morning. Compare with rejected sign-ins before treating it as an attack."
  }),
  rule({
    key: "account-target-throttle",
    title: "Account-targeted sign-in throttling",
    eventTypes: ["auth-rate-limited"],
    metadataFilter: { dimension: "account" },
    severity: "medium", threshold: 6, windowSeconds: 900, cooldownSeconds: 3600,
    ownerAction: "Specific accounts are being aimed at from more than one address. Recovery remains open to their owners."
  }),
  rule({
    key: "rejected-sign-ins",
    title: "Unusual volume of rejected sign-ins",
    eventTypes: ["auth-login-failed"],
    severity: "medium", threshold: 150, windowSeconds: 900, cooldownSeconds: 3600,
    ownerAction: "Well above a classroom's normal forgetfulness. Review the spray and throttle signals alongside it."
  }),
  rule({
    key: "recovery-abuse",
    title: "Recovery or sign-up budgets exhausted repeatedly",
    eventTypes: ["auth-recovery-rate-limited", "auth-signup-rate-limited"],
    severity: "medium", threshold: 3, windowSeconds: 3600, cooldownSeconds: 3600,
    ownerAction: "Someone is grinding the recovery or sign-up form. No mail is sent past the budget; review for enumeration attempts."
  }),
  rule({
    key: "authorized-code-pressure",
    title: "Authorized-code budget exhausted repeatedly",
    eventTypes: ["authorized-code-rate-limited"],
    severity: "medium", threshold: 3, windowSeconds: 3600, cooldownSeconds: 3600,
    ownerAction: "A school may be mistyping a rotated code. If not, rotate the authorized code."
  })
]);

export function alertRulesTouchedBy(eventTypes: ReadonlySet<string>): readonly SecurityAlertRule[] {
  return SECURITY_ALERT_RULES.filter((candidate) => candidate.eventTypes.some((type) => eventTypes.has(type)));
}

export type RaisedSecurityAlert = Readonly<{
  correlationId: string;
  firedAt: string;
  environment: SecurityEnvironment;
  synthetic: boolean;
  rule: SecurityAlertRule;
  count: number;
}>;

/**
 * What the evaluation needs from the store. The claim is the de-duplication
 * primitive and it is atomic in the database, so two serverless instances
 * that cross a threshold in the same second still produce one alert.
 */
export type SecurityAlertStore = Readonly<{
  countSince(rule: SecurityAlertRule, since: Date, synthetic: boolean): Promise<number | null>;
  claim(rule: SecurityAlertRule, synthetic: boolean): Promise<boolean>;
}>;

export function alertCorrelationId(ruleKey: string): string {
  return `alert-${ruleKey}-${randomBytes(6).toString("hex")}`;
}

/**
 * Evaluates the rules that any of `touchedTypes` participate in.
 *
 * Synthetic events are counted in their own partition: a synthetic scenario
 * can only ever raise a synthetic alert, and a real alert never counts a
 * synthetic event. That is what lets the owner exercise the whole pipeline on
 * staging without either masking or manufacturing a real signal.
 */
export async function evaluateSecurityAlerts(input: Readonly<{
  store: SecurityAlertStore;
  touchedTypes: ReadonlySet<string>;
  synthetic: boolean;
  environment: SecurityEnvironment;
  now?: Date;
}>): Promise<readonly RaisedSecurityAlert[]> {
  const now = input.now ?? new Date();
  const raised: RaisedSecurityAlert[] = [];
  for (const candidate of alertRulesTouchedBy(input.touchedTypes)) {
    const since = new Date(now.getTime() - candidate.windowSeconds * 1000);
    const count = await input.store.countSince(candidate, since, input.synthetic);
    if (count === null || count < candidate.threshold) continue;
    if (!await input.store.claim(candidate, input.synthetic)) continue;
    raised.push(Object.freeze({
      correlationId: alertCorrelationId(candidate.key),
      firedAt: now.toISOString(),
      environment: input.environment,
      synthetic: input.synthetic,
      rule: candidate,
      count
    }));
  }
  return raised;
}

function describeWindow(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} day${seconds === 86_400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  return `${Math.round(seconds / 60)} minutes`;
}

/**
 * The human-readable alert. It is built ONLY from the rule table and counts —
 * never from event metadata — so there is structurally nothing in it to redact.
 * The credential-shape check at the end is a tripwire, not a dependency.
 */
export function formatSecurityAlert(alert: RaisedSecurityAlert): Readonly<{ subject: string; text: string }> {
  const banner = securityEnvironmentBanner(alert.environment);
  const prefix = alert.synthetic ? `[SYNTHETIC TEST] ${banner}` : banner;
  const subject = `MathNexa Security Alert · ${prefix} · ${alert.rule.severity.toUpperCase()} · ${alert.rule.title}`;
  const lines = [
    "MathNexa Security Alert",
    "",
    `Environment: ${banner}`,
    `Severity: ${alert.rule.severity.toUpperCase()}`,
    `Event: ${alert.rule.title}`,
    `Rule: ${alert.rule.key}`,
    `Window: ${describeWindow(alert.rule.windowSeconds)}`,
    `Count: ${alert.count} (threshold ${alert.rule.threshold})`,
    `Correlation: ${alert.correlationId}`,
    `Fired at: ${alert.firedAt}`,
    "",
    `Recommended action: ${alert.rule.ownerAction}`
  ];
  if (alert.synthetic) {
    lines.push("", "SYNTHETIC · STAGING TEST EVENT · generated by an owner-run scenario. No action is required.");
  }
  const text = lines.join("\n");
  if (containsCredentialShape(text)) throw new Error("security-alert-format-invariant");
  return Object.freeze({ subject, text });
}

/** Sinks that receive alerts. Every sink is best-effort and reports its own outcome. */
export type SecurityAlertDelivery = Readonly<Record<string, "delivered" | "failed" | "not-configured" | "refused">>;

const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Validates an owner-configured alert webhook URL.
 *
 * HTTPS only, and an address literal must be a public one; a hostname is
 * accepted because the owner configured it server-side, and the request goes
 * through the platform's own resolver. This is a configuration value, not a
 * request input, so the check is defence in depth rather than the boundary.
 */
export function alertWebhookUrl(source: Readonly<Record<string, string | undefined>> = process.env): URL | null {
  const value = source.MVH_SECURITY_ALERT_WEBHOOK_URL?.trim() ?? "";
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const literal = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
    if (/^[\d.]+$|:/.test(literal) && !isPublicInternetAddress(literal)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function deliverSecurityAlert(
  alert: RaisedSecurityAlert,
  sinks: Readonly<{ webhook: URL | null; fetchImplementation?: typeof fetch }>
): Promise<SecurityAlertDelivery> {
  const formatted = formatSecurityAlert(alert);
  const delivery: Record<string, SecurityAlertDelivery[string]> = {};
  if (!sinks.webhook) {
    delivery.webhook = "not-configured";
    return Object.freeze(delivery);
  }
  const doFetch = sinks.fetchImplementation ?? fetch;
  try {
    const response = await doFetch(sinks.webhook, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "MathNexa-Security-Alerts/1.0" },
      body: JSON.stringify({
        text: `${formatted.subject}\n\n${formatted.text}`,
        subject: formatted.subject,
        environment: alert.environment,
        severity: alert.rule.severity,
        rule: alert.rule.key,
        event: alert.rule.title,
        windowSeconds: alert.rule.windowSeconds,
        count: alert.count,
        threshold: alert.rule.threshold,
        correlationId: alert.correlationId,
        ownerAction: alert.rule.ownerAction,
        synthetic: alert.synthetic,
        firedAt: alert.firedAt
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
    });
    delivery.webhook = response.status >= 200 && response.status < 300 ? "delivered" : "failed";
  } catch {
    delivery.webhook = "failed";
  }
  return Object.freeze(delivery);
}

export function isAlertRuleKey(value: unknown): value is string {
  return typeof value === "string" && SECURITY_ALERT_RULES.some((candidate) => candidate.key === value);
}

/** Guards the registry at module load: a rule may only name registered, persisted event types. */
for (const candidate of SECURITY_ALERT_RULES) {
  for (const type of candidate.eventTypes) {
    if (!isSecurityEventType(type)) throw new Error(`security-alert-rule-unknown-type:${candidate.key}`);
  }
}
