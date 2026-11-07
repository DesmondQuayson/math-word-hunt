/**
 * READ-ONLY production diagnosis for the Super Admin "System health" panel.
 *
 * Launched by scripts/invoke-system-health-production-diagnosis.ps1 with the
 * production project ref, database password and service key, plus (when the
 * vault holds it) the RESTRICTED read-only live Stripe key. Writes nothing:
 *
 *  - database: SELECT statements only, through the session pooler;
 *  - Stripe: retrieve/list calls only, and only with an rk_live_ key.
 *
 * It reproduces every input the panel reads (lib/admin/dashboard.ts) and the
 * evidence behind each one: webhook ledger states and every row that needs
 * attention (with the local projection and, with the key, Stripe's own view),
 * email delivery signals and Supabase Auth's own confirmation/recovery
 * timestamps, each quarantined resource file with its validator findings,
 * game packages and package quarantine events, buckets, the reconciliation
 * scheduler's freshness and recent admin activity. Provider and row
 * identifiers are reduced to 6-character suffixes; no email address, payload,
 * key, token or full provider id is printed.
 *
 * Email delivery (added 2026-11-07 after the System Health investigation):
 *  - emailLinks: every sign-up of the last 60 days with the SMTP provider's
 *    acceptance time, whether the emailed link was opened (Supabase issued the
 *    PKCE auth code) and whether the confirmation is still pending, plus monthly
 *    confirmation rates. Mailboxes are reduced to a provider class;
 *  - emailDomain: public DNS of the sending domain (Resend DKIM, SPF and bounce
 *    MX on send.<domain>, DMARC) - SYSTEM_HEALTH_SENDING_DOMAIN, default
 *    auth.mathnexa.com;
 *  - providerAccess: whether the vault's Supabase management token and Resend
 *    key can read provider-side evidence (status only), and when they can, the
 *    Auth settings that matter for delivery, 7 days of email-related Auth log
 *    lines and the Resend status of the emails sent to the unconfirmed sign-ups
 *    (matched in memory, never printed).
 * Request/runtime-log evidence: scripts/system-health-vercel-evidence.mjs.
 */
import { spawnSync } from "node:child_process";
import { Resolver } from "node:dns/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const PRODUCTION_QUIZ_ID_PREFIXES = Object.freeze(["83d9252f", "42215d2a", "5b8bdc39", "1d80b325", "e01a72e2", "3e25faa1", "339aa712", "7654e5e9"]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const STRIPE_API_VERSION = "2026-07-29.dahlia";
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const secrets = [];
const evidence = { label: "system-health-diagnosis", takenAt: new Date().toISOString() };

