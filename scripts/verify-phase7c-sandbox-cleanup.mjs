import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL?.trim() ?? "";
const secret = process.env.SUPABASE_TEST_SECRET_KEY?.trim() ?? "";
if (!url || !secret) process.exit(1);

const client = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const tables = [
  "consumer_accounts",
  "consumer_game_entitlements",
  "consumer_account_deletion_requests",
  "billing_customers",
  "billing_subscriptions",
  "billing_webhook_events",
  "teacher_profiles",
  "teacher_classes",
  "teacher_activities"
];

for (const table of tables) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error || count !== 0) process.exit(1);
}
