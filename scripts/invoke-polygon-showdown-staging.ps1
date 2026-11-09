param(
  [ValidateSet('identify', 'migrate', 'verify', 'privileges', 'smoke', 'load', 'attack', 'review')] [string]$Stage = 'identify',
  [string]$Origin = '',
  [string]$ExpectCommit = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for Polygon Showdown. Loads only the staging entries of
# the established process-only credential vault (never the *_LIVE_*,
# *_PRODUCTION_* or *_READONLY_* entries), runs one stage against the isolated
# staging project, and clears every variable afterwards. Mirrors
# invoke-math-bingo-live-staging.ps1.
#
#   -Stage identify  read-only: pooler database == staging, pending migrations
#   -Stage migrate   owner-approved: dry run, then apply the ONE pending Polygon migration and verify it
#   -Stage verify    read-only: tables, RLS, grants, functions, shop items, Draft row, /join guard
#   -Stage smoke     room contract through the service-role functions (synthetic, cleaned up)
#   -Stage load      10-50 virtual players against -Origin (synthetic, cleaned up)
#   -Stage attack    anti-cheat and access attempts against -Origin (synthetic, cleaned up)
#   -Stage review    real browsers against -Origin (synthetic accounts, deleted afterwards)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-polygon-showdown-staging.ps1 -Stage identify
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
if ($Stage -in @('load', 'attack', 'review') -and [string]::IsNullOrWhiteSpace($Origin)) { throw "The $Stage stage needs -Origin <staging preview URL>." }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
$stagingNames = switch ($Stage) {
  'smoke' { @('SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY') }
  'load' { @('SUPABASE_SECRET_KEY', 'SUPABASE_DB_PASSWORD', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
  'attack' { @('SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
  'review' { @('SUPABASE_SECRET_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
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
  if ($Stage -in @('load', 'attack', 'review')) {
    $env:STAGING_ORIGIN = $Origin
    $env:EXPECT_COMMIT = $ExpectCommit
    $script = switch ($Stage) {
      'load' { 'scripts/polygon-showdown-load-staging.mjs' }
      'attack' { 'scripts/attack-polygon-showdown-staging.mjs' }
      'review' { 'scripts/review-polygon-showdown-staging.mjs' }
    }
    & node --no-warnings $script
    exit $LASTEXITCODE
  }
  & node --no-warnings scripts/run-polygon-showdown-staging.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('STAGING_ORIGIN', 'EXPECT_COMMIT')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
