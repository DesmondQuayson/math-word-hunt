param(
  [ValidateSet('plan', 'apply', 'verify', 'verify-deep', 'review')] [string]$Stage = 'plan',
  [string]$Origin = 'https://mathnexa.com',
  [string]$ExpectBuild = '',
  [string]$Engines = 'chromium',
  [string]$TopicMap = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# -TopicMap content/quiz-pdfs/production-topic-map.json attaches the quizzes to
# the Grade 6 topics that already exist in production instead of creating new
# ones (plan, apply and verify stages).
# PRODUCTION launcher for the owner-approved Quiz PDFs content release. Loads
# exactly two production entries of the process-only credential vault (the
# production project ref and the production service key; never a staging
# entry, never a Stripe key, never the database password), runs one stage, and
# clears every variable afterwards. No value is printed. Mirrors
# scripts/invoke-subscription-lifecycle-production.ps1.
#
#   -Stage plan         read-only plan against the production content database
#   -Stage apply        publish the manifest as the real owner admin (the sole
#                       active MFA-enrolled owner row); never a synthetic owner
#   -Stage verify       database proof for every quiz
#   -Stage verify-deep  ... plus every stored object downloaded and re-hashed
#   -Stage review       real-browser review against -Origin (default the apex)
#                       with synthetic consumer accounts deleted afterwards
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$stagingProjectRef = 'gcmuhzxkwvfireyrearl'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
$names = @('SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_SECRET_KEY')
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($names -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  foreach ($name in $names) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "The production entry $name is not in the vault." }
  }
  $projectRef = $env:SUPABASE_PRODUCTION_PROJECT_REF.Trim().ToLowerInvariant()
  if ($projectRef -notmatch '^[a-z]{20}$') { throw 'Refusing: the vault production project ref is malformed.' }
  if ($projectRef -eq $stagingProjectRef) { throw 'Refusing: the vault production project ref is the staging project.' }
  $env:SUPABASE_URL = "https://$projectRef.supabase.co"
  $env:SUPABASE_SECRET_KEY = $env:SUPABASE_PRODUCTION_SECRET_KEY
  $env:QUIZ_PDFS_PRODUCTION_HOST = "$projectRef.supabase.co"
  Set-Location $repositoryRoot
  if ($Stage -eq 'review') {
    $env:REVIEW_ORIGIN = $Origin
    $env:REVIEW_TARGET = 'production'
    $env:REVIEW_OUT = 'owner-review/quiz-pdfs-v1/production'
    $env:REVIEW_ENGINES = $Engines
    $env:REVIEW_ALLOW_SYNTHETIC_ACCOUNTS_ON_PRODUCTION = 'yes'
    if ($ExpectBuild) { $env:REVIEW_EXPECT_BUILD = $ExpectBuild }
    & node scripts/review-quiz-pdfs-staging.mjs
    exit $LASTEXITCODE
  }
  $scriptArgs = @("--$($Stage -replace '-deep', '')", '--target', 'env')
  if ($Stage -eq 'verify-deep') { $scriptArgs += '--deep' }
  if ($Stage -eq 'apply') { $scriptArgs += @('--confirm-host', "$projectRef.supabase.co", '--production', '--actor-sole-owner') }
  if ($TopicMap) { $scriptArgs += @('--topic-map', $TopicMap) }
  & node scripts/publish-quiz-pdfs.mjs @scriptArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $names + @('SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'QUIZ_PDFS_PRODUCTION_HOST', 'REVIEW_ORIGIN', 'REVIEW_TARGET', 'REVIEW_OUT', 'REVIEW_ENGINES', 'REVIEW_ALLOW_SYNTHETIC_ACCOUNTS_ON_PRODUCTION', 'REVIEW_EXPECT_BUILD')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
