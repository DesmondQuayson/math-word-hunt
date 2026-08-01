param(
  [Parameter(Mandatory = $true)][ValidateSet('SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','VERCEL_AUTOMATION_BYPASS_SECRET')][string]$Name,
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 7D vault is unavailable.' }
$plain = $env:PHASE7D_VAULT_SECRET_VALUE
if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Phase 7D vault update value is unavailable.' }
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
$plain = $null
Remove-Item Env:PHASE7D_VAULT_SECRET_VALUE -ErrorAction SilentlyContinue
$pendingPath = "$VaultPath.pending"
try {
  $vault = Import-Clixml -LiteralPath $VaultPath
  $vault.Values | Add-Member -MemberType NoteProperty -Name $Name -Value $secure -Force
  $vault | Export-Clixml -LiteralPath $pendingPath
  $verified = Import-Clixml -LiteralPath $pendingPath
  if ($null -eq $verified.Values.$Name -or $verified.Values.$Name.GetType().FullName -ne 'System.Security.SecureString') {
    throw 'Phase 7D vault update verification failed.'
  }
  $acl = Get-Acl -LiteralPath $VaultPath
  Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
  Set-Acl -LiteralPath $VaultPath -AclObject $acl
} finally {
  Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
  if ($null -ne $verified) {
    foreach ($entry in $verified.Values.PSObject.Properties) { $entry.Value.Dispose() }
  }
  if ($null -ne $vault) {
    foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  }
  $secure.Dispose()
  $verified = $null
  $vault = $null
}
