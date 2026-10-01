import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
// Source with whole-line `//` comments and `/* */` blocks removed, so a gate
// that has been commented out no longer satisfies a check.
const code = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");
const auth = read("apps/platform-web/app/auth-actions.ts");
const home = read("apps/platform-web/components/public/teacher-first-home.tsx");
const page = read("apps/platform-web/app/page.tsx");
const play = code("apps/platform-web/app/play/page.tsx");
const runtime = code("apps/platform-web/app/game/runtime/[...asset]/route.ts");
const header = read("apps/platform-web/components/site-header.tsx");
const productAccess = code("apps/platform-web/lib/access/server.ts");
const launchGeneration = code("apps/platform-web/lib/game-access/runtime-generation.ts");

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
// Direct launch. Since 04dda34 /play redirects to gameLaunchHref() (the same
// runtime document plus a non-secret generation query) instead of the literal
// path. The server component must still await requireProductAccess("/games")
// before that redirect, production must always render the gated page, the
// gate must fail closed, and the launch URL must stay the protected runtime.
const consumerPlay = play.slice(play.indexOf("async function ConsumerPlayPage()"), play.indexOf("function LegacyPlayPage()"));
const authorizedAt = consumerPlay.indexOf('await requireProductAccess("/games");');
const launchedAt = consumerPlay.indexOf("return redirect(gameLaunchHref());");
if (!play.includes('import { requireProductAccess } from "@/lib/access/server";') ||
  !play.includes('import { gameLaunchHref } from "@/lib/game-access/runtime-generation";') ||
  /["']use client["']/.test(play) || authorizedAt === -1 || launchedAt === -1 || authorizedAt > launchedAt ||
  !play.includes("return isProductionPlatformMode() ? <ConsumerPlayPage /> : <LegacyPlayPage />;")) {
  throw new Error("Direct canonical launch must authorize on the server before entering the runtime.");
}
if (!/export async function requireProductAccess\(destination: ProductDestination\): Promise<GameAccessView> \{\s*const safeDestination = safeProductDestination\(destination\);\s*const access = await getGameAccessView\(\);\s*if \(hasMathNexaModuleAccess\(access\.decision, destinationModule\[safeDestination\]\)\) return access;[\s\S]*?\n {2}redirect\(subscriptionReviewHref\(safeDestination\)\);\n\}/.test(productAccess)) {
  throw new Error("requireProductAccess must decide access server-side and redirect every visitor without module access.");
}
if (!/export function gameLaunchHref\(\): string \{\s*return `\/game\/runtime\/index\.html\?launch=\$\{gameRuntimeGeneration\(\)\}`;\s*\}/.test(launchGeneration)) {
  throw new Error("gameLaunchHref must launch the protected canonical runtime document.");
}
for (const contract of ["getGameAccessView()", "readCanonicalServerAsset", '"Cache-Control": "private, no-store, max-age=0"']) {
  if (!runtime.includes(contract)) throw new Error(`Protected canonical runtime contract is missing: ${contract}`);
}
// The runtime route itself authorizes every request and returns the denial
// before it reads or serves the document; it exposes no other method.
const accessCheckedAt = runtime.indexOf("const access = await getGameAccessView();");
const denial = /if \(!access\.decision\.allowed\) \{\s*return Response\.json\([\s\S]*?\{ status: 401, headers: \{ "Cache-Control": "no-store" \} \}\s*\);\s*\}/.exec(runtime);
const readAt = runtime.indexOf("const asset = await readCanonicalServerAsset(requested[0]);");
if (accessCheckedAt === -1 || !denial || denial.index < accessCheckedAt || readAt === -1 || readAt < denial.index ||
  (runtime.match(/readCanonicalServerAsset\(/g) ?? []).length !== 1 ||
  /export\s+(?:async\s+)?function\s+(?!GET\b)[A-Z]+\b|export\s+const\s+(?:POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export\s*\{[^}]*\bas\s+(?:POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(runtime)) {
  throw new Error("The canonical runtime must deny unauthorized requests before reading the protected document.");
}
if (!page.includes("getGameAccessView()") || !header.includes("getGameAccessView()")) {
  throw new Error("Homepage and header authentication state must be resolved server-side.");
}
for (const forbidden of ["Today's math toolkit", "Game access verified", "Launch MathNexa game"]) {
  if (home.includes(forbidden)) throw new Error(`Removed customer-facing Phase 11 copy returned: ${forbidden}`);
}
// Current homepage showcase: 787fc21 renamed math-word-hunt.webp to
// math-vocabulary-hunt.webp and dropped the Number Cross tile; 4afa073 added
// Math Tug of War. Each asset must be referenced and must ship.
for (const asset of [
  "/media/games/math-vocabulary-hunt.webp",
  "/media/games/math-tug-of-war.webp",
  "/media/home/homework-preview.webp",
  "/media/home/map-prep-preview.webp",
  "/media/home/quiz-preview.webp"
]) {
  if (!home.includes(asset)) throw new Error(`Homepage product asset is missing: ${asset}`);
  if (!existsSync(`apps/platform-web/public${asset}`)) throw new Error(`Homepage product asset file is missing: ${asset}`);
}

for (const [path, expected] of [
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) throw new Error(`${path} changed during Phase 11.`);
}

console.log("Phase 11 security audit passed: Auth confirmation, server-rendered identity, direct authorized launch, private assets, and canonical hashes remain protected.");
