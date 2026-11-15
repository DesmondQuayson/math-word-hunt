param(
  [ValidateSet('identify', 'migrate', 'verify', 'privileges', 'smoke')] [string]$Stage = 'identify',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for Google Ads conversion measurement. Loads only the
# staging entries of the established process-only credential vault (never the
# *_LIVE_*, *_PRODUCTION_* or *_READONLY_* entries), runs one stage against the
# isolated staging project, and clears every variable afterwards. Mirrors
# invoke-math-race-champions-staging.ps1.
#
#   -Stage identify    read-only: pooler database == staging, pending migrations
#   -Stage migrate     dry run, then apply the ONE ads-conversion migration and verify it
#   -Stage verify      read-only: tables, RLS, grants, triggers, functions
#   -Stage privileges  read-only: who holds what on this feature's tables
#   -Stage smoke       every ledger rule through the service-role functions (one synthetic account, deleted)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-ads-conversions-staging.ps1 -Stage identify
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
$stagingNames = switch ($Stage) {
  'smoke' { @('SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY') }
  default { @('SUPABASE_DB_PASSWORD') }
}
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($stagingNames -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  foreach ($name in $stagingNames) {
    if ($name -eq 'SUPABASE_PUBLISHABLE_KEY') { continue }
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "The staging entry $name is not in the vault." }
  }
  Set-Location $repositoryRoot
  & node --no-warnings scripts/run-ads-conversions-staging.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
