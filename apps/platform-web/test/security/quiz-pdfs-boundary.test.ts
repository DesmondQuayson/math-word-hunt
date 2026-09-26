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

  it("the inline preview delivery applies the download route's authorization step for step and only changes the disposition", () => {
    const download = read("app/resources/[resourceId]/download/route.ts");
    const inline = read("app/resources/[resourceId]/inline/route.ts");
    for (const marker of ["access.decision.allowed", "record_resource_download", "createSignedUrl", '"Cache-Control":"private, no-store, max-age=0"', '"X-Content-Type-Options":"nosniff"', '"Referrer-Policy":"no-referrer"']) {
      expect(inline, marker).toContain(marker);
    }
    expect(inline.indexOf("access.decision.allowed")).toBeLessThan(inline.indexOf("createSignedUrl"));
    expect(inline).toContain('"Content-Type":"application/pdf"');
    expect(inline).toContain("inline; filename=");
    expect(inline).not.toContain("attachment;");
    expect(inline).not.toMatch(/signed\.data\.signedUrl\s*\}/);
    expect(inline).not.toMatch(/Response\.redirect|redirect\(/);
    // Quiz resources only; every other resource type is not found.
    expect(inline).toContain('resource_type.startsWith("quiz_")');
    // Same query chain and same authorization as the download route: the file lookup is identical (comments aside).
    const chain = (source: string) => source.split("\n")
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .filter((line) => /content_resources|content_resource_versions|resource_files|record_resource_download|createSignedUrl/.test(line))
      .map((line) => line.replace(/\s+/g, ""))
      .join("\n");
    expect(chain(inline)).toBe(chain(download));
  });

  it("the preview page is quiz-only and behind the same server-side entitlement as /quizzes; the viewer embeds nothing", () => {
    const page = read("app/resources/[resourceId]/preview/page.tsx");
    expect(page).toContain('requireProductAccess("/quizzes")');
    expect(page).toContain('resource.resourceType !== "quiz_pdf"');
    // The layout gate sits above the loading boundary, so the refusal is an HTTP redirect, never a streamed shell.
    expect(read("app/resources/[resourceId]/preview/layout.tsx")).toContain('await requireProductAccess("/quizzes")');
    expect(page).toContain("/inline`");
    const viewer = read("components/resources/pdf-viewer.tsx");
    expect(viewer).toContain("withCredentials: true");
    expect(viewer).toContain("useWasm: false");
    expect(viewer).not.toMatch(/<iframe|<object|<embed/);
    expect(viewer).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(viewer).not.toMatch(/supabase/i);
    // Homework cards never get the preview action; quiz cards do.
    const library = read("components/resources/public-resource-library.tsx");
    expect(library).toContain('designation="Quiz PDF" preview />');
    expect(library.match(/<ResourceCard key=\{resource\.id\} resource=\{resource\} \/>/g)).toHaveLength(1);
  });

  it("the banner carries no Authorize Code item; the homepage form stays the entry", () => {
    const header = read("components/site-header.tsx");
    expect(header).not.toMatch(/AuthorizedCodeLink|authorized-code-link|banner-code-link|Authorize Code/);
    expect(read("styles/conversion.css")).not.toContain("banner-code-link");
    expect(read("styles/conversion.css")).not.toContain('"code code code"');
    expect(() => read("components/layout/authorized-code-link.tsx")).toThrow();
    const home = read("components/public/teacher-first-home.tsx");
    expect(home).toContain("<AuthorizedCodeForm");
    expect(home).toContain("id={AUTHORIZED_ACCESS_ANCHOR}");
    expect(read("components/auth/authorized-code-form.tsx")).toContain("Authorize Code");
  });

  it("reads quizzes topic-scoped and never mixes in lesson-scoped Homework rows", () => {
    const catalog = read("lib/resources/catalog.ts");
    expect(catalog).toContain('kind === "homework" ? ["homework_pdf", "homework_answer_key"] : ["quiz_pdf", "quiz_answer_key"]');
    expect(catalog).toContain('.eq("resource_scope", kind === "homework" ? "lesson" : "topic")');
    expect(catalog).toContain('.eq("scope_status", "current")');
  });
});
