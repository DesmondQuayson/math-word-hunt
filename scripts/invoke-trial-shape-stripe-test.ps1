param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# STRIPE TEST-MODE ONLY launcher for the trial-shape validation. Loads exactly
# the vault's STRIPE_SECRET_KEY (the test-mode key also used by the staging
# drift tools) and refuses unless it is an sk_test_ key. Runs
# scripts/verify-trial-shape-stripe-test.mjs and clears the variable
# afterwards. No value is ever printed.
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($entry.Name -eq 'STRIPE_SECRET_KEY') {
      $plain = Open-SecureValue $entry.Value
      try {
        if (-not $plain.StartsWith('sk_test_', [StringComparison]::Ordinal)) { throw 'Refusing: STRIPE_SECRET_KEY in the vault is not a test-mode key.' }
        [Environment]::SetEnvironmentVariable('STRIPE_SECRET_KEY', $plain, 'Process')
      } finally { $plain = $null }
    }
  }
  if ([string]::IsNullOrWhiteSpace($env:STRIPE_SECRET_KEY)) { throw 'No test-mode STRIPE_SECRET_KEY in the vault.' }
  Set-Location $repositoryRoot
  & node scripts/verify-trial-shape-stripe-test.mjs
  exit $LASTEXITCODE
} finally {
  [Environment]::SetEnvironmentVariable('STRIPE_SECRET_KEY', $null, 'Process')
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
