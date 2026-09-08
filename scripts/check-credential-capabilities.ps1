param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml'),
  [switch]$IncludeLive
)
# Capability check for the process-only credential vault. Prints PASS/FAIL per
# capability and HTTP status codes only. Never prints, logs, hashes, or persists
# a credential value. Every probe is a read (GET); nothing is written anywhere.
# Live-mode probes run only with -IncludeLive and prefer the RESTRICTED
# read-only Stripe key when the vault has one.
#
# Supabase probes reuse the refresh script's key handling: modern sb_secret_ /
# sb_publishable_ keys travel in the apikey header only, legacy JWTs as
# apikey + Bearer, and every request carries a backend User-Agent because the
# gateway rejects secret keys presented with a browser-like User-Agent
# (Windows PowerShell's default starts with "Mozilla/5.0").
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
. (Join-Path $PSScriptRoot 'invoke-subscription-lifecycle-credential-refresh.ps1') -LibraryOnly -VaultPath $VaultPath

function Probe {
  param([string]$Label, [string]$Uri, [hashtable]$Headers, [string]$Method = 'GET', [scriptblock]$Inspect = $null)
  try {
    $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -Method $Method -UserAgent $script:BackendUserAgent -UseBasicParsing -TimeoutSec 30
    $detail = ''
    if ($Inspect) { $detail = ' ' + (& $Inspect $response) }
    "$Label = PASS (HTTP $($response.StatusCode))$detail"
  } catch {
    $status = Get-HttpFailureStatus $_
    "$Label = FAIL (HTTP $(if ($status -eq 0) { 'network' } else { $status }))"
  }
}
function Describe-SupabaseKey {
  param([string]$Key)
  switch (Get-SupabaseKeyKind $Key) {
    'secret' { return 'modern secret key (apikey header only)' }
    'publishable' { return 'modern publishable key (apikey header only)' }
    'legacy-jwt' { return "legacy JWT role=$(Get-JwtRole $Key) (apikey + Bearer)" }
    default { return 'unrecognized format' }
  }
}
$stagingRef = $script:StagingProjectRef
$stripeVersion = @{ 'Stripe-Version' = $script:StripeApiVersion }
$vault = Import-Clixml -LiteralPath $VaultPath
$values = @{}
try {
  foreach ($entry in $vault.Values.PSObject.Properties) { $values[$entry.Name] = Open-SecureValue $entry.Value }
  "VAULT_MODIFIED = $((Get-Item -LiteralPath $VaultPath).LastWriteTime.ToString('u'))"
  "VAULT_ENTRIES = $(($values.Keys | Sort-Object) -join ', ')"
  "REQUEST_USER_AGENT = $($script:BackendUserAgent)"
  $stripeTest = $values['STRIPE_SECRET_KEY']
  "STRIPE_TEST_KEY_FORMAT = $(if ($stripeTest -match '^sk_test_') { 'sk_test (sandbox)' } elseif ($stripeTest) { 'NOT TEST MODE' } else { 'missing' })"
  Probe 'SUPABASE_STAGING_MANAGEMENT_TOKEN' 'https://api.supabase.com/v1/projects' @{ Authorization = "Bearer $($values['SUPABASE_ACCESS_TOKEN'])" } 'GET' {
    param($r) $projects = $r.Content | ConvertFrom-Json; $staging = $projects | Where-Object { $_.ref -eq $stagingRef }
    if ($staging) { "staging visible: name=$($staging.name) region=$($staging.region) status=$($staging.status)" } else { 'staging project NOT visible' }
  }
  $stagingSecret = $values['SUPABASE_SECRET_KEY']
  "SUPABASE_STAGING_SECRET_KEY_KIND = $(Describe-SupabaseKey $stagingSecret)"
  if ((Get-SupabaseKeyKind $stagingSecret) -ne 'unknown') {
    Probe 'SUPABASE_STAGING_SERVICE_KEY' (Get-StagingRestUri $script:SecretKeyProbePath) (New-SupabaseReadHeaders $stagingSecret)
  } else {
    'SUPABASE_STAGING_SERVICE_KEY = FAIL (unrecognized key format)'
  }
  if ($values.ContainsKey('SUPABASE_PUBLISHABLE_KEY')) {
    "SUPABASE_STAGING_PUBLISHABLE_KEY_KIND = $(Describe-SupabaseKey $values['SUPABASE_PUBLISHABLE_KEY'])"
    Probe 'SUPABASE_STAGING_PUBLISHABLE_KEY' (Get-StagingRestUri $script:PublishableKeyProbePath) (New-SupabaseReadHeaders $values['SUPABASE_PUBLISHABLE_KEY'])
  }
  if ($stripeTest -match '^sk_test_') {
    Probe 'STRIPE_TEST_MODE_AUTH' 'https://api.stripe.com/v1/balance' (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion) 'GET' { param($r) "livemode=$(($r.Content | ConvertFrom-Json).livemode)" }
    Probe 'STRIPE_SANDBOX_PRICE' "https://api.stripe.com/v1/prices/$($script:SandboxPriceId)" (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion) 'GET' { param($r) $p = $r.Content | ConvertFrom-Json; "unit_amount=$($p.unit_amount) $($p.currency) interval=$($p.recurring.interval) product_match=$($p.product -eq 'prod_UzJVhdFFd8lNed')" }
    Probe 'STRIPE_SANDBOX_PORTAL' 'https://api.stripe.com/v1/billing_portal/configurations/bpc_1TzLQf4YQNsZa1pjhn4FayQy' (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion)
    Probe 'STRIPE_SANDBOX_WEBHOOK_ENDPOINTS' 'https://api.stripe.com/v1/webhook_endpoints?limit=100' (@{ Authorization = "Bearer $stripeTest" } + $stripeVersion) 'GET' {
      param($r) $list = ($r.Content | ConvertFrom-Json).data
      $staging = @($list | Where-Object { $_.url -like 'https://mathnexa-platform-staging.vercel.app/*' })
      "total=$($list.Count) staging_host_endpoints=$($staging.Count)" + $(if ($staging.Count -gt 0) { " api_version=$($staging[0].api_version) status=$($staging[0].status) events=$($staging[0].enabled_events.Count)" } else { '' })
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
    $productionRef = if ($values.ContainsKey('SUPABASE_PRODUCTION_PROJECT_REF')) { $values['SUPABASE_PRODUCTION_PROJECT_REF'].ToLowerInvariant() } else { $null }
    if ($productionRef -and $productionRef -match '^[a-z]{20}$' -and $productionRef -ne $stagingRef) {
      'SUPABASE_PRODUCTION_PROJECT_REF = present'
      $productionSecret = $values['SUPABASE_PRODUCTION_SECRET_KEY']
      "SUPABASE_PRODUCTION_SECRET_KEY_KIND = $(Describe-SupabaseKey $productionSecret)"
      if ((Get-SupabaseKeyKind $productionSecret) -ne 'unknown') {
        Probe 'SUPABASE_PRODUCTION_SERVICE_KEY (read-only GET)' "https://$productionRef.supabase.co$($script:SecretKeyProbePath)" (New-SupabaseReadHeaders $productionSecret)
      } else {
        'SUPABASE_PRODUCTION_SERVICE_KEY = FAIL (unrecognized key format)'
      }
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
