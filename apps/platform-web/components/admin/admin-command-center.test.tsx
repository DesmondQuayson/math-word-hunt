import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminDashboardSnapshot } from "@/lib/admin/dashboard";
import { ADMIN_SECTIONS } from "@/lib/admin/navigation";
import { REQUIRED_PRIVATE_BUCKETS, evaluateSystemHealth } from "@/lib/admin/system-health";

import { AdminCommandCenter } from "./admin-command-center";

const snapshot: AdminDashboardSnapshot = {
  state: "ready",
  metrics: [
    { key: "games", label: "Published Games", value: 0, detail: "Standalone catalog entries" },
    { key: "homework", label: "Homework PDFs", value: 0, detail: "Published lesson-scoped resources" }
  ],
  health: evaluateSystemHealth({
    now: new Date("2026-10-07T04:30:00.000Z"),
    database: "reachable",
    email: { signals: [], confirmations: [], signups: [] },
    webhooks: { totalEvents: 0, recent: [], lastHandledAt: null, open: [], laterProcessed: [], projections: [] },
    reconciliation: { expected: false, subscriptions: [] },
    storage: { buckets: [...REQUIRED_PRIVATE_BUCKETS] },
    packages: { states: [] },
    pdfQuarantine: { files: [{ role: "primary_pdf", quarantinedAt: "2026-08-22T19:37:55Z", resourceState: "draft", replaced: false }] },
    zipQuarantine: { events: [] }
  }),
  recentActions: []
};

afterEach(() => cleanup());

describe("Phase 8C admin command center", () => {
  it("provides all approved modules and truthful empty metrics", () => {
    render(<AdminCommandCenter snapshot={snapshot} activeSection="dashboard" csrfToken="test" signOutAction={vi.fn()} />);
    const navigation = screen.getByRole("navigation", { name: "Admin modules" });
    expect(navigation.querySelectorAll("a")).toHaveLength(ADMIN_SECTIONS.length);
    expect(navigation.textContent).toContain("MAP Prep");
    expect(screen.queryByText(/ShowMe Math/i)).toBeNull();
    expect(screen.getByText("Published Games").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText("Homework PDFs").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText(/Published lesson-scoped resources/)).toBeTruthy();
  });

  it("opens and filters the command interface from the keyboard", async () => {
    const user = userEvent.setup();
    render(<AdminCommandCenter snapshot={snapshot} activeSection="dashboard" csrfToken="test" signOutAction={vi.fn()} />);
    const search = screen.getByRole("searchbox", { name: "Find an admin area" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(search);
    await user.type(search, "quiz");
    expect(screen.getByRole("link", { name: /Quizzes/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Subscriptions/ })).toBeNull();
    await user.clear(search);
    await user.type(search, "missing module");
    expect(screen.getByRole("status").textContent).toContain("No admin areas match");
  });

  it("announces offline and unavailable states without inventing data", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<AdminCommandCenter snapshot={{ ...snapshot, state: "unavailable" }} activeSection="users" csrfToken="test" signOutAction={vi.fn()} />);
    expect(screen.getByText("You are offline.")).toBeTruthy();
    expect(screen.getByText("Live admin data is unavailable.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Users" })).toBeTruthy();
    expect(screen.getByText(/no placeholder data has been created/i)).toBeTruthy();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("explains every health row with expandable evidence and keeps neutral rows neutral", async () => {
    const user = userEvent.setup();
    render(<AdminCommandCenter snapshot={snapshot} activeSection="dashboard" csrfToken="test" signOutAction={vi.fn()} />);
    const panel = screen.getByRole("region", { name: "System health" });
    const row = (name: string) => [...panel.querySelectorAll<HTMLElement>("li.admin-health-row")].find((item) => item.querySelector(".admin-health-name")?.textContent === name)!;
    const badge = (name: string) => row(name).querySelector(".admin-health-badge")!;
    expect(badge("Application").textContent).toBe("Healthy");
    expect(badge("Email").textContent).toBe("No recent signal");
    expect(badge("Email").getAttribute("data-tone")).toBe("neutral");
    expect(badge("Webhooks").textContent).toBe("No recent signal");
    expect(badge("Game package validation").textContent).toBe("No packages");
    expect(badge("PDF quarantine").textContent).toBe("1");
    expect(badge("PDF quarantine").getAttribute("data-tone")).toBe("notice");
    expect(badge("ZIP quarantine").textContent).toBe("0");
    const email = row("Email").querySelector("details")!;
    expect(email.open).toBe(false);
    await user.click(within(row("Email")).getByText("Email"));
    expect(email.open).toBe(true);
    const evidence = within(email);
    for (const term of ["Status", "Last checked", "Last success", "Last failure", "Freshness"]) expect(evidence.getByText(term)).toBeTruthy();
    expect(evidence.getByText(/No email delivery has been recorded yet/)).toBeTruthy();
    expect(evidence.getByText(/Recommended action:/)).toBeTruthy();
    expect(panel.textContent).not.toMatch(/(?:sub|cus|in|evt|whsec|rk_live|sk_live)_[A-Za-z0-9]/);
  });
});
