param(
  [Parameter(Mandatory = $true)] [string]$Origin,
  [string]$ExpectCommit = '',
  [string]$Projects = 'chromium,webkit',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for the ShowMe Math access pass review
# (scripts/review-showme-pass-staging.mjs, docs/showme-access-gate.md). Loads
# only the staging entries of the established process-only credential vault
# (never the *_LIVE_*, *_PRODUCTION_* or *_READONLY_* entries), runs the review
# against a mathnexa-platform-staging preview, and clears every variable
# afterwards. Mirrors invoke-ads-conversions-staging.ps1.
#
# The preview's own pass secret (the value it was deployed with as
# MVH_SHOWME_ACCESS_SECRET) is read from $env:SHOWME_STAGING_PASS_SECRET, set by
# the caller for this one command.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-showme-pass-staging.ps1 -Origin <preview URL>
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
if ([string]::IsNullOrWhiteSpace($env:SHOWME_STAGING_PASS_SECRET)) { throw 'Set SHOWME_STAGING_PASS_SECRET to the preview''s pass secret for this command.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
$stagingNames = @('SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET')
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($stagingNames -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  foreach ($name in $stagingNames) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "The staging entry $name is not in the vault." }
  }
  Set-Location $repositoryRoot
  $env:STAGING_ORIGIN = $Origin
  $env:EXPECT_COMMIT = $ExpectCommit
  $env:REVIEW_PROJECTS = $Projects
  & node --no-warnings scripts/review-showme-pass-staging.mjs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('STAGING_ORIGIN', 'EXPECT_COMMIT', 'REVIEW_PROJECTS')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
}
