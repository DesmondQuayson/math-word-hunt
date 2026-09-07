param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml'),
  [switch]$IncludeLive
)
# Capability check for the process-only credential vault. Prints PASS/FAIL per
# capability and HTTP status codes only. Never prints, logs, hashes, or persists
# a credential value. Every probe is a read (HEAD/GET/list); nothing is written
# anywhere. Live-mode probes run only with -IncludeLive and prefer the
# RESTRICTED read-only Stripe key when the vault has one.
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Probe {
  param([string]$Label, [string]$Uri, [hashtable]$Headers, [string]$Method = 'GET', [scriptblock]$Inspect = $null)
  try {
    $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -Method $Method -UseBasicParsing -TimeoutSec 30
    $detail = ''
    if ($Inspect) { $detail = ' ' + (& $Inspect $response) }
    "$Label = PASS (HTTP $($response.StatusCode))$detail"
  } catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'network' }
    "$Label = FAIL (HTTP $status)"
  }
}
$stagingRef = 'gcmuhzxkwvfireyrearl'
$stripeVersion = @{ 'Stripe-Version' = '2026-07-29.dahlia' }
$vault = Import-Clixml -LiteralPath $VaultPath
$values = @{}
try {
  foreach ($entry in $vault.Values.PSObject.Properties) { $values[$entry.Name] = Open-SecureValue $entry.Value }
  "VAULT_MODIFIED = $((Get-Item -LiteralPath $VaultPath).LastWriteTime.ToString('u'))"
  "VAULT_ENTRIES = $(($values.Keys | Sort-Object) -join ', ')"
  $stripeTest = $values['STRIPE_SECRET_KEY']
  "STRIPE_TEST_KEY_FORMAT = $(if ($stripeTest -match '^sk_test_') { 'sk_test (sandbox)' } elseif ($stripeTest) { 'NOT TEST MODE' } else { 'missing' })"
  Probe 'SUPABASE_STAGING_MANAGEMENT_TOKEN' 'https://api.supabase.com/v1/projects' @{ Authorization = "Bearer $($values['SUPABASE_ACCESS_TOKEN'])" } 'GET' {
    param($r) $projects = $r.Content | ConvertFrom-Json; $staging = $projects | Where-Object { $_.ref -eq $stagingRef }
    if ($staging) { "staging visible: name=$($staging.name) region=$($staging.region) status=$($staging.status)" } else { 'staging project NOT visible' }
  }
  Probe 'SUPABASE_STAGING_SERVICE_KEY' "https://$stagingRef.supabase.co/rest/v1/billing_subscriptions?select=id&limit=1" @{ apikey = $values['SUPABASE_SECRET_KEY']; Authorization = "Bearer $($values['SUPABASE_SECRET_KEY'])"; Prefer = 'count=exact' } 'HEAD'
  if ($values.ContainsKey('SUPABASE_PUBLISHABLE_KEY')) {
    Probe 'SUPABASE_STAGING_PUBLISHABLE_KEY' "https://$stagingRef.supabase.co/rest/v1/" @{ apikey = $values['SUPABASE_PUBLISHABLE_KEY'] }
  }
  if ($stripeTest -match '^sk_test_') {
    Probe 'STRIPE_TEST_MODE_AUTH' 'https://api.stripe.com/v1/balance' (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion) 'GET' { param($r) "livemode=$(($r.Content | ConvertFrom-Json).livemode)" }
    Probe 'STRIPE_SANDBOX_PRICE' 'https://api.stripe.com/v1/prices/price_1TzKso4YQNsZa1pjh5UZvcV7' (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion) 'GET' { param($r) $p = $r.Content | ConvertFrom-Json; "unit_amount=$($p.unit_amount) $($p.currency) interval=$($p.recurring.interval) product_match=$($p.product -eq 'prod_UzJVhdFFd8lNed')" }
    Probe 'STRIPE_SANDBOX_PORTAL' 'https://api.stripe.com/v1/billing_portal/configurations/bpc_1TzLQf4YQNsZa1pjhn4FayQy' (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion)
    Probe 'STRIPE_SANDBOX_WEBHOOK_ENDPOINTS' 'https://api.stripe.com/v1/webhook_endpoints?limit=100' (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion) 'GET' {
      param($r) $list = ($r.Content | ConvertFrom-Json).data
      $staging = @($list | Where-Object { $_.url -like 'https://mathnexa-platform-staging.vercel.app/*' })
      "total=$($list.Count) staging_host_endpoints=$($staging.Count)" + ($(if ($staging.Count -gt 0) { " api_version=$($staging[0].api_version) status=$($staging[0].status) events=$($staging[0].enabled_events.Count)" } else { '' }))
    }
  } else {
    'STRIPE_TEST_MODE_AUTH = FAIL (no sk_test_ key in vault)'
  }
  if ($values.ContainsKey('VERCEL_AUTOMATION_BYPASS_SECRET')) {
    Probe 'VERCEL_PROTECTION_BYPASS' 'https://mathnexa-platform-staging-6662og3oe-bright-path-ed-tech.vercel.app/api/health' @{ 'x-vercel-protection-bypass' = $values['VERCEL_AUTOMATION_BYPASS_SECRET'] }
  }
  if ($values.ContainsKey('MVH_STAGING_ACCESS_TOKEN')) {
    Probe 'STAGING_GATE_BOOTSTRAP_TOKEN' 'https://mathnexa-platform-staging.vercel.app/api/internal/staging-access/bootstrap' @{ Authorization = "Bearer $($values['MVH_STAGING_ACCESS_TOKEN'])"; 'x-vercel-protection-bypass' = $values['VERCEL_AUTOMATION_BYPASS_SECRET'] } 'POST'
  }
  "CRON_SECRET_STAGING = $(if ($values.ContainsKey('CRON_SECRET_STAGING')) { 'present' } else { 'absent (pipeline --stage=cron-secret creates it)' })"
  if ($IncludeLive) {
    if ($values.ContainsKey('STRIPE_LIVE_READONLY_KEY')) {
      Probe 'STRIPE_LIVE_READONLY_AUTH (restricted rk_live key)' 'https://api.stripe.com/v1/webhook_endpoints?limit=1' (@{ Authorization = "Bearer $($values['STRIPE_LIVE_READONLY_KEY'])" } + $stripeVersion)
      Probe 'STRIPE_LIVE_READONLY_SUBSCRIPTIONS' 'https://api.stripe.com/v1/subscriptions?limit=1' (@{ Authorization = "Bearer $($values['STRIPE_LIVE_READONLY_KEY'])" } + $stripeVersion)
    } elseif ($values.ContainsKey('STRIPE_LIVE_SECRET_KEY')) {
      Probe 'STRIPE_LIVE_READONLY_AUTH (full secret key, read-only call; add an rk_live key to narrow this)' 'https://api.stripe.com/v1/balance' (@{ Authorization = "Bearer $($values['STRIPE_LIVE_SECRET_KEY'])" } + $stripeVersion)
    } else {
      'STRIPE_LIVE_READONLY_AUTH = FAIL (no live key in vault)'
    }
    $productionRef = if ($values.ContainsKey('SUPABASE_PRODUCTION_PROJECT_REF')) { $values['SUPABASE_PRODUCTION_PROJECT_REF'] } else { $null }
    if ($productionRef -and $productionRef -match '^[a-z]{20}$') {
      "SUPABASE_PRODUCTION_PROJECT_REF = present"
      Probe 'SUPABASE_PRODUCTION_SERVICE_KEY (read-only HEAD)' "https://$productionRef.supabase.co/rest/v1/billing_subscriptions?select=id&limit=1" @{ apikey = $values['SUPABASE_PRODUCTION_SECRET_KEY']; Authorization = "Bearer $($values['SUPABASE_PRODUCTION_SECRET_KEY'])"; Prefer = 'count=exact' } 'HEAD'
    } else {
      'SUPABASE_PRODUCTION_PROJECT_REF = absent (legacy ref ioodoktlxvvmghyvevgn no longer resolves; store the current ref via the refresh prompt)'
      'SUPABASE_PRODUCTION_SERVICE_KEY = FAIL (no production project ref)'
    }
  }
} finally {
  foreach ($k in @($values.Keys)) { $values[$k] = $null }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
