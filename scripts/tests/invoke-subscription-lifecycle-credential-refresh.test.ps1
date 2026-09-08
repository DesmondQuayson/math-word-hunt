# Local test for scripts/invoke-subscription-lifecycle-credential-refresh.ps1.
#
# Uses FAKE values only. Read-Host, Invoke-RestMethod and Invoke-WebRequest are
# shadowed by mocks defined below, so no provider is contacted, and the vault
# under test is a temporary file: the real vault in %USERPROFILE% is never read
# or written. Mocks record request shape (method, URL, header NAMES, User-Agent)
# and never store header values. Run with:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tests\invoke-subscription-lifecycle-credential-refresh.test.ps1
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'invoke-subscription-lifecycle-credential-refresh.ps1'
. $scriptPath -LibraryOnly

$script:PromptQueue = New-Object 'System.Collections.Generic.Queue[string]'
$script:PromptLog = @()
$script:RestCalls = @()
$script:WebRequests = @()
$script:AcceptedSupabaseKeys = @()
$script:Failures = 0
$script:Passes = 0

function Read-Host {
  param([string]$Prompt, [switch]$AsSecureString)
  $script:PromptLog += $Prompt
  $value = if ($script:PromptQueue.Count -gt 0) { $script:PromptQueue.Dequeue() } else { '' }
  if ([string]::IsNullOrEmpty($value)) { return (New-Object System.Security.SecureString) }
  return (ConvertTo-SecureString $value -AsPlainText -Force)
}
function Invoke-RestMethod {
  param($Uri, $Headers, $Method, $TimeoutSec, $UserAgent)
  $script:RestCalls += [string]$Uri
  if ($Uri -like 'https://api.supabase.com/v1/projects*') {
    return @([pscustomobject]@{ ref = 'gcmuhzxkwvfireyrearl'; name = 'mathnexa-platform-staging' }, [pscustomobject]@{ ref = 'zzzzzzzzzzzzzzzzzzzz'; name = 'other' })
  }
  if ($Uri -like 'https://api.stripe.com/v1/balance*') { return [pscustomobject]@{ livemode = $false } }
  throw "unexpected REST call $Uri"
}
# Stripe mock rules: first rule whose Key matches the Bearer key and whose PathLike matches the URL wins.
# Status 200 returns Content; any other status throws a PowerShell 5.1-style WebException.
$script:StripeRules = @()
$script:StripeDefaultListContent = '{"object":"list","data":[{"id":"sub_FAKEFAKEFAKEFAKE","object":"subscription","livemode":true,"customer":"cus_FAKEFAKEFAKE"}],"has_more":false,"url":"/v1/x"}'
function Set-StripeRule { param([string]$Key, [string]$PathLike, [int]$Status, [string]$Content = '') $script:StripeRules += [pscustomobject]@{ Key = $Key; PathLike = $PathLike; Status = $Status; Content = $Content } }
function Invoke-WebRequest {
  # Simulates the Supabase gateway and Stripe. Supabase: 200 only when the
  # apikey header carries an accepted fake key; otherwise a PowerShell 5.1-style
  # WebException for HTTP 401. Stripe: rule table above, default 200 list body.
  param($Uri, $Headers, $Method, [switch]$UseBasicParsing, $TimeoutSec, $UserAgent)
  $headerNames = @()
  if ($Headers) { $headerNames = @($Headers.Keys | Sort-Object) }
  $apikey = if ($Headers -and $Headers.ContainsKey('apikey')) { [string]$Headers['apikey'] } else { $null }
  $bearer = if ($Headers -and $Headers.ContainsKey('Authorization')) { [string]$Headers['Authorization'] } else { $null }
  $bearerKey = if ($bearer) { $bearer -replace '^Bearer ', '' } else { $null }
  $script:WebRequests += [pscustomobject]@{
    Method = [string]$Method; Uri = [string]$Uri; Host = ([Uri]$Uri).Host; HeaderNames = $headerNames; UserAgent = [string]$UserAgent
    ApiKeyAccepted = ($null -ne $apikey -and $script:AcceptedSupabaseKeys -contains $apikey)
    BearerMatchesApiKey = ($null -ne $bearer -and $null -ne $apikey -and $bearer -eq "Bearer $apikey")
    BearerIsFakeLiveRestricted = ($null -ne $bearerKey -and $bearerKey -eq $fakeLiveReadOnly)
    StripeVersion = if ($Headers -and $Headers.ContainsKey('Stripe-Version')) { [string]$Headers['Stripe-Version'] } else { $null }
  }
  if ($Uri -like '*.supabase.co/*') {
    if ($null -ne $apikey -and $script:AcceptedSupabaseKeys -contains $apikey) { return [pscustomobject]@{ StatusCode = 200; Content = '{}' } }
    throw (New-Object System.Net.WebException 'The remote server returned an error: (401) Unauthorized.')
  }
  if ($Uri -like 'https://api.stripe.com/*') {
    $rule = $script:StripeRules | Where-Object { $_.Key -eq $bearerKey -and $Uri -like $_.PathLike } | Select-Object -First 1
    if ($rule) {
      if ($rule.Status -eq 200) { return [pscustomobject]@{ StatusCode = 200; Content = $rule.Content } }
      throw (New-Object System.Net.WebException "The remote server returned an error: ($($rule.Status)) Stripe.")
    }
    if ($Uri -like '*limit=1*') { return [pscustomobject]@{ StatusCode = 200; Content = $script:StripeDefaultListContent } }
    return [pscustomobject]@{ StatusCode = 200; Content = '{}' }
  }
  return [pscustomobject]@{ StatusCode = 200; Content = '{}' }
}
# Always pass precomputed strings: inside an array literal the comma binds
# tighter than +, so 'a' + ('b'), 'c' would split into extra queue items.
function Queue { param([string[]]$Values) $script:PromptQueue.Clear(); foreach ($value in $Values) { $script:PromptQueue.Enqueue($value) } }
function Assert-QueueDrained { param([string]$Name) Assert ($script:PromptQueue.Count -eq 0) "$Name consumed every queued prompt value" }
function Assert {
  param([bool]$Condition, [string]$Name)
  if ($Condition) { $script:Passes += 1; Write-Host "PASS  $Name" } else { $script:Failures += 1; Write-Host "FAIL  $Name" }
}
function Plain { param([Security.SecureString]$Secure) return (Open-SecureValue $Secure) }
function Base64Url { param([string]$Text) return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Text)).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
function FakeJwt { param([string]$Role) return ((Base64Url '{"alg":"HS256","typ":"JWT"}') + '.' + (Base64Url ('{"iss":"supabase","ref":"gcmuhzxkwvfireyrearl","role":"' + $Role + '","iat":1,"exp":2}')) + '.' + (Base64Url 'fake-signature-not-verified')) }
function LastSupabaseRequest { return @($script:WebRequests | Where-Object { $_.Host -like '*.supabase.co' })[-1] }

