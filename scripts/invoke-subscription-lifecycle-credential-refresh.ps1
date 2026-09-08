param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml'),
  [switch]$SkipLive,
  # Dot-source with -LibraryOnly to load the functions without prompting (used by
  # scripts/tests/invoke-subscription-lifecycle-credential-refresh.test.ps1 and
  # scripts/check-credential-capabilities.ps1).
  [switch]$LibraryOnly
)
# OWNER-RUN, FOREGROUND ONLY. Refreshes the credentials the subscription
# lifecycle staging pipeline and the read-only live diagnosis need, using the
# established masked-prompt + DPAPI CLIXML vault contract:
#   * Read-Host -AsSecureString for every value (nothing is echoed or logged)
#   * format validation, then a READ-ONLY capability check against the provider
#   * atomic vault promotion (pending file -> verify -> move, ACL preserved)
#   * plaintext-absence check on the serialized vault
# Press Enter on an optional prompt to keep the vault's current value.
#
# Supabase key contract (https://supabase.com/docs/guides/api/api-keys):
#   * modern secret keys (sb_secret_...) are API keys, not JWTs. They travel in
#     the `apikey` header ONLY and are never sent as `Authorization: Bearer`.
#   * "A secret key doesn't work in a browser. Supabase matches on the
#     User-Agent header and returns HTTP 401 Unauthorized." Windows PowerShell's
#     default User-Agent starts with "Mozilla/5.0 (...) WindowsPowerShell/...",
#     which that check treats as a browser, so every request here sends an
#     explicit backend User-Agent.
#   * legacy service_role JWTs (eyJ...) keep the classic contract:
#     `apikey: <jwt>` plus `Authorization: Bearer <jwt>`.
#   * the staging validator is pinned to project gcmuhzxkwvfireyrearl; any other
#     host is refused before a request is made.
#
# Every validator is a ScriptBlock invoked with the plaintext as its only
# argument. Read-OptionalSecret refuses anything that is not a ScriptBlock
# before it reads a value, and never assigns a validator's Boolean result to a
# variable that shares a name with a parameter (PowerShell variable names are
# case-insensitive).
$ErrorActionPreference = 'Stop'
$script:StagingProjectRef = 'gcmuhzxkwvfireyrearl'
$script:StagingRestOrigin = "https://$($script:StagingProjectRef).supabase.co"
$script:BackendUserAgent = 'mathnexa-credential-refresh/1.1 (backend script; Windows PowerShell)'
$script:StripeApiVersion = '2026-07-29.dahlia'
$script:SandboxPriceId = 'price_1TzKso4YQNsZa1pjh5UZvcV7'
# Minimal read used to prove a SECRET key: consumer_accounts revokes anon and
# authenticated access, so a publishable key or a key from another project
# fails here while the service role reads at most one row (never displayed).
$script:SecretKeyProbePath = '/rest/v1/consumer_accounts?select=user_id&limit=1'
# Minimal read used to prove a PUBLISHABLE key (public Auth settings document).
$script:PublishableKeyProbePath = '/auth/v1/settings'
# Stripe LIVE restricted-key probes: one generic LIST endpoint per required read
# permission, limit=1. Paths are LITERAL strings on purpose: in PowerShell `?`
# is a legal variable-name character, so a dollar-variable followed directly by
# ?limit=1 inside a double-quoted string is read as one variable named
# resource?limit (undefined) and produced the request GET /v1/=1 (404).
$script:StripeApiOrigin = 'https://api.stripe.com'
$script:StripeLiveReadProbes = [ordered]@{
  'Webhook Endpoints' = '/v1/webhook_endpoints?limit=1'
  'Subscriptions'     = '/v1/subscriptions?limit=1'
  'Invoices'          = '/v1/invoices?limit=1'
  'Events'            = '/v1/events?limit=1'
  'Customers'         = '/v1/customers?limit=1'
}