function redact(text) {
  let value = String(text ?? "");
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.replace(/postgresql:\/\/\S+/g, "postgresql://[redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[sbkey]")
    .replace(/rk_live_[A-Za-z0-9]+/g, "[rkkey]")
    .replace(/\b(?:evt|sub|in|cus|cs_live|cs_test|cs|pi|ch|price|prod)_[A-Za-z0-9]{8,}\b/g, (match) => `..${match.slice(-6)}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function required(name, pattern) {
  const value = (process.env[name] ?? "").trim();
  check(pattern.test(value), `missing-or-malformed-${name}`);
  secrets.push(value, encodeURIComponent(value));
  return value;
}
/** An entry the diagnosis can do without: "" when absent or malformed (reported, never printed). */
function optional(name, pattern) {
  const value = (process.env[name] ?? "").trim();
  if (!pattern.test(value)) return "";
  secrets.push(value, encodeURIComponent(value));
  return value;
}
for (const name of Object.keys(process.env)) {
  check(!/^MVH_STAGING|^STAGING_|_STAGING$|^SUPABASE_DB_PASSWORD$|^SUPABASE_SECRET_KEY$/.test(name), `refusing: variable ${name} is present in this process`);
  check(!/^STRIPE_/.test(name) || name === "STRIPE_LIVE_READONLY_KEY", `refusing: ${name} is present; only the restricted read-only key may be used`);
}
const ref = required("SUPABASE_PRODUCTION_PROJECT_REF", /^[A-Za-z]{20}$/).toLowerCase();
check(ref !== STAGING_PROJECT_REF, "refusing: the production project ref is the staging project");

function cli(commandArgs) {
  const result = spawnSync(process.execPath, [supabaseCli, ...commandArgs, "--yes"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}
function parseRows(output) {
  const starts = [output.indexOf("["), output.indexOf("{")].filter((index) => index !== -1);
  check(starts.length > 0, `query-output-unreadable:${redact(output).slice(-300)}`);
  const parsed = JSON.parse(output.slice(Math.min(...starts), Math.max(output.lastIndexOf("]"), output.lastIndexOf("}")) + 1));
  return Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.result ?? parsed.data ?? [];
}
function connect() {
  const password = required("SUPABASE_PRODUCTION_DB_PASSWORD", /^.{12,}$/);
  for (const host of POOLER_HOSTS) {
    const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
    if (cli(["db", "query", "--db-url", url, "-o", "json", "select 1 as ok"]).ok) {
      secrets.push(url);
      return (query) => {
        check(/^\s*(select|with)\b/i.test(query), "read-only-guard: only SELECT statements are allowed");
        check(!/;\s*\S/.test(query), "read-only-guard: one statement per query");
        const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
        check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
        return parseRows(result.output);
      };
    }
  }
  throw new Error("production-database-unreachable");
}
/** A section that fails is reported as such instead of aborting the whole diagnosis. */
function section(name, run) {
  try { evidence[name] = run(); } catch (error) { evidence[name] = { unavailable: redact(error instanceof Error ? error.message : String(error)).slice(0, 300) }; }
}

async function identify(sql) {
  const database = sql(`select (select count(*) from public.consumer_accounts)::int as accounts,
    (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games,
    (select count(*) from public.content_resources where resource_type in ('quiz','quiz_pdf') and left(id::text, 8) in (${PRODUCTION_QUIZ_ID_PREFIXES.map((prefix) => `'${prefix}'`).join(",")}))::int as production_quizzes`)[0];
  const secretKey = required("SUPABASE_PRODUCTION_SECRET_KEY", /^(sb_secret_|eyJ).{16,}/);
  const client = createClient(`https://${ref}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = await client.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await client.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "production-api-rejected-the-vault-service-key");
  check(database.accounts === accounts.count && database.games === games.data.map((row) => `${row.stable_key}:${row.status}`).join(","), "pooler-database-and-production-api-differ");
  check(database.production_quizzes === PRODUCTION_QUIZ_ID_PREFIXES.length, "production-quiz-fingerprint-missing-refusing");
  evidence.environment = "PRODUCTION";
  // The panel itself reads storage through the API (listBuckets), so do the same.
  const buckets = await client.storage.listBuckets();
  evidence.storageBuckets = buckets.error ? { unavailable: "listBuckets failed" } : buckets.data.map((bucket) => ({ id: bucket.id, public: bucket.public }));
}

const suffix = (value) => (typeof value === "string" && value ? `..${value.slice(-6)}` : null);
const iso = (seconds) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);
const idOf = (value) => (typeof value === "string" ? value : value?.id ?? null);

/** Exactly the counts lib/admin/dashboard.ts computes, so the panel can be reproduced. */
function panelInputs(sql) {
  return sql(`select
    (select count(*) from public.billing_webhook_events)::int as webhook_events_all_time,
    (select count(*) from public.billing_webhook_events where processing_state in ('failed','manual_review'))::int as panel_webhook_failures,
    (select count(*) from public.billing_webhook_events where processing_state = 'retryable_failure')::int as retryable_failures_not_counted_by_panel,
    (select count(*) from public.platform_analytics_events where metric_key in ('email-confirmation-success','email-confirmation-failure','email-recovery-success','email-recovery-failure'))::int as panel_email_events,
    (select count(*) from public.platform_analytics_events where metric_key in ('email-confirmation-failure','email-recovery-failure'))::int as panel_email_failures,
    (select count(*) from public.resource_files where validation_state = 'quarantined')::int as panel_pdf_quarantine,
    (select count(*) from public.game_package_quarantine_events)::int as panel_zip_quarantine,
    (select count(*) from public.game_packages)::int as game_packages,
    (select count(*) from public.game_packages where publication_state = 'validating')::int as game_packages_validating`)[0];
}

function webhooks(sql) {
  const states = sql(`select processing_state, coalesce(failure_class, '') as failure_class, stripe_environment, count(*)::int as rows,
      min(received_at) as first_received_at, max(received_at) as last_received_at
    from public.billing_webhook_events group by 1, 2, 3 order by 1, 2, 3`);
  const freshness = sql(`select max(received_at) as last_received_at,
      max(processed_at) filter (where processing_state = 'processed') as last_processed_at,
      count(*) filter (where received_at > now() - interval '24 hours')::int as received_24h,
      count(*) filter (where received_at > now() - interval '7 days')::int as received_7d,
      count(*) filter (where received_at > now() - interval '30 days')::int as received_30d,
      count(*) filter (where processing_state in ('processed','ignored') and received_at > now() - interval '30 days')::int as succeeded_30d,
      count(*) filter (where processing_state in ('received','processing'))::int as pending_now,
      count(*) filter (where processing_state = 'processing' and lease_expires_at < now())::int as expired_leases,
      count(*) filter (where replay_count > 0)::int as replayed_rows
    from public.billing_webhook_events`)[0];
  const byType = sql(`select event_type, processing_state, count(*)::int as rows, max(received_at) as last_received_at
    from public.billing_webhook_events where received_at > now() - interval '60 days' group by 1, 2 order by 1, 2`);
  const attention = sql(`select e.id::text as id, e.event_type, e.stripe_environment, e.stripe_object_id, e.processing_state, e.failure_class,
      e.event_created_at, e.received_at, e.processed_at, e.last_attempt_at, e.attempt_count, e.replay_count, e.api_version,
      (select jsonb_build_object('status', s.subscription_status, 'cancelAtPeriodEnd', s.cancel_at_period_end,
          'currentPeriodEnd', s.current_period_end, 'canceledAt', s.canceled_at, 'endedAt', s.ended_at,
          'latestAuthoritativeEventAt', s.latest_authoritative_event_created_at, 'lastSynchronizedAt', s.last_synchronized_at,
          'lastSynchronizationSource', s.last_synchronization_source, 'consumerOwned', s.owner_consumer_id is not null,
          'stripeSubscriptionId', s.stripe_subscription_id, 'ownerId', s.owner_consumer_id,
          'matchedBy', case when s.stripe_subscription_id = e.stripe_object_id then 'subscription' else 'latest_invoice' end)
        from public.billing_subscriptions s
        where s.stripe_subscription_id = e.stripe_object_id or s.latest_invoice_id = e.stripe_object_id
        order by s.updated_at desc limit 1) as local_subscription,
      (select jsonb_agg(jsonb_build_object('type', l.event_type, 'state', l.processing_state, 'eventCreatedAt', l.event_created_at) order by l.event_created_at)
        from public.billing_webhook_events l
        where l.stripe_object_id = e.stripe_object_id and l.id <> e.id) as other_events_same_object
    from public.billing_webhook_events e
    where e.processing_state in ('manual_review','retryable_failure','received','processing','failed')
    order by e.received_at`);
  return { states, freshness, recentByType: byType, attention };
}

function entitlementFor(sql, ownerId) {
  if (!/^[0-9a-f-]{36}$/.test(ownerId ?? "")) return null;
  const rows = sql(`select to_jsonb(e) - 'user_id' - 'source_reference_hash' - 'trial_redemption_checkout_hash' as entitlement,
      (select to_jsonb(a)->>'status' from public.consumer_accounts a where a.user_id = e.user_id) as account_status
    from public.consumer_game_entitlements e where e.user_id = '${ownerId}'`);
  return rows[0] ?? null;
}

async function stripeViews(attention) {
  const key = (process.env.STRIPE_LIVE_READONLY_KEY ?? "").trim();
  if (!key) return { available: false, reason: "no STRIPE_LIVE_READONLY_KEY in the vault" };
  check(/^rk_live_[A-Za-z0-9]+$/.test(key), "refusing: STRIPE_LIVE_READONLY_KEY must be a restricted rk_live_ key");
  secrets.push(key);
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 });
  const failure = (error) => ({ error: redact(error?.type ?? error?.code ?? "request-failed"), status: error?.statusCode ?? null });
  const subscriptionView = async (id) => {
    if (!id) return null;
    try {
      const subscription = await stripe.subscriptions.retrieve(id);
      const item = subscription.items?.data?.[0];
      return {
        subscription: suffix(subscription.id), status: subscription.status, cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: iso(subscription.current_period_end ?? item?.current_period_end), endedAt: iso(subscription.ended_at),
        canceledAt: iso(subscription.canceled_at), latestInvoice: suffix(idOf(subscription.latest_invoice))
      };
    } catch (error) { return failure(error); }
  };
  const views = {};
  for (const row of attention) {
    if (row.stripe_environment !== "live" || !row.stripe_object_id) continue;
    const objectId = row.stripe_object_id;
    const view = {};
    try {
      if (objectId.startsWith("sub_")) {
        view.subscription = await subscriptionView(objectId);
      } else if (objectId.startsWith("in_")) {
        const invoice = await stripe.invoices.retrieve(objectId);
        const subscriptionId = idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
        view.invoice = { status: invoice.status, paid: invoice.paid ?? invoice.status === "paid", billingReason: invoice.billing_reason, created: iso(invoice.created), subscription: suffix(subscriptionId) };
        view.subscription = await subscriptionView(subscriptionId);
      } else if (objectId.startsWith("cs_")) {
        const session = await stripe.checkout.sessions.retrieve(objectId);
        view.checkout = { status: session.status, paymentStatus: session.payment_status, mode: session.mode, created: iso(session.created), subscription: suffix(idOf(session.subscription)) };
        view.subscription = await subscriptionView(idOf(session.subscription));
      } else if (objectId.startsWith("cus_")) {
        const customer = await stripe.customers.retrieve(objectId);
        view.customer = { deleted: Boolean(customer.deleted) };
      }
    } catch (error) { view.error = failure(error); }
    views[row.id] = view;
  }
  const account = {};
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
    account.webhookEndpoints = endpoints.data.map((endpoint) => ({
      host: (() => { try { return new URL(endpoint.url).host + new URL(endpoint.url).pathname; } catch { return "unparseable"; } })(),
      status: endpoint.status, apiVersion: endpoint.api_version, enabledEvents: endpoint.enabled_events?.length ?? 0, livemode: endpoint.livemode
    }));
  } catch (error) { account.webhookEndpoints = failure(error); }
  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 86_400;
    const failed = await stripe.events.list({ delivery_success: false, created: { gte: since }, limit: 100 });
    account.undeliveredEvents30d = { count: failed.data.length, hasMore: failed.has_more, events: failed.data.map((event) => ({ type: event.type, created: iso(event.created), pendingWebhooks: event.pending_webhooks })) };
  } catch (error) { account.undeliveredEvents30d = failure(error); }
  try {
    const since = Math.floor(Date.now() / 1000) - 30 * 86_400;
    const recent = await stripe.events.list({ created: { gte: since }, limit: 100 });
    const pending = recent.data.filter((event) => event.pending_webhooks > 0);
    account.recentEvents30d = { count: recent.data.length, hasMore: recent.has_more, withPendingDeliveries: pending.map((event) => ({ type: event.type, created: iso(event.created), pendingWebhooks: event.pending_webhooks })) };
  } catch (error) { account.recentEvents30d = failure(error); }
  return { available: true, objects: views, account };
}