$fakeToken = 'sbp_' + ('A' * 40)
$fakeStagingSecret = 'sb_secret_' + ('B' * 30)
$fakeStagingPublishable = 'sb_publishable_' + ('P' * 30)
$fakeLegacyServiceRole = FakeJwt 'service_role'
$fakeLegacyAnon = FakeJwt 'anon'
$fakeInvalidSecret = 'sb_secret_' + ('Z' * 30)
$fakeStripeTest = 'sk_test_' + ('C' * 24)
$fakeLiveReadOnly = 'rk_live_' + ('D' * 24)
$fakeProductionRef = 'abcdefghijklmnopqrst'
$fakeProductionSecret = 'sb_secret_' + ('E' * 30)
$fakeExisting = 'existing-fake-value-' + ('F' * 20)
$fakeRejectedToken = 'sbp_' + ('X' * 40)
$fakeLiveInvalid = 'rk_live_' + ('I' * 24)
$fakeLiveNoSubscriptions = 'rk_live_' + ('N' * 24)
$fakeLiveWrongEndpoint = 'rk_live_' + ('W' * 24)
$fakeLiveTestObjects = 'rk_live_' + ('T' * 24)
$fakeLiveEmptyLists = 'rk_live_' + ('M' * 24)
$fakeTestRestricted = 'rk_test_' + ('R' * 24)
$fakeLiveFullSecret = 'sk_live_' + ('S' * 24)
$allFakeSecrets = @($fakeToken, $fakeStagingSecret, $fakeStagingPublishable, $fakeLegacyServiceRole, $fakeLegacyAnon, $fakeInvalidSecret, $fakeStripeTest, $fakeLiveReadOnly, $fakeProductionSecret, $fakeExisting, $fakeRejectedToken, $fakeLiveInvalid, $fakeLiveNoSubscriptions, $fakeLiveWrongEndpoint, $fakeLiveTestObjects, $fakeLiveEmptyLists, $fakeTestRestricted, $fakeLiveFullSecret)
$script:AcceptedSupabaseKeys = @($fakeStagingSecret, $fakeStagingPublishable, $fakeLegacyServiceRole, $fakeProductionSecret)
$stagingHost = 'gcmuhzxkwvfireyrearl.supabase.co'

