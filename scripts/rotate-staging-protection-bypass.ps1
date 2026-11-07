param(
  [switch]$Apply,
  [switch]$Resync,
  [string]$VerifyOrigin = '',
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# Rotates the STAGING Vercel protection-bypass secret (project mathnexa-platform-staging only; production has none).
#   (no switch)  plan only, read-only.
#   -Apply       revoke the current secret, generate a new one, store it in the vault, verify (owner-approved only).
#   -Resync      store the project's current secret in the vault (recovery).
#   -VerifyOrigin <staging preview URL>  after -Apply/-Resync, prove the preview accepts the new secret and refuses the old.
# Only VERCEL_AUTOMATION_BYPASS_SECRET is loaded from the vault; no value is printed or passed on a command line.
$ErrorActionPreference = 'Stop'
if ($Apply -and $Resync) { throw 'Use -Apply or -Resync, not both.' }
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
$vercel = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx') -Recurse -Filter 'vercel.cmd' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $vercel) { throw 'Authenticated Vercel CLI is unavailable (run npx vercel whoami once).' }
$names = @('VERCEL_AUTOMATION_BYPASS_SECRET')
$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($names -contains $entry.Name) {
      $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($entry.Value)
      try { [Environment]::SetEnvironmentVariable($entry.Name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer), 'Process') }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
  }
  $env:ROTATE_BYPASS_MODE = if ($Apply) { 'apply' } elseif ($Resync) { 'resync' } else { 'plan' }
  $env:ROTATE_VERCEL_CLI = $vercel
  $env:ROTATE_VAULT_UPDATE_SCRIPT = Join-Path $PSScriptRoot 'update-phase7d-vault.ps1'
  $env:ROTATE_VERIFY_ORIGIN = $VerifyOrigin
  & node (Join-Path $PSScriptRoot 'rotate-staging-protection-bypass.mjs')
  exit $LASTEXITCODE
} finally {
  foreach ($name in $names + @('ROTATE_BYPASS_MODE', 'ROTATE_VERCEL_CLI', 'ROTATE_VAULT_UPDATE_SCRIPT', 'ROTATE_VERIFY_ORIGIN')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  $vault = $null
}
