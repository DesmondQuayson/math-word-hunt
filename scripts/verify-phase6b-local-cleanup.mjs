import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const tables = [
  "teacher_profiles", "teacher_classes", "teacher_activities", "product_entitlements",
  "account_deletion_requests", "billing_customers", "billing_subscriptions", "billing_webhook_events"
];
const counts = {};
for (const table of tables) {
  const result = await admin.from(table).select("*", { count: "exact", head: true });
  if (result.error) throw new Error("Could not verify cleanup for " + table + ".");
  counts[table] = result.count ?? -1;
}
const auth = await admin.auth.admin.listUsers();
if (auth.error) throw new Error("Could not verify Auth-user cleanup.");
counts.auth_users = auth.data.users.length;
const nonzero = Object.entries(counts).filter(([, count]) => count !== 0);
if (nonzero.length > 0) throw new Error("Phase 6B local cleanup is incomplete: " + nonzero.map(([name, count]) => name + "=" + count).join(", "));
console.log("Phase 6B local cleanup verified: " + Object.keys(counts).join(", ") + " all equal zero.");
