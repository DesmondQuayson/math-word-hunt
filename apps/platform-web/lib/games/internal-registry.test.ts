// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createInternalGameResponse,
  getInternalGameRegistration,
  internalGameKeys,
  isInternalGameRegistered
} from "./internal-registry";

describe("trusted internal game registry", () => {
  it("registers the source-owned CrossCalc, Number Cross, and Number Logic keys and routes only", () => {
    expect(internalGameKeys()).toEqual(["crosscalc", "number-cross", "number-logic"]);
    expect(getInternalGameRegistration("crosscalc")).toMatchObject({
      stableKey: "crosscalc",
      route: "/games/crosscalc/play",
      assetBase: "/internal-games/crosscalc/",
      connectSource: "'self'"
    });
    expect(isInternalGameRegistered("crosscalc")).toBe(true);
    expect(getInternalGameRegistration("number-cross")).toMatchObject({
      stableKey: "number-cross",
      route: "/games/number-cross/play",
      assetBase: "/internal-games/number-cross/",
      connectSource: "'none'"
    });
    expect(isInternalGameRegistered("number-cross")).toBe(true);
    expect(getInternalGameRegistration("number-logic")).toMatchObject({
      stableKey: "number-logic",
      route: "/games/number-logic/play",
      assetBase: "/internal-games/number-logic/",
      connectSource: "'self'"
    });
    expect(isInternalGameRegistered("number-logic")).toBe(true);
    expect(getInternalGameRegistration("../../arbitrary-module")).toBeNull();
  });

  it("renders CrossCalc as a same-origin five-mode game", async () => {
    const response = createInternalGameResponse("crosscalc");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
    const body = await response.text();
    expect(body).toContain('<base href="/internal-games/crosscalc/"');
    expect(body).toContain('<script type="module" src="./assets/index-DIwGVbWJ.js"');
    expect(body).toContain('href="/games" aria-label="Back to MathNexa Games"');
    expect(body).not.toContain("iframe");
    expect(body).not.toContain("http://");
    expect(body).not.toContain("https://");
  });

  it("renders Number Logic as one same-origin game with one six-mode runtime", async () => {
    const response = createInternalGameResponse("number-logic");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
    const body = await response.text();
    expect(body).toContain('<base href="/internal-games/number-logic/"');
    expect(body).toContain('<script type="module" src="./assets/index-DXexJzA-.js"');
    expect(body).toContain('href="/games" aria-label="Back to MathNexa Games"');
    expect(body).not.toContain("iframe");
    expect(body).not.toContain("http://");
    expect(body).not.toContain("https://");
  });

  it("renders a same-origin top-level document with restrictive headers", async () => {
    const response = createInternalGameResponse("number-cross");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("permissions-policy")).toContain("fullscreen=(self)");
    const body = await response.text();
    expect(body).toContain('<base href="/internal-games/number-cross/"');
    expect(body).toContain('<script type="module" src="./src/app.js"');
    expect(body).not.toContain("number-cross.vercel.app");
    expect(body).not.toContain("launch=");
  });

  it("fails closed for unregistered internal keys", () => {
    expect(createInternalGameResponse("unregistered").status).toBe(404);
  });
});
