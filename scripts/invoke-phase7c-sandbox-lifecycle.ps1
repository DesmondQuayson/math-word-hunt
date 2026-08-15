param(
  [Parameter(Mandatory = $true)][string]$ProductId,
  [Parameter(Mandatory = $true)][string]$PriceId,
  [Parameter(Mandatory = $true)][string]$PortalId
)

$ErrorActionPreference = 'Stop'

function Read-SandboxKey {
  param([string]$Prompt, [string]$Prefix)
  while ($true) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
      if ($value.StartsWith($Prefix, [StringComparison]::Ordinal)) { return $value }
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
      $secure.Dispose()
    }
  }
}

$publishableKey = Read-SandboxKey -Prompt 'Stripe Sandbox publishable key' -Prefix 'pk_test_'
$secretKey = Read-SandboxKey -Prompt 'Stripe Sandbox secret key' -Prefix 'sk_test_'

try {
  $env:STRIPE_PUBLISHABLE_KEY = $publishableKey
  $env:STRIPE_SECRET_KEY = $secretKey
  $env:STRIPE_PRODUCT_MATHNEXA = $ProductId
  $env:STRIPE_PRICE_MATHNEXA_MONTHLY = $PriceId
  $env:STRIPE_PORTAL_CONFIGURATION_ID = $PortalId
  Write-Host 'STRIPE SANDBOX KEYS ACCEPTED'
  & node scripts/run-phase7c-sandbox-lifecycle.mjs *> $null
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:STRIPE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:STRIPE_SECRET_KEY -ErrorAction SilentlyContinue
  $publishableKey = $null
  $secretKey = $null
}
