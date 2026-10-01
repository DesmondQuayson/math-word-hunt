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

// Source with whole-line `//` comments and `/* */` blocks removed, so a gate
// that has been commented out no longer satisfies a check.
function code(path) {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}
function functionBody(path, header) {
  const source = code(path);
  const start = source.indexOf(header);
  if (start === -1) throw new Error(`${path} is missing Phase 7C safeguard: ${header}`);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? undefined : end + 2);
}
// Each marker (string or RegExp) must be found after the previous one.
function requireOrder(path, text, markers) {
  let from = 0;
  for (const marker of markers) {
    let at;
    if (typeof marker === "string") {
      at = text.indexOf(marker, from);
    } else {
      const match = marker.exec(text.slice(from));
      at = match ? from + match.index : -1;
    }
    if (at === -1) throw new Error(`${path} is missing Phase 7C safeguard (in this order): ${marker}`);
    from = at + 1;
  }
  return from;
}

requireAll("apps/platform-web/lib/billing/consumer-config.ts", [
  'MVH_APP_ENVIRONMENT !== "production-platform"',
  'ConsumerBillingConfigurationError("stripe-mode-mismatch")',
  "fixture-local-only",
  "automatic-refunds-prohibited",
  "renewalGraceDays"
]);
requireAll("apps/platform-web/lib/billing/consumer-stripe-provider.ts", [
  'mode: "setup"',
  'currency: "usd"',
  "managed_payments: { enabled: false }",
  "requireStandardPayments",
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
  "synchronizeCustomerSubscriptions"
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

// Phase 7C originally ran consumer billing in Stripe TEST mode only. The live
// launch (8cf80a5) replaced that rule with an owner-gated live mode; the checks
// below verify the replacement, in order, inside the single configuration
// parser: mode agreement, fixture confinement, mode-bound keys, explicit
// owner-approved live activation with its production prerequisites, refusal
// of live markers in test mode, and one exit after all of them.
const configPath = "apps/platform-web/lib/billing/consumer-config.ts";
const parser = functionBody(configPath, "export function parseConsumerBillingConfiguration(");
requireOrder(configPath, parser, [
  /if \(\(stripeMode !== "test" && stripeMode !== "live"\) \|\| applicationStripeMode !== stripeMode\) \{\s*throw new ConsumerBillingConfigurationError\("stripe-mode-mismatch"\);/,
  /if \(provider === "fixture" && \(!localRehearsal \|\| stripeMode !== "test"\)\) \{\s*throw new ConsumerBillingConfigurationError\("fixture-local-only"\);/,
  'if (!new RegExp(`^pk_${stripeMode}_[A-Za-z0-9]{8,}$`).test(publishableKey)) throw new ConsumerBillingConfigurationError("publishable-key-mode-or-format");',
  'if (!new RegExp(`^sk_${stripeMode}_[A-Za-z0-9]{8,}$`).test(secretKey)) throw new ConsumerBillingConfigurationError("secret-key-mode-or-format");',
  // The fixture provider serves only plain-http loopback origins and never a Vercel runtime.
  /if \(provider === "fixture" && \(!LOCAL_FIXTURE_ORIGIN\.test\(applicationBaseUrl\) \|\|\s*!LOCAL_FIXTURE_ORIGIN\.test\(subscriberManagementBaseUrl\) \|\| source\.VERCEL\?\.trim\(\) \|\| source\.VERCEL_ENV\?\.trim\(\)\)\) \{\s*throw new ConsumerBillingConfigurationError\("fixture-local-only"\);/,
  /if \(stripeMode === "live"\) \{\s*if \(source\.MVH_COMMERCIAL_ACTIVATION !== "live" \|\| source\.BILLING_LIVE_ACTIVATION !== "owner-approved"\) \{\s*throw new ConsumerBillingConfigurationError\("live-commercial-activation-not-approved"\);/,
  // Every live production prerequisite, each one sufficient to refuse.
  new RegExp(`if \\(${[
    'source.MVH_EMAIL_DELIVERY !== "transactional-verified"',
    'source.MVH_FIXTURE_POLICY !== "forbidden"',
    'source.MVH_IDENTITY_MODEL !== "consumer-v1"',
    'applicationBaseUrl !== "https://mathnexa.com"',
    'source.MVH_APPLICATION_ORIGIN !== "https://mathnexa.com"',
    'source.MVH_LEGAL_REVIEW !== "owner-approved"',
    "!supportEmail",
    "source.MVH_TERMS_VERSION !== COMMERCIAL_POLICY.termsVersion",
    "source.MVH_PRIVACY_VERSION !== COMMERCIAL_POLICY.privacyVersion",
    "source.MVH_CANCELLATION_POLICY_VERSION !== COMMERCIAL_POLICY.cancellationVersion",
    "source.MVH_REFUND_POLICY_VERSION !== COMMERCIAL_POLICY.refundVersion"
  ].map((condition) => condition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*\\|\\|\\s*")}\\) \\{\\s*throw new ConsumerBillingConfigurationError\\("live-production-prerequisites-incomplete"\\);`),
  'throw new ConsumerBillingConfigurationError("stable-subscriber-management-origin-required");',
  /\} else if \(source\.MVH_COMMERCIAL_ACTIVATION === "live" \|\| source\.BILLING_LIVE_ACTIVATION === "owner-approved"\) \{\s*throw new ConsumerBillingConfigurationError\("test-mode-live-activation-conflict"\);/,
  "return Object.freeze({"
]);
if (!code(configPath).includes(String.raw`const LOCAL_FIXTURE_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/;`)) {
  throw new Error(`${configPath} is missing Phase 7C safeguard: the loopback-only fixture origin rule`);
}
if ((parser.match(/\breturn\b/g) ?? []).length !== 1) {
  throw new Error(`${configPath}: parseConsumerBillingConfiguration must have exactly one return, after every mode and activation gate.`);
}

// Webhooks: projection moved from consumer-webhook.ts (applyProjection) into
// consumer-synchronizer.ts (1e707ee). Verify that nothing changes state until
// the Stripe signature is verified, that a refused signature or the wrong
// livemode returns before any write, that the event is registered and claimed
// first, and that synchronization runs only after that.
const webhookPath = "apps/platform-web/lib/billing/consumer-webhook.ts";
const webhook = functionBody(webhookPath, "export async function processConsumerBillingWebhook(");
const verifiedAt = webhook.indexOf("event = input.provider.constructVerifiedEvent(input.payload, input.signature, input.config.webhookSecret);");
const claimedAt = requireOrder(webhookPath, webhook, [
  /if \(!input\.signature\) \{\s*await recordSecurityEvent\("WEBHOOK_SIGNATURE_INVALID", \{ reason: "absent" \}\);\s*return \{ status: 400, body: \{ received: false, state: "invalid-signature" \} \};/,
  "event = input.provider.constructVerifiedEvent(input.payload, input.signature, input.config.webhookSecret);",
  /\} catch \{\s*await recordSecurityEvent\("WEBHOOK_SIGNATURE_INVALID", \{ reason: "verification-failed" \}\);\s*return \{ status: 400, body: \{ received: false, state: "invalid-signature" \} \};/,
  /if \(event\.livemode !== expectedLivemode\) \{\s*return \{\s*status: 400,/,
  "receipt = await input.repository.registerEvent(",
  /if \(!await input\.repository\.claimEvent\(receipt\.id\)\) \{\s*return \{ status: 200, body: \{ received: true, state: "already-processing" \} \};/
]);
for (const forbidden of ["repository.", "synchroniz", "activateConsumerSetupCheckout", "revokeCustomer", "finishEvent"]) {
  if (webhook.slice(0, verifiedAt).includes(forbidden)) {
    throw new Error(`${webhookPath}: ${forbidden} runs before the Stripe signature is verified.`);
  }
}
for (const stateChange of ["activateConsumerSetupCheckout(", "input.repository.revokeCustomer(", "synchronizeCustomerSubscriptions({"]) {
  const at = webhook.indexOf(stateChange);
  if (at === -1 || at < claimedAt) throw new Error(`${webhookPath}: ${stateChange} must run only after the verified event is registered and claimed.`);
}
if (!/constructVerifiedEvent\(payload: string \| Buffer, signature: string, secret: string\) \{\s*const event = this\.stripe\.webhooks\.constructEvent\(payload, signature, secret\);/.test(code("apps/platform-web/lib/billing/consumer-stripe-provider.ts"))) {
  throw new Error("Stripe signature verification (webhooks.constructEvent) must be the first step of constructVerifiedEvent.");
}
const synchronizerPath = "apps/platform-web/lib/billing/consumer-synchronizer.ts";
// The snapshot validator itself still refuses ownership, status, mode and
// price conflicts before it can report a snapshot as valid.
requireOrder(synchronizerPath, functionBody(synchronizerPath, "export function validateAuthoritativeSubscription("), [
  "customer.deleted || customer.livemode !== expectedLivemode || customer.ownerUserId !== input.ownerUserId",
  'return "ownership_conflict";',
  'if (subscription.status === null) return "unknown_subscription_status";',
  "subscription.livemode !== expectedLivemode || price.livemode !== expectedLivemode",
  "!config.acceptedPriceIds.includes(price.id)",
  'return "projection_conflict";',
  "return null;"
]);
const customerSync = functionBody(synchronizerPath, "export async function synchronizeCustomerSubscriptions(");
requireOrder(synchronizerPath, customerSync, [
  "const failure = validateAuthoritativeSubscription({",
  /if \(failure\) \{[\s\S]*?continue;\s*\}/,
  "states[subscription.id] = await synchronizeConsumerSubscription({",
  "const failure = validateAuthoritativeSubscription({",
  /if \(failure\) \{\s*skipped\[request\.primary\.subscription\.id\] = failure;\s*\} else \{\s*state = await synchronizeConsumerSubscription\(\{/
]);
if ((customerSync.match(/synchronizeConsumerSubscription\(/g) ?? []).length !== 2) {
  throw new Error(`${synchronizerPath}: every projection must follow its own snapshot validation.`);
}
if (!code("apps/platform-web/lib/billing/consumer-repository.ts").includes('this.client.rpc("synchronize_consumer_billing_subscription"')) {
  throw new Error("apps/platform-web/lib/billing/consumer-repository.ts is missing Phase 7C safeguard: the synchronize_consumer_billing_subscription RPC");
}

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
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
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

console.log("Phase 7C security audit passed: owner-approved live activation with mode-bound keys and a local-only fixture, Setup-mode ownership, signature-verified webhooks that change nothing before verification and claim, validated server-owned trial/subscription projection, replay protection, secret isolation, and canonical hashes are enforced.");
