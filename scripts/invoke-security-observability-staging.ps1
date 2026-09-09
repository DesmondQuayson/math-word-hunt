param(
  [ValidateSet('migrate', 'pgtap-remote', 'inspect', 'env', 'deploy', 'certify', 'all')] [string]$Stage = 'certify',
  [string]$Url = '',
  [string]$LogFile = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for the PH2-07 security observability pipeline.
# Loads only the staging entries of the established process-only credential
# vault (never *_LIVE_*, *_PRODUCTION_* or *_READONLY_* entries), runs the
# requested stage, and clears every variable afterwards. Mirrors
# invoke-subscription-lifecycle-staging.ps1; no value is ever printed.
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
  'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD',
  'CRON_SECRET_STAGING', 'SECURITY_DRAIN_SECRET_STAGING'
)
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($stagingNames -contains $entry.Name) {
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
  & node scripts/run-security-observability-staging.mjs @scriptArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('LIFECYCLE_VERCEL_CLI', 'LIFECYCLE_VAULT_SET_SCRIPT', 'LIFECYCLE_VAULT_SECRET_VALUE', 'LIFECYCLE_LOG_FILE')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
