param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 7D credential vault is unavailable.' }

function Read-RequiredSecret {
  param([string]$Prompt, [scriptblock]$Validate)
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if (-not (& $Validate $plain)) { throw 'Credential validation failed.' }
    return $secure
  } catch {
    $secure.Dispose()
    throw
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plain = $null
  }
}

function Assert-ImportedSecret {
  param([Security.SecureString]$Secure, [scriptblock]$Validate, [string]$SerializedVault)
  if ($null -eq $Secure) { throw 'Encrypted credential is unavailable.' }
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if (-not (& $Validate $plain)) { throw 'Encrypted credential validation failed.' }
    if ($SerializedVault.Contains($plain)) { throw 'Encrypted vault contains plaintext credential data.' }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plain = $null
  }
}

$vault = Import-Clixml -LiteralPath $VaultPath
$pendingPath = "$VaultPath.pending"
$acl = Get-Acl -LiteralPath $VaultPath
$resend = $null
$stripe = $null
$verified = $null
try {
  foreach ($name in @('SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'STRIPE_PUBLISHABLE_KEY')) {
    if ($null -eq $vault.Values.$name -or $vault.Values.$name.GetType().FullName -ne 'System.Security.SecureString') {
      throw 'Existing Phase 7D vault contract is invalid.'
    }
  }

  foreach ($retired in @('RESEND_API_KEY', 'STRIPE_SECRET_KEY')) {
    $property = $vault.Values.PSObject.Properties[$retired]
    if ($null -ne $property) {
      $property.Value.Dispose()
      [void]$vault.Values.PSObject.Properties.Remove($retired)
    }
  }
  $vault | Export-Clixml -LiteralPath $pendingPath
  Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
  Set-Acl -LiteralPath $VaultPath -AclObject $acl

  $resend = Read-RequiredSecret 'Resend API key' { param($value) $value -match '^re_[A-Za-z0-9_\-]{16,}$' }
  $stripe = Read-RequiredSecret 'Stripe Sandbox secret key' { param($value) $value -match '^sk_test_[A-Za-z0-9_]{8,}$' }
  $vault.Values | Add-Member -MemberType NoteProperty -Name RESEND_API_KEY -Value $resend -Force
  $vault.Values | Add-Member -MemberType NoteProperty -Name STRIPE_SECRET_KEY -Value $stripe -Force
  $vault | Export-Clixml -LiteralPath $pendingPath
  $verified = Import-Clixml -LiteralPath $pendingPath
  $serialized = Get-Content -LiteralPath $pendingPath -Raw
  Assert-ImportedSecret $verified.Values.RESEND_API_KEY { param($value) $value -match '^re_[A-Za-z0-9_\-]{16,}$' } $serialized
  Assert-ImportedSecret $verified.Values.STRIPE_SECRET_KEY { param($value) $value -match '^sk_test_[A-Za-z0-9_]{8,}$' } $serialized
  Assert-ImportedSecret $verified.Values.STRIPE_PUBLISHABLE_KEY { param($value) $value -match '^pk_test_[A-Za-z0-9_]{8,}$' } $serialized
  Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
  Set-Acl -LiteralPath $VaultPath -AclObject $acl
} finally {
  Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
  if ($null -ne $verified) {
    foreach ($entry in $verified.Values.PSObject.Properties) { $entry.Value.Dispose() }
  }
  if ($null -ne $vault) {
    foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  }
  if ($null -ne $resend) { $resend.Dispose() }
  if ($null -ne $stripe) { $stripe.Dispose() }
  $serialized = $null
  $verified = $null
  $vault = $null
}

Write-Host 'PHASE 7D ROTATED CREDENTIALS ACCEPTED'
