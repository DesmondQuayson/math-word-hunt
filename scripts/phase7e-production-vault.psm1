Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ProductionCredentialNames = @(
  'RESEND_PRODUCTION_PROVISIONING_API_KEY',
  'STRIPE_LIVE_PUBLISHABLE_KEY',
  'STRIPE_LIVE_SECRET_KEY'
)

function Get-Phase7eProductionVaultPath {
  Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml'
}

function Import-Phase7eProductionVault {
  param(
    [Parameter(Mandatory)][string]$VaultPath,
    [switch]$RequireProductionCredentials
  )
  if (-not (Test-Path -LiteralPath $VaultPath -PathType Leaf)) {
    throw 'MathNexa credential vault is unavailable.'
  }
  $vault = Import-Clixml -LiteralPath $VaultPath
  if ($null -eq $vault.PSObject.Properties['Version'] -or
      $null -eq $vault.PSObject.Properties['CreatedAt'] -or
      $null -eq $vault.PSObject.Properties['Values']) {
    throw 'MathNexa credential vault schema is invalid.'
  }
  if ($RequireProductionCredentials) {
    foreach ($name in $script:ProductionCredentialNames) {
      $entry = $vault.Values.PSObject.Properties[$name]
      if ($null -eq $entry -or $entry.Value -isnot [Security.SecureString]) {
        foreach ($property in $vault.Values.PSObject.Properties) {
          if ($property.Value -is [IDisposable]) { $property.Value.Dispose() }
        }
        throw 'MathNexa Production credential vault is incomplete.'
      }
    }
  }
  return $vault
}

function Set-Phase7eProductionCredentials {
  param(
    [Parameter(Mandatory)][string]$VaultPath,
    [Parameter(Mandatory)][Security.SecureString]$ResendProvisioningKey,
    [Parameter(Mandatory)][Security.SecureString]$StripePublishableKey,
    [Parameter(Mandatory)][Security.SecureString]$StripeSecretKey
  )
  $vault = Import-Phase7eProductionVault -VaultPath $VaultPath
  $pendingPath = "$VaultPath.pending"
  try {
    $acl = Get-Acl -LiteralPath $VaultPath
    $vault.Values | Add-Member -MemberType NoteProperty -Name RESEND_PRODUCTION_PROVISIONING_API_KEY -Value $ResendProvisioningKey -Force
    $vault.Values | Add-Member -MemberType NoteProperty -Name STRIPE_LIVE_PUBLISHABLE_KEY -Value $StripePublishableKey -Force
    $vault.Values | Add-Member -MemberType NoteProperty -Name STRIPE_LIVE_SECRET_KEY -Value $StripeSecretKey -Force
    $vault | Export-Clixml -LiteralPath $pendingPath
    $roundTrip = Import-Phase7eProductionVault -VaultPath $pendingPath -RequireProductionCredentials
    try {
      Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
      Set-Acl -LiteralPath $VaultPath -AclObject $acl
    } finally {
      foreach ($entry in $roundTrip.Values.PSObject.Properties) {
        if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() }
      }
    }
  } finally {
    Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
    foreach ($entry in $vault.Values.PSObject.Properties) {
      if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() }
    }
  }
}

function Remove-Phase7eVaultEntry {
  param(
    [Parameter(Mandatory)][string]$VaultPath,
    [Parameter(Mandatory)][ValidateSet('RESEND_PRODUCTION_PROVISIONING_API_KEY')][string]$Name
  )
  $vault = Import-Phase7eProductionVault -VaultPath $VaultPath
  $pendingPath = "$VaultPath.pending"
  try {
    $acl = Get-Acl -LiteralPath $VaultPath
    $property = $vault.Values.PSObject.Properties[$Name]
    if ($null -ne $property) {
      if ($property.Value -is [IDisposable]) { $property.Value.Dispose() }
      [void]$vault.Values.PSObject.Properties.Remove($Name)
    }
    $vault | Export-Clixml -LiteralPath $pendingPath
    Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
    Set-Acl -LiteralPath $VaultPath -AclObject $acl
  } finally {
    Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
    foreach ($entry in $vault.Values.PSObject.Properties) {
      if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() }
    }
  }
}

function Set-Phase7eVaultSecureEntry {
  param(
    [Parameter(Mandatory)][string]$VaultPath,
    [Parameter(Mandatory)][ValidateSet(
      'SUPABASE_PRODUCTION_DB_PASSWORD',
      'SUPABASE_PRODUCTION_PUBLISHABLE_KEY',
      'SUPABASE_PRODUCTION_SECRET_KEY',
      'RESEND_PRODUCTION_RUNTIME_API_KEY',
      'STRIPE_LIVE_WEBHOOK_SECRET'
    )][string]$Name,
    [Parameter(Mandatory)][Security.SecureString]$Value
  )
  $vault = Import-Phase7eProductionVault -VaultPath $VaultPath
  $pendingPath = "$VaultPath.pending"
  try {
    $acl = Get-Acl -LiteralPath $VaultPath
    $vault.Values | Add-Member -MemberType NoteProperty -Name $Name -Value $Value -Force
    $vault | Export-Clixml -LiteralPath $pendingPath
    $roundTrip = Import-Phase7eProductionVault -VaultPath $pendingPath
    try {
      $entry = $roundTrip.Values.PSObject.Properties[$Name]
      if ($null -eq $entry -or $entry.Value -isnot [Security.SecureString]) {
        throw 'Generated Production credential round-trip failed.'
      }
      Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
      Set-Acl -LiteralPath $VaultPath -AclObject $acl
    } finally {
      foreach ($entry in $roundTrip.Values.PSObject.Properties) {
        if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() }
      }
    }
  } finally {
    Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
    foreach ($entry in $vault.Values.PSObject.Properties) {
      if ($entry.Value -is [IDisposable]) { $entry.Value.Dispose() }
    }
  }
}

Export-ModuleMember -Function Get-Phase7eProductionVaultPath, Import-Phase7eProductionVault, Set-Phase7eProductionCredentials, Remove-Phase7eVaultEntry, Set-Phase7eVaultSecureEntry
