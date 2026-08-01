param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 7D credential vault is unavailable.' }

function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$pendingPath = "$VaultPath.pending"
$vault = $null
$verified = $null
$secure = $null
$token = $null
try {
  $vault = Import-Clixml -LiteralPath $VaultPath
  $existing = $vault.Values.MVH_STAGING_ACCESS_TOKEN
  if ($null -ne $existing) {
    $token = Open-SecureValue $existing
    if ($token -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'Stored Phase 7D staging token is invalid.' }
  } else {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) }
    finally { $random.Dispose() }
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    if ($token -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'Generated Phase 7D staging token is invalid.' }
    $secure = ConvertTo-SecureString $token -AsPlainText -Force
    $vault.Values | Add-Member -MemberType NoteProperty -Name 'MVH_STAGING_ACCESS_TOKEN' -Value $secure -Force
    $vault | Export-Clixml -LiteralPath $pendingPath
    $rawVault = Get-Content -LiteralPath $pendingPath -Raw
    if ($rawVault.Contains($token)) { throw 'Phase 7D staging token was serialized as plaintext.' }
    $rawVault = $null
    $verified = Import-Clixml -LiteralPath $pendingPath
    if ($null -eq $verified.Values.MVH_STAGING_ACCESS_TOKEN -or
      $verified.Values.MVH_STAGING_ACCESS_TOKEN.GetType().FullName -ne 'System.Security.SecureString') {
      throw 'Phase 7D staging token vault verification failed.'
    }
    $roundTrip = Open-SecureValue $verified.Values.MVH_STAGING_ACCESS_TOKEN
    try {
      if ($roundTrip -cne $token) { throw 'Phase 7D staging token vault round-trip failed.' }
    } finally { $roundTrip = $null }
    $acl = Get-Acl -LiteralPath $VaultPath
    Move-Item -LiteralPath $pendingPath -Destination $VaultPath -Force
    Set-Acl -LiteralPath $VaultPath -AclObject $acl
  }
  Write-Output 'PHASE7D_STAGING_ACCESS_TOKEN_READY'
} finally {
  $token = $null
  Remove-Item -LiteralPath $pendingPath -Force -ErrorAction SilentlyContinue
  if ($null -ne $verified) {
    foreach ($entry in $verified.Values.PSObject.Properties) { $entry.Value.Dispose() }
  }
  if ($null -ne $vault) {
    foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  }
  if ($null -ne $secure) { $secure.Dispose() }
  $verified = $null
  $vault = $null
}
