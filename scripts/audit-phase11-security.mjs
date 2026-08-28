import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const auth = read("apps/platform-web/app/auth-actions.ts");
const home = read("apps/platform-web/components/public/teacher-first-home.tsx");
const page = read("apps/platform-web/app/page.tsx");
const play = read("apps/platform-web/app/play/page.tsx");
const runtime = read("apps/platform-web/app/game/runtime/[...asset]/route.ts");
const header = read("apps/platform-web/components/site-header.tsx");

for (const contract of [
  "supabase.auth.getUser()",
  "supabase.auth.resend",
  "safeInternalRedirect",
  "httpOnly: true",
  'sameSite: "lax"',
  "confirmationCooldownCookie"
]) {
  if (!auth.includes(contract)) throw new Error(`Phase 11 confirmation boundary is missing: ${contract}`);
}
if (/confirmation-email[^\n]*searchParams|searchParams[^\n]*confirmation-email/i.test(auth)) {
  throw new Error("Phase 11 must not place a confirmation email address in query parameters.");
}
if (!play.includes('requireProductAccess("/games")') || !play.includes('redirect("/game/runtime/index.html")')) {
  throw new Error("Direct canonical launch must authorize on the server before entering the runtime.");
}
for (const contract of ["getGameAccessView()", "readCanonicalServerAsset", '"Cache-Control": "private, no-store, max-age=0"']) {
  if (!runtime.includes(contract)) throw new Error(`Protected canonical runtime contract is missing: ${contract}`);
}
if (!page.includes("getGameAccessView()") || !header.includes("getGameAccessView()")) {
  throw new Error("Homepage and header authentication state must be resolved server-side.");
}
for (const forbidden of ["Today's math toolkit", "Game access verified", "Launch MathNexa game"]) {
  if (home.includes(forbidden)) throw new Error(`Removed customer-facing Phase 11 copy returned: ${forbidden}`);
}
for (const asset of [
  "math-word-hunt.webp",
  "number-cross.webp",
  "homework-preview.webp",
  "map-prep-preview.webp",
  "quiz-preview.webp"
]) {
  if (!home.includes(asset)) throw new Error(`Homepage product asset is missing: ${asset}`);
}

for (const [path, expected] of [
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) throw new Error(`${path} changed during Phase 11.`);
}

console.log("Phase 11 security audit passed: Auth confirmation, server-rendered identity, direct authorized launch, private assets, and canonical hashes remain protected.");
