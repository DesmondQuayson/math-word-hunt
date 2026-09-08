# Local test for scripts/invoke-subscription-lifecycle-credential-refresh.ps1.
#
# Uses FAKE values only. Read-Host, Invoke-RestMethod and Invoke-WebRequest are
# shadowed by mocks defined below, so no provider is contacted, and the vault
# under test is a temporary file: the real vault in %USERPROFILE% is never read
# or written. Run with:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tests\invoke-subscription-lifecycle-credential-refresh.test.ps1
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'invoke-subscription-lifecycle-credential-refresh.ps1'
. $scriptPath -LibraryOnly

$script:PromptQueue = New-Object 'System.Collections.Generic.Queue[string]'
$script:PromptLog = @()
$script:RestCalls = @()
$script:WebCalls = @()
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
  param($Uri, $Headers, $Method, $TimeoutSec)
  $script:RestCalls += [string]$Uri
  if ($Uri -like 'https://api.supabase.com/v1/projects*') {
    return @([pscustomobject]@{ ref = 'gcmuhzxkwvfireyrearl'; name = 'mathnexa-platform-staging' }, [pscustomobject]@{ ref = 'zzzzzzzzzzzzzzzzzzzz'; name = 'other' })
  }
  if ($Uri -like 'https://api.stripe.com/v1/balance*') { return [pscustomobject]@{ livemode = $false } }
  throw "unexpected REST call $Uri"
}
function Invoke-WebRequest {
  param($Uri, $Headers, $Method, [switch]$UseBasicParsing, $TimeoutSec)
  $script:WebCalls += "$Method $Uri"
  return [pscustomobject]@{ StatusCode = 200 }
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

$fakeToken = 'sbp_' + ('A' * 40)
$fakeStagingSecret = 'sb_secret_' + ('B' * 30)
$fakeStripeTest = 'sk_test_' + ('C' * 24)
$fakeLiveReadOnly = 'rk_live_' + ('D' * 24)
$fakeProductionRef = 'abcdefghijklmnopqrst'
$fakeProductionSecret = 'sb_secret_' + ('E' * 30)
$fakeExisting = 'existing-fake-value-' + ('F' * 20)
$fakeRejectedToken = 'sbp_' + ('X' * 40)

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

# --- 5. End-to-end against a temporary vault (staging prompts only).
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
try {
  Queue @($fakeToken, $fakeStagingSecret, '', '', $fakeStripeTest, '')
  $refreshed = @(Invoke-CredentialRefresh -VaultPath $tempVault -SkipLive)
  Assert (($refreshed -join ',') -eq 'STRIPE_SECRET_KEY,SUPABASE_ACCESS_TOKEN,SUPABASE_SECRET_KEY') "refresh reports exactly the entered names: $($refreshed -join ',')"
  $stored = Import-Clixml -LiteralPath $tempVault
  Assert ($stored.Values.SUPABASE_ACCESS_TOKEN -is [Security.SecureString] -and (Plain $stored.Values.SUPABASE_ACCESS_TOKEN) -eq $fakeToken) 'token stored as SecureString and round-trips'
  Assert ((Plain $stored.Values.SUPABASE_SECRET_KEY) -eq $fakeStagingSecret) 'staging secret key stored and round-trips'
  Assert ((Plain $stored.Values.STRIPE_SECRET_KEY) -eq $fakeStripeTest) 'sandbox key stored and round-trips'
  Assert ((Plain $stored.Values.EXISTING_ENTRY) -eq $fakeExisting) 'untouched entries are preserved'
  Assert ($null -ne $stored.Values.STRIPE_LIVE_SECRET_KEY) 'live entry preserved when -SkipLive'
  Assert ($null -eq $stored.Values.PSObject.Properties['SUPABASE_PUBLISHABLE_KEY']) 'skipped prompt adds no entry'
  $serialized = Get-Content -LiteralPath $tempVault -Raw
  Assert (-not ($serialized.Contains($fakeToken) -or $serialized.Contains($fakeStagingSecret) -or $serialized.Contains($fakeStripeTest) -or $serialized.Contains($fakeExisting))) 'serialized vault contains no plaintext value'
  Assert (-not (Test-Path -LiteralPath "$tempVault.pending")) 'pending file removed after promotion'
  Assert (($script:RestCalls | Where-Object { $_ -like 'https://api.supabase.com/v1/projects*' }).Count -ge 1) 'token verified via a read-only projects list'
  Assert (($script:WebCalls | Where-Object { $_ -like 'HEAD https://gcmuhzxkwvfireyrearl.supabase.co/rest/v1/billing_subscriptions*' }).Count -eq 1) 'staging secret key verified via a read-only HEAD'
  Assert (($script:WebCalls | Where-Object { $_ -like 'GET https://api.stripe.com/v1/prices/price_1TzKso4YQNsZa1pjh5UZvcV7*' }).Count -eq 1) 'sandbox key verified against the sandbox price (read)'
  Assert (-not ($script:WebCalls -join ' ').Contains($fakeToken) -and -not ($script:RestCalls -join ' ').Contains($fakeToken)) 'no secret value appears in a request URL'
  Assert-QueueDrained 'staging refresh'

  # --- 6. All Enter: no changes, vault untouched.
  $hashBefore = (Get-FileHash -LiteralPath $tempVault -Algorithm SHA256).Hash
  Queue @('', '', '', '', '', '')
  $none = @(Invoke-CredentialRefresh -VaultPath $tempVault -SkipLive)
  Assert ($none.Count -eq 0) 'all-Enter run reports no changes'
  Assert ((Get-FileHash -LiteralPath $tempVault -Algorithm SHA256).Hash -eq $hashBefore) 'all-Enter run leaves the vault byte-identical'
  Assert-QueueDrained 'all-Enter run'

  # --- 7. Live prompts (rk_live restricted key, production ref, production secret) store under the expected names.
  Queue @('', '', '', '', '', '', $fakeLiveReadOnly, $fakeProductionRef, $fakeProductionSecret)
  $live = @(Invoke-CredentialRefresh -VaultPath $tempVault)
  Assert (($live -join ',') -eq 'STRIPE_LIVE_READONLY_KEY,SUPABASE_PRODUCTION_PROJECT_REF,SUPABASE_PRODUCTION_SECRET_KEY') "live prompts stored under expected names: $($live -join ',')"
  $stored = Import-Clixml -LiteralPath $tempVault
  Assert ((Plain $stored.Values.STRIPE_LIVE_READONLY_KEY) -eq $fakeLiveReadOnly) 'restricted live key round-trips'
  Assert ((Plain $stored.Values.SUPABASE_PRODUCTION_PROJECT_REF) -eq $fakeProductionRef) 'production ref round-trips'
  Assert (($script:WebCalls | Where-Object { $_ -like "HEAD https://$fakeProductionRef.supabase.co/rest/v1/billing_subscriptions*" }).Count -eq 1) 'production secret verified against the entered production ref (read-only HEAD)'
  Assert ((Plain $stored.Values.SUPABASE_ACCESS_TOKEN) -eq $fakeToken) 'earlier entries survive a later refresh'
  Assert-QueueDrained 'live refresh'
} finally {
  Remove-Item -LiteralPath $tempVault -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath "$tempVault.pending" -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "RESULT  passed=$($script:Passes) failed=$($script:Failures)"
if ($script:Failures -gt 0) { exit 1 }
exit 0