# --- 1. Regression: a capability check that returns $true must yield a SecureString (the original cast bug).
Queue @($fakeToken)
$result = Read-OptionalSecret -Prompt 'token' -FormatCheck { param($v) $v -match '^sbp_' } -CapabilityCheck { param($v) $true }
Assert ($result -is [Security.SecureString]) 'accepted capability check returns a SecureString instead of throwing a ScriptBlock cast error'
Assert ((Plain $result) -eq $fakeToken) 'accepted SecureString decrypts to the entered value'
$result.Dispose()

# --- 2. Guard: validators that are not ScriptBlocks fail with a clear message before any prompt.
$promptsBefore = $script:PromptLog.Count
$guardMessage = ''
try { Read-OptionalSecret -Prompt 'guarded' -FormatCheck $true -CapabilityCheck { param($v) $true } | Out-Null } catch { $guardMessage = $_.Exception.Message }
Assert ($guardMessage -like '*format check*must be a ScriptBlock*System.Boolean*') "Boolean format check rejected with a clear message: $guardMessage"
try { $guardMessage = ''; Read-OptionalSecret -Prompt 'guarded' -FormatCheck { param($v) $true } -CapabilityCheck $false | Out-Null } catch { $guardMessage = $_.Exception.Message }
Assert ($guardMessage -like '*capability check*must be a ScriptBlock*System.Boolean*') "Boolean capability check rejected with a clear message: $guardMessage"
try { $guardMessage = ''; Read-OptionalSecret -Prompt 'guarded' -FormatCheck { param($v) $true } -CapabilityCheck 'not a block' | Out-Null } catch { $guardMessage = $_.Exception.Message }
Assert ($guardMessage -like '*must be a ScriptBlock*System.String*') 'String capability check rejected with a clear message'
Assert ($script:PromptLog.Count -eq $promptsBefore) 'guard fires before Read-Host is called (no credential read)'

# --- 3. Retry path: format rejection, then capability rejection, then acceptance.
Queue @('bad-format', $fakeRejectedToken, $fakeToken)
$promptsBefore = $script:PromptLog.Count
$result = Read-OptionalSecret -Prompt 'retry' -FormatCheck { param($v) $v -match '^sbp_' } -CapabilityCheck { param($v) if ($v -eq $fakeRejectedToken) { return 'rejected by provider' }; return $true }
Assert (($script:PromptLog.Count - $promptsBefore) -eq 3) 're-prompts after format and capability rejections'
Assert ((Plain $result) -eq $fakeToken) 'third attempt accepted'
Assert-QueueDrained 'retry test'
$result.Dispose()

# --- 4. Enter keeps the current value.
Queue @('')
$result = Read-OptionalSecret -Prompt 'skip' -FormatCheck { param($v) $true } -CapabilityCheck { param($v) $true }
Assert ($null -eq $result) 'empty entry returns $null (keep current value)'
Assert-QueueDrained 'skip test'

# --- A. Modern sb_secret key succeeds: apikey header only, backend User-Agent, GET on the staging probe.
$script:WebRequests = @()
$outcome = Test-StagingSecretKeyCapability $fakeStagingSecret
Assert ($outcome -eq $true) 'A: modern sb_secret key is accepted'
$request = LastSupabaseRequest
Assert ($request.Method -eq 'GET') 'A: capability probe is a GET (minimal read, not HEAD)'
Assert ($request.Uri -eq "https://$stagingHost/rest/v1/consumer_accounts?select=user_id&limit=1") "A: probe URL is the staging PostgREST read: $($request.Uri)"
Assert (($request.HeaderNames -join ',') -eq 'apikey') "A: sb_secret travels in the apikey header only (headers: $($request.HeaderNames -join ','))"
Assert (-not $request.BearerMatchesApiKey) 'A: sb_secret is never sent as Authorization: Bearer'
Assert ($request.UserAgent -eq $script:BackendUserAgent -and $request.UserAgent -notlike 'Mozilla*') "A: backend User-Agent sent, not a browser one: $($request.UserAgent)"
Assert ((Get-SupabaseKeyKind $fakeStagingSecret) -eq 'secret') 'A: key kind detected as modern secret without JWT decoding'

