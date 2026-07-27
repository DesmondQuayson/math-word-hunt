import { appendFileSync, existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";

const API_VERSION = "2026-02-25.clover";
const dryRun = process.argv.includes("--dry-run");
const writeEnv = process.argv.includes("--write-env");
const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (!key) {
  console.log("Stripe test provisioning unavailable: STRIPE_SECRET_KEY is not configured. No resources were created.");
  process.exit(0);
}
if (!key.startsWith("sk_test_")) throw new Error("Test provisioning rejected a non-test Stripe key");
const stripe = new Stripe(key, { apiVersion: API_VERSION });
const metadata = { mvh_internal_product: "math-vocabulary-hunt", mvh_environment: "test" };

const products = await stripe.products.list({ active: true, limit: 100 });
let product = products.data.find((item) => item.metadata.mvh_internal_product === metadata.mvh_internal_product && item.metadata.mvh_environment === "test");
if (product?.livemode) throw new Error("Provisioning rejected a live Product");
if (!product && !dryRun) product = await stripe.products.create({ name: "Math Vocabulary Hunt Teacher Pro (Test)", description: "Test-mode Teacher Pro subscription. Not production pricing.", metadata }, { idempotencyKey: "mvh-test-product-v1" });

async function ensurePrice(lookupKey, amount, interval) {
  const found = (await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 10 })).data[0];
  if (found) {
    if (found.livemode || !found.active || found.currency !== "usd" || found.unit_amount !== amount || found.recurring?.interval !== interval || found.recurring.interval_count !== 1 || found.recurring.usage_type !== "licensed" || found.product !== product?.id) throw new Error(`Existing ${interval} test Price does not match the frozen contract`);
    return found;
  }
  if (dryRun || !product) return null;
  return stripe.prices.create({ product: product.id, currency: "usd", unit_amount: amount, recurring: { interval }, lookup_key: lookupKey, metadata }, { idempotencyKey: `mvh-${lookupKey}` });
}
const monthly = await ensurePrice("mvh_teacher_pro_monthly_test_v1", 999, "month");
const annual = await ensurePrice("mvh_teacher_pro_annual_test_v1", 7999, "year");

const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
let portal = configurations.data.find((item) => item.metadata?.mvh_internal_product === metadata.mvh_internal_product && item.metadata?.mvh_environment === "test");
if (portal && (portal.livemode || !portal.active || !portal.features.invoice_history.enabled || !portal.features.payment_method_update.enabled || !portal.features.subscription_cancel.enabled || portal.features.subscription_cancel.mode !== "at_period_end" || portal.features.subscription_update.enabled)) throw new Error("Existing test portal configuration does not match the frozen contract");
if (!portal && !dryRun) portal = await stripe.billingPortal.configurations.create({
  business_profile: { headline: "Math Vocabulary Hunt test billing" },
  features: {
    customer_update: { enabled: false, allowed_updates: [] },
    invoice_history: { enabled: true }, payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: false, options: [] } },
    subscription_update: { enabled: false, default_allowed_updates: [], products: [] }
  }, metadata
});

if (dryRun) {
  console.log(`Stripe test provisioning dry run: product=${product ? "reuse" : "create"}, monthly=${monthly ? "reuse" : "create"}, annual=${annual ? "reuse" : "create"}, portal=${portal ? "reuse" : "create"}.`);
  process.exit(0);
}
if (!product || !monthly || !annual || !portal || product.livemode || monthly.livemode || annual.livemode || portal.livemode) throw new Error("Test resource provisioning failed closed");
console.log(`Stripe test resources ready: product=${product.id}, monthly=${monthly.id}, annual=${annual.id}, portal=${portal.id}`);
if (writeEnv) {
  const path = ".env.billing.local";
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (existing.trim()) throw new Error("Refusing to overwrite existing ignored billing environment file");
  appendFileSync(path, `STRIPE_PRODUCT_TEACHER_PRO=${product.id}\nSTRIPE_PRICE_TEACHER_PRO_MONTHLY=${monthly.id}\nSTRIPE_PRICE_TEACHER_PRO_ANNUAL=${annual.id}\nSTRIPE_PORTAL_CONFIGURATION_ID=${portal.id}\n`);
  console.log("Safe resource IDs written to ignored .env.billing.local; no secret was written.");
}
