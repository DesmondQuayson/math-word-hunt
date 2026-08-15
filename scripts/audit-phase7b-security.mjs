import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

function requireAll(path, markers) {
  const source = readFileSync(path, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${path} is missing Phase 7B safeguard: ${marker}`);
  }
  return source;
}

requireAll("packages/platform-core/src/environment/registry.ts", [
  "production-platform",
  "consumerAccountsAvailable: true",
  "teacherToolsAvailable: false",
  "gameEntitlementRequired: true",
  'paymentMode === "disabled"',
  'input.identityModel === "consumer-v1"',
  "input.previewCredentialCollision !== true"
]);
requireAll("packages/platform-core/src/game-access/entitlement.ts", [
  "serverNow",
  "malformed-entitlement",
  "account-suspended",
  "account-deletion-pending",
  "24 * 60 * 60 * 1000"
]);
requireAll("apps/platform-web/proxy.ts", [
  "isProductionPlatformRestrictedPath",
  "isProductionPlatformDeferredBillingPath",
  "Production account configuration unavailable"
]);
requireAll("apps/platform-web/app/auth-actions.ts", [
  "prohibitedConsumerFields",
  "Only email and password are accepted",
  "data: consumerMode ? {}"
]);
requireAll("apps/platform-web/app/game/runtime/[...asset]/route.ts", [
  "getGameAccessView",
  "private, no-store",
  "game-access-denied"
]);
requireAll("apps/platform-web/lib/game-access/canonical-assets.ts", [
  '"index.html"',
  '"vocab.js"',
  "isCanonicalAssetName"
]);
requireAll("supabase/migrations/20260730210000_phase7b_consumer_identity_entitlement.sql", [
  "legacy-preview",
  "consumer-v1",
  "force row level security",
  "prevent_consumer_trial_replay",
  "trial_ends_at = trial_started_at + interval '24 hours'",
  "revoke all on table public.consumer_accounts from public, anon, authenticated"
]);

for (const candidate of [
  "apps/platform-web/public/docs/index.html",
  "apps/platform-web/public/docs/vocab.js",
  "apps/platform-web/public/index.html",
  "apps/platform-web/public/vocab.js"
]) {
  if (existsSync(candidate)) throw new Error(`Public canonical bypass exists: ${candidate}`);
}

const expected = new Map([
  ["docs/index.html", "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== digest) throw new Error(`${path} changed: ${actual}`);
}

const staticRoot = "apps/platform-web/.next/static";
if (existsSync(staticRoot)) {
  const stack = [staticRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if ([".js", ".json", ".map", ".txt", ".html"].includes(extname(entry.name))) {
        const source = readFileSync(path, "utf8");
        for (const marker of ["SUPABASE_SECRET_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "MVH_PREVIEW_SUPABASE_SECRET_KEY"]) {
          if (source.includes(marker)) throw new Error(`${relative(".", path)} exposes server-only configuration marker ${marker}.`);
        }
        if (createHash("sha256").update(source).digest("hex") === expected.get("docs/index.html") ||
            createHash("sha256").update(source).digest("hex") === expected.get("docs/vocab.js")) {
          throw new Error(`${relative(".", path)} contains a public canonical asset copy.`);
        }
      }
    }
  }
}

console.log("Phase 7B security audit passed: consumer identity, Preview isolation, server-owned entitlement, billing deferral, private canonical delivery, and protected hashes are enforced.");