# --- B. Legacy service_role JWT succeeds with apikey + Bearer; anon JWT is rejected with a role message.
$script:WebRequests = @()
$outcome = Test-StagingSecretKeyCapability $fakeLegacyServiceRole
Assert ($outcome -eq $true) 'B: legacy service_role JWT is accepted'
$request = LastSupabaseRequest
Assert ($request.HeaderNames.Count -eq 2 -and ($request.HeaderNames -contains 'apikey') -and ($request.HeaderNames -contains 'Authorization') -and $request.BearerMatchesApiKey) "B: legacy JWT travels as apikey + Authorization: Bearer <jwt> (headers: $($request.HeaderNames -join ','))"
Assert ($request.UserAgent -eq $script:BackendUserAgent) 'B: legacy path also uses the backend User-Agent'
$requestsBefore = $script:WebRequests.Count
$outcome = Test-StagingSecretKeyCapability $fakeLegacyAnon
Assert ($outcome -like "*role is 'anon'*") "B: anon JWT rejected locally with a role message: $outcome"
Assert ($script:WebRequests.Count -eq $requestsBefore) 'B: anon JWT rejection makes no network request'
Assert ((Test-StagingSecretKeyFormat $fakeStagingPublishable) -eq $false) 'B: publishable key fails the secret-key format check'

# --- C. Invalid key gives a controlled 401 message without the key.
$outcome = Test-StagingSecretKeyCapability $fakeInvalidSecret
Assert ($outcome -like 'PostgREST read returned 401 from staging project gcmuhzxkwvfireyrearl (secret key, apikey header only, backend User-Agent)*') "C: invalid key yields the controlled 401 message: $outcome"
Assert (-not ([string]$outcome).Contains($fakeInvalidSecret)) 'C: 401 message does not contain the key'
Assert ((Get-HttpFailureStatus ([System.Management.Automation.ErrorRecord]::new((New-Object System.Net.WebException 'The remote server returned an error: (401) Unauthorized.'), 'x', 'InvalidOperation', $null))) -eq 401) 'C: PowerShell 5.1 WebException message maps to status 401'

# --- D. Staging validation always targets the staging ref.
$script:WebRequests = @()
Test-StagingSecretKeyCapability $fakeStagingSecret | Out-Null
Test-StagingSecretKeyCapability $fakeLegacyServiceRole | Out-Null
Test-StagingPublishableKeyCapability $fakeStagingPublishable | Out-Null
Test-StagingSecretKeyCapability $fakeInvalidSecret | Out-Null
$hosts = @($script:WebRequests | ForEach-Object { $_.Host } | Sort-Object -Unique)
Assert ($hosts.Count -eq 1 -and $hosts[0] -eq $stagingHost) "D: every staging validation request targets $stagingHost (seen: $($hosts -join ','))"
Assert (@($script:WebRequests | Where-Object { $_.Uri -notlike "https://$stagingHost/rest/v1/*" -and $_.Uri -ne "https://$stagingHost/auth/v1/settings" }).Count -eq 0) 'D: every staging validation URL is a staging PostgREST or Auth-settings read'
$publishableProbe = @($script:WebRequests | Where-Object { $_.Uri -eq "https://$stagingHost/auth/v1/settings" })
Assert ($publishableProbe.Count -eq 1 -and $publishableProbe[0].Method -eq 'GET' -and (($publishableProbe[0].HeaderNames -join ',') -eq 'apikey') -and $publishableProbe[0].UserAgent -eq $script:BackendUserAgent) 'D: publishable key proven with GET /auth/v1/settings, apikey header only, backend User-Agent'