function email(sql) {
  const signals = sql(`select metric_key, outcome, count(*)::int as rows, sum(quantity)::int as quantity, min(occurred_at) as first_at, max(occurred_at) as last_at
    from public.platform_analytics_events where source = 'email' or metric_key like 'email-%' group by 1, 2 order by 1, 2`);
  const failures = sql(`select metric_key, occurred_at, quantity from public.platform_analytics_events
    where metric_key in ('email-confirmation-failure','email-recovery-failure') order by occurred_at`);
  const daily = sql(`select occurred_at::date as day, metric_key, sum(quantity)::int as quantity from public.platform_analytics_events
    where metric_key like 'email-%' and occurred_at > now() - interval '60 days' group by 1, 2 order by 1, 2`);
  const auth = sql(`select count(*)::int as users,
      count(*) filter (where email_confirmed_at is not null)::int as confirmed,
      max(email_confirmed_at) as latest_email_confirmed_at,
      count(*) filter (where email_confirmed_at > now() - interval '7 days')::int as confirmed_7d,
      count(*) filter (where email_confirmed_at > now() - interval '30 days')::int as confirmed_30d,
      max(created_at) as latest_user_created_at,
      count(*) filter (where created_at > now() - interval '30 days')::int as created_30d,
      count(*) filter (where created_at > now() - interval '30 days' and email_confirmed_at is null)::int as unconfirmed_created_30d,
      max(confirmation_sent_at) as latest_confirmation_sent_at,
      count(*) filter (where confirmation_sent_at > now() - interval '30 days')::int as confirmation_sent_30d,
      max(recovery_sent_at) as latest_recovery_sent_at,
      count(*) filter (where recovery_sent_at > now() - interval '30 days')::int as recovery_sent_30d
    from auth.users`)[0];
  // Each recorded failure against the accounts whose confirmation was sent in
  // the ten minutes before it: did the address confirm afterwards anyway?
  const failureOutcomes = sql(`select f.metric_key, f.occurred_at,
      count(u.id)::int as accounts_sent_within_10m,
      count(u.id) filter (where u.email_confirmed_at > f.occurred_at)::int as confirmed_after_failure,
      min(extract(epoch from (f.occurred_at - u.confirmation_sent_at)))::int as seconds_since_confirmation_sent,
      min(extract(epoch from (u.email_confirmed_at - f.occurred_at)))::int as seconds_until_confirmed
    from public.platform_analytics_events f
    left join auth.users u on u.confirmation_sent_at between f.occurred_at - interval '10 minutes' and f.occurred_at
    where f.metric_key in ('email-confirmation-failure','email-recovery-failure')
    group by f.id, f.metric_key, f.occurred_at order by f.occurred_at`);
  const consumerConfirmations = sql(`select count(*)::int as accounts,
      count(*) filter (where email_confirmed_at is not null)::int as confirmed,
      max(email_confirmed_at) as latest_email_confirmed_at,
      count(*) filter (where email_confirmed_at > now() - interval '30 days')::int as confirmed_30d,
      count(*) filter (where email_confirmed_at > created_at + interval '10 seconds' and email_confirmed_at > now() - interval '30 days')::int as confirmed_after_delay_30d
    from public.consumer_accounts`)[0];
  let authAudit;
  try {
    authAudit = sql(`select payload->>'action' as action, count(*)::int as rows, max(created_at) as last_at
      from auth.audit_log_entries where created_at > now() - interval '60 days' group by 1 order by 1`);
  } catch (error) { authAudit = { unavailable: redact(error.message).slice(0, 200) }; }
  return { signals, failures, failureOutcomes, daily60d: daily, authUsers: auth, consumerConfirmations, authAuditActions60d: authAudit };
}

