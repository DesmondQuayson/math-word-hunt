param(
  [ValidateSet('audit', 'migrate', 'verify', 'smoke', 'publish', 'archive')] [string]$Stage = 'audit',
  [string]$EvidenceDir = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# PRODUCTION launcher for the owner-approved Math Bingo Live release (owner:
# "Release as is", 2026-11-05). Loads exactly the production project ref, the
# production database password (audit/migrate/verify only), the production
# service key and, if the vault holds it, the production publishable key —
# never a staging entry, never a Stripe key — runs one stage, and clears every
# variable afterwards. No value is printed. Mirrors
# invoke-math-tug-of-war-production.ps1.
#
#   -Stage audit    READ ONLY production identity + migration plan + baseline
#   -Stage migrate  apply the ONE pending Bingo migration in order (20261103100000, then 20261106100000); refuses otherwise
#   -Stage verify   tables, RLS, grants, functions, catalog row, other games
#   -Stage smoke    service-role room contract with synthetic hashes (no account; cleaned up)
#   -Stage publish  owner-instructed: draft -> published via the Super Admin publish function
#   -Stage archive  owner-instructed: -> archived the same way (game-only rollback)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-bingo-live-production.ps1 -Stage audit
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$stagingProjectRef = 'gcmuhzxkwvfireyrearl'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$names = @('SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_SECRET_KEY')
if ($Stage -in @('audit', 'migrate', 'verify', 'publish', 'archive')) { $names += 'SUPABASE_PRODUCTION_DB_PASSWORD' }
$optional = @()
if ($Stage -eq 'smoke') { $optional += 'SUPABASE_PRODUCTION_PUBLISHABLE_KEY' }
$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if (($names + $optional) -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  foreach ($name in $names) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "The production entry $name is not in the vault." }
  }
  $projectRef = $env:SUPABASE_PRODUCTION_PROJECT_REF.Trim().ToLowerInvariant()
  if ($projectRef -notmatch '^[a-z]{20}$') { throw 'Refusing: the vault production project ref is malformed.' }
  if ($projectRef -eq $stagingProjectRef) { throw 'Refusing: the vault production project ref is the staging project.' }
  if ($EvidenceDir) { $env:RELEASE_EVIDENCE_DIR = $EvidenceDir }
  Set-Location $repositoryRoot
  & node scripts/run-math-bingo-live-production.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in ($names + $optional + @('SUPABASE_PRODUCTION_DB_PASSWORD', 'RELEASE_EVIDENCE_DIR'))) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
