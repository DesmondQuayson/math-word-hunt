param(
  [Parameter(Mandatory = $true)][ValidateSet('RESEND_PROVISIONING_API_KEY')][string]$Name,
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 7D vault is unavailable.' }
$pendingPath = "$VaultPath.pending"
$vault = Import-Clixml -LiteralPath $VaultPath
$verified = $null
try {
  $property = $vault.Values.PSObject.Properties[$Name]
  if ($null -ne $property) {
    $property.Value.Dispose()
    [void]$vault.Values.PSObject.Properties.Remove($Name)
  }
  $acl = Get-Acl -LiteralPath $VaultPath
  $vault | Export-Clixml -LiteralPath $pendingPath
  $verified = Import-Clixml -LiteralPath $pendingPath
  if ($null -ne $verified.Values.PSObject.Properties[$Name]) { throw 'Phase 7D vault removal verification failed.' }
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
  $verified = $null
  $vault = $null
}
