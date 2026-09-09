param(
  [ValidateSet('subscriber-readonly')] [string]$Stage = 'subscriber-readonly',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# PRODUCTION read-only launcher for the Next.js hotfix pipeline. Loads exactly
# three entries of the process-only credential vault — the production project
# ref, the production service key and the RESTRICTED read-only Stripe key —
# for the subscriber-readonly stage, which only ever issues GET requests. The
# full live Stripe secret key, the database password and every staging entry
# are never loaded. Every variable is cleared afterwards; no value is printed.
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
$names = @('SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_SECRET_KEY', 'STRIPE_LIVE_READONLY_KEY')
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($names -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try {
        if ($entry.Name -eq 'STRIPE_LIVE_READONLY_KEY' -and $plain -notmatch '^rk_live_') { throw 'Refusing: STRIPE_LIVE_READONLY_KEY in the vault is not a restricted (rk_live_) key.' }
        [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process')
      } finally { $plain = $null }
    }
  }
  Set-Location $repositoryRoot
  & node scripts/run-nextjs-hotfix-production.mjs "--stage=$Stage"
  exit $LASTEXITCODE
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
