param(
  [ValidateSet('audit', 'migrate', 'verify', 'smoke', 'review')] [string]$Stage = 'audit',
  [string]$Origin = 'https://mathnexa.com',
  [string]$ExpectBuild = '',
  [string]$Engines = 'chromium,webkit',
  [string]$EvidenceDir = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# PRODUCTION launcher for the owner-approved Math Tug of War V1 release
# (owner approval 2026-09-27). Loads exactly the production project ref, the
# production database password (audit/migrate/verify only) and the production
# service key from the process-only credential vault — never a staging entry,
# never a Stripe key — runs one stage, and clears every variable afterwards.
# No value is printed.
#
#   -Stage audit    READ ONLY production identity + migration plan + baseline
#   -Stage migrate  apply ONLY 20260927100000 then 20260928100000 (refuses otherwise)
#   -Stage verify   tables, RLS, grants, functions, ±7 bound, winner rule, catalog
#   -Stage smoke    service-role room lifecycle with synthetic hashes (cleaned up)
#   -Stage review   real-browser review of -Origin (default the apex) with
#                   synthetic consumer accounts that are deleted afterwards
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
if ($Stage -in @('audit', 'migrate', 'verify')) { $names += 'SUPABASE_PRODUCTION_DB_PASSWORD' }
$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($names -contains $entry.Name) {
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
  if ($Stage -eq 'review') {
    $env:REVIEW_TARGET = 'production'
    $env:REVIEW_ORIGIN = $Origin
    $env:REVIEW_ENGINES = $Engines
    $env:REVIEW_OUT = 'owner-review/math-tug-of-war-v1/production'
    $env:REVIEW_ALLOW_SYNTHETIC_ACCOUNTS_ON_PRODUCTION = 'yes'
    if ($ExpectBuild) { $env:EXPECT_COMMIT = $ExpectBuild }
    & node scripts/review-math-tug-of-war-staging.mjs
    exit $LASTEXITCODE
  }
  & node scripts/run-math-tug-of-war-production.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in @('SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_SECRET_KEY', 'SUPABASE_PRODUCTION_DB_PASSWORD', 'RELEASE_EVIDENCE_DIR', 'REVIEW_TARGET', 'REVIEW_ORIGIN', 'REVIEW_ENGINES', 'REVIEW_OUT', 'REVIEW_ALLOW_SYNTHETIC_ACCOUNTS_ON_PRODUCTION', 'EXPECT_COMMIT')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