function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Assert-ScriptBlockValidator {
  param([string]$Role, [string]$Prompt, $Candidate)
  if ($Candidate -is [scriptblock]) { return }
  $actual = if ($null -eq $Candidate) { 'null' } else { $Candidate.GetType().FullName }
  throw "Credential refresh misconfiguration: the $Role for prompt '$Prompt' must be a ScriptBlock, got $actual. No credential was read."
}

function Read-OptionalSecret {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)]$FormatCheck,
    [Parameter(Mandatory = $true)]$CapabilityCheck
  )
  Assert-ScriptBlockValidator 'format check' $Prompt $FormatCheck
  Assert-ScriptBlockValidator 'capability check' $Prompt $CapabilityCheck
  for ($attempt = 1; $attempt -le 4; $attempt += 1) {
    $secure = Read-Host -Prompt "$Prompt (Enter = keep current)" -AsSecureString
    if ($secure.Length -eq 0) { $secure.Dispose(); return $null }
    $plain = Open-SecureValue $secure
    $accepted = $false
    try {
      $formatOutcome = & $FormatCheck $plain
      if ($formatOutcome -ne $true) { Write-Host '  format rejected'; continue }
      $capabilityOutcome = & $CapabilityCheck $plain
      if ($capabilityOutcome -ne $true) { Write-Host "  capability check failed: $capabilityOutcome"; continue }
      $accepted = $true
      Write-Host '  accepted'
      return $secure
    } finally {
      $plain = $null
      if (-not $accepted) { $secure.Dispose() }
    }
  }
  throw "Credential correction limit reached for '$Prompt'."
}

function Get-HttpFailureStatus {
  param($ErrorRecord)
  $response = $ErrorRecord.Exception.Response
  if ($null -ne $response -and $null -ne $response.StatusCode) { return [int]$response.StatusCode }
  if ($ErrorRecord.Exception.Message -match '\((\d{3})\)') { return [int]$Matches[1] }
  return 0
}

function Http {
  # Read-only request as a backend client. Returns the HTTP status only; the
  # body is discarded and headers are never echoed.
  param([string]$Uri, [hashtable]$Headers, [string]$Method = 'GET')
  try {
    $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -Method $Method -UserAgent $script:BackendUserAgent -UseBasicParsing -TimeoutSec 30
    return [int]$response.StatusCode
  } catch {
    return (Get-HttpFailureStatus $_)
  }
}

function Json {
  param([string]$Uri, [hashtable]$Headers)
  return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Get -UserAgent $script:BackendUserAgent -TimeoutSec 30
}

# --- Supabase key handling ---------------------------------------------------
function Get-SupabaseKeyKind {
  param([string]$Key)
  if ($Key -match '^sb_secret_[A-Za-z0-9_\-]{10,}$') { return 'secret' }
  if ($Key -match '^sb_publishable_[A-Za-z0-9_\-]{10,}$') { return 'publishable' }
  if ($Key -match '^eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$') { return 'legacy-jwt' }
  return 'unknown'
}

function Get-JwtRole {
  # Reads the `role` claim of a legacy JWT locally (no network, nothing printed).
  param([string]$Jwt)
  try {
    $payload = $Jwt.Split('.')[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) { 2 { $payload += '==' } 3 { $payload += '=' } }
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    return [string]$claims.role
  } catch { return '' }
}

function New-SupabaseReadHeaders {
  # Modern keys: apikey only (never Bearer). Legacy JWTs: apikey + Bearer.
  param([string]$Key)
  switch (Get-SupabaseKeyKind $Key) {
    'secret' { return @{ apikey = $Key } }
    'publishable' { return @{ apikey = $Key } }
    'legacy-jwt' { return @{ apikey = $Key; Authorization = "Bearer $Key" } }
    default { throw 'Unsupported Supabase key format.' }
  }
}

function Get-StagingRestUri {
  # Every staging validator URL is built from the pinned staging ref and
  # re-checked, so a production ref in scope or in the vault can never leak in.
  param([string]$Path)
  $uri = "$($script:StagingRestOrigin)$Path"
  $targetHost = ([Uri]$uri).Host
  $expectedHost = "$($script:StagingProjectRef).supabase.co"
  if ($targetHost -ne $expectedHost) { throw "Staging validator refused non-staging host '$targetHost' (expected $expectedHost)." }
  return $uri
}

