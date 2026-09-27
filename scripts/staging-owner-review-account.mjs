/**
 * STAGING-ONLY owner-review account helper for Math Tug of War review.
 * Launched by scripts/invoke-math-tug-of-war-staging.ps1 -Stage owner-account
 * (loads only the staging Supabase secret key). Never reads or sets a
 * password; access is through the normal Forgot Password flow.
 *
 *   OWNER_EMAIL=<email> [OWNER_ACCOUNT_APPLY=entitle] node scripts/staging-owner-review-account.mjs
 *
 * Default is read-only: reports whether the email exists on staging and its
 * account/entitlement state. With OWNER_ACCOUNT_APPLY=entitle it gives that
 * existing account an active staging subscription entitlement (90 days).
 */
import { createClient } from "@supabase/supabase-js";

const STAGING = "https://gcmuhzxkwvfireyrearl.supabase.co";
const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("OWNER_EMAIL required");
const admin = createClient(STAGING, process.env.SUPABASE_SECRET_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser() {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`list-users-failed:${error.message}`);
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUser();
if (!user && process.env.OWNER_ACCOUNT_APPLY === "create") {
  // Unusable random password: generated in memory, never printed or stored,
  // and discarded. The owner sets their own password through Forgot Password.
  const { randomBytes } = await import("node:crypto");
  const made = await admin.auth.admin.createUser({
    email,
    password: `${randomBytes(32).toString("base64url")}Aa1!`,
    email_confirm: true,
    user_metadata: { purpose: "math-tug-of-war-owner-review", environment: "staging" }
  });
  if (made.error || !made.data.user) throw new Error(`create-failed:${made.error?.message}`);
  user = made.data.user;
  process.env.OWNER_ACCOUNT_APPLY = "entitle";
}
const report = { email, exists: Boolean(user) };
if (user) {
  report.emailConfirmed = Boolean(user.email_confirmed_at);
  report.signInMethods = (user.identities ?? []).map((identity) => identity.provider);
  report.createdAt = user.created_at;
  const account = await admin.from("consumer_accounts").select("account_status, email_confirmed_at, trial_redeemed_at").eq("user_id", user.id).maybeSingle();
  report.consumerAccount = account.data ?? null;
  const entitlements = await admin.from("consumer_game_entitlements").select("entitlement_state, current_period_ends_at, trial_ends_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  report.entitlements = entitlements.data ?? [];
  if (process.env.OWNER_ACCOUNT_APPLY === "entitle") {
    const ends = new Date(Date.now() + 90 * 86_400_000).toISOString();
    const insert = await admin.from("consumer_game_entitlements").insert({ user_id: user.id, entitlement_state: "subscription-active", current_period_ends_at: ends });
    if (insert.error) throw new Error(`entitle-failed:${insert.error.message}`);
    report.entitled = { entitlement_state: "subscription-active", current_period_ends_at: ends };
  }
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
