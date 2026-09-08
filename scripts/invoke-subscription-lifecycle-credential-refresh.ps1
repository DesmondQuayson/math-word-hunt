param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml'),
  [switch]$SkipLive,
  # Dot-source with -LibraryOnly to load the functions without prompting (used by
  # scripts/tests/invoke-subscription-lifecycle-credential-refresh.test.ps1).
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
# Every validator is a ScriptBlock invoked with the plaintext as its only
# argument. Read-OptionalSecret refuses anything that is not a ScriptBlock
# before it reads a value, and never assigns a validator's Boolean result to a
# variable that shares a name with a parameter (PowerShell variable names are
# case-insensitive; that collision is what broke the first version).
$ErrorActionPreference = 'Stop'
$script:StagingProjectRef = 'gcmuhzxkwvfireyrearl'
$script:StripeApiVersion = '2026-07-29.dahlia'
$script:SandboxPriceId = 'price_1TzKso4YQNsZa1pjh5UZvcV7'

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

function Http {
  param([string]$Uri, [hashtable]$Headers, [string]$Method = 'GET')
  try {
    $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -Method $Method -UseBasicParsing -TimeoutSec 30
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  }
}

function Json {
  param([string]$Uri, [hashtable]$Headers)
  return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Get -TimeoutSec 30
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
    Write-Host "  Staging secret / publishable key -> project $stagingRef > Settings > API keys"
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

    $secretKey = Read-OptionalSecret -Prompt 'Staging Supabase secret key (sb_secret_... or service_role JWT)' -FormatCheck { param($v) $v -match '^(sb_secret_[A-Za-z0-9_\-]{10,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)$' } -CapabilityCheck {
      param($v)
      $status = Http "https://$stagingRef.supabase.co/rest/v1/billing_subscriptions?select=id&limit=1" @{ apikey = $v; Authorization = "Bearer $v" } 'HEAD'
      if ($status -ne 200) { return "PostgREST HEAD returned $status" }
      return $true
    }
    if ($secretKey) { $updates['SUPABASE_SECRET_KEY'] = $secretKey }

    $publishable = Read-OptionalSecret -Prompt 'Staging Supabase publishable key (sb_publishable_... or anon JWT)' -FormatCheck { param($v) $v -match '^(sb_publishable_[A-Za-z0-9_\-]{10,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)$' } -CapabilityCheck {
      param($v)
      $status = Http "https://$stagingRef.supabase.co/rest/v1/" @{ apikey = $v }
      if ($status -ne 200) { return "PostgREST root returned $status" }
      return $true
    }
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
      $liveReadOnly = Read-OptionalSecret -Prompt 'Stripe LIVE RESTRICTED read-only key (rk_live_...) for diagnosis' -FormatCheck { param($v) $v -match '^rk_live_[A-Za-z0-9_]{8,}$' } -CapabilityCheck {
        param($v)
        $status = Http 'https://api.stripe.com/v1/webhook_endpoints?limit=1' (@{ Authorization = "Bearer $v" } + $stripeHeaders)
        if ($status -ne 200) { return "webhook_endpoints read returned $status (grant Webhook Endpoints: read)" }
        foreach ($resource in @('subscriptions', 'invoices', 'events', 'customers')) {
          $status = Http "https://api.stripe.com/v1/$resource?limit=1" (@{ Authorization = "Bearer $v" } + $stripeHeaders)
          if ($status -ne 200) { return "$resource read returned $status (grant read permission)" }
        }
        return $true
      }
      if ($liveReadOnly) { $updates['STRIPE_LIVE_READONLY_KEY'] = $liveReadOnly }

      $productionRef = Read-OptionalSecret -Prompt 'Production Supabase project ref (20 lowercase letters, from the dashboard URL)' -FormatCheck { param($v) $v -match '^[a-z]{20}$' } -CapabilityCheck {
        param($v)
        $status = Http "https://$v.supabase.co/rest/v1/" @{}
        if ($status -eq 0) { return 'host does not resolve' }
        return $true
      }
      if ($productionRef) { $updates['SUPABASE_PRODUCTION_PROJECT_REF'] = $productionRef }

      $productionSecret = Read-OptionalSecret -Prompt 'Production Supabase secret key (read-only use; sb_secret_... or service_role JWT)' -FormatCheck { param($v) $v -match '^(sb_secret_[A-Za-z0-9_\-]{10,}|eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)$' } -CapabilityCheck {
        param($v)
        $ref = if ($productionRef) { Open-SecureValue $productionRef } elseif ($vault.Values.PSObject.Properties['SUPABASE_PRODUCTION_PROJECT_REF']) { Open-SecureValue $vault.Values.SUPABASE_PRODUCTION_PROJECT_REF } else { $null }
        if (-not $ref) { return 'production project ref is required first' }
        $status = Http "https://$ref.supabase.co/rest/v1/billing_subscriptions?select=id&limit=1" @{ apikey = $v; Authorization = "Bearer $v" } 'HEAD'
        if ($status -ne 200) { return "PostgREST HEAD returned $status" }
        return $true
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
