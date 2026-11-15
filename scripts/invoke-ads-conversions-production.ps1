param(
  [ValidateSet('audit', 'migrate', 'verify')] [string]$Stage = 'audit',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# PRODUCTION launcher for the owner-approved Google Ads conversion measurement
# release. Loads exactly the production project ref, the production database
# password and the production service key: never a staging entry, never a
# Stripe key. Runs one stage and clears every variable afterwards. No value is
# printed. Mirrors invoke-math-race-champions-production.ps1.
#
#   -Stage audit    READ ONLY production identity + migration plan + baseline
#   -Stage migrate  apply ONLY the ads-conversion migration, then verify it
#   -Stage verify   READ ONLY tables, RLS, grants, triggers, functions, counts
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-ads-conversions-production.ps1 -Stage audit
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
$names = @('SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_SECRET_KEY', 'SUPABASE_PRODUCTION_DB_PASSWORD')
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
  Set-Location $repositoryRoot
  & node --no-warnings scripts/run-ads-conversions-production.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
