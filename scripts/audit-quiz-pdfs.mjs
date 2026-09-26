// Quiz PDFs V1 - offline audit: manifest integrity, byte-identical files,
// structural PDF validation, no publicly served PDF, and the app wiring that
// keeps /quizzes behind the MathNexa entitlement. Prints the content audit.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findPublicPdfs, loadQuizManifest, renderContentAudit, summarizeQuizManifest, verifyQuizFiles, REPOSITORY_ROOT } from "./quiz-pdfs/manifest.mjs";

const problems = [];
const manifest = loadQuizManifest();
const verification = verifyQuizFiles(manifest);
for (const item of verification.results.filter((entry) => !entry.ok)) problems.push(`${item.file}: ${item.findings.map((finding) => finding.detail).join("; ")}`);

const publicPdfs = findPublicPdfs();
if (publicPdfs.length) problems.push(`PDF files under the public asset root would bypass the entitlement check: ${publicPdfs.join(", ")}`);

const read = (path) => readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
const wiring = [
  ["apps/platform-web/app/quizzes/layout.tsx", 'requireProductAccess("/quizzes")', "the /quizzes layout must re-check entitlement on the server"],
  ["apps/platform-web/app/quizzes/page.tsx", 'requireProductAccess("/quizzes")', "the /quizzes page must re-check entitlement on the server"],
  ["apps/platform-web/app/quizzes/page.tsx", 'loadPublicResourceLibrary("quizzes")', "the /quizzes page must read the published quiz catalog"],
  ["apps/platform-web/lib/access/server.ts", '"/quizzes": "quizzes"', "the quiz entry must map to the quizzes product module"],
  ["apps/platform-web/lib/auth/access-intent.ts", '"/quizzes"', "the quiz entry must be a remembered product destination"],
  ["apps/platform-web/lib/navigation/banner.ts", '{ href: "/quizzes", label: "Quiz PDFs" }', "the banner must keep its Quiz PDFs item"],
  ["apps/platform-web/app/resources/[resourceId]/download/route.ts", "access.decision.allowed", "downloads must check the entitlement decision"],
  ["apps/platform-web/app/resources/[resourceId]/download/route.ts", "record_resource_download", "consumer downloads must be authorized by the database"],
  ["apps/platform-web/app/resources/[resourceId]/download/route.ts", "createSignedUrl", "files must be fetched through short-lived signed URLs"],
  ["apps/platform-web/lib/resources/catalog.ts", '.eq("resource_scope", kind === "homework" ? "lesson" : "topic")', "quizzes must be read topic-scoped, homework lesson-scoped"]
];
for (const [path, marker, why] of wiring) if (!read(path).includes(marker)) problems.push(`${path} lacks ${JSON.stringify(marker)} - ${why}`);
const library = read("apps/platform-web/components/resources/public-resource-library.tsx");
if (!/Topic-by-topic math quizzes/.test(library)) problems.push("the quiz library copy must describe topic-by-topic quizzes");
if (/Lesson \d/.test(library)) problems.push("the quiz library must not label quizzes by lesson number");

const summary = summarizeQuizManifest(manifest);
console.log(renderContentAudit(summary, verification));
console.log("");
console.log(`Stored copies: ${manifest.quizzes.length} under content/quiz-pdfs (outside the public asset root); public PDFs: ${publicPdfs.length}`);
if (problems.length) {
  console.error(`\nQuiz PDF audit FAILED with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log("Quiz PDF audit passed: every manifest file is present, byte-identical, structurally accepted and unique, and PDFs are served only through the entitlement-checked download route.");