# --- E. A production ref in scope or in the vault can never reach the staging validator.
$script:WebRequests = @()
$productionRef = ConvertTo-SecureString $fakeProductionRef -AsPlainText -Force
$vault = [pscustomobject]@{ Values = [pscustomobject]@{ SUPABASE_PRODUCTION_PROJECT_REF = (ConvertTo-SecureString $fakeProductionRef -AsPlainText -Force) } }
$outcome = Test-StagingSecretKeyCapability $fakeStagingSecret
Assert ($outcome -eq $true -and (LastSupabaseRequest).Host -eq $stagingHost) 'E: staging validator ignores a production ref in scope and in the vault'
Assert (@($script:WebRequests | Where-Object { $_.Host -like "$fakeProductionRef*" }).Count -eq 0) 'E: no staging validation request touched the production host'
$savedOrigin = $script:StagingRestOrigin
$script:StagingRestOrigin = "https://$fakeProductionRef.supabase.co"
$refusal = ''
try { Get-StagingRestUri '/rest/v1/' | Out-Null } catch { $refusal = $_.Exception.Message }
$script:StagingRestOrigin = $savedOrigin
Assert ($refusal -like "*refused non-staging host '$fakeProductionRef.supabase.co'*") "E: a tampered staging origin is refused before any request: $refusal"
$outcome = Test-ProductionSecretKeyCapability -Key $fakeProductionSecret -ProjectRef 'gcmuhzxkwvfireyrearl'
Assert ($outcome -like '*STAGING project ref, not production*') 'E: production validator refuses the staging ref'
$productionRef.Dispose(); Remove-Variable productionRef; Remove-Variable vault

