param(
  [ValidateSet('audit', 'migrate', 'verify', 'smoke', 'wallets', 'qa', 'publish', 'archive')] [string]$Stage = 'audit',
  [string]$ExpectBuild = '',
  [string]$Out = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# PRODUCTION launcher for the owner-authorised Math Race Champions release.
# Loads exactly the production project ref, the production database password
# (audit/migrate/verify/wallets/publish/archive only), the production service
# key and, if the vault holds it, the production publishable key: never a
# staging entry, never a Stripe key. Runs one stage and clears every variable
# afterwards. No value is printed. Mirrors invoke-polygon-showdown-production.ps1.
#
#   -Stage audit    READ ONLY production identity + migration plan + baseline
#   -Stage migrate  apply ONLY the next pending Math Race migration; run once per migration
#   -Stage verify   tables, RLS, grants, functions, cars, catalog row, /join guard
#   -Stage smoke    service-role room contract with synthetic hashes (no account; cleaned up)
#   -Stage wallets  READ ONLY every wallet against its ledger, no identities
#   -Stage qa       guest gameplay QA on https://mathnexa.com (no account; synthetic room; cleaned up)
#   -Stage publish  owner-instructed: set the approved description, draft -> published
#   -Stage archive  game-only rollback: -> archived
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-race-champions-production.ps1 -Stage audit
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
if ($Stage -in @('audit', 'migrate', 'verify', 'wallets', 'publish', 'archive')) { $names += 'SUPABASE_PRODUCTION_DB_PASSWORD' }
$optional = @()
if ($Stage -in @('smoke', 'qa')) { $optional += 'SUPABASE_PRODUCTION_PUBLISHABLE_KEY' }
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
  Set-Location $repositoryRoot
  if ($Stage -eq 'qa') {
    $env:EXPECT_BUILD = $ExpectBuild
    $env:QA_OUT = $Out
    & node --no-warnings scripts/qa-math-race-champions-production.mjs
    exit $LASTEXITCODE
  }
  & node --no-warnings scripts/run-math-race-champions-production.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in ($names + $optional + @('SUPABASE_PRODUCTION_DB_PASSWORD', 'EXPECT_BUILD', 'QA_OUT'))) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
