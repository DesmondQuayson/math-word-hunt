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
  ["apps/platform-web/lib/resources/catalog.ts", '.eq("resource_scope", kind === "homework" ? "lesson" : "topic")', "quizzes must be read topic-scoped, homework lesson-scoped"],
  // The in-app preview: the same authorization as the download, inline disposition, never cached.
  ["apps/platform-web/app/resources/[resourceId]/inline/route.ts", "access.decision.allowed", "inline delivery must check the entitlement decision"],
  ["apps/platform-web/app/resources/[resourceId]/inline/route.ts", "record_resource_download", "consumer inline delivery must be authorized by the database"],
  ["apps/platform-web/app/resources/[resourceId]/inline/route.ts", "createSignedUrl", "inline delivery must fetch through short-lived signed URLs"],
  ["apps/platform-web/app/resources/[resourceId]/inline/route.ts", "inline; filename=", "inline delivery must be displayed, not downloaded"],
  ["apps/platform-web/app/resources/[resourceId]/inline/route.ts", '"Cache-Control":"private, no-store, max-age=0"', "inline delivery must never be cached"],
  ["apps/platform-web/app/resources/[resourceId]/inline/route.ts", 'resource_type.startsWith("quiz_")', "inline delivery is for quiz resources only"],
  ["apps/platform-web/app/resources/[resourceId]/preview/layout.tsx", 'await requireProductAccess("/quizzes")', "the preview layout must redirect unentitled requests before any shell streams"],
  ["apps/platform-web/app/resources/[resourceId]/preview/page.tsx", 'requireProductAccess("/quizzes")', "the preview page must re-check entitlement on the server"],
  ["apps/platform-web/app/resources/[resourceId]/preview/page.tsx", 'resource.resourceType !== "quiz_pdf"', "the preview page is for quiz PDFs only"],
  ["apps/platform-web/components/resources/pdf-viewer.tsx", "withCredentials: true", "the viewer must fetch the PDF with the session, from the protected route"],
  ["apps/platform-web/components/resources/public-resource-library.tsx", 'designation="Quiz PDF" preview />', "every quiz card must offer Preview"]
];
for (const [path, marker, why] of wiring) if (!read(path).includes(marker)) problems.push(`${path} lacks ${JSON.stringify(marker)} - ${why}`);
const library = read("apps/platform-web/components/resources/public-resource-library.tsx");
if (!/Topic-by-topic math quizzes/.test(library)) problems.push("the quiz library copy must describe topic-by-topic quizzes");
if (/Lesson \d/.test(library)) problems.push("the quiz library must not label quizzes by lesson number");
const viewer = read("apps/platform-web/components/resources/pdf-viewer.tsx").split("\n").filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line)).join("\n");
if (/<iframe|<object|<embed|localStorage|sessionStorage/.test(viewer)) problems.push("the PDF viewer must embed nothing and store nothing in the browser");
const inlineRoute = read("apps/platform-web/app/resources/[resourceId]/inline/route.ts");
if (/attachment;|Response\.redirect|redirect\(/.test(inlineRoute)) problems.push("inline delivery must stream the bytes inline, never redirect to storage");
// Banner: no Authorize Code item; the homepage form remains the entry.
const header = read("apps/platform-web/components/site-header.tsx");
if (/AuthorizedCodeLink|banner-code-link|Authorize Code/.test(header)) problems.push("the banner must not carry an Authorize Code item");
if (/banner-code-link|"code code code"/.test(read("apps/platform-web/styles/conversion.css"))) problems.push("the banner CSS must not keep the authorized-code row");
if (!/<AuthorizedCodeForm/.test(read("apps/platform-web/components/public/teacher-first-home.tsx")) || !/Authorize Code/.test(read("apps/platform-web/components/auth/authorized-code-form.tsx"))) problems.push("the homepage must keep the Authorize Code form");

const summary = summarizeQuizManifest(manifest);
console.log(renderContentAudit(summary, verification));
console.log("");
console.log(`Stored copies: ${manifest.quizzes.length} under content/quiz-pdfs (outside the public asset root); public PDFs: ${publicPdfs.length}`);
if (problems.length) {
  console.error(`\nQuiz PDF audit FAILED with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log("Quiz PDF audit passed: every manifest file is present, byte-identical, structurally accepted and unique, PDFs are served only through the entitlement-checked download and inline routes, and the banner carries no Authorize Code item.");