# --- G. Stripe LIVE restricted key validator.
$stripeLiveEndpoints = @('https://api.stripe.com/v1/webhook_endpoints?limit=1', 'https://api.stripe.com/v1/subscriptions?limit=1', 'https://api.stripe.com/v1/invoices?limit=1', 'https://api.stripe.com/v1/events?limit=1', 'https://api.stripe.com/v1/customers?limit=1')
# G1. live restricted key with every read permission succeeds; requests are the literal list endpoints.
$script:WebRequests = @(); $script:StripeRules = @()
$outcome = Test-StripeLiveRestrictedKeyCapability $fakeLiveReadOnly
Assert ($outcome -eq $true) 'G1: live restricted key with Subscriptions read (and the other reads) is accepted'
$stripeRequests = @($script:WebRequests | Where-Object { $_.Host -eq 'api.stripe.com' })
Assert (($stripeRequests | ForEach-Object { $_.Uri }) -join ' ' -eq ($stripeLiveEndpoints -join ' ')) "G1: probes are exactly the five literal list endpoints in order (got: $(($stripeRequests | ForEach-Object { $_.Uri -replace 'https://api.stripe.com', '' }) -join ' '))"
Assert (@($stripeRequests | Where-Object { $_.Uri -eq 'https://api.stripe.com/v1/subscriptions?limit=1' }).Count -eq 1) 'G1: the Subscriptions check is GET /v1/subscriptions?limit=1 (regression: a dollar-variable followed by ?limit=1 used to request /v1/=1)'
Assert (($stripeRequests | Where-Object { $_.Uri -like '*/v1/=1*' -or $_.Uri -like '*/v1/limit=1*' }).Count -eq 0) 'G1: no malformed /v1/=1 request is made'
Assert (($stripeRequests | Where-Object { $_.Method -ne 'GET' }).Count -eq 0) 'G1: every Stripe probe is a GET (read only)'
Assert (($stripeRequests | Where-Object { -not $_.BearerIsFakeLiveRestricted }).Count -eq 0) 'G1: the live restricted key is sent as the Bearer credential to every probe'
Assert (($stripeRequests | Where-Object { $_.StripeVersion -ne '2026-07-29.dahlia' }).Count -eq 0) 'G1: every probe pins the runtime Stripe-Version'
Assert (($stripeRequests | Where-Object { $_.UserAgent -ne $script:BackendUserAgent }).Count -eq 0) 'G1: every probe uses the backend User-Agent'
Assert (($script:WebRequests | Where-Object { $_.Host -ne 'api.stripe.com' }).Count -eq 0) 'G1: the live validator contacts only api.stripe.com'
# G2. empty subscription list still succeeds.
$script:WebRequests = @(); $script:StripeRules = @()
Set-StripeRule -Key $fakeLiveEmptyLists -PathLike 'https://api.stripe.com/v1/*' -Status 200 -Content '{"object":"list","data":[],"has_more":false}'
$outcome = Test-StripeLiveRestrictedKeyCapability $fakeLiveEmptyLists
Assert ($outcome -eq $true) 'G2: empty lists (no subscriptions, invoices, events, customers, endpoints) still pass the permission check'
# G3. invalid or expired key -> 401 classified as key problem, never as missing permission.
$script:StripeRules = @()
Set-StripeRule -Key $fakeLiveInvalid -PathLike 'https://api.stripe.com/v1/*' -Status 401
$outcome = Test-StripeLiveRestrictedKeyCapability $fakeLiveInvalid
Assert ($outcome -like '401 from Stripe while listing Webhook Endpoints: the key is invalid, expired, or revoked*') "G3: 401 classified as invalid/expired key: $outcome"
Assert ($outcome -notlike '*grant*' -and $outcome -notlike '*lacks*') 'G3: 401 is not described as a permission problem'
# G4. permission denial -> 403 names the missing permission.
$script:StripeRules = @()
Set-StripeRule -Key $fakeLiveNoSubscriptions -PathLike 'https://api.stripe.com/v1/subscriptions*' -Status 403
$outcome = Test-StripeLiveRestrictedKeyCapability $fakeLiveNoSubscriptions
Assert ($outcome -like "403 from Stripe while listing Subscriptions: the restricted key lacks the 'Subscriptions' read permission") "G4: 403 classified as missing permission: $outcome"
# G5. 404 is a wrong endpoint/object, never mislabeled as a missing permission.
$script:StripeRules = @()
Set-StripeRule -Key $fakeLiveWrongEndpoint -PathLike 'https://api.stripe.com/v1/subscriptions*' -Status 404
$outcome = Test-StripeLiveRestrictedKeyCapability $fakeLiveWrongEndpoint
Assert ($outcome -like '404 from Stripe while listing Subscriptions: wrong endpoint or object*NOT a missing permission*') "G5: 404 classified as endpoint/object mismatch: $outcome"
Assert ($outcome -notlike '*grant read permission*' -and $outcome -notlike '*lacks*') 'G5: 404 never says "grant read permission"'
Assert ((Get-StripeProbeVerdict -Status 200 -Permission 'Subscriptions') -eq $null) 'G5: 200 is success (no verdict message)'
# G6. test/live mode cannot be mixed.
Assert ((Test-StripeLiveRestrictedKeyFormat $fakeTestRestricted) -eq $false) 'G6: rk_test_ key is rejected by the live prompt format check'
Assert ((Test-StripeLiveRestrictedKeyFormat $fakeLiveFullSecret) -eq $false) 'G6: sk_live_ full secret key is rejected by the restricted-key format check'
Assert ((Test-StripeLiveRestrictedKeyFormat $fakeLiveReadOnly) -eq $true) 'G6: rk_live_ key passes the format check'
Assert ((Test-StripeLiveRestrictedKeyCapability $fakeTestRestricted) -like '*must be a LIVE-mode key*') 'G6: capability check refuses a test-mode restricted key even if the format check were bypassed'
Assert ((Test-StripeLiveRestrictedKeyCapability $fakeLiveFullSecret) -like '*must be a RESTRICTED key*') 'G6: capability check refuses a full live secret key'
Assert ((Get-StripeKeyMode $fakeStripeTest) -eq 'test' -and (Get-StripeKeyMode $fakeLiveReadOnly) -eq 'live' -and (Get-StripeKeyMode 'nonsense') -eq 'unknown') 'G6: key mode is derived from the prefix'
$script:StripeRules = @()
Set-StripeRule -Key $fakeLiveTestObjects -PathLike 'https://api.stripe.com/v1/*' -Status 200 -Content '{"object":"list","data":[{"id":"sub_FAKE","livemode":false}],"has_more":false}'
$outcome = Test-StripeLiveRestrictedKeyCapability $fakeLiveTestObjects
Assert ($outcome -like 'mode mismatch: Stripe returned test-mode objects*') "G6: live-mode proof fails when Stripe returns livemode=false objects: $outcome"
$script:StripeRules = @()
# G7. no key, id, or header value in any verdict.
$verdicts = @((Test-StripeLiveRestrictedKeyCapability $fakeLiveInvalid), (Test-StripeLiveRestrictedKeyCapability $fakeLiveReadOnly)) | ForEach-Object { [string]$_ }
Assert (($verdicts | Where-Object { $_ -match 'rk_live_|Bearer|sub_|cus_|in_[A-Za-z0-9]{6}|evt_' }).Count -eq 0) 'G7: verdict messages contain no key, Authorization header, or Stripe object id'

