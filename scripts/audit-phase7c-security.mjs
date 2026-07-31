import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

function requireAll(path, markers) {
  const source = readFileSync(path, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${path} is missing Phase 7C safeguard: ${marker}`);
    }
  }
  return source;
}

requireAll("apps/platform-web/lib/billing/consumer-config.ts", [
  'MVH_APP_ENVIRONMENT !== "production-platform"',
  'STRIPE_MODE") !== "test"',
  "fixture-local-only",
  "automatic-refunds-prohibited",
  "renewalGraceDays"
]);
requireAll("apps/platform-web/lib/billing/consumer-stripe-provider.ts", [
  'mode: "setup"',
  "setup_intent_data",
  "default_payment_method",
  "trial_end",
  "idempotencyKey",
  "constructEvent"
]);
requireAll("apps/platform-web/lib/billing/consumer-service.ts", [
  "MATHNEXA_TRIAL_SECONDS",
  "trial_redemption_checkout_hash",
  "claimTrial",
  "ownership-conflict",
  "amountMinorUnits === MATHNEXA_MONTHLY_AMOUNT"
]);
requireAll("apps/platform-web/lib/billing/consumer-webhook.ts", [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "createHash",
  "claimEvent",
  "applyProjection"
]);
requireAll("apps/platform-web/app/api/billing/webhook/route.ts", [
  "readBoundedBillingBody",
  "stripe-signature",
  "processConsumerBillingWebhook"
]);
requireAll("supabase/migrations/20260731210000_phase7c_consumer_billing.sql", [
  "claim_consumer_trial_redemption",
  "apply_consumer_billing_projection",
  "subscription-grace-period",
  "stale_ignored",
  "trial_ineligible",
  "p_trial_end = p_trial_start + interval '24 hours'",
  "revoke all on function public.apply_consumer_billing_projection",
  "to service_role"
]);

const consumerSources = [
  "apps/platform-web/lib/billing/consumer-config.ts",
  "apps/platform-web/lib/billing/consumer-models.ts",
  "apps/platform-web/lib/billing/consumer-provider.ts",
  "apps/platform-web/lib/billing/consumer-repository.ts",
  "apps/platform-web/lib/billing/consumer-service.ts",
  "apps/platform-web/lib/billing/consumer-stripe-provider.ts",
  "apps/platform-web/lib/billing/consumer-webhook.ts"
].map((path) => readFileSync(path, "utf8")).join("\n");
for (const marker of [
  "NEXT_PUBLIC_STRIPE_SECRET",
  "NEXT_PUBLIC_STRIPE_WEBHOOK",
  "NEXT_PUBLIC_SUPABASE_SECRET",
  "sk_live_",
  "pk_live_"
]) {
  if (consumerSources.includes(marker)) {
    throw new Error(`Consumer billing source contains prohibited marker ${marker}.`);
  }
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
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if ([".js", ".json", ".map", ".txt", ".html"].includes(extname(entry.name))) {
        const source = readFileSync(path, "utf8");
        for (const marker of [
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "SUPABASE_SECRET_KEY",
          "sk_test_fixture12345",
          "whsec_fixture12345",
          "sk_live_"
        ]) {
          if (source.includes(marker)) {
            throw new Error(`${relative(".", path)} exposes server-only billing material ${marker}.`);
          }
        }
      }
    }
  }
}

console.log("Phase 7C security audit passed: Sandbox-only provider use, Setup-mode ownership, bounded signed webhooks, server-owned trial/subscription projection, replay protection, secret isolation, and canonical hashes are enforced.");
