param(
  [Parameter(Mandatory = $true)][ValidateSet('SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','VERCEL_AUTOMATION_BYPASS_SECRET')][string]$Name,
  [string]$VaultPath = (Join-Path $env:LOCALAPPDATA 'MathNexa\phase7d-staging-vault.json')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 7D vault is unavailable.' }
$plain = $env:PHASE7D_VAULT_SECRET_VALUE
if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Phase 7D vault update value is unavailable.' }
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
try {
  $vault = Get-Content -LiteralPath $VaultPath -Raw | ConvertFrom-Json
  $vault.values | Add-Member -MemberType NoteProperty -Name $Name -Value ($secure | ConvertFrom-SecureString) -Force
  $vault | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $VaultPath -Encoding UTF8
} finally {
  $secure.Dispose()
  $plain = $null
  Remove-Item Env:PHASE7D_VAULT_SECRET_VALUE -ErrorAction SilentlyContinue
}
