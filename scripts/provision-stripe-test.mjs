import { appendFileSync, existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";

import {
  buildPortalConfigurationPayload,
  hasCanonicalSandboxMetadata,
  isMonthlyPriceContract,
  isOwnedSandboxResource,
  portalConfigurationMatchesContract,
  requireSingleCandidate,
  STRIPE_SANDBOX_LEGACY_MONTHLY_LOOKUP_KEY,
  STRIPE_SANDBOX_LEGACY_PRODUCT_NAME,
  STRIPE_SANDBOX_METADATA,
  STRIPE_SANDBOX_MONTHLY_AMOUNT,
  STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY,
  STRIPE_SANDBOX_PRODUCT_NAME
} from "./stripe-sandbox-provisioning-contract.mjs";

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

// Complete all discovery before issuing any create or update call.
const productsResponse = await stripe.products.list({ active: true, limit: 100 });
const lookupPricesResponse = await stripe.prices.list({
  active: true,
  lookup_keys: [STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY, STRIPE_SANDBOX_LEGACY_MONTHLY_LOOKUP_KEY],
  limit: 100
});
const portalResponse = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });

const ownedProducts = productsResponse.data.filter(isOwnedSandboxResource);
const unmanagedNamedProducts = productsResponse.data.filter((item) =>
  !isOwnedSandboxResource(item) &&
  [STRIPE_SANDBOX_PRODUCT_NAME, STRIPE_SANDBOX_LEGACY_PRODUCT_NAME].includes(item.name)
);
if (unmanagedNamedProducts.length > 0) {
  throw new Error(`Conflicting unmanaged MathNexa Sandbox Product resources: ${unmanagedNamedProducts.map(({ id }) => id).join(", ")}`);
}
let product = requireSingleCandidate(ownedProducts, "Product");

let productPrices = [];
if (product) {
  productPrices = (await stripe.prices.list({ active: true, product: product.id, type: "recurring", limit: 100 })).data;
}

const lookupPriceCandidates = lookupPricesResponse.data.filter((item) =>
  [STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY, STRIPE_SANDBOX_LEGACY_MONTHLY_LOOKUP_KEY].includes(item.lookup_key)
);
if (lookupPriceCandidates.some((item) => product && item.product !== product.id)) {
  throw new Error(`Conflicting MathNexa Sandbox Price lookup key ownership: ${lookupPriceCandidates.map(({ id }) => id).join(", ")}`);
}

const priceCandidates = [...lookupPriceCandidates, ...productPrices.filter((item) =>
  isOwnedSandboxResource(item) || isMonthlyPriceContract(item, product?.id)
)];
let monthly = requireSingleCandidate(priceCandidates, "monthly Price");
if (monthly && !product) {
  throw new Error(`Conflicting MathNexa Sandbox Price without an owned Product: ${monthly.id}`);
}
if (monthly && !isMonthlyPriceContract(monthly, product.id)) {
  throw new Error(`Existing MathNexa Sandbox monthly Price does not match the USD 5.99 monthly contract: ${monthly.id}`);
}

const ownedPortals = portalResponse.data.filter(isOwnedSandboxResource);
let portal = requireSingleCandidate(ownedPortals, "Customer Portal configuration");

const actions = { product: product ? "reused" : "created", monthly: monthly ? "reused" : "created", portal: portal ? "reused" : "created" };

if (dryRun) {
  console.log(`Stripe test provisioning dry run: product=${actions.product}, monthly=${actions.monthly}, portal=${actions.portal}.`);
  process.exit(0);
}

if (!product) {
  product = await stripe.products.create({
    name: STRIPE_SANDBOX_PRODUCT_NAME,
    description: "MathNexa monthly game subscription (Stripe Sandbox).",
    metadata: STRIPE_SANDBOX_METADATA
  }, { idempotencyKey: "mathnexa-sandbox-product-v1" });
} else if (
  product.name !== STRIPE_SANDBOX_PRODUCT_NAME ||
  !hasCanonicalSandboxMetadata(product)
) {
  product = await stripe.products.update(product.id, {
    name: STRIPE_SANDBOX_PRODUCT_NAME,
    description: "MathNexa monthly game subscription (Stripe Sandbox).",
    metadata: STRIPE_SANDBOX_METADATA
  });
}

if (!monthly) {
  monthly = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: STRIPE_SANDBOX_MONTHLY_AMOUNT,
    recurring: { interval: "month" },
    lookup_key: STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY,
    metadata: STRIPE_SANDBOX_METADATA
  }, { idempotencyKey: `mathnexa-${STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY}` });
} else if (
  monthly.lookup_key !== STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY ||
  !hasCanonicalSandboxMetadata(monthly)
) {
  monthly = await stripe.prices.update(monthly.id, {
    lookup_key: STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY,
    transfer_lookup_key: true,
    metadata: STRIPE_SANDBOX_METADATA
  });
}

const portalPayload = buildPortalConfigurationPayload();
if (!portal) {
  portal = await stripe.billingPortal.configurations.create(portalPayload, {
    idempotencyKey: "mathnexa-sandbox-portal-v1"
  });
} else if (!portalConfigurationMatchesContract(portal) || !hasCanonicalSandboxMetadata(portal)) {
  portal = await stripe.billingPortal.configurations.update(portal.id, portalPayload);
}

if (
  !product || !monthly || !portal ||
  product.livemode || monthly.livemode || portal.livemode ||
  !isMonthlyPriceContract(monthly, product.id) ||
  monthly.lookup_key !== STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY ||
  !portalConfigurationMatchesContract(portal)
) {
  throw new Error("Test resource provisioning failed closed");
}

console.log(`Stripe test resources ready: product=${product.id} (${actions.product}), monthly=${monthly.id} (${actions.monthly}), portal=${portal.id} (${actions.portal})`);
if (writeEnv) {
  const path = ".env.billing.local";
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (existing.trim()) throw new Error("Refusing to overwrite existing ignored billing environment file");
  appendFileSync(path, `STRIPE_PRODUCT_MATHNEXA=${product.id}\nSTRIPE_PRICE_MATHNEXA_MONTHLY=${monthly.id}\nSTRIPE_PORTAL_CONFIGURATION_ID=${portal.id}\n`);
  console.log("Safe resource IDs written to ignored .env.billing.local; no secret was written.");
}