# --- 5. End-to-end against a temporary vault (staging prompts only), with host-output capture for leakage checks.
$tempVault = Join-Path $env:TEMP ("credential-refresh-test-" + [guid]::NewGuid().ToString('N') + '.clixml')
$vaultObject = [pscustomobject]@{
  Version = 1
  CreatedAt = (Get-Date).ToUniversalTime().ToString('o')
  Values = [pscustomobject]@{
    EXISTING_ENTRY = (ConvertTo-SecureString $fakeExisting -AsPlainText -Force)
    STRIPE_LIVE_SECRET_KEY = (ConvertTo-SecureString ('sk_live_' + ('G' * 24)) -AsPlainText -Force)
  }
}
$vaultObject | Export-Clixml -LiteralPath $tempVault
$hostOutput = @()
try {
  $script:WebRequests = @()
  Queue @($fakeToken, $fakeInvalidSecret, $fakeStagingSecret, $fakeStagingPublishable, '', $fakeStripeTest, '')
  $captured = @(Invoke-CredentialRefresh -VaultPath $tempVault -SkipLive 6>&1)
  $refreshed = @($captured | Where-Object { $_ -is [string] })
  $hostOutput += @($captured | Where-Object { $_ -isnot [string] } | ForEach-Object { [string]$_ })
  Assert (($refreshed -join ',') -eq 'STRIPE_SECRET_KEY,SUPABASE_ACCESS_TOKEN,SUPABASE_PUBLISHABLE_KEY,SUPABASE_SECRET_KEY') "refresh reports exactly the entered names: $($refreshed -join ',')"
  Assert (($hostOutput | Where-Object { $_ -like '*capability check failed: PostgREST read returned 401*' }).Count -eq 1) 'invalid staging key produced one controlled 401 message, then the valid key was accepted'
  $stored = Import-Clixml -LiteralPath $tempVault
  Assert ($stored.Values.SUPABASE_ACCESS_TOKEN -is [Security.SecureString] -and (Plain $stored.Values.SUPABASE_ACCESS_TOKEN) -eq $fakeToken) 'token stored as SecureString and round-trips'
  Assert ((Plain $stored.Values.SUPABASE_SECRET_KEY) -eq $fakeStagingSecret) 'staging secret key stored and round-trips'
  Assert ((Plain $stored.Values.SUPABASE_PUBLISHABLE_KEY) -eq $fakeStagingPublishable) 'staging publishable key stored and round-trips'
  Assert ((Plain $stored.Values.STRIPE_SECRET_KEY) -eq $fakeStripeTest) 'sandbox key stored and round-trips'
  Assert ((Plain $stored.Values.EXISTING_ENTRY) -eq $fakeExisting) 'untouched entries are preserved'
  Assert ($null -ne $stored.Values.STRIPE_LIVE_SECRET_KEY) 'live entry preserved when -SkipLive'
  $serialized = Get-Content -LiteralPath $tempVault -Raw
  Assert (-not ($serialized.Contains($fakeToken) -or $serialized.Contains($fakeStagingSecret) -or $serialized.Contains($fakeStripeTest) -or $serialized.Contains($fakeExisting))) 'serialized vault contains no plaintext value'
  Assert (-not (Test-Path -LiteralPath "$tempVault.pending")) 'pending file removed after promotion'
  Assert (($script:RestCalls | Where-Object { $_ -like 'https://api.supabase.com/v1/projects*' }).Count -ge 1) 'token verified via a read-only projects list'
  Assert (@($script:WebRequests | Where-Object { $_.Method -eq 'GET' -and $_.Uri -eq "https://$stagingHost/rest/v1/consumer_accounts?select=user_id&limit=1" }).Count -eq 2) 'staging secret keys (invalid + valid) verified via the read-only GET probe'
  Assert (@($script:WebRequests | Where-Object { $_.Uri -like 'https://api.stripe.com/v1/prices/price_1TzKso4YQNsZa1pjh5UZvcV7*' }).Count -eq 1) 'sandbox key verified against the sandbox price (read)'
  Assert (@($script:WebRequests | Where-Object { $_.Method -notin @('GET', '') }).Count -eq 0) 'every capability request is a GET (read only)'
  Assert-QueueDrained 'staging refresh'

  # --- 6. All Enter: no changes, vault untouched.
  $hashBefore = (Get-FileHash -LiteralPath $tempVault -Algorithm SHA256).Hash
  Queue @('', '', '', '', '', '')
  $none = @(Invoke-CredentialRefresh -VaultPath $tempVault -SkipLive 6>$null)
  Assert ($none.Count -eq 0) 'all-Enter run reports no changes'
  Assert ((Get-FileHash -LiteralPath $tempVault -Algorithm SHA256).Hash -eq $hashBefore) 'all-Enter run leaves the vault byte-identical'
  Assert-QueueDrained 'all-Enter run'

  # --- 7. Live prompts (rk_live restricted key, production ref, production secret) store under the expected names.
  $script:WebRequests = @()
  Queue @('', '', '', '', '', '', $fakeLiveReadOnly, $fakeProductionRef, $fakeProductionSecret)
  $captured = @(Invoke-CredentialRefresh -VaultPath $tempVault 6>&1)
  $live = @($captured | Where-Object { $_ -is [string] })
  $hostOutput += @($captured | Where-Object { $_ -isnot [string] } | ForEach-Object { [string]$_ })
  Assert (($live -join ',') -eq 'STRIPE_LIVE_READONLY_KEY,SUPABASE_PRODUCTION_PROJECT_REF,SUPABASE_PRODUCTION_SECRET_KEY') "live prompts stored under expected names: $($live -join ',')"
  $stored = Import-Clixml -LiteralPath $tempVault
  Assert ((Plain $stored.Values.STRIPE_LIVE_READONLY_KEY) -eq $fakeLiveReadOnly) 'restricted live key round-trips'
  Assert ((Plain $stored.Values.SUPABASE_PRODUCTION_PROJECT_REF) -eq $fakeProductionRef) 'production ref round-trips'
  $productionProbe = @($script:WebRequests | Where-Object { $_.Uri -eq "https://$fakeProductionRef.supabase.co/rest/v1/consumer_accounts?select=user_id&limit=1" })
  Assert ($productionProbe.Count -eq 1 -and $productionProbe[0].Method -eq 'GET' -and (($productionProbe[0].HeaderNames -join ',') -eq 'apikey')) 'production secret verified with a read-only GET, apikey header only, against the entered production ref'
  Assert (@($script:WebRequests | Where-Object { $_.Host -eq $stagingHost }).Count -eq 0) 'live-only run sends nothing to the staging host'
  Assert ((Plain $stored.Values.SUPABASE_ACCESS_TOKEN) -eq $fakeToken) 'earlier entries survive a later refresh'
  Assert-QueueDrained 'live refresh'
} finally {
  Remove-Item -LiteralPath $tempVault -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath "$tempVault.pending" -Force -ErrorAction SilentlyContinue
}