const MAJOR_MAILBOXES = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "live.com", "me.com", "msn.com", "ymail.com", "proton.me", "protonmail.com"];
const MAILBOX_CLASS = `case when split_part(lower(u.email), '@', 2) in (${MAJOR_MAILBOXES.map((domain) => `'${domain}'`).join(",")}) then split_part(lower(u.email), '@', 2)
  when split_part(lower(u.email), '@', 2) ~ '(\\.invalid|\\.test|\\.example|example\\.(com|org|net))$' then 'reserved-test-domain'
  when split_part(lower(u.email), '@', 2) ~ '(\\.k12\\.|\\.edu$)' then 'school-domain'
  else 'other-domain' end`;

function emailLinks(sql) {
  // auth.flow_state keeps one row per PKCE sign-up flow; auth_code_issued_at is set when Supabase verifies the
  // emailed link. auth.one_time_tokens keeps the confirmation token until it is used.
  const signups = sql(`select right(u.id::text, 6) as account, u.created_at, u.confirmation_sent_at, u.email_confirmed_at,
      ${MAILBOX_CLASS} as mailbox,
      exists(select 1 from auth.flow_state f where f.user_id = u.id and f.auth_code_issued_at is not null) as link_opened,
      exists(select 1 from auth.one_time_tokens o where o.user_id = u.id and o.token_type = 'confirmation_token') as confirmation_pending,
      (select count(*)::int from auth.flow_state f where f.user_id = u.id and f.authentication_method = 'email/signup') as signup_submissions
    from auth.users u where u.created_at > now() - interval '60 days' order by u.created_at`);
  const monthly = sql(`select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*)::int as signups,
      count(email_confirmed_at)::int as confirmed,
      percentile_cont(0.5) within group (order by extract(epoch from (email_confirmed_at - coalesce(confirmation_sent_at, created_at))))
        filter (where email_confirmed_at is not null) as median_seconds_to_confirm
    from auth.users group by 1 order by 1`);
  const byMailbox = sql(`select ${MAILBOX_CLASS} as mailbox, count(*)::int as signups, count(u.email_confirmed_at)::int as confirmed, max(u.email_confirmed_at) as last_confirmed_at
    from auth.users u group by 1 order by 2 desc`);
  return {
    signups, monthly, byMailbox,
    reading: "confirmation_sent_at = the SMTP provider accepted the message; link_opened = Supabase verified the emailed link. An unopened link does not prove non-delivery: only the provider's log shows delivered, bounced or suppressed."
  };
}