function Test-StagingSecretKeyFormat {
  param([string]$Key)
  return ((Get-SupabaseKeyKind $Key) -in @('secret', 'legacy-jwt'))
}

function Test-StagingSecretKeyCapability {
  # READ ONLY. Proves the key is accepted by the STAGING project as a secret
  # (service-level) key. Returns $true or a message that never contains the key.
  param([string]$Key)
  $kind = Get-SupabaseKeyKind $Key
  if ($kind -eq 'legacy-jwt') {
    $role = Get-JwtRole $Key
    if ($role -ne 'service_role') { return "legacy JWT role is '$role'; the staging secret must be the service_role JWT or an sb_secret_ key" }
  }
  $status = Http (Get-StagingRestUri $script:SecretKeyProbePath) (New-SupabaseReadHeaders $Key)
  if ($status -ne 200) {
    $strategy = if ($kind -eq 'legacy-jwt') { 'apikey + Authorization Bearer' } else { 'apikey header only' }
    return "PostgREST read returned $status from staging project $($script:StagingProjectRef) ($kind key, $strategy, backend User-Agent). A publishable key, a key from another project, or a revoked key fails here."
  }
  return $true
}

function Test-StagingPublishableKeyFormat {
  param([string]$Key)
  return ((Get-SupabaseKeyKind $Key) -in @('publishable', 'legacy-jwt'))
}

function Test-StagingPublishableKeyCapability {
  # READ ONLY. The PostgREST root (OpenAPI) is not exposed to the anon role on
  # this project, so a publishable key is proven with the public Auth settings
  # read, which answers 200 for any valid key of the project.
  param([string]$Key)
  $status = Http (Get-StagingRestUri $script:PublishableKeyProbePath) (New-SupabaseReadHeaders $Key)
  if ($status -ne 200) { return "Auth settings read returned $status from staging project $($script:StagingProjectRef) (apikey header only, backend User-Agent)" }
  return $true
}

function Test-ProductionSecretKeyCapability {
  # READ ONLY against the production project named by the owner. Same header
  # strategy as staging; the ref comes from this prompt or the vault, never
  # from the staging constant.
  param([string]$Key, [string]$ProjectRef)
  if (-not $ProjectRef) { return 'production project ref is required first' }
  if ($ProjectRef -notmatch '^[a-z]{20}$') { return 'production project ref must be 20 lowercase letters' }
  if ($ProjectRef -eq $script:StagingProjectRef) { return 'that is the STAGING project ref, not production' }
  $kind = Get-SupabaseKeyKind $Key
  if ($kind -eq 'legacy-jwt' -and (Get-JwtRole $Key) -ne 'service_role') { return 'legacy JWT is not a service_role key' }
  $status = Http "https://$ProjectRef.supabase.co$($script:SecretKeyProbePath)" (New-SupabaseReadHeaders $Key)
  if ($status -ne 200) { return "PostgREST read returned $status from production project ($kind key)" }
  return $true
}

# --- Stripe key handling -----------------------------------------------------
function Get-StripeKeyMode {
  # Stripe encodes the mode in the key prefix; live and test can never mix.
  param([string]$Key)
  if ($Key -match '^(sk|rk|pk)_live_[A-Za-z0-9]{8,}$') { return 'live' }
  if ($Key -match '^(sk|rk|pk)_test_[A-Za-z0-9]{8,}$') { return 'test' }
  return 'unknown'
}

function Get-StripeKeyKind {
  param([string]$Key)
  if ($Key -match '^rk_(live|test)_[A-Za-z0-9]{8,}$') { return 'restricted' }
  if ($Key -match '^sk_(live|test)_[A-Za-z0-9]{8,}$') { return 'secret' }
  if ($Key -match '^pk_(live|test)_[A-Za-z0-9]{8,}$') { return 'publishable' }
  return 'unknown'
}

