import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/environment/server", () => ({
  getServerEnvironment: () => ({ identity: "production-platform", billingAvailable: true })
}));
vi.mock("@/lib/supabase/proxy", () => ({
  refreshSupabaseSession: () => new NextResponse(null, { status: 200, headers: { "x-session-gate": "reached" } })
}));

import { proxy } from "@/proxy";

const originalEnvironment = { ...process.env };

function setProductionPlatform(adminEnabled: string | undefined) {
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.MVH_ADMIN_ENABLED = adminEnabled;
  delete process.env.MVH_STAGING_ACCESS_REQUIRED;
}

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("production-platform admin request gate", () => {
  it("keeps the entire admin route family undisclosed when the server flag is disabled or malformed", async () => {
    for (const value of [undefined, "false", "TRUE", "1"]) {
      setProductionPlatform(value);
      for (const pathname of ["/admin", "/admin/sign-in", "/admin/users/123"]) {
        const response = await proxy(new NextRequest(`https://www.mathnexa.com${pathname}`));
        const body = await response.text();
        expect(response.status, `${value}:${pathname}`).toBe(404);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
        expect(body).not.toMatch(/super admin|admin sign in|admin navigation/i);
      }
    }
  });

  it("lets enabled admin routes reach the existing server-side admin security layer", async () => {
    setProductionPlatform("true");
    for (const pathname of ["/admin", "/admin/sign-in", "/admin/mfa", "/admin/users/123"]) {
      const response = await proxy(new NextRequest(`https://www.mathnexa.com${pathname}`));
      expect(response.status, pathname).toBe(200);
      expect(response.headers.get("x-session-gate"), pathname).toBe("reached");
    }
  });

  it("does not change public paths, unrelated restricted paths, or preview routing", async () => {
    setProductionPlatform("true");
    for (const pathname of ["/", "/pricing", "/sign-in"]) {
      const response = await proxy(new NextRequest(`https://www.mathnexa.com${pathname}`));
      expect(response.headers.get("x-session-gate"), pathname).toBe("reached");
    }
    for (const pathname of ["/teacher", "/classes/1", "/student"]) {
      const response = await proxy(new NextRequest(`https://www.mathnexa.com${pathname}`));
      expect(response.status, pathname).toBe(404);
    }

    process.env.MVH_APP_ENVIRONMENT = "preview";
    process.env.MVH_ADMIN_ENABLED = "false";
    const previewResponse = await proxy(new NextRequest("https://preview.example.invalid/admin"));
    expect(previewResponse.headers.get("x-session-gate")).toBe("reached");
  });
});
