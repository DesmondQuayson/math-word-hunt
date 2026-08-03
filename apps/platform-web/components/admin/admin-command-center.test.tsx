import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminDashboardSnapshot } from "@/lib/admin/dashboard";
import { ADMIN_SECTIONS } from "@/lib/admin/navigation";

import { AdminCommandCenter } from "./admin-command-center";

const snapshot: AdminDashboardSnapshot = {
  state: "ready",
  metrics: [
    { key: "games", label: "Published games", value: 0, detail: "Reviewed game resources" },
    { key: "downloads", label: "Recent downloads", value: 0, detail: "Entitlement-authorized downloads in the last 30 days" }
  ],
  emailHealth: "no-events",
  webhookHealth: "no-events",
  systemHealth: "operational",
  recentActions: []
};

afterEach(() => cleanup());

describe("Phase 8C admin command center", () => {
  it("provides all approved modules and truthful empty metrics", () => {
    render(<AdminCommandCenter snapshot={snapshot} activeSection="dashboard" csrfToken="test" signOutAction={vi.fn()} />);
    const navigation = screen.getByRole("navigation", { name: "Admin modules" });
    expect(navigation.querySelectorAll("a")).toHaveLength(ADMIN_SECTIONS.length);
    expect(screen.getByRole("link", { name: /MAP Prep/ })).toBeTruthy();
    expect(screen.queryByText(/ShowMe Math/i)).toBeNull();
    expect(screen.getByText("Published games").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText("Recent downloads").nextElementSibling?.textContent).toBe("0");
    expect(screen.getByText(/Entitlement-authorized downloads in the last 30 days/)).toBeTruthy();
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
    render(<AdminCommandCenter snapshot={{ ...snapshot, state: "unavailable", systemHealth: "degraded" }} activeSection="users" csrfToken="test" signOutAction={vi.fn()} />);
    expect(screen.getByText("You are offline.")).toBeTruthy();
    expect(screen.getByText("Live admin data is unavailable.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Users" })).toBeTruthy();
    expect(screen.getByText(/no placeholder data has been created/i)).toBeTruthy();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
});