function Invoke-StripeListProbe {
  # READ ONLY GET of one Stripe list endpoint (limit=1) at api.stripe.com.
  # Returns status, the `livemode` flag of the first object (if any) and the
  # object count. Never returns or logs ids, headers, or the key.
  param([string]$Key, [string]$Path)
  $uri = "$($script:StripeApiOrigin)$Path"
  $targetHost = ([Uri]$uri).Host
  if ($targetHost -ne 'api.stripe.com') { throw "Stripe probe refused host '$targetHost'." }
  $headers = @{ Authorization = "Bearer $Key"; 'Stripe-Version' = $script:StripeApiVersion }
  try {
    $response = Invoke-WebRequest -Uri $uri -Headers $headers -Method GET -UserAgent $script:BackendUserAgent -UseBasicParsing -TimeoutSec 30
    $livemode = $null
    $count = $null
    try {
      $body = $response.Content | ConvertFrom-Json
      if ($null -ne $body.data) {
        $items = @($body.data)
        $count = $items.Count
        if ($count -gt 0 -and $null -ne $items[0].livemode) { $livemode = [bool]$items[0].livemode }
      }
    } catch { $livemode = $null }
    return @{ Status = [int]$response.StatusCode; Livemode = $livemode; Count = $count }
  } catch {
    return @{ Status = (Get-HttpFailureStatus $_); Livemode = $null; Count = $null }
  }
}

function Get-StripeProbeVerdict {
  # Maps an HTTP status to a precise, key-free message; $null means success.
  param([int]$Status, [string]$Permission)
  switch ($Status) {
    200 { return $null }
    401 { return "401 from Stripe while listing $Permission`: the key is invalid, expired, or revoked (not a permission problem)" }
    403 { return "403 from Stripe while listing $Permission`: the restricted key lacks the '$Permission' read permission" }
    404 { return "404 from Stripe while listing $Permission`: wrong endpoint or object (validator or API-path defect), NOT a missing permission" }
    0 { return "network failure reaching api.stripe.com while listing $Permission" }
    default { return "unexpected HTTP $Status from Stripe while listing $Permission" }
  }
}

function Test-StripeLiveRestrictedKeyFormat {
  param([string]$Key)
  return ($Key -match '^rk_live_[A-Za-z0-9]{8,}$')
}

function Test-StripeLiveRestrictedKeyCapability {
  # READ ONLY. Proves a LIVE RESTRICTED key can list each resource the live
  # diagnosis reads, and that Stripe answers with live-mode objects.
  param([string]$Key)
  if ((Get-StripeKeyKind $Key) -ne 'restricted') { return 'the live diagnosis key must be a RESTRICTED key (rk_live_...), not a full secret or publishable key' }
  if ((Get-StripeKeyMode $Key) -ne 'live') { return 'the live diagnosis key must be a LIVE-mode key (rk_live_...); test-mode keys are refused at this prompt' }
  $observedLivemode = @()
  foreach ($entry in $script:StripeLiveReadProbes.GetEnumerator()) {
    $probe = Invoke-StripeListProbe -Key $Key -Path $entry.Value
    $verdict = Get-StripeProbeVerdict -Status $probe.Status -Permission $entry.Key
    if ($verdict) { return $verdict }
    if ($null -ne $probe.Livemode) { $observedLivemode += $probe.Livemode }
  }
  if ($observedLivemode -contains $false) { return 'mode mismatch: Stripe returned test-mode objects for a key presented as live' }
  return $true
}

