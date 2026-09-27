param(
  [ValidateSet('migrate', 'smoke')] [string]$Stage = 'migrate',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STAGING-ONLY launcher for Math Tug of War. Loads only the staging entries of
# the established process-only credential vault (never the *_LIVE_*,
# *_PRODUCTION_* or *_READONLY_* entries), runs one stage of
# scripts/run-math-tug-of-war-staging.mjs against the isolated staging project,
# and clears every variable afterwards. Mirrors invoke-quiz-pdfs-staging.ps1.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-tug-of-war-staging.ps1 -Stage migrate
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-tug-of-war-staging.ps1 -Stage smoke
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
$stagingNames = if ($Stage -eq 'migrate') { @('SUPABASE_DB_PASSWORD') } else { @('SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY') }
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
  & node scripts/run-math-tug-of-war-staging.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $stagingNames) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
