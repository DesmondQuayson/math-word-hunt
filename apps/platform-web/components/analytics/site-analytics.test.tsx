import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for Vercel's <Analytics> that behaves like the real one: it hands
// the analytics script (window.va) a page view on mount and on every client-side
// page change, from an effect, without catching errors.
const route = vi.hoisted(() => ({ path: "/sign-in" }));
vi.mock("@vercel/analytics/next", async () => {
  const { useEffect } = await import("react");
  return {
    Analytics: function Analytics() {
      const path = route.path;
      useEffect(() => {
        (window as unknown as { va?: (...args: unknown[]) => void }).va?.("pageview", { path });
      }, [path]);
      return <span data-testid="analytics-mounted" />;
    }
  };
});

import { SiteAnalytics } from "./site-analytics";

type AnalyticsWindow = Window & { va?: (...args: unknown[]) => void };
const page = () => <><SiteAnalytics /><main><h1>Start your free trial</h1></main></>;

beforeEach(() => {
  route.path = "/sign-in";
  // React reports errors a boundary caught to console.error; keep the output quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  delete (window as AnalyticsWindow).va;
  vi.restoreAllMocks();
});

describe("SiteAnalytics", () => {
  it("hands every page change to a working analytics script", () => {
    const received: unknown[][] = [];
    (window as AnalyticsWindow).va = (...args) => { received.push(args); };
    const view = render(page());
    route.path = "/subscription";
    view.rerender(page());
    expect(screen.getByTestId("analytics-mounted")).toBeTruthy();
    expect(received).toEqual([["pageview", { path: "/sign-in" }], ["pageview", { path: "/subscription" }]]);
  });

  it("keeps the page when the analytics script throws on a client-side page change", () => {
    (window as AnalyticsWindow).va = () => {};
    const view = render(page());
    // The script loads and replaces window.va with a function that throws, then the visitor moves on.
    (window as AnalyticsWindow).va = () => { throw new Error("analytics down"); };
    route.path = "/subscription";
    expect(() => view.rerender(page())).not.toThrow();
    expect(screen.getByRole("heading", { name: "Start your free trial" })).toBeTruthy();
    // Analytics steps aside for the rest of the visit.
    expect(screen.queryByTestId("analytics-mounted")).toBeNull();
    route.path = "/account";
    expect(() => view.rerender(page())).not.toThrow();
    expect(screen.getByRole("heading", { name: "Start your free trial" })).toBeTruthy();
  });

  it("keeps the page when the analytics script is broken from the start", () => {
    (window as AnalyticsWindow).va = 5 as unknown as AnalyticsWindow["va"];
    expect(() => render(page())).not.toThrow();
    expect(screen.getByRole("heading", { name: "Start your free trial" })).toBeTruthy();
    expect(screen.queryByTestId("analytics-mounted")).toBeNull();
  });
});
