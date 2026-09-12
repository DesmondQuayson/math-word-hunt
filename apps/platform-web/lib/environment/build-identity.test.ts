import { describe, expect, it } from "vitest";
import { UNKNOWN_SOURCE_REVISION, getDeployedSourceRevision } from "./build-identity";

/**
 * Production bug sweep BS-08. `/api/health` published `build: "e5c5294…"` on
 * every deployment because the value came from a hand-set environment
 * variable. These tests pin the automatic per-deployment resolution and the
 * honest fallback, and they prove the answer is not wired to any one commit.
 */

const APPROVED = "2361b763dd3dfd59b12e8a9c80c5e4ec8e99f552";
const NEXT_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STALE_BUILD_ID = "e5c5294d0187d60db41d362f3532defb305d0fb6";

describe("deployed source revision", () => {
  it("reports the platform's own commit for the deployment", () => {
    expect(getDeployedSourceRevision({ VERCEL_GIT_COMMIT_SHA: APPROVED })).toBe(APPROVED);
  });

  it("follows the next deployment automatically instead of a pinned commit", () => {
    expect(getDeployedSourceRevision({ VERCEL_GIT_COMMIT_SHA: NEXT_COMMIT })).toBe(NEXT_COMMIT);
    expect(getDeployedSourceRevision({ MVH_SOURCE_REVISION: NEXT_COMMIT })).toBe(NEXT_COMMIT);
  });

  it("accepts the revision a pipeline stamps when the deployment carries no git metadata", () => {
    expect(getDeployedSourceRevision({ MVH_SOURCE_REVISION: APPROVED })).toBe(APPROVED);
  });

  it("prefers the platform commit over a pipeline-supplied one", () => {
    expect(
      getDeployedSourceRevision({ VERCEL_GIT_COMMIT_SHA: APPROVED, MVH_SOURCE_REVISION: NEXT_COMMIT })
    ).toBe(APPROVED);
  });

  it("normalises case so one deployment has one identity", () => {
    expect(getDeployedSourceRevision({ VERCEL_GIT_COMMIT_SHA: APPROVED.toUpperCase() })).toBe(APPROVED);
  });

  it("ignores the stale hand-set build identifier entirely", () => {
    // MVH_BUILD_ID is what went stale; it must not reach this field even when
    // it is present and sha-shaped.
    expect(getDeployedSourceRevision({ MVH_BUILD_ID: STALE_BUILD_ID })).toBe(UNKNOWN_SOURCE_REVISION);
    expect(
      getDeployedSourceRevision({ MVH_BUILD_ID: STALE_BUILD_ID, VERCEL_GIT_COMMIT_SHA: APPROVED })
    ).toBe(APPROVED);
  });

  it("says unknown rather than inventing a revision", () => {
    for (const source of [
      {},
      { VERCEL_GIT_COMMIT_SHA: "" },
      { VERCEL_GIT_COMMIT_SHA: "   " },
      { VERCEL_GIT_COMMIT_SHA: "not a sha; <script>" },
      { VERCEL_GIT_COMMIT_SHA: "12345" },
      { MVH_SOURCE_REVISION: "main" },
      { MVH_SOURCE_REVISION: "v1.2.8" },
      { VERCEL_GIT_COMMIT_SHA: "../../etc/passwd" }
    ]) {
      expect(getDeployedSourceRevision(source)).toBe(UNKNOWN_SOURCE_REVISION);
    }
  });

  it("falls through a malformed platform value to the pipeline revision", () => {
    expect(
      getDeployedSourceRevision({ VERCEL_GIT_COMMIT_SHA: "unknown", MVH_SOURCE_REVISION: APPROVED })
    ).toBe(APPROVED);
  });

  it("is a revision only: no deployment id, no host, no secret, no query input", () => {
    const source = {
      VERCEL_GIT_COMMIT_SHA: APPROVED,
      VERCEL_DEPLOYMENT_ID: "dpl_CsT2bvFYkYiZHf3Vox4WTFihg9Lz",
      VERCEL_URL: "mathnexa-platform-production-fj81x46cb-bright-path-ed-tech.vercel.app",
      STRIPE_SECRET_KEY: ["sk", "live", "production12345"].join("_"),
      SUPABASE_SECRET_KEY: "secret-production-live-key",
      build: "fake",
      commit: "fake",
      sha: "fake"
    };
    const revision = getDeployedSourceRevision(source);
    expect(revision).toBe(APPROVED);
    expect(revision).not.toContain("dpl_");
    expect(revision).not.toContain("vercel.app");
    expect(revision).not.toMatch(/sk_|secret|fake/i);
  });
});
