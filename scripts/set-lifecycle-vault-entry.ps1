param(
  [Parameter(Mandatory = $true)][ValidateSet('CRON_SECRET_STAGING', 'CRON_SECRET_PRODUCTION', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_LIVE_READONLY_KEY', 'SUPABASE_PRODUCTION_PROJECT_REF', 'SECURITY_DRAIN_SECRET_STAGING')][string]$Name,
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)
# Non-interactive vault write used by the staging pipeline for values it
# GENERATES or RECEIVES from a provider (a new webhook signing secret, the
# staging scheduler secret). The value arrives only through the process
# environment variable LIFECYCLE_VAULT_SECRET_VALUE, which is cleared here.
# Mirrors scripts/update-phase7d-vault.ps1; the allowed-name list is closed.
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Credential vault is unavailable.' }
$plain = $env:LIFECYCLE_VAULT_SECRET_VALUE
if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Vault update value is unavailable.' }
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
$plain = $null
Remove-Item Env:LIFECYCLE_VAULT_SECRET_VALUE -ErrorAction SilentlyContinue
$pendingPath = "$VaultPath.pending"
try {
  $vault = Import-Clixml -LiteralPath $VaultPath
  $vault.Values | Add-Member -MemberType NoteProperty -Name $Name -Value $secure -Force
  $vault | Export-Clixml -LiteralPath $pendingPath
  $verified = Import-Clixml -LiteralPath $pendingPath
  if ($null -eq $verified.Values.$Name -or $verified.Values.$Name.GetType().FullName -ne 'System.Security.SecureString') {
    throw 'Vault update verification failed.'
  }
  $acl = Get-Acl -LiteralPath $VaultPath
  Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
  Set-Acl -LiteralPath $VaultPath -AclObject $acl
  Write-Output "VAULT_ENTRY_STORED $Name"
} finally {
  Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
  if ($null -ne $verified) { foreach ($entry in $verified.Values.PSObject.Properties) { $entry.Value.Dispose() } }
  if ($null -ne $vault) { foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() } }
  $secure.Dispose()
  $verified = $null
  $vault = $null
}
