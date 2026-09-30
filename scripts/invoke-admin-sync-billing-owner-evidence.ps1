param(
  [Parameter(Mandatory = $true)] [string]$OwnerEmail,
  [ValidateSet('before', 'after')] [string]$Label = 'before',
  [string]$Since = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# READ-ONLY evidence launcher for the owner-approved production "Sync with
# Stripe" test. Loads exactly the production project ref, database password and
# service key, plus the RESTRICTED read-only live Stripe key when the vault
# holds one (never a secret key, never a staging entry). Clears every variable
# afterwards. No value is printed.
#
#   -Label before                         before the owner presses Sync with Stripe
#   -Label after -Since <before takenAt>  after, including Stripe/DB activity since then
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
  $env:OWNER_EMAIL = $OwnerEmail
  $env:OWNER_EVIDENCE_LABEL = $Label
  if ($Since) { $env:OWNER_EVIDENCE_SINCE = $Since }
  Set-Location $repositoryRoot
  & node scripts/admin-sync-billing-owner-evidence.mjs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $required + $optional + @('OWNER_EMAIL', 'OWNER_EVIDENCE_LABEL', 'OWNER_EVIDENCE_SINCE')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
