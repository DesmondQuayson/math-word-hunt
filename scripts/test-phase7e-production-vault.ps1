$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'phase7e-production-vault.psm1') -Force

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("mathnexa-phase7e-vault-" + [guid]::NewGuid().ToString('N'))
$temporaryVault = Join-Path $temporaryRoot 'production-vault.clixml'
$dummyPlain = @()
$dummySecure = @()
$roundTrip = $null
try {
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  $dummyPlain = @(
    ('re_' + [guid]::NewGuid().ToString('N')),
    ('pk_live_' + [guid]::NewGuid().ToString('N')),
    ('sk_live_' + [guid]::NewGuid().ToString('N'))
  )
  $dummySecure = @($dummyPlain | ForEach-Object { ConvertTo-SecureString $_ -AsPlainText -Force })
  $seed = [pscustomobject]@{
    Version = 1
    CreatedAt = (Get-Date).ToUniversalTime().ToString('o')
    Values = [pscustomobject]@{}
  }
  $seed | Export-Clixml -LiteralPath $temporaryVault
  Set-Phase7eProductionCredentials -VaultPath $temporaryVault `
    -ResendProvisioningKey $dummySecure[0] -StripePublishableKey $dummySecure[1] -StripeSecretKey $dummySecure[2]
  $roundTrip = Import-Phase7eProductionVault -VaultPath $temporaryVault -RequireProductionCredentials
  $serialized = Get-Content -LiteralPath $temporaryVault -Raw
  foreach ($value in $dummyPlain) {
    if ($serialized.Contains($value)) { throw 'Temporary vault contains plaintext.' }
  }
  foreach ($name in @('RESEND_PRODUCTION_PROVISIONING_API_KEY','STRIPE_LIVE_PUBLISHABLE_KEY','STRIPE_LIVE_SECRET_KEY')) {
    if ($roundTrip.Values.PSObject.Properties[$name].Value -isnot [Security.SecureString]) {
      throw 'Temporary vault round-trip failed.'
    }
  }
  Write-Host 'PHASE 7E DUMMY VAULT PREFLIGHT PASSED'
} finally {
  if ($null -ne $roundTrip) {
    foreach ($entry in $roundTrip.Values.PSObject.Properties) {
      if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() }
    }
  }
  foreach ($secret in $dummySecure) { if ($null -ne $secret) { $secret.Dispose() } }
  for ($index = 0; $index -lt $dummyPlain.Count; $index += 1) { $dummyPlain[$index] = $null }
  $dummyPlain = @()
  $serialized = $null
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
  foreach ($name in @('RESEND_PRODUCTION_PROVISIONING_API_KEY','STRIPE_LIVE_PUBLISHABLE_KEY','STRIPE_LIVE_SECRET_KEY')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}
if (Test-Path -LiteralPath $temporaryRoot) { throw 'Temporary vault cleanup failed.' }
Write-Host 'PHASE 7E DUMMY CLEANUP PASSED'
