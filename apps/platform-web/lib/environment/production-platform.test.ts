import { describe, expect, it } from "vitest";

import {
  hasPreviewCredentialCollision,
  hasProductionIdentityConfiguration,
  isProductionPlatformAuthenticatedPath,
  isProductionPlatformDeferredBillingPath,
  isProductionPlatformRestrictedPath
} from "./production-platform";

const local = {
  NODE_ENV: "test",
  MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true",
  MVH_SUPABASE_PROJECT_REF: "production-local",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-local",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-local",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-production-local-key",
  SUPABASE_SECRET_KEY: "secret-production-local-key"
};

describe("Production-platform isolation", () => {
  it("requires a complete isolated identity configuration", () => {
    expect(hasProductionIdentityConfiguration(local)).toBe(true);
    expect(hasProductionIdentityConfiguration({ ...local, SUPABASE_SECRET_KEY: "" })).toBe(false);
    expect(hasProductionIdentityConfiguration({ ...local, MVH_PRODUCTION_SUPABASE_PROJECT_REF: "other" })).toBe(false);
    expect(hasProductionIdentityConfiguration({ ...local, NODE_ENV: "production" })).toBe(false);
  });

  it("detects project and credential collision with Preview", () => {
    expect(hasPreviewCredentialCollision(local)).toBe(false);
    expect(hasPreviewCredentialCollision({ ...local, MVH_PREVIEW_SUPABASE_PROJECT_REF: "production-local" })).toBe(true);
    expect(hasPreviewCredentialCollision({ ...local, MVH_PREVIEW_SUPABASE_PUBLISHABLE_KEY: local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY })).toBe(true);
  });

  it("classifies public-account, restricted, and deferred routes", () => {
    for (const path of ["/teacher", "/teacher/classes", "/pilot", "/classes/1", "/student", "/admin"]) {
      expect(isProductionPlatformRestrictedPath(path, { MVH_ADMIN_ENABLED: "false" }), path).toBe(true);
    }
    for (const path of ["/account", "/subscription", "/game-access", "/play"]) expect(isProductionPlatformAuthenticatedPath(path), path).toBe(true);
    for (const path of ["/api/billing/webhook", "/billing/portal", "/checkout/status"]) expect(isProductionPlatformDeferredBillingPath(path), path).toBe(true);
    for (const path of ["/", "/pricing", "/help", "/privacy", "/terms", "/sign-up", "/sign-in", "/forgot-password", "/auth/callback"]) {
      expect(isProductionPlatformRestrictedPath(path), path).toBe(false);
      expect(isProductionPlatformAuthenticatedPath(path), path).toBe(false);
    }
  });

  it("allows only the server-enabled admin route family through the generic production gate", () => {
    for (const path of ["/admin", "/admin/sign-in", "/admin/users/123"]) {
      expect(isProductionPlatformRestrictedPath(path, { MVH_ADMIN_ENABLED: "true" }), path).toBe(false);
      for (const value of [undefined, "", "false", "TRUE", "1"]) {
        expect(isProductionPlatformRestrictedPath(path, { MVH_ADMIN_ENABLED: value }), `${path}:${value}`).toBe(true);
      }
    }

    for (const path of ["/teacher", "/classes/1", "/student", "/administrator", "/api/admin"]) {
      expect(isProductionPlatformRestrictedPath(path, { MVH_ADMIN_ENABLED: "true" }), path).toBe(path !== "/administrator" && path !== "/api/admin");
    }
  });
});
