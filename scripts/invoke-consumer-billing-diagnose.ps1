param(
  [ValidateSet('test', 'live')] [string]$Environment = 'test',
  [int]$Hours = 168,
  [string]$ProductionProjectRef = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# READ-ONLY diagnosis launcher. Loads the established process-only credential
# vault, maps the selected environment's keys onto the diagnosis script's
# variables, runs it, and clears every variable afterwards. Nothing is printed,
# logged, hashed, or persisted from the vault.
#
# Live mode prefers the RESTRICTED read-only Stripe key (STRIPE_LIVE_READONLY_KEY)
# and refuses to run without it unless -Environment live is combined with an
# explicit owner decision to use the full secret key read-only (set
# LIFECYCLE_ALLOW_LIVE_SECRET_KEY=1 in the calling shell).
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
$values = @{}
foreach ($entry in $vault.Values.PSObject.Properties) { $values[$entry.Name] = Open-SecureValue $entry.Value }
try {
  if ($Environment -eq 'live') {
    if ($values.ContainsKey('STRIPE_LIVE_READONLY_KEY')) {
      $env:STRIPE_SECRET_KEY = $values['STRIPE_LIVE_READONLY_KEY']
    } elseif ($env:LIFECYCLE_ALLOW_LIVE_SECRET_KEY -eq '1') {
      $env:STRIPE_SECRET_KEY = $values['STRIPE_LIVE_SECRET_KEY']
    } else {
      throw 'No STRIPE_LIVE_READONLY_KEY in the vault. Add a restricted read-only key via scripts/invoke-subscription-lifecycle-credential-refresh.ps1, or set LIFECYCLE_ALLOW_LIVE_SECRET_KEY=1 to use the full live key read-only.'
    }
    $ref = if ($ProductionProjectRef) { $ProductionProjectRef } elseif ($values.ContainsKey('SUPABASE_PRODUCTION_PROJECT_REF')) { $values['SUPABASE_PRODUCTION_PROJECT_REF'] } else { $null }
    if (-not $ref -or $ref -notmatch '^[a-z]{20}$') { throw 'Production Supabase project ref is unknown. Pass -ProductionProjectRef or store SUPABASE_PRODUCTION_PROJECT_REF via the refresh prompt.' }
    # Canonical form: Supabase refs are lowercase and PowerShell -match is case-insensitive.
    $ref = $ref.ToLowerInvariant()
    $env:SUPABASE_URL = "https://$ref.supabase.co"
    $env:SUPABASE_SECRET_KEY = $values['SUPABASE_PRODUCTION_SECRET_KEY']
  } else {
    $env:STRIPE_SECRET_KEY = $values['STRIPE_SECRET_KEY']
    $env:SUPABASE_URL = 'https://gcmuhzxkwvfireyrearl.supabase.co'
    $env:SUPABASE_SECRET_KEY = $values['SUPABASE_SECRET_KEY']
  }
  Set-Location $repositoryRoot
  & node scripts/consumer-billing-diagnose.mjs "--environment=$Environment" "--hours=$Hours"
  exit $LASTEXITCODE
} finally {
  foreach ($name in @('STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($k in @($values.Keys)) { $values[$k] = $null }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
