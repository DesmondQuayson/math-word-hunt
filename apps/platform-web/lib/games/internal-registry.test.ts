// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  createInternalGameResponse,
  getInternalGameRegistration,
  internalGameKeys,
  isInternalGameRegistered
} from "./internal-registry";

describe("trusted internal game registry", () => {
  it("registers Number Cross by source-owned key and route only", () => {
    expect(internalGameKeys()).toEqual(["number-cross"]);
    expect(getInternalGameRegistration("number-cross")).toMatchObject({
      stableKey: "number-cross",
      route: "/games/number-cross/play",
      assetBase: "/internal-games/number-cross/"
    });
    expect(isInternalGameRegistered("number-cross")).toBe(true);
    expect(getInternalGameRegistration("../../arbitrary-module")).toBeNull();
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
