param(
  [string]$VaultPath = (Join-Path $env:LOCALAPPDATA 'MathNexa\phase7d-staging-vault.json')
)

$ErrorActionPreference = 'Stop'

function Read-RequiredSecret {
  param([string]$Prompt, [scriptblock]$Validate)
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if (-not (& $Validate $plain)) { throw 'Credential validation failed.' }
    return $secure | ConvertFrom-SecureString
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
    $plain = $null
  }
}

function Test-DpapiValue {
  param([string]$Cipher, [scriptblock]$Validate)
  $secure = ConvertTo-SecureString $Cipher
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if (-not (& $Validate $plain)) { throw 'Encrypted credential validation failed.' }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
    $plain = $null
  }
}

if (Test-Path -LiteralPath $VaultPath) {
  Write-Host 'PHASE 7D CREDENTIAL VAULT ALREADY AVAILABLE'
  exit 0
}

$parent = Split-Path -Parent $VaultPath
New-Item -ItemType Directory -Path $parent -Force | Out-Null

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
  $databasePassword = ConvertTo-SecureString $databasePasswordPlain -AsPlainText -Force | ConvertFrom-SecureString
} finally {
  $random.Dispose()
  [Array]::Clear($bytes, 0, $bytes.Length)
  $databasePasswordPlain = $null
}

$vault = [ordered]@{
  version = 1
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  values = [ordered]@{
    SUPABASE_ACCESS_TOKEN = $supabase
    SUPABASE_DB_PASSWORD = $databasePassword
    RESEND_API_KEY = $resend
    STRIPE_PUBLISHABLE_KEY = $publishable
    STRIPE_SECRET_KEY = $stripe
  }
}
$pendingPath = "$VaultPath.pending"
try {
  $vault | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pendingPath -Encoding UTF8
  $stored = Get-Content -LiteralPath $pendingPath -Raw | ConvertFrom-Json -AsHashtable
  Test-DpapiValue $stored.values.SUPABASE_ACCESS_TOKEN { param($value) $value -match '^sbp_[A-Za-z0-9_\-]{16,}$' }
  Test-DpapiValue $stored.values.SUPABASE_DB_PASSWORD { param($value) $value.Length -ge 32 }
  Test-DpapiValue $stored.values.RESEND_API_KEY { param($value) $value -match '^re_[A-Za-z0-9_\-]{16,}$' }
  Test-DpapiValue $stored.values.STRIPE_PUBLISHABLE_KEY { param($value) $value -match '^pk_test_[A-Za-z0-9_]{8,}$' }
  Test-DpapiValue $stored.values.STRIPE_SECRET_KEY { param($value) $value -match '^sk_test_[A-Za-z0-9_]{8,}$' }
  Move-Item -LiteralPath $pendingPath -Destination $VaultPath
} finally {
  Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
  $stored = $null
  $vault = $null
  $supabase = $resend = $publishable = $stripe = $databasePassword = $null
}
Write-Host 'PHASE 7D CREDENTIALS ACCEPTED'
