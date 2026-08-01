import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { PHASE7D_PROTECTED_HASHES } from "./phase7d-hosted-contract.mjs";

const files = [
  "scripts/phase7d-hosted-contract.mjs",
  "scripts/phase7d-hosted-lifecycle.mjs",
  "scripts/run-phase7d-hosted-staging.mjs",
  "scripts/invoke-phase7d-credential-prompt.ps1",
  "scripts/invoke-phase7d-hosted-staging.ps1",
  "scripts/update-phase7d-vault.ps1"
];
const sources = files.map((path) => readFileSync(path, "utf8")).join("\n");
for (const prohibited of [
  "sk_live_", "pk_live_", "STRIPE_LIVE", "--prod", "mathnexa-production",
  "student_email", "school_name", "organization_id=", "learning_progress"
]) {
  if (sources.includes(prohibited)) throw new Error(`Phase 7D source contains prohibited marker: ${prohibited}`);
}
for (const required of [
  "Read-Host -Prompt $Prompt -AsSecureString",
  "ConvertFrom-SecureString",
  "ZeroFreeBSTR",
  "RandomNumberGenerator]::Create()",
  "$random.GetBytes($bytes)",
  "Test-DpapiValue",
  "Move-Item -LiteralPath $pendingPath -Destination $VaultPath",
  "SUPABASE_ACCESS_TOKEN",
  "STRIPE_WEBHOOK_SECRET",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "x-vercel-protection-bypass",
  "mailer_autoconfirm: false",
  "external_anonymous_users_enabled: false",
  "mode: \"test\"",
  "cleanupHosted",
  "set_platform_identity_model"
]) {
  if (!sources.includes(required)) throw new Error(`Phase 7D safeguard is missing: ${required}`);
}
if (/Write-(?:Host|Output)\s+\$(?:supabase|resend|publishable|stripe|plain|secret)/i.test(sources)) {
  throw new Error("Phase 7D credential prompt may print a credential value.");
}
if (/Set-Content[^\r\n]+\$(?:plain|databasePasswordPlain)/i.test(sources)) {
  throw new Error("Phase 7D credential prompt may persist plaintext.");
}
if (/RandomNumberGenerator\]::Fill\(/.test(sources)) {
  throw new Error("Phase 7D credential prompt uses an API unavailable in Windows PowerShell 5.1.");
}
if (/ConvertFrom-Json\s+-AsHashtable/.test(sources)) {
  throw new Error("Phase 7D vault scripts use a JSON option unavailable in Windows PowerShell 5.1.");
}
for (const [path, expected] of Object.entries(PHASE7D_PROTECTED_HASHES)) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
  if (actual !== expected) throw new Error(`${path} changed: ${actual}`);
}
console.log("Phase 7D security audit passed: DPAPI vaulting, test-only billing, protected staging, strict Auth, cleanup, and protected hashes are enforced.");