async function emailDomain() {
  const domain = (process.env.SYSTEM_HEALTH_SENDING_DOMAIN ?? "auth.mathnexa.com").trim().toLowerCase();
  check(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain), "SYSTEM_HEALTH_SENDING_DOMAIN is not a domain name");
  const organization = domain.split(".").slice(-2).join(".");
  const resolver = new Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  const txt = async (name) => { try { return (await resolver.resolveTxt(name)).map((parts) => parts.join("")); } catch { return []; } };
  const mx = async (name) => { try { return (await resolver.resolveMx(name)).map((record) => `${record.priority} ${record.exchange}`); } catch { return []; } };
  const dkim = await txt(`resend._domainkey.${domain}`);
  return {
    sendingDomain: domain,
    resendDkim: dkim.some((value) => /(^|;)\s*p=[A-Za-z0-9+/=]{100,}/.test(value)) ? "present" : "missing",
    bounceDomainSpf: (await txt(`send.${domain}`)).filter((value) => value.startsWith("v=spf1")),
    bounceDomainMx: await mx(`send.${domain}`),
    dmarc: (await txt(`_dmarc.${domain}`)).filter((value) => value.startsWith("v=DMARC1")),
    organizationDmarc: (await txt(`_dmarc.${organization}`)).filter((value) => value.startsWith("v=DMARC1")),
    organizationMx: await mx(organization),
    reading: "Resend needs the DKIM record and the send.<domain> SPF/MX records to send; DMARC is optional for low volume but lets receivers report alignment (rua) and is required of bulk senders."
  };
}

