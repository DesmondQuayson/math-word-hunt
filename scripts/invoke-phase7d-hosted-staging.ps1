param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 7D credential vault is unavailable.' }

function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$vault = Import-Clixml -LiteralPath $VaultPath
try {
  foreach ($entry in $vault.Values.PSObject.Properties) {
    $plain = Open-SecureValue $entry.Value
    try { [Environment]::SetEnvironmentVariable($entry.Name, $plain, 'Process') }
    finally { $plain = $null }
  }
  $env:PHASE7D_VAULT_PATH = $VaultPath
  $env:PHASE7D_VAULT_UPDATE_SCRIPT = Join-Path $PSScriptRoot 'update-phase7d-vault.ps1'
  $vercel = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx') -Recurse -Filter 'vercel.cmd' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  if ([string]::IsNullOrWhiteSpace($vercel)) { throw 'Authenticated Vercel CLI is unavailable.' }
  $env:PHASE7D_VERCEL_CLI = $vercel
  Set-Location $repositoryRoot
  & node scripts/run-phase7d-hosted-staging.mjs
  exit $LASTEXITCODE
} finally {
  foreach ($name in @(
    'SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','RESEND_API_KEY','STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET','VERCEL_AUTOMATION_BYPASS_SECRET','PHASE7D_VAULT_PATH',
    'PHASE7D_VAULT_UPDATE_SCRIPT','PHASE7D_VERCEL_CLI'
  )) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
