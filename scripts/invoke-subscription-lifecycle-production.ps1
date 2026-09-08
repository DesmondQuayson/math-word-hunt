param(
  [ValidateSet('preflight', 'migrate', 'verify', 'deploy-preview', 'probe-preview', 'promote', 'probe-live', 'cron-secret')] [string]$Stage = 'preflight',
  [string]$Url = '',
  [string]$LogFile = '',
  [switch]$AllowReapply,
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# PRODUCTION launcher for the owner-approved subscription lifecycle repair.
# Loads only the production entries of the process-only credential vault (never
# the staging service key, staging DB password, or staging gate token), runs one
# stage, and clears every variable afterwards. No stage charges, refunds,
# cancels, or writes customer data.
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
$productionNames = @(
  'SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_DB_PASSWORD', 'SUPABASE_PRODUCTION_SECRET_KEY',
  'CRON_SECRET_PRODUCTION', 'CRON_SECRET_STAGING'
)
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($productionNames -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  $vercel = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx') -Recurse -Filter 'vercel.cmd' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  if (-not [string]::IsNullOrWhiteSpace($vercel)) { $env:LIFECYCLE_VERCEL_CLI = $vercel }
  $env:LIFECYCLE_VAULT_SET_SCRIPT = Join-Path $PSScriptRoot 'set-lifecycle-vault-entry.ps1'
  if ($LogFile) { $env:LIFECYCLE_LOG_FILE = $LogFile }
  Set-Location $repositoryRoot
  $scriptArgs = @("--stage=$Stage")
  if ($Url) { $scriptArgs += "--url=$Url" }
  if ($AllowReapply) { $scriptArgs += '--allow-reapply' }
  & node scripts/run-subscription-lifecycle-production.mjs @scriptArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $productionNames + @('LIFECYCLE_VERCEL_CLI', 'LIFECYCLE_VAULT_SET_SCRIPT', 'LIFECYCLE_VAULT_SECRET_VALUE', 'LIFECYCLE_LOG_FILE', 'LIFECYCLE_PREVIEW_URL')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
