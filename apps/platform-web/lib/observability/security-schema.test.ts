import { describe, expect, it } from "vitest";

import { BILLING_LIFECYCLE_EVENTS } from "@/lib/billing/consumer-observability";

import { SECURITY_ALERT_RULES } from "./security-alerts";
import { SECURITY_EVENTS } from "./security-events";
import {
  SECURITY_EVENT_REGISTRY,
  SECURITY_SEVERITIES,
  classifySecurityOutcome,
  classifySecuritySeverity,
  isSecurityEventType
} from "./security-schema";

describe("security event registry", () => {
  it("covers every code the security taxonomy can emit", () => {
    for (const [name, descriptor] of Object.entries(SECURITY_EVENTS)) {
      expect(isSecurityEventType(descriptor.code), `${name} (${descriptor.code}) must be registered`).toBe(true);
      expect(SECURITY_EVENT_REGISTRY[descriptor.code as keyof typeof SECURITY_EVENT_REGISTRY].category, `${name} category`).toBe(descriptor.category);
    }
  });

  it("covers every billing lifecycle code so webhook health is observable", () => {
    for (const [name, descriptor] of Object.entries(BILLING_LIFECYCLE_EVENTS)) {
      expect(isSecurityEventType(descriptor.code), `${name} (${descriptor.code}) must be registered`).toBe(true);
      expect(SECURITY_EVENT_REGISTRY[descriptor.code as keyof typeof SECURITY_EVENT_REGISTRY].category).toBe("billing");
    }
  });

  it("covers the limiter outage code that predates the taxonomy", () => {
    expect(isSecurityEventType("rate-limiter-unavailable")).toBe(true);
    expect(SECURITY_EVENT_REGISTRY["rate-limiter-unavailable"].severity).toBe("critical");
  });

  it("classifies deliberately: control failures are critical, patterns are left to the rules", () => {
    for (const type of ["rate-limiter-unavailable", "staging-configuration-invalid", "security-config-error", "security-dependency-unavailable"] as const) {
      expect(SECURITY_EVENT_REGISTRY[type].severity, type).toBe("critical");
    }
    for (const type of ["auth-spray-suspected", "ssrf-blocked", "scheduler-auth-failed", "admin-auth-rate-limited", "entitlement-mismatch-unresolved"] as const) {
      expect(SECURITY_EVENT_REGISTRY[type].severity, type).toBe("high");
    }
    // A single rejected sign-in, refused code or staging probe is ordinary.
    for (const type of ["auth-login-failed", "authorized-code-failed", "staging-access-denied", "authorization-denied"] as const) {
      expect(SECURITY_EVENT_REGISTRY[type].severity, type).toBe("info");
    }
    for (const descriptor of Object.values(SECURITY_EVENT_REGISTRY)) {
      expect(SECURITY_SEVERITIES).toContain(descriptor.severity);
      expect(descriptor.source).toMatch(/^[a-z0-9-]{1,64}$/);
    }
  });

  it("escalates an authorization denial only when the producer marked it an anomaly", () => {
    expect(classifySecuritySeverity("authorization-denied", {})).toBe("info");
    expect(classifySecuritySeverity("authorization-denied", { anomaly: false })).toBe("info");
    expect(classifySecuritySeverity("authorization-denied", { anomaly: true })).toBe("high");
    // A string "true" is not a boolean true; a forged or sloppy value cannot escalate.
    expect(classifySecuritySeverity("authorization-denied", { anomaly: "true" })).toBe("info");
    expect(classifySecuritySeverity("auth-login-failed", { anomaly: true })).toBe("info");
  });

  it("reports an ignored synchronization as ignored rather than succeeded", () => {
    expect(classifySecurityOutcome("subscription-synchronized", { result: "stale_ignored" })).toBe("ignored");
    expect(classifySecurityOutcome("subscription-renewal-synchronized", { result: "superseded_ignored" })).toBe("ignored");
    expect(classifySecurityOutcome("subscription-synchronized", { result: "trial_shape_conflict" })).toBe("failed");
    expect(classifySecurityOutcome("subscription-synchronized", { result: "subscription-active" })).toBe("succeeded");
    expect(classifySecurityOutcome("webhook-signature-invalid", { result: "stale_ignored" })).toBe("denied");
  });

  it("keeps the pipeline's own self-reports out of the store", () => {
    expect(SECURITY_EVENT_REGISTRY["security-pipeline-error"].persisted).toBe(false);
    expect(SECURITY_EVENT_REGISTRY["security-alert-raised"].persisted).toBe(false);
    expect(SECURITY_EVENT_REGISTRY["security-synthetic-test"].persisted).toBe(true);
  });

  it("only lets alert rules name registered, persisted event types", () => {
    for (const rule of SECURITY_ALERT_RULES) {
      for (const type of rule.eventTypes) {
        expect(isSecurityEventType(type), `${rule.key} -> ${type}`).toBe(true);
        expect(SECURITY_EVENT_REGISTRY[type].persisted, `${rule.key} -> ${type} must be stored to be counted`).toBe(true);
      }
    }
  });
});
