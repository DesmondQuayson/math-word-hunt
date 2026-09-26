param(
  [ValidateSet('plan', 'apply', 'verify')] [string]$Stage = 'plan',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for the Quiz PDFs manifest. Loads only the staging
# Supabase entries of the established process-only credential vault (never the
# *_LIVE_*, *_PRODUCTION_* or *_READONLY_* entries), publishes or verifies the
# quiz manifest against the isolated staging project, and clears every variable
# afterwards. Mirrors scripts/invoke-subscription-lifecycle-staging.ps1.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-quiz-pdfs-staging.ps1 -Stage plan
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-quiz-pdfs-staging.ps1 -Stage apply
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-quiz-pdfs-staging.ps1 -Stage verify
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
$stagingNames = @('SUPABASE_SECRET_KEY')
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($stagingNames -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SECRET_KEY)) { throw 'The staging Supabase secret key is not in the vault.' }
  $env:SUPABASE_URL = "https://$stagingProjectRef.supabase.co"
  Set-Location $repositoryRoot
  $scriptArgs = @("--$Stage", '--target', 'env')
  if ($Stage -eq 'apply') { $scriptArgs += @('--confirm-host', "$stagingProjectRef.supabase.co", '--synthetic-owner', '--allow-synthetic-owner-on-hosted') }
  & node scripts/publish-quiz-pdfs.mjs @scriptArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames + @('SUPABASE_URL')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
