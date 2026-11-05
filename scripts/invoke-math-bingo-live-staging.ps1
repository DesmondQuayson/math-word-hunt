param(
  [ValidateSet('identify', 'migrate', 'smoke', 'review', 'load')] [string]$Stage = 'identify',
  [string]$Origin = '',
  [string]$ExpectCommit = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for Math Bingo Live. Loads only the staging entries of
# the established process-only credential vault (never the *_LIVE_*,
# *_PRODUCTION_* or *_READONLY_* entries), runs one stage against the isolated
# staging project, and clears every variable afterwards. Mirrors
# invoke-math-tug-of-war-staging.ps1.
#
#   -Stage identify  read-only: pooler database == staging, pending migrations
#   -Stage migrate   owner-approved: apply ONLY 20261103100000 (draft catalog row, new tables) and verify it
#   -Stage smoke     room contract through the service-role functions (synthetic, cleaned up)
#   -Stage review    real browsers against -Origin <staging preview URL> (synthetic free teacher, deleted)
#   -Stage load      50 virtual students + a real host screen against -Origin (synthetic, deleted)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-bingo-live-staging.ps1 -Stage identify
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
if ($Stage -in @('review', 'load') -and [string]::IsNullOrWhiteSpace($Origin)) { throw "The $Stage stage needs -Origin <staging preview URL>." }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
$stagingNames = switch ($Stage) {
  'migrate' { @('SUPABASE_DB_PASSWORD') }
  'smoke' { @('SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY') }
  'review' { @('SUPABASE_SECRET_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
  'load' { @('SUPABASE_SECRET_KEY', 'VERCEL_AUTOMATION_BYPASS_SECRET') }
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
  if ($Stage -in @('review', 'load')) {
    $env:STAGING_ORIGIN = $Origin
    $env:EXPECT_COMMIT = $ExpectCommit
    $script = if ($Stage -eq 'load') { 'scripts/load-math-bingo-live-staging.mjs' } else { 'scripts/review-math-bingo-live-staging.mjs' }
    & node $script
    exit $LASTEXITCODE
  }
  & node scripts/run-math-bingo-live-staging.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('STAGING_ORIGIN', 'EXPECT_COMMIT')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
