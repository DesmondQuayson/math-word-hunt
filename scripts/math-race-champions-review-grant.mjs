/**
 * LOCAL owner review only: gives the synthetic review account enough Race
 * Dollars to inspect every car in the garage, and opens all ten stages for it.
 *
 *   node scripts/math-race-champions-review-grant.mjs [--balance 12000] [--stages 10]
 *
 * This writes the wallet row directly, which is how a balance can appear
 * without racing, and it is possible only with the local database's own key.
 * It refuses any Supabase that is not on 127.0.0.1, so it can never create
 * Race Dollars on staging or Production. Nothing in the application can do
 * this: there, Race Dollars come only from stage wins and achievements.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const balance = Number(option("balance", "12000"));
const stages = Number(option("stages", "10"));
const email = option("email", "race-owner@example.test");
if (!Number.isInteger(balance) || balance < 0 || balance > 12000) throw new Error("Balance must be 0 to 12000 (everything that can ever be earned).");
if (!Number.isInteger(stages) || stages < 0 || stages > 10) throw new Error("Stages must be 0 to 10.");
if (!email.endsWith("@example.test")) throw new Error("Only a synthetic @example.test review account can be granted.");

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL ?? "")) throw new Error("Refusing: this is not local Supabase.");

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;
const user = listed.data.users.find((entry) => entry.email === email);
if (!user) throw new Error(`No ${email}. Start the review server once first: node scripts/run-math-race-champions.mjs demo`);

const wallet = await admin.from("race_wallets").upsert({ user_id: user.id, balance });
if (wallet.error) throw wallet.error;
if (stages > 0) {
  const now = new Date().toISOString();
  const rows = Array.from({ length: stages - 1 }, (_, index) => ({ user_id: user.id, stage: index + 1, plays: 1, wins: 1, first_won_at: now }));
  if (rows.length) {
    const progress = await admin.from("race_stage_progress").upsert(rows, { onConflict: "user_id,stage", ignoreDuplicates: true });
    if (progress.error) throw progress.error;
  }
}
console.log(`${email}: ${balance.toLocaleString("en-US")} Race Dollars in the LOCAL review wallet${stages > 0 ? `; Stages 1 to ${stages} open` : ""}.`);
