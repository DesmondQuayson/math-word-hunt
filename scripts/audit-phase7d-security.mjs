import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { PHASE7D_PROTECTED_HASHES } from "./phase7d-hosted-contract.mjs";

const vaultFiles = [
  "scripts/invoke-phase7d-credential-prompt.ps1",
  "scripts/ensure-phase7d-staging-access-token.ps1",
  "scripts/invoke-phase7d-hosted-staging.ps1",
  "scripts/refresh-phase7d-resend-provisioning-key.ps1",
  "scripts/refresh-phase7d-required-credentials.ps1",
  "scripts/remove-phase7d-vault-secret.ps1",
  "scripts/update-phase7d-vault.ps1"
];
const files = [
  "apps/platform-web/proxy.ts",
  "apps/platform-web/lib/staging-access/server.ts",
  "apps/platform-web/app/api/internal/staging-access/bootstrap/route.ts",
  "apps/platform-web/app/api/billing/webhook/route.ts",
  "scripts/phase7d-hosted-contract.mjs",
  "scripts/phase7d-hosted-lifecycle.mjs",
  "scripts/run-phase7d-hosted-staging.mjs",
  ...vaultFiles
];
const sources = files.map((path) => readFileSync(path, "utf8")).join("\n");
const vaultSources = vaultFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const runnerSource = readFileSync("scripts/run-phase7d-hosted-staging.mjs", "utf8");
const refreshSource = readFileSync("scripts/refresh-phase7d-required-credentials.ps1", "utf8");
const resendRefreshSource = readFileSync("scripts/refresh-phase7d-resend-provisioning-key.ps1", "utf8");
for (const prohibited of [
  "sk_live_", "pk_live_", "STRIPE_LIVE", "mathnexa-production",
  "student_email", "school_name", "organization_id=", "learning_progress"
]) {
  if (sources.includes(prohibited)) throw new Error(`Phase 7D source contains prohibited marker: ${prohibited}`);
}
for (const required of [
  "Read-Host -Prompt $Prompt -AsSecureString",
  "Export-Clixml -LiteralPath",
  "Import-Clixml -LiteralPath",
  ".mathnexa-secrets\\phase7d-credentials.clixml",
  "ZeroFreeBSTR",
  "RandomNumberGenerator]::Create()",
  "$random.GetBytes($bytes)",
  "Assert-ImportedSecret",
  "Set-CurrentUserOnlyAcl",
  "Move-Item -LiteralPath $pendingPath -Destination $VaultPath",
  "SUPABASE_ACCESS_TOKEN",
  "STRIPE_WEBHOOK_SECRET",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "MVH_STAGING_ACCESS_TOKEN",
  "__Host-mvh-staging-access",
  "timingSafeEqual",
  "Authorization: `Bearer ${token}`",
  "stagingAccessNotFoundResponse",
  "RESEND_RUNTIME_API_KEY",
  "PHASE7D_VAULT_REMOVE_SCRIPT",
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
if (!sources.includes('"--prod"') || runnerSource.includes('"--target"') ||
  /vercel\(\["alias",\s*"set"/.test(runnerSource) ||
  /"project",\s*"protection",\s*"enable"/.test(runnerSource)) {
  throw new Error("Phase 7D must use one explicit isolated Production deployment without target, alias, or protection experiments.");
}
if (/MVH_STAGING_ACCESS_TOKEN[^\r\n]*(?:URL|url|query|searchParams)/.test(sources) ||
  /x-mvh-staging-access-token/i.test(sources)) {
  throw new Error("Phase 7D staging access token may not be placed in a URL, query string, or custom transport header.");
}
if (/Convert(?:To|From)-Json|ConvertFrom-SecureString|\.json\b/i.test(vaultSources)) {
  throw new Error("Phase 7D vault scripts must use only native SecureString CLIXML serialization.");
}
if (runnerSource.indexOf("await validateProviderAuthentication();") < 0 ||
  runnerSource.indexOf("await validateProviderAuthentication();") > runnerSource.indexOf("const supabase = await provisionSupabase(state);")) {
  throw new Error("Phase 7D provider authentication must pass before resource mutation.");
}
for (const requiredResendControl of [
  '"user-agent": "MathNexa-Phase7D/1.0"',
  'permission: "sending_access"',
  "domain_id: domain.id",
  'await revokeResendProvisioningKey(state);'
]) {
  if (!runnerSource.includes(requiredResendControl)) throw new Error("Phase 7D Resend least-privilege control is missing.");
}
for (const requiredPrompt of ["Read-RequiredSecret 'Resend API key'", "Read-RequiredSecret 'Stripe Sandbox secret key'"]) {
  if (!refreshSource.includes(requiredPrompt)) throw new Error("Phase 7D rotation prompt is incomplete.");
}
for (const prohibitedPrompt of ["Read-RequiredSecret 'Supabase", "Read-RequiredSecret 'Stripe Sandbox publishable key'"]) {
  if (refreshSource.includes(prohibitedPrompt)) throw new Error("Phase 7D rotation prompt requests an already-valid credential.");
}
if (!resendRefreshSource.includes("Read-RequiredSecret 'Temporary Resend Full-access API key'") ||
  (resendRefreshSource.match(/Read-RequiredSecret '/g) ?? []).length !== 1) {
  throw new Error("Phase 7D Resend prompt must request exactly one Full-access key.");
}
for (const [path, expected] of Object.entries(PHASE7D_PROTECTED_HASHES)) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
  if (actual !== expected) throw new Error(`${path} changed: ${actual}`);
}
console.log("Phase 7D security audit passed: native SecureString CLIXML vaulting, test-only billing, protected staging, strict Auth, cleanup, and protected hashes are enforced.");
