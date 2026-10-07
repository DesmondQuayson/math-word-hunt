// STRIPE TEST-MODE ONLY: proves how Stripe shapes a MathNexa trial.
//
// Launched by scripts/invoke-trial-shape-stripe-test.ps1 with the vault's
// sk_test_ key (a live or restricted key is refused). Creates one throwaway
// test customer with Stripe's test card, then two trialing subscriptions on the
// test MathNexa price with exactly the parameters the application sends:
//
//   checkout-clock  trial_end = (checkout event time + 24 h), the event two
//                   seconds before creation: what production sent until now;
//   duration        trial_period_days = 1: what the fix sends.
//
// It reads each subscription and Stripe's own customer.subscription.created
// event for it, reports trial_end - trial_start, then cancels both
// subscriptions and deletes the customer. Nothing is left behind except Stripe
// test-mode event history. No key or full identifier is printed.
import Stripe from "stripe";

const API_VERSION = "2026-07-29.dahlia";
const TEST_PRICE = process.env.TRIAL_SHAPE_TEST_PRICE?.trim() || "price_1TzKso4YQNsZa1pjh5UZvcV7";
const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
if (!/^sk_test_[A-Za-z0-9]+$/.test(key)) throw new Error("refusing: a Stripe sk_test_ key is required (never live)");
for (const name of Object.keys(process.env)) if (/_LIVE_|_PRODUCTION_/.test(name) && process.env[name]) throw new Error(`refusing: ${name} is loaded`);
const stripe = new Stripe(key, { apiVersion: API_VERSION, maxNetworkRetries: 2 });
const suffix = (value) => (value ? `..${String(value).slice(-6)}` : null);
const iso = (seconds) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const evidence = { mode: "stripe-test", startedAt: new Date().toISOString(), variants: {} };

async function main() {
  const price = await stripe.prices.retrieve(TEST_PRICE);
  if (price.livemode || price.unit_amount !== 599 || price.currency !== "usd" || price.recurring?.interval !== "month") throw new Error("unexpected test price");
  evidence.price = { price: suffix(price.id), amount: price.unit_amount, interval: price.recurring.interval, livemode: price.livemode };
  const startedSeconds = Math.floor(Date.now() / 1000) - 5;
  const customer = await stripe.customers.create({ description: "MathNexa trial-shape validation (test mode, deleted after run)", metadata: { purpose: "trial-shape-validation" } });
  evidence.customer = suffix(customer.id);
  const created = [];
  try {
    const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    const base = {
      customer: customer.id,
      items: [{ price: price.id, quantity: 1 }],
      default_payment_method: paymentMethod.id,
      collection_method: "charge_automatically",
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { purpose: "trial-shape-validation" }
    };
    const trialSettings = { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } };
    // The activation computes the end from the checkout event, which Stripe
    // creates before the subscription; production showed a 1-2 s gap.
    const checkoutEventTime = Date.now() - 2_000;
    const variants = [
      ["checkout-clock", { ...base, ...trialSettings, trial_end: Math.floor(checkoutEventTime / 1000) + 86_400 }],
      ["duration", { ...base, ...trialSettings, trial_period_days: 1 }]
    ];
    for (const [name, parameters] of variants) {
      const subscription = await stripe.subscriptions.create(parameters, { idempotencyKey: `trial-shape-validation-${name}-${customer.id}` });
      created.push(subscription.id);
      evidence.variants[name] = {
        subscription: suffix(subscription.id), status: subscription.status,
        trialStart: iso(subscription.trial_start), trialEnd: iso(subscription.trial_end),
        trialSeconds: subscription.trial_end - subscription.trial_start,
        exact24h: subscription.trial_end - subscription.trial_start === 86_400,
        createdToTrialStartSeconds: subscription.trial_start - subscription.created
      };
    }
    // Stripe's own created events, i.e. exactly what the webhook handler receives.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const events = await stripe.events.list({ type: "customer.subscription.created", created: { gte: startedSeconds }, limit: 100 });
      const ours = events.data.filter((event) => created.includes(event.data.object.id));
      if (ours.length === created.length) {
        for (const event of ours) {
          const object = event.data.object;
          const name = Object.entries(evidence.variants).find(([, value]) => value.subscription === suffix(object.id))[0];
          evidence.variants[name].createdEvent = {
            trialSeconds: object.trial_end - object.trial_start,
            exact24h: object.trial_end - object.trial_start === 86_400,
            synchronizerVerdict: object.status === "trialing" && object.trial_end - object.trial_start === 86_400 ? "projected (trial-active)" : "trial_shape_conflict (manual review)"
          };
        }
        break;
      }
      await sleep(2_000);
    }
  } finally {
    evidence.cleanup = {};
    for (const id of created) {
      try { const canceled = await stripe.subscriptions.cancel(id); evidence.cleanup[suffix(id)] = canceled.status; } catch (error) { evidence.cleanup[suffix(id)] = `cancel-failed:${error?.code ?? error?.type}`; }
    }
    try { const deleted = await stripe.customers.del(customer.id); evidence.cleanup.customerDeleted = deleted.deleted === true; } catch (error) { evidence.cleanup.customerDeleted = `failed:${error?.code ?? error?.type}`; }
  }
}

try {
  await main();
  const v = evidence.variants;
  evidence.result = v.duration?.exact24h && v.duration?.createdEvent?.exact24h ? "PASS" : "FAIL";
  if (evidence.result !== "PASS") process.exitCode = 1;
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = String(error?.message ?? error).replace(/sk_test_[A-Za-z0-9]+/g, "[key]").replace(/\b(cus|sub|pm|price|evt)_[A-Za-z0-9]{8,}\b/g, (m) => `..${m.slice(-6)}`);
  process.exitCode = 1;
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
