import "server-only";

import { randomUUID } from "node:crypto";

import { isSyntheticSecurityTestingAllowed, securityEnvironmentLabel } from "./security-environment";
import { emitSecurityEvent } from "./security-events";
import { SECURITY_EVENT_REGISTRY, type SecurityEventType } from "./security-schema";
import { ingestSecurityEvents, type SecurityIngestInput, type SecurityIngestOutcome } from "./security-sink";

/**
 * Owner-run synthetic scenarios for exercising the alert pipeline.
 *
 * Every event produced here is flagged `synthetic: true` and is counted only
 * in the synthetic partition, so a scenario can neither trigger a real alert
 * nor mask one. The scenarios are refused outright anywhere the deployment
 * label is production or cannot be established.
 */
type SyntheticEvent = Readonly<{ type: SecurityEventType; count: number; detail: Readonly<Record<string, string | number | boolean>> }>;

export type SyntheticSecurityScenario = Readonly<{
  title: string;
  description: string;
  events: readonly SyntheticEvent[];
  /** The alert rule the scenario is designed to cross, if any. */
  expectedAlert: string | null;
}>;

const scenario = (input: SyntheticSecurityScenario): SyntheticSecurityScenario => Object.freeze(input);

export const SYNTHETIC_SECURITY_SCENARIOS = Object.freeze({
  "webhook-signature-spike": scenario({
    title: "Invalid webhook signature spike",
    description: "Six invalid-signature refusals in one burst; crosses the webhook-signature-spike rule (5 in 10 minutes).",
    events: [{ type: "webhook-signature-invalid", count: 6, detail: { reason: "verification-failed" } }],
    expectedAlert: "webhook-signature-spike"
  }),
  "rejected-sign-in": scenario({
    title: "One rejected sign-in",
    description: "A single rejected credential. Recorded, never alerted.",
    events: [{ type: "auth-login-failed", count: 1, detail: { scope: "sign-in" } }],
    expectedAlert: null
  }),
  "network-throttle": scenario({
    title: "Sustained network throttling",
    description: "Twelve network-dimension throttle events; crosses the network-throttle rule (12 in 15 minutes).",
    events: [{ type: "auth-rate-limited", count: 12, detail: { scope: "sign-in", dimension: "request" } }],
    expectedAlert: "network-throttle"
  }),
  "account-target-throttle": scenario({
    title: "Account-targeted throttling",
    description: "Six account-dimension throttle events; crosses the account-target-throttle rule (6 in 15 minutes).",
    events: [{ type: "auth-rate-limited", count: 6, detail: { scope: "sign-in", dimension: "account" } }],
    expectedAlert: "account-target-throttle"
  }),
  "admin-auth-denial": scenario({
    title: "Admin authentication failures",
    description: "Three failed admin sign-ins; crosses the admin-auth-attack rule (3 in 15 minutes).",
    events: [{ type: "admin-auth-failed", count: 3, detail: { reason: "credentials", step: "login" } }],
    expectedAlert: "admin-auth-attack"
  }),
  "ssrf-blocked": scenario({
    title: "SSRF destination blocked",
    description: "One outbound destination refused as loopback; crosses the ssrf-attempt rule (1 in 60 minutes).",
    events: [{ type: "ssrf-blocked", count: 1, detail: { reason: "resolved-address-blocked", destinationClass: "loopback", surface: "admin-external-destination" } }],
    expectedAlert: "ssrf-attempt"
  }),
  "cross-user-authorization-denial": scenario({
    title: "Authorization anomalies",
    description: "Three forged-ticket denials; crosses the authorization-anomaly rule (3 in 60 minutes).",
    events: [{ type: "authorization-denied", count: 3, detail: { surface: "game-ticket", reason: "signature-invalid", anomaly: true } }],
    expectedAlert: "authorization-anomaly"
  }),
  "pipeline-heartbeat": scenario({
    title: "Pipeline heartbeat",
    description: "One synthetic test event through the whole store path. Proves storage without crossing any rule.",
    events: [{ type: "security-synthetic-test", count: 1, detail: { probe: "heartbeat" } }],
    expectedAlert: null
  })
} as const);

export type SyntheticScenarioKey = keyof typeof SYNTHETIC_SECURITY_SCENARIOS;

export function isSyntheticScenarioKey(value: unknown): value is SyntheticScenarioKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SYNTHETIC_SECURITY_SCENARIOS, value);
}

/** The raw emissions a scenario produces; every one is unmistakably marked. */
export function syntheticScenarioEvents(key: SyntheticScenarioKey, now = new Date()): readonly SecurityIngestInput[] {
  const inputs: SecurityIngestInput[] = [];
  const deployment = securityEnvironmentLabel();
  for (const item of SYNTHETIC_SECURITY_SCENARIOS[key].events) {
    for (let index = 0; index < item.count; index += 1) {
      inputs.push({
        raw: {
          category: SECURITY_EVENT_REGISTRY[item.type].category,
          severity: "info",
          code: item.type,
          // Unique per event, so the emitter's de-duplication never collapses a burst.
          correlationId: `synthetic-${key}-${index}-${randomUUID().slice(0, 8)}`,
          detail: { ...item.detail, synthetic: true, scenario: key, deployment },
          eventId: randomUUID().replace(/-/g, ""),
          emittedAt: now.toISOString()
        }
      });
    }
  }
  return inputs;
}

/**
 * Runs one scenario through the real store and the real alert rules. Awaited
 * deliberately — unlike ordinary persistence — so the owner's result page can
 * state what was stored and whether the expected alert fired.
 */
export async function runSyntheticSecurityScenario(key: SyntheticScenarioKey, now = new Date()): Promise<SecurityIngestOutcome> {
  if (!isSyntheticSecurityTestingAllowed()) throw new Error("synthetic-security-testing-refused");
  // Announce it in the log stream too, so an external destination sees the
  // test for what it is.
  emitSecurityEvent("SECURITY_SYNTHETIC_TEST", { scenario: key, synthetic: true }, new Headers(), `synthetic-${key}-run`);
  return ingestSecurityEvents(syntheticScenarioEvents(key, now), { ingestSource: "synthetic", now });
}
