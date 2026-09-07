param(
  [ValidateSet('migrate', 'webhook-config', 'cron-secret', 'deploy', 'certify', 'lifecycle', 'sweep', 'reconcile-dry-run', 'all')] [string]$Stage = 'certify',
  [switch]$Alias,
  [switch]$AllowEndpointCreate,
  [string]$Url = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher. Loads only the staging entries of the established
# process-only credential vault (never the *_LIVE_*, *_PRODUCTION_*, or
# *_READONLY_* entries), runs the requested pipeline stage, and clears every
# variable afterwards. The Stripe entries loaded here are SANDBOX/TEST keys by
# format contract (sk_test_/pk_test_); the pipeline re-proves test mode at
# runtime before any Stripe object is created.
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
$stagingNames = @(
  'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY',
  'MVH_STAGING_ACCESS_TOKEN', 'VERCEL_AUTOMATION_BYPASS_SECRET',
  'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'CRON_SECRET_STAGING'
)
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($stagingNames -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try {
        if ($entry.Name -like 'STRIPE_*KEY' -and $plain -notmatch '^(sk|pk)_test_') { throw "Refusing: $($entry.Name) in the vault is not a Stripe TEST-mode key." }
        [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process')
      } finally { $plain = $null }
    }
  }
  $vercel = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx') -Recurse -Filter 'vercel.cmd' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  if (-not [string]::IsNullOrWhiteSpace($vercel)) { $env:LIFECYCLE_VERCEL_CLI = $vercel }
  $env:LIFECYCLE_VAULT_SET_SCRIPT = Join-Path $PSScriptRoot 'set-lifecycle-vault-entry.ps1'
  Set-Location $repositoryRoot
  $scriptArgs = @("--stage=$Stage")
  if ($Alias) { $scriptArgs += '--alias' }
  if ($AllowEndpointCreate) { $scriptArgs += '--allow-endpoint-create' }
  if ($Url) { $scriptArgs += "--url=$Url" }
  & node scripts/run-subscription-lifecycle-staging.mjs @scriptArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('LIFECYCLE_VERCEL_CLI', 'LIFECYCLE_VAULT_SET_SCRIPT', 'LIFECYCLE_VAULT_SECRET_VALUE')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
