import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const apply = args.has("--apply");
const owner = args.get("--owner");
const eventId = args.get("--event");
const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (!owner && !eventId && !args.has("--unresolved")) throw new Error("Use --owner=<internal UUID>, --event=<test event ID>, or --unresolved");
if (key && !key.startsWith("sk_test_")) throw new Error("Billing operation rejected non-test credentials");
if (!key && (owner || eventId)) { console.log("Billing operation unavailable: test Stripe credentials are not configured. No changes made."); process.exit(0); }
const url = process.env.SUPABASE_URL?.trim() ?? "";
const dbKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
if (!url || !dbKey) throw new Error("Local server-only Supabase configuration is required");
const stripe = key ? new Stripe(key, { apiVersion: "2026-02-25.clover" }) : null;
const db = createClient(url, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });

if (args.has("--unresolved")) {
  const result = await db.from("billing_webhook_events").select("processing_state, failure_class, attempt_count, replay_count").in("processing_state", ["retryable_failure", "manual_review"]);
  if (result.error) throw new Error("Unable to inspect billing diagnostics");
  console.log(`Unresolved billing events: ${result.data.length}.`);
}

async function replay(event) {
  if (event.livemode) throw new Error("Live event replay is forbidden");
  if (!apply) { console.log(`Dry run: one ${event.type} test event is eligible for verified local replay.`); return; }
  const endpoint = process.env.BILLING_WEBHOOK_REPLAY_URL?.trim() ?? "http://127.0.0.1:3000/api/billing/webhook";
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret.startsWith("whsec_")) throw new Error("Local webhook secret is required for apply mode");
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload });
  console.log(`Verified local replay completed with HTTP ${response.status}.`);
  if (response.status >= 500) process.exitCode = 1;
}

if (eventId && stripe) await replay(await stripe.events.retrieve(eventId));
if (owner) {
  if (!/^[0-9a-f-]{36}$/i.test(owner)) throw new Error("Owner reference must be an internal UUID");
  const mapping = await db.from("billing_customers").select("stripe_customer_id").eq("owner_teacher_id", owner).eq("stripe_environment", "test").maybeSingle();
  if (mapping.error) throw new Error("Unable to inspect customer mapping");
  if (!mapping.data) console.log("Diagnostic: no_customer_mapping.");
  else if (stripe) {
    const customer = await stripe.customers.retrieve(mapping.data.stripe_customer_id);
    if (customer.deleted) console.log("Diagnostic: customer_missing.");
    else if (customer.livemode || (customer.metadata.mvh_teacher_id && customer.metadata.mvh_teacher_id !== owner)) console.log(`Diagnostic: ${customer.livemode ? "environment_mismatch" : "ownership_conflict"}.`);
    const matches = await stripe.customers.search({ query: `metadata['mvh_teacher_id']:'${owner}'`, limit: 10 });
    if (matches.data.length > 1) console.log("Diagnostic: duplicate_customer; apply is denied pending review.");
    const subscriptions = await stripe.subscriptions.list({ customer: mapping.data.stripe_customer_id, status: "all", limit: 10 });
    console.log(`Diagnostic: mapped customer has ${subscriptions.data.length} test subscription projection candidate(s).`);
    if (subscriptions.data.length > 1) console.log("Diagnostic: duplicate_subscription; apply is denied pending review.");
    const approvedPrices = new Set([process.env.STRIPE_PRICE_TEACHER_PRO_MONTHLY, process.env.STRIPE_PRICE_TEACHER_PRO_ANNUAL].filter(Boolean));
    if (subscriptions.data.some((subscription) => subscription.livemode)) console.log("Diagnostic: environment_mismatch.");
    if (subscriptions.data.some((subscription) => !approvedPrices.has(subscription.items.data[0]?.price.id))) console.log("Diagnostic: unknown_price.");
    const expired = await db.from("product_entitlements").select("id", { count: "exact", head: true }).eq("teacher_user_id", owner).eq("status", "active").lt("expires_at", new Date().toISOString());
    if (expired.error) throw new Error("Unable to inspect entitlement projection");
    if ((expired.count ?? 0) > 0) console.log("Diagnostic: expired_entitlement.");
    if (apply && matches.data.length === 1 && subscriptions.data.length === 1 && !subscriptions.data[0].livemode && approvedPrices.has(subscriptions.data[0].items.data[0]?.price.id)) {
      const events = await stripe.events.list({ types: ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"], limit: 100 });
      const candidate = events.data.find((event) => event.data.object && "id" in event.data.object && event.data.object.id === subscriptions.data[0].id);
      if (!candidate) throw new Error("No verified provider event is available to rebuild projection");
      await replay(candidate);
    }
  }
}
