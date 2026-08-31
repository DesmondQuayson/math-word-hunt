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

  it("lets only structurally ticketed sandbox assets reach their cryptographic route gate", async () => {
    enableStagingLock();
    process.env.MVH_ADMIN_ENABLED = "true";
    const uuid = "11111111-1111-4111-8111-111111111111";
    const ticket = `${"A".repeat(80)}.${"B".repeat(43)}`;
    for (const pathname of [
      `/admin/games/${uuid}/preview/assets/${ticket}/game/main.js`,
      `/games/${uuid}/runtime/assets/${ticket}/game/styles.css`
    ]) {
      expect((await proxy(new NextRequest(`https://staging.example.invalid${pathname}`))).status).toBe(200);
    }
    for (const pathname of [
      `/admin/games/not-a-uuid/preview/assets/${ticket}/game/main.js`,
      `/games/${uuid}/runtime/assets/not-a-ticket/game/main.js`,
      `/games/${uuid}/runtime/assets/${ticket}`
    ]) {
      expect((await proxy(new NextRequest(`https://staging.example.invalid${pathname}`))).status).toBe(404);
    }
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

/**
 * MN-09 recurrence guard, at the layer where the incident actually happened.
 *
 * The unit contract in server.test.ts proves the parser. This proves the thing
 * that was observed in production-like conditions: a protected staging
 * deployment whose gate value carries transport whitespace must NOT serve the
 * site. During certification it returned HTTP 200 with the complete body while
 * the configuration looked correct, and only manual verification against the
 * live URL caught it.
 */
describe("staging gate never serves the site on a malformed configuration", () => {
  function configure(required: string | undefined, environment = "production-platform") {
    process.env.MVH_APP_ENVIRONMENT = environment;
    process.env.MVH_STAGING_ACCESS_TOKEN = token;
    if (required === undefined) delete process.env.MVH_STAGING_ACCESS_REQUIRED;
    else process.env.MVH_STAGING_ACCESS_REQUIRED = required;
  }

  async function anonymousRequest() {
    return proxy(new NextRequest("https://staging.example.invalid/"));
  }

  it("returns the protected 404 for the exact value that caused the incident", async () => {
    configure("true\n");
    const response = await anonymousRequest();
    expect(response.status, "a trailing newline must not serve the site").toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("never returns 200 for any whitespace, casing or malformed variant", async () => {
    for (const value of [
      "true", " true ", "true\n", "\ttrue\r\n", "TRUE", "True",
      "False", "FALSE", "yes", "1", "on", "tru", "trueXYZ", "false-ish",
      "", " ", undefined
    ]) {
      configure(value);
      const response = await anonymousRequest();
      expect(response.status, `${JSON.stringify(value)} must not serve the site`).toBe(404);
      expect(await response.text(), `${JSON.stringify(value)} must have an empty body`).toBe("");
    }
  });

  it("still protects when the environment name carries transport whitespace", async () => {
    // The gate used to be nested inside a strict MVH_APP_ENVIRONMENT compare, so
    // a newline here skipped it entirely however well the flag was parsed.
    for (const environment of ["production-platform\n", " production-platform ", "\tproduction-platform\r\n"]) {
      configure("true", environment);
      const response = await anonymousRequest();
      expect(response.status, `${JSON.stringify(environment)} must still protect`).toBe(404);
      expect(await response.text()).toBe("");
    }
  });

  it("opens only for an exact lowercase false", async () => {
    configure("false");
    const opened = await anonymousRequest();
    expect(opened.status).not.toBe(404);

    configure("False");
    const stillProtected = await anonymousRequest();
    expect(stillProtected.status, "a cased false must not open staging").toBe(404);
  });

  it("leaves a deployment with no staging token alone", async () => {
    // Production's shape: platform mode, no gate token. It must never be locked
    // by this gate, whatever the flag says, or a typo would black out the site.
    for (const value of [undefined, "", "yes", "garbage"]) {
      process.env.MVH_APP_ENVIRONMENT = "production-platform";
      delete process.env.MVH_STAGING_ACCESS_TOKEN;
      if (value === undefined) delete process.env.MVH_STAGING_ACCESS_REQUIRED;
      else process.env.MVH_STAGING_ACCESS_REQUIRED = value;
      const response = await anonymousRequest();
      expect(response.status, `${JSON.stringify(value)} must not lock an ungated deployment`).not.toBe(404);
    }
  });
});
