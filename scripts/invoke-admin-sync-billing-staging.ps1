param(
  [ValidateSet('audit', 'apply', 'verify', 'contract')] [string]$Stage = 'audit',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for the Super Admin "Sync with Stripe" CHECK fix
# (migration 20260929100000). Loads only the staging database password and the
# staging service key from the process-only credential vault (never a *_LIVE_*,
# *_PRODUCTION_*, *_READONLY_* or Stripe entry), runs one stage, and clears
# every variable afterwards. No value is printed.
#
#   -Stage audit     READ ONLY
#   -Stage apply     OWNER-APPROVED: needs $env:ADMIN_SYNC_BILLING_OWNER_APPROVED='yes'
#   -Stage verify    READ ONLY
#   -Stage contract  database half of Sync with Stripe in a rolled-back transaction
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$names = @('SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY')
$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($names -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  foreach ($name in $names) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "The staging entry $name is not in the vault." }
  }
  Set-Location $repositoryRoot
  & node scripts/run-admin-sync-billing-staging.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $names + @('ADMIN_SYNC_BILLING_OWNER_APPROVED')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
