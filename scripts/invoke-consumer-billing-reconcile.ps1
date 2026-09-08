param(
  [ValidateSet('test', 'live')] [string]$Environment = 'test',
  [string]$Owner = '',
  [switch]$Apply,
  [switch]$OwnerApproved,
  [string]$ProductionProjectRef = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# Drift audit launcher. DRY RUN unless -Apply is given; applying to LIVE also
# requires -OwnerApproved (an explicit owner decision) and is refused otherwise.
# Loads the established process-only credential vault, maps the selected
# environment's keys onto the CLI's variables, runs it, and clears every
# variable afterwards. Live mode uses the RESTRICTED read-only Stripe key
# (STRIPE_LIVE_READONLY_KEY); the full live secret key is never loaded here.
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
if ($Environment -eq 'live' -and $Apply -and -not $OwnerApproved) { throw 'Applying to live requires -OwnerApproved after an explicit owner decision.' }
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
    if (-not $values.ContainsKey('STRIPE_LIVE_READONLY_KEY')) { throw 'No STRIPE_LIVE_READONLY_KEY in the vault. Add a restricted read-only key via scripts/invoke-subscription-lifecycle-credential-refresh.ps1.' }
    $env:STRIPE_SECRET_KEY = $values['STRIPE_LIVE_READONLY_KEY']
    $ref = if ($ProductionProjectRef) { $ProductionProjectRef } elseif ($values.ContainsKey('SUPABASE_PRODUCTION_PROJECT_REF')) { $values['SUPABASE_PRODUCTION_PROJECT_REF'] } else { $null }
    if (-not $ref -or $ref -notmatch '^[a-z]{20}$' -or $ref -eq 'gcmuhzxkwvfireyrearl') { throw 'Production Supabase project ref is unknown or is the staging ref.' }
    $env:SUPABASE_URL = "https://$ref.supabase.co"
    $env:SUPABASE_SECRET_KEY = $values['SUPABASE_PRODUCTION_SECRET_KEY']
  } else {
    $env:STRIPE_SECRET_KEY = $values['STRIPE_SECRET_KEY']
    $env:SUPABASE_URL = 'https://gcmuhzxkwvfireyrearl.supabase.co'
    $env:SUPABASE_SECRET_KEY = $values['SUPABASE_SECRET_KEY']
  }
  # The live product and price are the same catalogue objects the app is configured with.
  if (-not $env:STRIPE_PRODUCT_MATHNEXA) { $env:STRIPE_PRODUCT_MATHNEXA = if ($Environment -eq 'live') { $values['STRIPE_LIVE_PRODUCT_MATHNEXA'] } else { 'prod_UzJVhdFFd8lNed' } }
  if (-not $env:STRIPE_PRICE_MATHNEXA_MONTHLY) { $env:STRIPE_PRICE_MATHNEXA_MONTHLY = if ($Environment -eq 'live') { $values['STRIPE_LIVE_PRICE_MATHNEXA_MONTHLY'] } else { 'price_1TzKso4YQNsZa1pjh5UZvcV7' } }
  if (-not $env:STRIPE_PRODUCT_MATHNEXA -or -not $env:STRIPE_PRICE_MATHNEXA_MONTHLY) { throw 'STRIPE_PRODUCT_MATHNEXA and STRIPE_PRICE_MATHNEXA_MONTHLY are required for live: set them in the calling shell (ids are not secrets).' }
  Set-Location $repositoryRoot
  $cliArgs = @("--environment=$Environment")
  if ($Owner) { $cliArgs += "--owner=$Owner" }
  if ($Apply) { $cliArgs += '--apply' }
  if ($OwnerApproved) { $cliArgs += '--owner-approved' }
  & node scripts/consumer-billing-reconcile.mjs @cliArgs
  exit $LASTEXITCODE
} finally {
  foreach ($name in @('STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($k in @($values.Keys)) { $values[$k] = $null }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
