param(
  [string]$OutFile = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# READ-ONLY launcher for the Super Admin System health diagnosis. Loads exactly
# the production project ref, database password and service key, plus the
# RESTRICTED read-only live Stripe key when the vault holds one (never a secret
# key, never a staging entry). Clears every variable afterwards. No value is
# printed; the evidence JSON reduces provider and row identifiers to suffixes.
#
#   .\scripts\invoke-system-health-production-diagnosis.ps1 [-OutFile <path>]
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
$required = @('SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_SECRET_KEY', 'SUPABASE_PRODUCTION_DB_PASSWORD')
$optional = @('STRIPE_LIVE_READONLY_KEY')
$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if (($required + $optional) -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  foreach ($name in $required) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) { throw "The production entry $name is not in the vault." }
  }
  $projectRef = $env:SUPABASE_PRODUCTION_PROJECT_REF.Trim().ToLowerInvariant()
  if ($projectRef -notmatch '^[a-z]{20}$') { throw 'Refusing: the vault production project ref is malformed.' }
  if ($projectRef -eq $stagingProjectRef) { throw 'Refusing: the vault production project ref is the staging project.' }
  Set-Location $repositoryRoot
  if ($OutFile) {
    & node scripts/system-health-production-diagnosis.mjs | Out-File -LiteralPath $OutFile -Encoding utf8
  } else {
    & node scripts/system-health-production-diagnosis.mjs
  }
  exit $LASTEXITCODE
} finally {
  foreach ($name in $required + $optional) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
