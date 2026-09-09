import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminSecurityHealthSnapshot } from "@/lib/admin/security-health-model";

import { AdminSecurityHealth } from "./admin-security-health";

const snapshot: AdminSecurityHealthSnapshot = {
  state: "ready",
  environment: "staging",
  generatedAt: "2026-09-09T02:00:00.000Z",
  sinkMode: "database",
  drainConfigured: true,
  alertWebhookConfigured: false,
  syntheticAllowed: true,
  retentionDays: 30,
  severityTotals: {
    hour: { info: 3, medium: 1, high: 0, critical: 0 },
    day: { info: 30, medium: 6, high: 1, critical: 0 },
    week: { info: 300, medium: 6, high: 1, critical: 1 }
  },
  syntheticTotals: { hour: 6, day: 6, week: 6 },
  classes: [],
  topClasses: [{ eventType: "webhook-signature-invalid", summary: "A webhook arrived without a valid signature", source: "billing-webhook", severity: "medium", hour: 1, day: 6, week: 6, lastOccurredAt: "2026-09-09T01:59:00.000Z" }],
  groups: [{ key: "billing", label: "Webhooks and subscription synchronization", classes: [{ eventType: "webhook-signature-invalid", summary: "A webhook arrived without a valid signature", source: "billing-webhook", severity: "medium", hour: 1, day: 6, week: 6, lastOccurredAt: "2026-09-09T01:59:00.000Z" }] }],
  recentEvents: [{ occurredAt: "2026-09-09T01:59:00.000Z", eventType: "webhook-signature-invalid", summary: "A webhook arrived without a valid signature", severity: "medium", source: "billing-webhook", outcome: "denied", environment: "staging", correlationId: "cle1-abcdef123456-0123456789abcdef0123456789abcdef", synthetic: false, ingestSource: "in-process", detail: "reason: verification-failed" }],
  recentAlerts: [{ firedAt: "2026-09-09T01:59:30.000Z", ruleKey: "webhook-signature-spike", severity: "high", environment: "staging", count: 6, threshold: 5, windowSeconds: 600, correlationId: "alert-webhook-signature-spike-0123456789ab", synthetic: true, delivery: "webhook: not-configured" }],
  pipeline: [{ source: "in-process", lastReceivedAt: "2026-09-09T01:59:30.000Z", eventsLastDay: 42 }],
  lastEventAt: "2026-09-09T01:59:30.000Z",
  rules: [{ key: "webhook-signature-spike", title: "Repeated invalid webhook signatures", severity: "high", threshold: 5, windowSeconds: 600, cooldownSeconds: 3600, ownerAction: "Review the webhook delivery source and the endpoint signing secret." }],
  scenarios: [{ key: "webhook-signature-spike", title: "Invalid webhook signature spike", description: "Six refusals in a burst.", expectedAlert: "webhook-signature-spike" }]
};

afterEach(() => cleanup());

describe("Security Health admin section", () => {
  it("renders every section as labelled, keyboard-reachable regions with status carried by text", () => {
    render(<AdminSecurityHealth snapshot={snapshot} csrfToken="csrf-test" />);
    expect(screen.getByRole("heading", { level: 1, name: "Security Health" })).toBeTruthy();
    for (const name of ["Observability pipeline", "Severity by window", "Top event classes", "Event classes by control", "Alerts fired", "Recent events", "Alert rules", "Synthetic scenario"]) {
      expect(screen.getByRole("heading", { level: 2, name }), name).toBeTruthy();
    }
    // Every scrollable table is a labelled region a keyboard user can focus and scroll.
    const tables = Array.from(document.querySelectorAll(".admin-security-table"));
    expect(tables.length).toBeGreaterThanOrEqual(5);
    for (const table of tables) {
      expect(table.getAttribute("role")).toBe("region");
      expect(table.getAttribute("tabindex")).toBe("0");
      expect(table.getAttribute("aria-label")).toBeTruthy();
    }
    // Severity is a word, never only a colour.
    const severityTable = screen.getByRole("region", { name: "Security event counts by severity and window" });
    expect(within(severityTable).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["critical", "high", "medium", "info", "Synthetic (test) events"]);
    expect(within(severityTable).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Severity", "Last hour", "Last 24 hours", "Last 7 days"]);
    // Environment label is unmistakable and synthetic rows say so.
    expect(screen.getByText(/Security observability · STAGING/)).toBeTruthy();
    expect(screen.getAllByText(/SYNTHETIC TEST/).length).toBeGreaterThanOrEqual(1);
  });

  it("offers the synthetic form only where it is allowed, with CSRF, reason and explicit confirmation", () => {
    const { container } = render(<AdminSecurityHealth snapshot={snapshot} csrfToken="csrf-test" />);
    const form = container.querySelector("form.admin-security-form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("action")).toBe("/admin/security/synthetic");
    expect(form!.getAttribute("method")).toBe("post");
    expect((form!.querySelector("input[name=csrfToken]") as HTMLInputElement).value).toBe("csrf-test");
    expect(form!.querySelector("select[name=scenario][required]")).not.toBeNull();
    expect(form!.querySelector("textarea[name=reason][required]")).not.toBeNull();
    expect(form!.querySelector("input[type=checkbox][name=confirm][value=synthetic][required]")).not.toBeNull();
    cleanup();
    render(<AdminSecurityHealth snapshot={{ ...snapshot, environment: "production", syntheticAllowed: false }} csrfToken="csrf-test" />);
    expect(document.querySelector("form.admin-security-form")).toBeNull();
    expect(screen.getByText(/refuses them before reading the request/)).toBeTruthy();
  });

  it("states the result of an operation and never estimates an unavailable store", () => {
    render(<AdminSecurityHealth snapshot={{ ...snapshot, state: "unavailable", recentEvents: [], recentAlerts: [], groups: [], topClasses: [] }} csrfToken="csrf-test" result="synthetic-webhook-signature-spike-stored-6-alerts-1" />);
    expect(screen.getByRole("status").textContent).toContain("6 event(s) stored, 1 synthetic alert(s) fired");
    expect(screen.getByRole("alert").textContent).toContain("The security event store is unavailable.");
    expect(screen.getByText("No alerts have fired")).toBeTruthy();
    expect(screen.getByText("No events recorded")).toBeTruthy();
  });

  it("does not render raw identifiers beyond the correlation id and never a payload", () => {
    const { container } = render(<AdminSecurityHealth snapshot={snapshot} csrfToken="csrf-test" />);
    const html = container.innerHTML;
    expect(html).toContain("cle1-abcdef123456-0123456789abcdef0123456789abcdef");
    expect(html).not.toMatch(/@|sk_live|whsec_|eyJ|203\.0\.113/);
  });
});
