import { describe, expect, it } from "vitest";

import {
  CONTENT_GRADE_NUMBERS,
  CONTENT_PUBLICATION_STATES,
  CONTENT_RESOURCE_TYPES,
  canTransitionContentState,
  isContentGradeNumber,
  normalizeContentTags,
  parseContentResourceDraft,
  parseContentSlug,
  parsePrivateObjectPath,
  planResourceRevision,
  validateContentManifest
} from "./model";

describe("Phase 8B admin content model", () => {
  it("supports Grades 1 through 9 without creating curriculum records", () => {
    expect(CONTENT_GRADE_NUMBERS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(isContentGradeNumber(1)).toBe(true);
    expect(isContentGradeNumber(9)).toBe(true);
    expect(isContentGradeNumber(0)).toBe(false);
    expect(isContentGradeNumber(10)).toBe(false);
  });

  it("exposes only the approved resource types and publication states", () => {
    expect(CONTENT_RESOURCE_TYPES).toEqual([
      "game", "homework_pdf", "homework_answer_key", "quiz_pdf", "quiz_answer_key",
      "preview_image", "thumbnail", "map_prep_link"
    ]);
    expect(CONTENT_PUBLICATION_STATES).toEqual(["draft", "validating", "ready_for_review", "published", "archived"]);
  });

  it("accepts normalized hierarchy slugs and rejects ambiguous values", () => {
    expect(parseContentSlug("grade-7-ratios")).toBe("grade-7-ratios");
    for (const invalid of ["Grade-7", "grade--7", " grade-7", "grade_7", ""]) expect(parseContentSlug(invalid)).toBeNull();
  });

  it("normalizes, deduplicates, and deterministically orders safe tags", () => {
    expect(normalizeContentTags([" Fractions ", "grade-4", "fractions"])).toEqual(["fractions", "grade-4"]);
    expect(normalizeContentTags(["unsafe tag"])).toBeNull();
    expect(normalizeContentTags(new Array(21).fill("tag"))).toBeNull();
  });

  it("accepts private object references without accepting traversal or URLs", () => {
    expect(parsePrivateObjectPath("thumbnails/grade-4/fractions.png")).toBe("thumbnails/grade-4/fractions.png");
    expect(parsePrivateObjectPath("../private.pdf")).toBeNull();
    expect(parsePrivateObjectPath("https://example.com/file.png")).toBeNull();
  });

  it("represents MAP Prep only as a secure external destination", () => {
    expect(validateContentManifest("map_prep_link", { external_url: "https://showmemath.example/app" })).toEqual({
      external_url: "https://showmemath.example/app"
    });
    expect(validateContentManifest("map_prep_link", { external_url: "http://example.com" })).toBeNull();
    expect(validateContentManifest("map_prep_link", { external_url: "https://example.com", html: "<script>" })).toBeNull();
    expect(validateContentManifest("game", { external_url: "https://example.com" })).toBeNull();
  });

  it("parses a normalized resource draft and rejects browser-shaped publication fields", () => {
    const parsed = parseContentResourceDraft({
      resourceType: "homework_pdf",
      slug: "fraction-practice",
      title: "Fraction practice",
      description: "A teacher-led practice resource.",
      sortOrder: 1,
      thumbnailPath: "thumbnails/fractions.png",
      tags: ["Fractions", "grade-4"],
      manifest: { asset_pending: true },
      publicationState: "published"
    });
    expect(parsed).toMatchObject({ resourceType: "homework_pdf", slug: "fraction-practice", tags: ["fractions", "grade-4"] });
    expect(parsed).not.toHaveProperty("publicationState");
  });

  it("allows only reviewed forward publication transitions", () => {
    expect(canTransitionContentState("draft", "validating")).toBe(true);
    expect(canTransitionContentState("validating", "ready_for_review")).toBe(true);
    expect(canTransitionContentState("ready_for_review", "published")).toBe(true);
    expect(canTransitionContentState("draft", "published")).toBe(false);
    expect(canTransitionContentState("published", "draft")).toBe(false);
    expect(canTransitionContentState("archived", "published")).toBe(false);
  });

  it("fails optimistic concurrency closed and increments versions deterministically", () => {
    expect(planResourceRevision(2, 7, 7)).toEqual({ expectedLockVersion: 7, nextLockVersion: 8, nextVersionNumber: 3 });
    expect(planResourceRevision(2, 7, 6)).toBeNull();
    expect(planResourceRevision(0, 1, 1)).toBeNull();
  });
});
