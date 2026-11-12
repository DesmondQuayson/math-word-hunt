param(
  [ValidateSet('identify', 'migrate', 'verify', 'privileges', 'smoke', 'sweep', 'activity', 'publish', 'unpublish', 'load', 'review', 'qa')] [string]$Stage = 'identify',
  [string]$Origin = '',
  [string]$ExpectCommit = '',
  [string]$Players = '10,20,30,40,50',
  [string]$Out = '',
  [string]$Projects = 'chromium',
  [string]$ReviewArgs = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for Math Race Champions. Loads only the staging entries
# of the established process-only credential vault (never the *_LIVE_*,
# *_PRODUCTION_* or *_READONLY_* entries), runs one stage against the isolated
# staging project, and clears every variable afterwards. Mirrors
# invoke-polygon-showdown-staging.ps1.
#
#   -Stage identify    read-only: pooler database == staging, pending migrations
#   -Stage migrate     dry run, then apply the ONE next pending Math Race migration and verify it
#   -Stage verify      read-only: tables, RLS, grants, functions, cars, achievements, catalog row, /join guard
#   -Stage privileges  read-only: who holds what on this game's tables
#   -Stage smoke       room contract through the service-role functions (synthetic, cleaned up)
#   -Stage publish     STAGING catalog only: draft -> published, through the functions behind Super Admin's buttons
#   -Stage unpublish   STAGING catalog only: back to draft
#   -Stage qa          the guest QA script (homepage card, catalog, assets, an Online Race) against -Origin
#   -Stage load        10-50 virtual racers against -Origin (synthetic rooms, cleaned up)
#   -Stage review      real browsers against -Origin (synthetic accounts, deleted afterwards)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-race-champions-staging.ps1 -Stage identify
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
if ($Stage -in @('load', 'review', 'qa') -and [string]::IsNullOrWhiteSpace($Origin)) { throw "The $Stage stage needs -Origin <staging preview URL>." }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
$stagingNames = switch ($Stage) {
  'smoke' { @('SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY') }
  'load' { @('SUPABASE_SECRET_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
  'review' { @('SUPABASE_SECRET_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
  'qa' { @('SUPABASE_SECRET_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
  'publish' { @('SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY') }
  'unpublish' { @('SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY') }
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
  if ($Stage -in @('load', 'review', 'qa')) {
    $env:STAGING_ORIGIN = $Origin
    $env:EXPECT_COMMIT = $ExpectCommit
    $env:REVIEW_OUT = $Out
    $env:REVIEW_PROJECTS = $Projects
    $env:REVIEW_ARGS = $ReviewArgs
    if ($Stage -eq 'qa') {
      $env:QA_OUT = $Out
      $qaScript = if ($env:RACE_QA_SCRIPT) { $env:RACE_QA_SCRIPT } else { 'scripts/qa-math-race-champions-production.mjs' }
      & node --no-warnings $qaScript
      exit $LASTEXITCODE
    }
    if ($Stage -eq 'load') {
      $loadArguments = @('--players', $Players)
      if ($Out) { $loadArguments += @('--out', $Out) }
      & node --no-warnings scripts/math-race-champions-load.mjs @loadArguments
      exit $LASTEXITCODE
    }
    & node --no-warnings scripts/review-math-race-champions-staging.mjs
    exit $LASTEXITCODE
  }
  & node --no-warnings scripts/run-math-race-champions-staging.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('STAGING_ORIGIN', 'EXPECT_COMMIT', 'REVIEW_OUT', 'REVIEW_PROJECTS', 'REVIEW_ARGS', 'QA_OUT')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