async function providerAccess(sql) {
  const get = async (url, headers) => {
    const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { status: response.status, body };
  };
  const result = {};
  const managementToken = optional("SUPABASE_ACCESS_TOKEN", /^sbp_[A-Za-z0-9]{20,}$/);
  if (!managementToken) {
    result.supabaseManagement = { readable: false, reason: "no Supabase management token in the vault" };
  } else {
    const projects = await get("https://api.supabase.com/v1/projects", { Authorization: `Bearer ${managementToken}` });
    result.supabaseManagement = { readable: projects.status === 200, status: projects.status };
    if (projects.status === 200) {
      const config = await get(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { Authorization: `Bearer ${managementToken}` });
      const keep = ["site_url", "mailer_autoconfirm", "mailer_otp_exp", "smtp_host", "smtp_port", "smtp_sender_name", "smtp_max_frequency",
        "rate_limit_email_sent", "external_email_enabled", "hook_send_email_enabled", "mailer_subjects_confirmation", "disable_signup"];
      result.authSettings = { status: config.status };
      if (config.status === 200 && config.body) {
        for (const key of keep) result.authSettings[key] = config.body[key] ?? null;
        result.authSettings.sender_domain = typeof config.body.smtp_admin_email === "string" ? config.body.smtp_admin_email.split("@")[1] ?? null : null;
        result.authSettings.redirect_allow_list_entries = typeof config.body.uri_allow_list === "string" ? config.body.uri_allow_list.split(",").filter(Boolean).length : null;
      }
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86_400_000);
      const query = "select timestamp, event_message from auth_logs where regexp_contains(lower(event_message), 'mail|smtp|confirm|recover|rate limit|429') order by timestamp desc limit 200";
      const logs = await get(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all?sql=${encodeURIComponent(query)}&iso_timestamp_start=${start.toISOString()}&iso_timestamp_end=${end.toISOString()}`,
        { Authorization: `Bearer ${managementToken}` });
      const rows = Array.isArray(logs.body?.result) ? logs.body.result : [];
      result.authLogs7d = { status: logs.status, lines: rows.map((row) => {
        let parsed = null;
        try { parsed = JSON.parse(row.event_message); } catch { parsed = null; }
        const at = typeof row.timestamp === "number" ? new Date(row.timestamp / 1000).toISOString() : row.timestamp;
        return parsed ? { at, msg: parsed.msg ?? null, error: parsed.error ?? null, path: parsed.path ?? null, status: parsed.status ?? null }
          : { at, text: redact(String(row.event_message)).slice(0, 200) };
      }) };
    }
  }
  const resendKey = optional("RESEND_PRODUCTION_RUNTIME_API_KEY", /^re_[A-Za-z0-9_]{8,}$/);
  if (!resendKey) {
    result.resend = { readable: false, reason: "no production Resend key in the vault" };
  } else {
    const domains = await get("https://api.resend.com/domains", { Authorization: `Bearer ${resendKey}` });
    result.resend = { readable: domains.status === 200, status: domains.status, reason: domains.body?.name ?? null };
    if (domains.status === 200 && Array.isArray(domains.body?.data)) {
      result.resend.domains = domains.body.data.map((item) => ({ name: item.name, status: item.status, region: item.region }));
      // The emails sent to sign-ups that never confirmed, matched in memory; the address never leaves this process.
      const pending = sql(`select u.id::text as id, lower(u.email) as email from auth.users u
        where u.created_at > now() - interval '60 days' and u.email_confirmed_at is null`);
      for (const row of pending) secrets.push(row.email, row.id);
      const byAddress = new Map(pending.map((row) => [row.email, `..${row.id.slice(-6)}`]));
      const matched = [];
      let after = null;
      for (let page = 0; page < 20; page += 1) {
        const list = await get(`https://api.resend.com/emails?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, { Authorization: `Bearer ${resendKey}` });
        if (list.status !== 200 || !Array.isArray(list.body?.data) || list.body.data.length === 0) break;
        for (const item of list.body.data) {
          const recipients = (Array.isArray(item.to) ? item.to : [item.to]).filter(Boolean).map((address) => String(address).toLowerCase().replace(/^.*</, "").replace(/>.*$/, "").trim());
          for (const address of recipients) if (byAddress.has(address)) matched.push({ account: byAddress.get(address), at: item.created_at, lastEvent: item.last_event ?? null });
        }
        if (!list.body.has_more) break;
        after = list.body.data[list.body.data.length - 1].id;
        await new Promise((done) => setTimeout(done, 600));
      }
      result.resend.unconfirmedSignupEmails = matched;
    }
  }
  result.ownerActionIfUnreadable = [
    "Supabase: create a personal access token (Account > Access Tokens) and store it as SUPABASE_ACCESS_TOKEN with scripts/update-phase7d-vault.ps1, or read Logs > Auth in the dashboard.",
    "Resend: the runtime keys are sending-only by design; read Emails in the Resend dashboard (no read-only API scope exists; a full-access key would also grant writes)."
  ];
  return result;
}

