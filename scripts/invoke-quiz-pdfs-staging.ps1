param(
  [ValidateSet('plan', 'apply', 'verify', 'verify-deep', 'review')] [string]$Stage = 'plan',
  [string]$Origin = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for the Quiz PDFs manifest. Loads only the staging
# entries of the established process-only credential vault (never the
# *_LIVE_*, *_PRODUCTION_* or *_READONLY_* entries), runs one stage against the
# isolated staging project, and clears every variable afterwards. Mirrors
# scripts/invoke-subscription-lifecycle-staging.ps1.
#
#   -Stage plan         read-only plan against the staging content database
#   -Stage apply        publish the manifest (synthetic owner, revoked afterwards)
#   -Stage verify       database proof for every quiz
#   -Stage verify-deep  ... plus every stored object downloaded and re-hashed
#   -Stage review       real-browser owner review against a staging deployment
#                       (-Origin https://<staging deployment host>); needs the
#                       Vercel protection-bypass entry as well
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-quiz-pdfs-staging.ps1 -Stage plan
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$stagingProjectRef = 'gcmuhzxkwvfireyrearl'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
if ($Stage -eq 'review' -and [string]::IsNullOrWhiteSpace($Origin)) { throw 'The review stage needs -Origin <staging deployment URL>.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
$stagingNames = @('SUPABASE_SECRET_KEY')
if ($Stage -eq 'review') { $stagingNames += 'VERCEL_AUTOMATION_BYPASS_SECRET' }
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
  $env:SUPABASE_URL = "https://$stagingProjectRef.supabase.co"
  Set-Location $repositoryRoot
  if ($Stage -eq 'review') {
    $env:STAGING_ORIGIN = $Origin
    & node scripts/review-quiz-pdfs-staging.mjs
    exit $LASTEXITCODE
  }
  $scriptArgs = @("--$($Stage -replace '-deep', '')", '--target', 'env')
  if ($Stage -eq 'verify-deep') { $scriptArgs += '--deep' }
  if ($Stage -eq 'apply') { $scriptArgs += @('--confirm-host', "$stagingProjectRef.supabase.co", '--synthetic-owner', '--allow-synthetic-owner-on-hosted') }
  & node scripts/publish-quiz-pdfs.mjs @scriptArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('SUPABASE_URL', 'STAGING_ORIGIN')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
