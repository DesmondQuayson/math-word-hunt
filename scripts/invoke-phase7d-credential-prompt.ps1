param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)

$ErrorActionPreference = 'Stop'

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
  param(
    [Security.SecureString]$Secure,
    [scriptblock]$Validate,
    [string]$SerializedVault
  )
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

function Set-CurrentUserOnlyAcl {
  param([string]$Path)
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl = Get-Acl -LiteralPath $Path
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleAll($rule) }
  $access = New-Object Security.AccessControl.FileSystemAccessRule(
    $identity,
    [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow
  )
  [void]$acl.AddAccessRule($access)
  Set-Acl -LiteralPath $Path -AclObject $acl
}

if (Test-Path -LiteralPath $VaultPath) {
  Write-Host 'PHASE 7D CREDENTIAL VAULT ALREADY AVAILABLE'
  exit 0
}

$parent = Split-Path -Parent $VaultPath
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$pendingPath = "$VaultPath.pending"

$supabase = Read-RequiredSecret 'Supabase access token' { param($value) $value -match '^sbp_[A-Za-z0-9_\-]{16,}$' }
$resend = Read-RequiredSecret 'Resend API key' { param($value) $value -match '^re_[A-Za-z0-9_\-]{16,}$' }
$publishable = Read-RequiredSecret 'Stripe Sandbox publishable key' { param($value) $value -match '^pk_test_[A-Za-z0-9_]{8,}$' }
$stripe = Read-RequiredSecret 'Stripe Sandbox secret key' { param($value) $value -match '^sk_test_[A-Za-z0-9_]{8,}$' }

$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%_-'
$bytes = New-Object byte[] 48
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $random.GetBytes($bytes)
  $databasePasswordPlain = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
  $databasePassword = ConvertTo-SecureString $databasePasswordPlain -AsPlainText -Force
} finally {
  $random.Dispose()
  [Array]::Clear($bytes, 0, $bytes.Length)
  $databasePasswordPlain = $null
}

$vault = [pscustomobject]@{
  Version = 1
  CreatedAt = (Get-Date).ToUniversalTime().ToString('o')
  Values = [pscustomobject]@{
    SUPABASE_ACCESS_TOKEN = $supabase
    SUPABASE_DB_PASSWORD = $databasePassword
    RESEND_API_KEY = $resend
    STRIPE_PUBLISHABLE_KEY = $publishable
    STRIPE_SECRET_KEY = $stripe
  }
}

$stored = $null
try {
  $vault | Export-Clixml -LiteralPath $pendingPath
  Move-Item -LiteralPath $pendingPath -Destination $VaultPath
  Set-CurrentUserOnlyAcl $VaultPath
  $stored = Import-Clixml -LiteralPath $VaultPath
  $serialized = Get-Content -LiteralPath $VaultPath -Raw
  Assert-ImportedSecret $stored.Values.SUPABASE_ACCESS_TOKEN { param($value) $value -match '^sbp_[A-Za-z0-9_\-]{16,}$' } $serialized
  Assert-ImportedSecret $stored.Values.SUPABASE_DB_PASSWORD { param($value) $value.Length -ge 32 } $serialized
  Assert-ImportedSecret $stored.Values.RESEND_API_KEY { param($value) $value -match '^re_[A-Za-z0-9_\-]{16,}$' } $serialized
  Assert-ImportedSecret $stored.Values.STRIPE_PUBLISHABLE_KEY { param($value) $value -match '^pk_test_[A-Za-z0-9_]{8,}$' } $serialized
  Assert-ImportedSecret $stored.Values.STRIPE_SECRET_KEY { param($value) $value -match '^sk_test_[A-Za-z0-9_]{8,}$' } $serialized
} catch {
  Remove-Item -LiteralPath $VaultPath -Force -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
  if ($null -ne $stored) {
    foreach ($entry in $stored.Values.PSObject.Properties) { $entry.Value.Dispose() }
  }
  foreach ($secret in @($supabase, $resend, $publishable, $stripe, $databasePassword)) {
    if ($null -ne $secret) { $secret.Dispose() }
  }
  $serialized = $null
  $stored = $null
  $vault = $null
}

Write-Host 'PHASE 7D CREDENTIALS ACCEPTED'