function pdfQuarantine(sql) {
  const rows = sql(`select right(f.id::text, 6) as file, f.file_role, f.original_filename, f.normalized_filename, f.mime_type, f.byte_size,
      left(f.sha256, 12) as sha256_prefix, f.created_at, f.quarantined_at, f.resource_version_number,
      f.validation_report->>'validator' as validator, f.validation_report->'findings' as findings, f.validation_report->>'acroform' as acroform,
      right(f.resource_id::text, 6) as resource, r.resource_type, r.publication_state as resource_state, r.current_version_number, r.published_version_number,
      to_jsonb(r)->>'title' as resource_title,
      right(f.created_by::text, 6) as uploaded_by,
      (select count(*) from public.resource_files a where a.resource_id = f.resource_id and a.file_role = f.file_role and a.validation_state = 'accepted')::int as accepted_same_role,
      (select count(*) from public.resource_files a where a.resource_id = f.resource_id and a.resource_version_number = f.resource_version_number and a.file_role = f.file_role and a.validation_state = 'accepted')::int as accepted_same_role_same_version,
      (select count(*) from public.resource_files d where d.sha256 = f.sha256)::int as files_with_same_hash,
      (select count(*) from public.resource_files d where d.sha256 = f.sha256 and d.validation_state = 'accepted')::int as accepted_with_same_hash,
      (select count(*) from public.resource_download_events x where x.resource_file_id = f.id)::int as downloads_of_this_file,
      exists(select 1 from storage.objects o where o.bucket_id = f.bucket_id and o.name = f.object_path) as object_present
    from public.resource_files f join public.content_resources r on r.id = f.resource_id
    where f.validation_state = 'quarantined' order by f.created_at`);
  const objects = sql(`select bucket_id, count(*)::int as objects from storage.objects
    where bucket_id in ('resource-files','resource-quarantine','game-packages','game-package-quarantine') group by 1 order by 1`);
  const states = sql(`select validation_state, file_role, count(*)::int as rows from public.resource_files group by 1, 2 order by 1, 2`);
  return { rows, objects, states };
}

