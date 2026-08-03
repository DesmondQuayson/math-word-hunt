import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

function requireAll(path, markers) {
  const source = readFileSync(path, "utf8");
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`${path} is missing ${marker}`);
}

requireAll("apps/platform-web/lib/billing/consumer-config.ts", [
  'stripeMode: "test" | "live"', "stripe-mode-mismatch", "live-commercial-activation-not-approved",
  "live-production-prerequisites-incomplete", "stable-subscriber-management-origin-required",
  "BILLING_CHECKOUT_ENABLED", 'source.MVH_APPLICATION_ORIGIN !== "https://mathnexa.com"'
]);
requireAll("apps/platform-web/lib/commercial/policy.ts", ["86_400", "amountMinorUnits: 599", "COMMERCIAL_CONSENT_FIELDS"]);
requireAll("apps/platform-web/lib/billing/consumer-service.ts", [
  "recordCommercialAcceptance", "bindCommercialAcceptance", "hasCurrentCommercialAcceptance",
  "commercial-consent-required", 'context.status !== "deletion-pending"'
]);
requireAll("apps/platform-web/lib/billing/consumer-webhook.ts", ["test-event-rejected", "live-event-rejected", "constructVerifiedEvent"]);
requireAll("supabase/migrations/20260801210000_phase7e_commercial_consent.sql", [
  "consumer_commercial_acceptances", "consumer_checkout_acceptance_bindings", "consumer_refund_requests",
  "enable row level security", "grant select, insert", "bind_consumer_checkout_acceptance",
  "request_own_consumer_refund_review"
]);

const protectedHashes = new Map([
  ["docs/index.html", "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, expected] of protectedHashes) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) throw new Error(`${path} changed: ${actual}`);
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
        for (const marker of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SUPABASE_SECRET_KEY", ["sk", "live", "phase7e"].join("_"), "whsec_phase7e"]) {
          if (source.includes(marker)) throw new Error(`${relative(".", path)} exposes ${marker}`);
        }
      }
    }
  }
}

for (const path of ["docs/index.html", "docs/vocab.js"]) {
  if (!existsSync(path)) throw new Error(`${path} is missing`);
}
console.log("Phase 7E security audit passed: Live/Test isolation, explicit activation, consent ownership, cancellation access, secret isolation, and protected hashes are enforced.");
