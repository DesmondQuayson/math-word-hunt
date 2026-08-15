$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'phase7e-production-vault.psm1') -Force

function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Read-ValidatedSecret {
  param([string]$Prompt, [scriptblock]$Validate)
  for ($attempt = 1; $attempt -le 4; $attempt += 1) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $plain = Open-SecureValue $secure
    try {
      if (& $Validate $plain) { return $secure }
    } finally { $plain = $null }
    $secure.Dispose()
    if ($attempt -eq 4) { throw 'Credential format correction limit reached.' }
    Write-Host 'Credential format rejected. Try again in this window.'
  }
}

function Test-ResendManagementCredential {
  param([Security.SecureString]$Secure)
  $plain = Open-SecureValue $Secure
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'https://api.resend.com/api-keys' `
      -Headers @{ Authorization = "Bearer $plain"; Accept = 'application/json' } -Method Get
    return $response.StatusCode -eq 200
  } catch { return $false }
  finally { $plain = $null }
}

function Test-StripeSecretCredential {
  param([Security.SecureString]$Secure)
  $plain = Open-SecureValue $Secure
  $bytes = $null
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes("${plain}:")
    $authorization = [Convert]::ToBase64String($bytes)
    $account = Invoke-RestMethod -Uri 'https://api.stripe.com/v1/account' `
      -Headers @{ Authorization = "Basic $authorization"; 'Stripe-Version' = '2026-07-29.dahlia' } -Method Get
    return $null -ne $account.id -and $account.charges_enabled -eq $true -and $account.payouts_enabled -eq $true
  } catch { return $false }
  finally {
    if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $authorization = $null
    $plain = $null
  }
}

function Test-StripePublishableCredential {
  param([Security.SecureString]$Secure)
  $plain = Open-SecureValue $Secure
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://api.stripe.com/v1/tokens' `
      -Headers @{ Authorization = "Bearer $plain" } -Method Post -Body @{} | Out-Null
    return $true
  } catch {
    $status = [int]$_.Exception.Response.StatusCode
    return $status -eq 400
  } finally { $plain = $null }
}

$vaultPath = Get-Phase7eProductionVaultPath
$resend = $null
$publishable = $null
$stripe = $null
try {
  $resend = Read-ValidatedSecret 'Resend Production provisioning key' {
    param($value) $value -match '^re_[A-Za-z0-9_\-]{16,}$'
  }
  $resendCorrections = 0
  while (-not (Test-ResendManagementCredential $resend)) {
    if ($resendCorrections -ge 3) { throw 'Resend authentication correction limit reached.' }
    $resendCorrections += 1
    $resend.Dispose()
    $resend = Read-ValidatedSecret 'Resend Production provisioning key correction' {
      param($value) $value -match '^re_[A-Za-z0-9_\-]{16,}$'
    }
  }

  $publishable = Read-ValidatedSecret 'Stripe Live publishable key' {
    param($value) $value -match '^pk_live_[A-Za-z0-9_]{8,}$'
  }
  $publishableCorrections = 0
  while (-not (Test-StripePublishableCredential $publishable)) {
    if ($publishableCorrections -ge 3) { throw 'Stripe publishable-key correction limit reached.' }
    $publishableCorrections += 1
    $publishable.Dispose()
    $publishable = Read-ValidatedSecret 'Stripe Live publishable key correction' {
      param($value) $value -match '^pk_live_[A-Za-z0-9_]{8,}$'
    }
  }

  $stripe = Read-ValidatedSecret 'Stripe Live secret key' {
    param($value) $value -match '^sk_live_[A-Za-z0-9_]{8,}$'
  }
  $stripeCorrections = 0
  while (-not (Test-StripeSecretCredential $stripe)) {
    if ($stripeCorrections -ge 3) { throw 'Stripe secret-key correction limit reached.' }
    $stripeCorrections += 1
    $stripe.Dispose()
    $stripe = Read-ValidatedSecret 'Stripe Live secret key correction' {
      param($value) $value -match '^sk_live_[A-Za-z0-9_]{8,}$'
    }
  }

  Set-Phase7eProductionCredentials -VaultPath $vaultPath `
    -ResendProvisioningKey $resend -StripePublishableKey $publishable -StripeSecretKey $stripe

  $verified = Import-Phase7eProductionVault -VaultPath $vaultPath -RequireProductionCredentials
  try {
    $serialized = Get-Content -LiteralPath $vaultPath -Raw
    foreach ($secure in @($resend, $publishable, $stripe)) {
      $plain = Open-SecureValue $secure
      try { if ($serialized.Contains($plain)) { throw 'Credential vault plaintext scan failed.' } }
      finally { $plain = $null }
    }
  } finally {
    foreach ($entry in $verified.Values.PSObject.Properties) {
      if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() }
    }
  }
  Write-Host 'PHASE 7E PRODUCTION VAULT AND AUTHENTICATION PASSED'
} finally {
  foreach ($secret in @($resend, $publishable, $stripe)) {
    if ($null -ne $secret) { $secret.Dispose() }
  }
  $serialized = $null
  $verified = $null
  foreach ($name in @('RESEND_PRODUCTION_PROVISIONING_API_KEY','STRIPE_LIVE_PUBLISHABLE_KEY','STRIPE_LIVE_SECRET_KEY')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}
