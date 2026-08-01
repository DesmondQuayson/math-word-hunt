import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/environment/server", () => ({
  getServerEnvironment: () => ({ identity: "production-platform", billingAvailable: true })
}));
vi.mock("@/lib/supabase/proxy", () => ({
  refreshSupabaseSession: () => NextResponse.next()
}));

import { POST as bootstrapStagingAccess } from "@/app/api/internal/staging-access/bootstrap/route";
import { proxy } from "@/proxy";
import { createStagingAccessCookieValue, STAGING_ACCESS_COOKIE_NAME } from "./server";

const originalEnvironment = { ...process.env };
const token = "C".repeat(43);

function enableStagingLock() {
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.MVH_STAGING_ACCESS_REQUIRED = "true";
  process.env.MVH_STAGING_ACCESS_TOKEN = token;
}

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("staging access request gate", () => {
  it("returns a genuine hard 404 before application code for an anonymous page request", async () => {
    enableStagingLock();
    const response = await proxy(new NextRequest("https://staging.example.invalid/play"));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("allows an application request only with the valid signed host cookie", async () => {
    enableStagingLock();
    const cookie = createStagingAccessCookieValue();
    const response = await proxy(new NextRequest("https://staging.example.invalid/", {
      headers: { cookie: `${STAGING_ACCESS_COOKIE_NAME}=${cookie}` }
    }));
    expect(response.status).toBe(200);
  });

  it("excludes the Stripe webhook route from only the staging-cookie gate", async () => {
    enableStagingLock();
    const response = await proxy(new NextRequest("https://staging.example.invalid/api/billing/webhook", {
      method: "POST"
    }));
    expect(response.status).toBe(200);
  });

  it("rejects missing and invalid bootstrap credentials without disclosing the token", async () => {
    enableStagingLock();
    for (const authorization of [null, `Bearer ${"D".repeat(43)}`]) {
      const headers = authorization ? { authorization } : undefined;
      const response = await bootstrapStagingAccess(new Request(
        "https://staging.example.invalid/api/internal/staging-access/bootstrap",
        { method: "POST", headers }
      ));
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
  });

  it("sets only a Secure HttpOnly SameSite host cookie after valid bootstrap", async () => {
    enableStagingLock();
    const response = await bootstrapStagingAccess(new Request(
      "https://staging.example.invalid/api/internal/staging-access/bootstrap",
      { method: "POST", headers: { authorization: `Bearer ${token}` } }
    ));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(response.status).toBe(204);
    expect(setCookie).toContain(`${STAGING_ACCESS_COOKIE_NAME}=v1.`);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toContain("Domain=");
    expect(setCookie).not.toContain(token);
    expect(await response.text()).toBe("");
  });
});
