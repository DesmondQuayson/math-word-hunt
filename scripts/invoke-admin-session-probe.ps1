param(
  [Parameter(Mandatory = $true)] [string]$Origin,
  [switch]$StagingPreview,
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# Unauthenticated Phase 2B admin session probe of a deployed origin. With
# -StagingPreview it loads ONLY the staging Vercel protection-bypass entry from
# the credential vault (protected preview URLs); against the live apex it loads
# nothing. Signs in to nothing and changes nothing. No value is printed.
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
try {
  if ($StagingPreview) {
    if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
    $vault = Import-Clixml -LiteralPath $VaultPath
    foreach ($entry in $vault.Values.PSObject.Properties) {
      if ($entry.Name -eq 'VERCEL_AUTOMATION_BYPASS_SECRET') {
        $plain = Open-SecureValue $entry.Value
        try { $env:VERCEL_AUTOMATION_BYPASS_SECRET = $plain } finally { $plain = $null }
      }
    }
    foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
    $vault = $null
    if ([string]::IsNullOrWhiteSpace($env:VERCEL_AUTOMATION_BYPASS_SECRET)) { throw 'The staging protection-bypass entry is not in the vault.' }
  }
  $env:ADMIN_PROBE_ORIGIN = $Origin
  Set-Location $repositoryRoot
  & node scripts/probe-admin-session.mjs
  exit $LASTEXITCODE
} finally {
  foreach ($name in @('VERCEL_AUTOMATION_BYPASS_SECRET', 'ADMIN_PROBE_ORIGIN')) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
}
