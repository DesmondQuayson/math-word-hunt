param([string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml'))
# READ-ONLY production schema check for the Polygon Showdown staging round.
# Loads exactly the production project ref and database password, runs one
# SELECT, and clears both. Nothing here can change production.
$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$names = @('SUPABASE_PRODUCTION_PROJECT_REF', 'SUPABASE_PRODUCTION_DB_PASSWORD')
$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    if ($names -contains $entry.Name) {
      $plain = Open-SecureValue $entry.Value
      try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') } finally { $plain = $null }
    }
  }
  Set-Location $repositoryRoot
  & node --no-warnings scripts/audit-polygon-showdown-production.mjs
  exit $LASTEXITCODE
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() } }
  $vault = $null
}
