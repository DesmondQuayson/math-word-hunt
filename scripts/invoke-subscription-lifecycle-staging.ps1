param(
  [ValidateSet('migrate', 'deploy', 'certify', 'all')] [string]$Stage = 'certify',
  [switch]$Alias,
  [string]$Url = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher. Loads only the staging entries of the established
# process-only credential vault (never the *_LIVE_* or *_PRODUCTION_* entries),
# runs the staging pipeline stage, and clears every variable afterwards.
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
$stagingNames = @('SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY', 'MVH_STAGING_ACCESS_TOKEN', 'VERCEL_AUTOMATION_BYPASS_SECRET')
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
  Set-Location $repositoryRoot
  $scriptArgs = @("--stage=$Stage")
  if ($Alias) { $scriptArgs += '--alias' }
  if ($Url) { $scriptArgs += "--url=$Url" }
  & node scripts/run-subscription-lifecycle-staging.mjs @scriptArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('LIFECYCLE_VERCEL_CLI')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
