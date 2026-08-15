import { createClient } from "@supabase/supabase-js";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const name = process.argv[index];
  if (!name.startsWith("--")) throw new Error("Unexpected emergency revocation argument.");
  if (name === "--execute") { args.set(name, "true"); continue; }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
  args.set(name, value);
  index += 1;
}

const userId = args.get("--user-id") ?? "";
const reason = args.get("--reason") ?? "";
const execute = args.get("--execute") === "true";
const url = process.env.SUPABASE_URL?.trim() ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
const local = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(url);
const hostedRef = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(url)?.[1] ?? null;
const confirmedHostedRef = args.get("--confirm-hosted-ref") ?? "";

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
  throw new Error("--user-id must be an Auth user UUID.");
}
if (reason.trim().length < 3 || reason.trim().length > 160) throw new Error("--reason must contain 3 to 160 characters.");
if ((!local && !hostedRef) || secretKey.length < 20) throw new Error("Server-only Supabase configuration is unavailable.");
if (!local && (confirmedHostedRef !== hostedRef || process.env.MVH_ADMIN_REVOCATION_APPROVAL !== "owner-approved")) {
  throw new Error("Hosted revocation requires the exact project ref and MVH_ADMIN_REVOCATION_APPROVAL=owner-approved.");
}

if (!execute) {
  console.log(`DRY RUN: admin access would be revoked in the ${local ? "local" : "explicitly confirmed hosted"} environment.`);
  console.log("Re-run with --execute after independently confirming the target user UUID and environment.");
  process.exit(0);
}

const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
const result = await client.rpc("revoke_admin_access", {
  p_user_id: userId,
  p_reason: reason.trim(),
  p_ip: null,
  p_user_agent: "phase8a-emergency-revocation-cli"
});
if (result.error || typeof result.data !== "number") throw new Error("Emergency admin revocation failed closed.");
console.log(`Admin access revoked; ${result.data} active admin session(s) invalidated.`);
