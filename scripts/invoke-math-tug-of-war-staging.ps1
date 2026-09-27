param(
  [ValidateSet('identify', 'apply', 'verify', 'migrate', 'smoke', 'review', 'share-check', 'owner-account')] [string]$Stage = 'identify',
  [string]$Origin = '',
  [string]$ExpectCommit = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for Math Tug of War. Loads only the staging entries of
# the established process-only credential vault (never the *_LIVE_*,
# *_PRODUCTION_* or *_READONLY_* entries), runs one stage against the isolated
# staging project, and clears every variable afterwards. Mirrors
# invoke-quiz-pdfs-staging.ps1.
#
#   -Stage identify  read-only: pooler database == staging API, history format
#   -Stage apply     owner-approved: apply ONLY 20260927100000 in one statement and record it
#   -Stage smoke     room contract through the service-role functions (synthetic, cleaned up)
#   -Stage review    real browsers against -Origin <staging preview URL> (synthetic subscribers, deleted)
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-tug-of-war-staging.ps1 -Stage identify
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
if ($Stage -in @('review', 'share-check') -and [string]::IsNullOrWhiteSpace($Origin)) { throw 'The review stage needs -Origin <staging preview URL>.' }
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
  'share-check' { @('SUPABASE_SECRET_KEY') }
  'owner-account' { @('SUPABASE_SECRET_KEY') }
  default { @('SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY') }
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
  if ($Stage -eq 'owner-account') {
    & node scripts/staging-owner-review-account.mjs
    exit $LASTEXITCODE
  }
  if ($Stage -eq 'share-check') {
    $env:SHARE_URL = $Origin
    & node scripts/verify-math-tug-of-war-share-link.mjs
    exit $LASTEXITCODE
  }
  if ($Stage -eq 'review') {
    $env:STAGING_ORIGIN = $Origin
    $env:EXPECT_COMMIT = $ExpectCommit
    & node scripts/review-math-tug-of-war-staging.mjs
    exit $LASTEXITCODE
  }
  & node scripts/run-math-tug-of-war-staging.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('STAGING_ORIGIN', 'EXPECT_COMMIT', 'SHARE_URL')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