# --- F. Secrets are never logged: host output, recorded request shapes, and REST call log contain no fake secret.
$everything = @($hostOutput) + @($script:RestCalls) + @($script:WebRequests | ForEach-Object { "$($_.Method) $($_.Uri) $($_.HeaderNames -join ',') $($_.UserAgent)" }) + @($script:PromptLog)
$leaks = @()
foreach ($secret in $allFakeSecrets) { foreach ($line in $everything) { if ($line -and $line.Contains($secret)) { $leaks += $secret.Substring(0, 6) } } }
Assert ($leaks.Count -eq 0) "F: no fake secret appears in host output, request URLs, header names, User-Agent, or prompts ($($everything.Count) lines checked)"
# Header VALUES never appear: no "Bearer <token>" and no "apikey: <value>" / "apikey=<value>" (the
# strategy description "apikey header only" in a status message is not a value).
Assert (($hostOutput | Where-Object { $_ -match 'Bearer\s+\S+' -or $_ -match 'apikey\s*[:=]\s*\S+' }).Count -eq 0) 'F: host output never contains an Authorization or apikey header value'
Assert ($hostOutput.Count -gt 5) "F: host output was actually captured for the leakage check ($($hostOutput.Count) lines)"
# Key-shaped values only: the guidance text legitimately names the rk_live_ prefix.
Assert (@($hostOutput | Where-Object { $_ -match 'sub_[A-Za-z0-9]{4,}|cus_[A-Za-z0-9]{4,}|evt_[A-Za-z0-9]{4,}|rk_live_[A-Za-z0-9]{8,}|sk_live_[A-Za-z0-9]{8,}' }).Count -eq 0) 'F: host output never contains a Stripe customer, subscription, or event id, or a live key value'

Write-Host ''
Write-Host "RESULT  passed=$($script:Passes) failed=$($script:Failures)"
if ($script:Failures -gt 0) { exit 1 }
exit 0
