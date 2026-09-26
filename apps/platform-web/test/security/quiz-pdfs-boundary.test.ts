// @vitest-environment node
/**
 * Quiz PDFs share the Homework PDFs protection boundary. These guards fail the
 * moment someone adds a shortcut: a PDF under public/, a quiz route that no
 * longer re-checks entitlement, or a download that skips the database
 * authorization and the short-lived signed URL proxy.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { findPublicPdfs, loadQuizManifest } from "../../../../scripts/quiz-pdfs/manifest.mjs";

const app = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(app, path), "utf8");

describe("Quiz PDFs protection boundary", () => {
  it("serves no PDF as a public asset; the manifest files live outside public/", () => {
    expect(findPublicPdfs()).toEqual([]);
    for (const quiz of loadQuizManifest().quizzes) {
      const stored = quiz.absolutePath.replaceAll("\\", "/");
      expect(stored).not.toContain("/apps/platform-web/public/");
      expect(stored).toContain("/content/quiz-pdfs/");
    }
  });

  it("keeps /quizzes and every quiz resource page behind the server-side product entitlement", () => {
    expect(read("app/quizzes/layout.tsx")).toContain('requireProductAccess("/quizzes")');
    expect(read("app/quizzes/page.tsx")).toContain('requireProductAccess("/quizzes")');
    expect(read("app/resources/[resourceId]/page.tsx")).toContain('requireProductAccess(resource.resourceType.startsWith("homework")?"/homework":"/quizzes")');
    expect(read("lib/access/server.ts")).toContain('"/quizzes": "quizzes"');
    expect(read("lib/auth/access-intent.ts")).toMatch(/PRODUCT_DESTINATIONS = \[[\s\S]*"\/quizzes"[\s\S]*\] as const/);
  });

  it("downloads stay server-proxied, entitlement-checked and database-authorized, exactly like Homework", () => {
    const download = read("app/resources/[resourceId]/download/route.ts");
    expect(download.indexOf("access.decision.allowed")).toBeGreaterThan(-1);
    expect(download.indexOf("access.decision.allowed")).toBeLessThan(download.indexOf("createSignedUrl"));
    expect(download).toContain("record_resource_download");
    expect(download).toContain('"Cache-Control":"private, no-store, max-age=0"');
    expect(download).toContain("attachment; filename=");
    expect(download).not.toMatch(/signed\.data\.signedUrl\s*\}/);
  });

  it("reads quizzes topic-scoped and never mixes in lesson-scoped Homework rows", () => {
    const catalog = read("lib/resources/catalog.ts");
    expect(catalog).toContain('kind === "homework" ? ["homework_pdf", "homework_answer_key"] : ["quiz_pdf", "quiz_answer_key"]');
    expect(catalog).toContain('.eq("resource_scope", kind === "homework" ? "lesson" : "topic")');
    expect(catalog).toContain('.eq("scope_status", "current")');
  });
});
