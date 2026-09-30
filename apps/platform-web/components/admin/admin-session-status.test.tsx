import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSessionClock, AdminSessionNotice, formatSessionRemaining, useAdminSessionCountdown, type AdminSessionTiming } from "./admin-session-status";

function Harness({ timing }: Readonly<{ timing: AdminSessionTiming }>) {
  const countdown = useAdminSessionCountdown(timing, "csrf-token");
  return <header><AdminSessionClock countdown={countdown} /><AdminSessionNotice countdown={countdown} signInHref="/admin/sign-in?expired=1&next=%2Fadmin" /></header>;
}

const start = new Date("2026-09-30T10:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function timing(absoluteMinutes: number, idleMinutes: number): AdminSessionTiming {
  return {
    absoluteExpiresAt: new Date(start.getTime() + absoluteMinutes * 60_000).toISOString(),
    idleExpiresAt: new Date(start.getTime() + idleMinutes * 60_000).toISOString(),
    serverNow: start.toISOString()
  };
}

describe("Phase 2B session countdown", () => {
  it("formats the remaining time", () => {
    expect(formatSessionRemaining(107 * 60_000)).toBe("1h 47m");
    expect(formatSessionRemaining(120 * 60_000)).toBe("2h");
    expect(formatSessionRemaining(9 * 60_000 + 1)).toBe("10m");
    expect(formatSessionRemaining(-5)).toBe("0m");
  });

  it("shows the time left before the 2-hour limit without announcing every tick", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<Harness timing={timing(107, 60)} />);
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("1h 47m remaining")).toBeTruthy();
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.textContent).toBe("");
    act(() => { vi.advanceTimersByTime(20 * 60_000); });
    expect(screen.getByText("1h 27m remaining")).toBeTruthy();
    expect(liveRegion.textContent, "no announcement before the warning threshold").toBe("");
    expect(fetchSpy, "the countdown never extends the session on its own").not.toHaveBeenCalled();
  });

  it("warns once at 10 minutes before an absolute expiry, then announces the end", () => {
    render(<Harness timing={timing(15, 60)} />);
    act(() => { vi.advanceTimersByTime(5 * 60_000 + 15_000); });
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.textContent).toMatch(/^Your Super Admin session expires in (10|9) minutes\.$/);
    expect(screen.getByText(/Save your work/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stay signed in" }), "the absolute limit cannot be extended").toBeNull();
    const firstAnnouncement = liveRegion.textContent;
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(liveRegion.textContent, "the warning is announced once").toBe(firstAnnouncement);
    act(() => { vi.advanceTimersByTime(8 * 60_000); });
    expect(liveRegion.textContent).toBe("Your Super Admin session has ended. Sign in again to continue.");
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/admin/sign-in?expired=1&next=%2Fadmin");
  });

  it("offers to stay signed in before an idle expiry and keeps the absolute limit", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      state: "active",
      absoluteExpiresAt: new Date(start.getTime() + 110 * 60_000).toISOString(),
      idleExpiresAt: new Date(start.getTime() + 112 * 60_000).toISOString(),
      serverNow: new Date(start.getTime() + 52 * 60_000).toISOString()
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<Harness timing={timing(110, 60)} />);
    act(() => { vi.advanceTimersByTime(52 * 60_000); });
    expect(screen.getByRole("status").textContent).toMatch(/because of inactivity\.$/);
    const stay = screen.getByRole("button", { name: "Stay signed in" });
    vi.useRealTimers();
    act(() => { stay.click(); });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/still ends at the 2-hour limit/));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/session/activity");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("csrfToken")).toBe("csrf-token");
    expect(screen.getByRole("status").textContent).toMatch(/still ends at the 2-hour limit/);
    expect(screen.queryByRole("button", { name: "Stay signed in" })).toBeNull();
  });
});