function Invoke-CredentialRefresh {
  param([Parameter(Mandatory = $true)][string]$VaultPath, [switch]$SkipLive)
  if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable. Run scripts/invoke-phase7d-credential-prompt.ps1 first.' }
  $stagingRef = $script:StagingProjectRef
  $stripeHeaders = @{ 'Stripe-Version' = $script:StripeApiVersion }
  $vault = Import-Clixml -LiteralPath $VaultPath
  $updates = @{}
  $pendingPath = "$VaultPath.pending"
  $refreshedNames = @()
  $verified = $null
  $serialized = $null
  try {
    Write-Host ''
    Write-Host 'MathNexa subscription lifecycle credential refresh. Values are never displayed.'
    Write-Host 'Where to get each one:'
    Write-Host '  Supabase personal access token  -> supabase.com/dashboard/account/tokens (starts with sbp_)'
    Write-Host "  Staging secret / publishable key -> project $stagingRef > Settings > API keys (sb_secret_ / sb_publishable_, or the legacy service_role / anon JWT)"
    Write-Host '  Stripe SANDBOX secret key        -> Stripe dashboard, TEST/sandbox mode, Developers > API keys (sk_test_)'
    Write-Host '  Stripe LIVE restricted key       -> Developers > API keys > Create restricted key, READ permissions only (rk_live_)'
    Write-Host '  Production Supabase ref/key      -> the production project ref (from its dashboard URL) and its secret key'
    Write-Host ''

    $token = Read-OptionalSecret -Prompt 'Supabase personal access token (sbp_...)' -FormatCheck { param($v) $v -match '^sbp_[A-Za-z0-9_\-]{16,}$' } -CapabilityCheck {
      param($v)
      $projects = Json 'https://api.supabase.com/v1/projects' @{ Authorization = "Bearer $v" }
      if (-not ($projects | Where-Object { $_.ref -eq $stagingRef })) { return "token valid but staging project $stagingRef not visible" }
      return $true
    }
    if ($token) { $updates['SUPABASE_ACCESS_TOKEN'] = $token }

    $secretKey = Read-OptionalSecret -Prompt 'Staging Supabase secret key (sb_secret_... or legacy service_role JWT)' -FormatCheck { param($v) Test-StagingSecretKeyFormat $v } -CapabilityCheck { param($v) Test-StagingSecretKeyCapability $v }
    if ($secretKey) { $updates['SUPABASE_SECRET_KEY'] = $secretKey }

    $publishable = Read-OptionalSecret -Prompt 'Staging Supabase publishable key (sb_publishable_... or legacy anon JWT)' -FormatCheck { param($v) Test-StagingPublishableKeyFormat $v } -CapabilityCheck { param($v) Test-StagingPublishableKeyCapability $v }
    if ($publishable) { $updates['SUPABASE_PUBLISHABLE_KEY'] = $publishable }

    $dbPassword = Read-OptionalSecret -Prompt 'Staging database password (only if it was reset since 2026-08-02)' -FormatCheck { param($v) $v.Length -ge 16 } -CapabilityCheck { param($v) $true }
    if ($dbPassword) { $updates['SUPABASE_DB_PASSWORD'] = $dbPassword }

    $stripeTest = Read-OptionalSecret -Prompt 'Stripe SANDBOX secret key (sk_test_...)' -FormatCheck { param($v) $v -match '^sk_test_[A-Za-z0-9_]{8,}$' } -CapabilityCheck {
      param($v)
      $balance = Json 'https://api.stripe.com/v1/balance' (@{ Authorization = "Bearer $v" } + $stripeHeaders)
      if ($balance.livemode -ne $false) { return 'key is not a test-mode key' }
      $status = Http "https://api.stripe.com/v1/prices/$($script:SandboxPriceId)" @{ Authorization = "Bearer $v" }
      if ($status -ne 200) { return "sandbox price $($script:SandboxPriceId) not found (HTTP $status): is this the MathNexa sandbox?" }
      return $true
    }
    if ($stripeTest) { $updates['STRIPE_SECRET_KEY'] = $stripeTest }

    $stripeTestPublishable = Read-OptionalSecret -Prompt 'Stripe SANDBOX publishable key (pk_test_...)' -FormatCheck { param($v) $v -match '^pk_test_[A-Za-z0-9_]{8,}$' } -CapabilityCheck { param($v) $true }
    if ($stripeTestPublishable) { $updates['STRIPE_PUBLISHABLE_KEY'] = $stripeTestPublishable }

    if (-not $SkipLive) {
      $liveReadOnly = Read-OptionalSecret -Prompt 'Stripe LIVE RESTRICTED read-only key (rk_live_...) for diagnosis' -FormatCheck { param($v) Test-StripeLiveRestrictedKeyFormat $v } -CapabilityCheck { param($v) Test-StripeLiveRestrictedKeyCapability $v }
      if ($liveReadOnly) { $updates['STRIPE_LIVE_READONLY_KEY'] = $liveReadOnly }

      $productionRef = Read-OptionalSecret -Prompt 'Production Supabase project ref (20 lowercase letters, from the dashboard URL)' -FormatCheck { param($v) $v -match '^[a-z]{20}$' -and $v -ne $stagingRef } -CapabilityCheck {
        param($v)
        $status = Http "https://$v.supabase.co/rest/v1/" @{}
        if ($status -eq 0) { return 'host does not resolve' }
        return $true
      }
      if ($productionRef) {
      # Store the canonical lowercase ref: PowerShell -match is case-insensitive,
      # so a hand-typed mixed-case ref passes the format check, and while DNS
      # tolerates it the pooler username postgres.<ref> does not.
      $normalized = (Open-SecureValue $productionRef).ToLowerInvariant()
      $productionRef.Dispose()
      $productionRef = ConvertTo-SecureString $normalized -AsPlainText -Force
      $normalized = $null
      $updates['SUPABASE_PRODUCTION_PROJECT_REF'] = $productionRef
    }

      $productionSecret = Read-OptionalSecret -Prompt 'Production Supabase secret key (read-only use; sb_secret_... or legacy service_role JWT)' -FormatCheck { param($v) Test-StagingSecretKeyFormat $v } -CapabilityCheck {
        param($v)
        $ref = if ($productionRef) { Open-SecureValue $productionRef } elseif ($vault.Values.PSObject.Properties['SUPABASE_PRODUCTION_PROJECT_REF']) { Open-SecureValue $vault.Values.SUPABASE_PRODUCTION_PROJECT_REF } else { '' }
        Test-ProductionSecretKeyCapability -Key $v -ProjectRef $ref
      }
      if ($productionSecret) { $updates['SUPABASE_PRODUCTION_SECRET_KEY'] = $productionSecret }
    }

    $refreshedNames = @($updates.Keys | Sort-Object)
    # Return the names as plain pipeline output (no comma operator: a wrapped
    # array reaches the caller as a single System.String[] element).
    if ($refreshedNames.Count -eq 0) { return @() }
    $acl = Get-Acl -LiteralPath $VaultPath
    foreach ($name in $refreshedNames) { $vault.Values | Add-Member -MemberType NoteProperty -Name $name -Value $updates[$name] -Force }
    $vault | Export-Clixml -LiteralPath $pendingPath
    $serialized = Get-Content -LiteralPath $pendingPath -Raw
    $verified = Import-Clixml -LiteralPath $pendingPath
    foreach ($name in $refreshedNames) {
      $entry = $verified.Values.PSObject.Properties[$name]
      if ($null -eq $entry -or $entry.Value -isnot [Security.SecureString]) { throw "Vault verification failed for $name" }
      $plain = Open-SecureValue $entry.Value
      try { if ($serialized.Contains($plain)) { throw 'Encrypted vault contains plaintext credential data.' } } finally { $plain = $null }
    }
    Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
    Set-Acl -LiteralPath $VaultPath -AclObject $acl
    return [string[]]$refreshedNames
  } finally {
    Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
    $serialized = $null
    if ($null -ne $verified) { foreach ($entry in $verified.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } } }
    foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
    foreach ($k in @($updates.Keys)) { if ($updates[$k] -is [IDisposable]) { $updates[$k].Dispose() } }
    $vault = $null; $verified = $null; $updates = $null
  }
}

if (-not $LibraryOnly) {
  $refreshed = @(Invoke-CredentialRefresh -VaultPath $VaultPath -SkipLive:$SkipLive)
  if ($refreshed.Count -eq 0) {
    Write-Host 'No changes.'
  } else {
    Write-Host ''
    Write-Host ("REFRESHED: " + ($refreshed -join ', '))
    Write-Host 'Next: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-credential-capabilities.ps1 -IncludeLive'
  }
}
