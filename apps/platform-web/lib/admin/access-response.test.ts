// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import { adminAccessDeniedResponse, adminReturnPathFor, adminSignInPath } from "./access-response";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

function post(referer?: string) {
  return new Request("https://mathnexa.example/admin/users/action", {
    method: "POST",
    headers: referer ? { referer } : {}
  });
}

describe("Phase 2B expiry experience", () => {
  it("builds the sign-in URL with a validated destination", () => {
    expect(adminSignInPath("/admin?section=users")).toBe("/admin/sign-in?expired=1&next=%2Fadmin%3Fsection%3Dusers");
    expect(adminSignInPath("https://evil.example/")).toBe("/admin/sign-in?expired=1");
    expect(adminSignInPath(null)).toBe("/admin/sign-in?expired=1");
  });

  it("returns to the admin page the request came from, and only on this origin", () => {
    process.env.MVH_APPLICATION_ORIGIN = "https://mathnexa.example";
    expect(adminReturnPathFor(post("https://mathnexa.example/admin?section=users"))).toBe("/admin?section=users");
    expect(adminReturnPathFor(post("https://evil.example/admin?section=users"))).toBeNull();
    expect(adminReturnPathFor(post("https://mathnexa.example/account"))).toBeNull();
    expect(adminReturnPathFor(post())).toBeNull();
  });

  it("redirects a legitimate administrator whose session ran out to sign in again", () => {
    process.env.MVH_APPLICATION_ORIGIN = "https://mathnexa.example";
    const response = adminAccessDeniedResponse(post("https://mathnexa.example/admin?section=settings"), { state: "reauth-required", reason: "idle", recoverable: true });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mathnexa.example/admin/sign-in?expired=1&next=%2Fadmin%3Fsection%3Dsettings");
  });

  it("keeps the concealing 404 for everyone else", async () => {
    for (const access of [
      { state: "unauthenticated" }, { state: "non-admin" }, { state: "disabled" }, { state: "mfa-required" }, { state: "unavailable" },
      { state: "reauth-required", reason: "ended", recoverable: false }, { state: "reauth-required", reason: "revoked", recoverable: false }
    ] as const) {
      const response = adminAccessDeniedResponse(post("https://mathnexa.example/admin"), access);
      expect(response.status, access.state).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toBe("Not Found");
    }
  });
});