function packages(sql) {
  return {
    states: sql(`select publication_state, count(*)::int as rows from public.game_packages group by 1 order by 1`),
    assets: sql(`select count(*)::int as rows from public.game_package_assets`)[0],
    quarantineEvents: sql(`select normalized_filename, left(archive_sha256, 12) as sha256_prefix, compressed_size, created_at,
        (select jsonb_agg(f->>'code') from jsonb_array_elements(q.findings) f) as finding_codes
      from public.game_package_quarantine_events q order by created_at`),
    catalog: sql(`select stable_key, status, launch_type, package_id is not null as package_backed from public.game_catalog_entries order by stable_key`)
  };
}

function operations(sql) {
  return {
    migrations: sql(`select count(*)::int as applied, max(version) as latest from supabase_migrations.schema_migrations`)[0],
    reconciliation: sql(`select (select max(last_reconciliation_attempt_at) from public.billing_customers) as last_reconciliation_attempt_at,
        (select jsonb_agg(jsonb_build_object('source', source, 'rows', rows, 'lastSynchronizedAt', last_at)) from (
          select coalesce(last_synchronization_source, '') as source, count(*)::int as rows, max(last_synchronized_at) as last_at
          from public.billing_subscriptions group by 1) s) as synchronization`)[0],
    subscriptions: sql(`select stripe_environment, subscription_status, count(*)::int as rows from public.billing_subscriptions group by 1, 2 order by 1, 2`),
    runtimeErrorSignals: sql(`select metric_key, outcome, count(*)::int as rows, sum(quantity)::int as quantity, max(occurred_at) as last_at
      from public.platform_analytics_events where metric_key in ('vercel-error','supabase-error') group by 1, 2`),
    featureFlags: sql(`select flag_key, enabled, updated_at from public.platform_feature_flags order by flag_key`),
    adminActivity14d: sql(`select action, count(*)::int as rows, max(created_at) as last_at from public.admin_audit_log
      where created_at > now() - interval '14 days' group by 1 order by 1`),
    retention: sql(`select job_key, completed_at, deleted_event_count from public.platform_retention_runs order by completed_at desc limit 3`)
  };
}

async function main() {
  const sql = connect();
  await identify(sql);
  section("panelInputs", () => panelInputs(sql));
  section("webhooks", () => webhooks(sql));
  if (Array.isArray(evidence.webhooks?.attention)) {
    for (const row of evidence.webhooks.attention) {
      secrets.push(row.id);
      if (row.stripe_object_id) secrets.push(row.stripe_object_id);
      const local = row.local_subscription;
      if (local?.ownerId) {
        try { row.ownerEntitlement = entitlementFor(sql, local.ownerId); } catch (error) { row.ownerEntitlement = { unavailable: redact(error.message).slice(0, 200) }; }
        secrets.push(local.ownerId);
      }
      if (local?.stripeSubscriptionId) secrets.push(local.stripeSubscriptionId);
    }
    evidence.stripe = await stripeViews(evidence.webhooks.attention);
    for (const row of evidence.webhooks.attention) {
      const view = evidence.stripe.objects?.[row.id];
      row.object = suffix(row.stripe_object_id);
      row.objectKind = row.stripe_object_id?.split("_")[0] ?? null;
      row.record = suffix(row.id);
      if (row.local_subscription) {
        row.local_subscription.subscription = suffix(row.local_subscription.stripeSubscriptionId);
        delete row.local_subscription.stripeSubscriptionId;
        delete row.local_subscription.ownerId;
      }
      if (view) row.stripe = view;
      delete row.stripe_object_id;
      delete row.id;
    }
    delete evidence.stripe.objects;
  }
  section("email", () => email(sql));
  section("emailLinks", () => emailLinks(sql));
  try { evidence.emailDomain = await emailDomain(); } catch (error) { evidence.emailDomain = { unavailable: redact(error instanceof Error ? error.message : String(error)).slice(0, 300) }; }
  try { evidence.providerAccess = await providerAccess(sql); } catch (error) { evidence.providerAccess = { unavailable: redact(error instanceof Error ? error.message : String(error)).slice(0, 300) }; }
  section("pdfQuarantine", () => pdfQuarantine(sql));
  section("packages", () => packages(sql));
  section("operations", () => operations(sql));
}

try {
  await main();
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
process.stdout.write(`${redact(JSON.stringify(evidence, null, 2))}\n`);
