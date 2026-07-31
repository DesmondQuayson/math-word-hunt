import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPortalConfigurationPayload,
  findEmptyArrays,
  hasCanonicalSandboxMetadata,
  hasLegacySandboxMetadata,
  isMonthlyPriceContract,
  portalConfigurationMatchesContract,
  requireSingleCandidate,
  STRIPE_SANDBOX_METADATA,
  STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY
} from "./stripe-sandbox-provisioning-contract.mjs";

test("portal payload enables supported billing controls without invalid empty arrays", () => {
  const payload = buildPortalConfigurationPayload();

  assert.deepEqual(findEmptyArrays(payload), []);
  assert.deepEqual(payload.metadata, STRIPE_SANDBOX_METADATA);
  assert.deepEqual(payload.features.payment_method_update, { enabled: true });
  assert.deepEqual(payload.features.invoice_history, { enabled: true });
  assert.deepEqual(payload.features.subscription_update, { enabled: false });
  assert.deepEqual(payload.features.customer_update, { enabled: false });
  assert.deepEqual(payload.features.subscription_cancel, {
    enabled: true,
    mode: "at_period_end",
    proration_behavior: "none",
    cancellation_reason: {
      enabled: true,
      options: ["too_expensive", "missing_features", "unused", "other"]
    }
  });
  assert.equal("products" in payload.features.subscription_update, false);
  assert.equal("default_allowed_updates" in payload.features.subscription_update, false);
});

test("portal contract accepts the Stripe response form and rejects weakened controls", () => {
  const payload = buildPortalConfigurationPayload();
  const response = { id: "bpc_test", active: true, livemode: false, ...payload };

  assert.equal(portalConfigurationMatchesContract(response), true);
  assert.equal(portalConfigurationMatchesContract({
    ...response,
    features: {
      ...response.features,
      subscription_cancel: {
        ...response.features.subscription_cancel,
        proration_behavior: "create_prorations"
      }
    }
  }), false);
});

test("resource reconciliation recognizes canonical and legacy ownership metadata", () => {
  assert.equal(hasCanonicalSandboxMetadata({ metadata: STRIPE_SANDBOX_METADATA }), true);
  assert.equal(hasLegacySandboxMetadata({
    metadata: { mathnexa_internal_product: "game-subscription", mathnexa_environment: "test" }
  }), true);
  assert.equal(hasCanonicalSandboxMetadata({ metadata: { application: "other" } }), false);
});

test("resource reconciliation fails closed on duplicate candidates", () => {
  assert.throws(
    () => requireSingleCandidate([{ id: "prod_one" }, { id: "prod_two" }], "Product"),
    /Conflicting duplicate MathNexa Sandbox Product resources: prod_one, prod_two/
  );
  assert.deepEqual(requireSingleCandidate([{ id: "prod_one" }, { id: "prod_one" }], "Product"), { id: "prod_one" });
});

test("monthly price contract is exactly USD 5.99 recurring monthly", () => {
  const price = {
    id: "price_test",
    active: true,
    livemode: false,
    currency: "usd",
    unit_amount: 599,
    lookup_key: STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY,
    product: "prod_test",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }
  };

  assert.equal(isMonthlyPriceContract(price, "prod_test"), true);
  assert.equal(isMonthlyPriceContract({ ...price, unit_amount: 600 }, "prod_test"), false);
});
