param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml'),
  [string]$RepairRunId = ''
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 10 staging credential vault is unavailable.' }

function Open-SecureValue {
  param([Security.SecureString]$Secure)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$vault = Import-Clixml -LiteralPath $VaultPath
$names = @(
  'SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY',
  'MVH_STAGING_ACCESS_TOKEN','VERCEL_AUTOMATION_BYPASS_SECRET'
)
try {
  Set-Location $repositoryRoot
  if ((git branch --show-current).Trim() -ne 'feature/admin-product-model-alignment') {
    throw 'Phase 10 hosted staging requires feature/admin-product-model-alignment.'
  }
  git diff --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Stage the complete Phase 10 candidate before hosted verification.' }
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { throw 'No staged Phase 10 candidate is available.' }
  $candidateTree = (git write-tree).Trim()
  if ($candidateTree -notmatch '^[a-f0-9]{40}$') { throw 'Candidate tree could not be frozen.' }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath 'docs\index.html').Hash -ne '7F00ED6789A2FAF23B90E96C3DFDEE0167ACED87BEB08DABF10B89C3E72C9FC5' -or
      (Get-FileHash -Algorithm SHA256 -LiteralPath 'docs\vocab.js').Hash -ne 'CAEB8FBB590FFFD8CBC169F88F174A38C26DE2D16A7E1B0C1CF5E83AC9F01C46') {
    throw 'Protected canonical hash mismatch.'
  }
  foreach ($name in $names) {
    $entry = $vault.Values.PSObject.Properties[$name]
    if (-not $entry) { throw "Missing required staging credential: $name" }
    $plain = Open-SecureValue $entry.Value
    try { [Environment]::SetEnvironmentVariable($name, $plain, 'Process') }
    finally { $plain = $null }
  }
  $vercel = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx') -Recurse -Filter 'vercel.cmd' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  if (-not $vercel) { throw 'Authenticated Vercel CLI is unavailable.' }
  $env:PHASE10_VERCEL_CLI = $vercel
  $env:PHASE10_CANDIDATE_TREE = $candidateTree
  if ($RepairRunId) {
    if ($RepairRunId -notmatch '^[a-f0-9]{32}$') { throw 'Invalid Phase 10 repair run ID.' }
    $env:PHASE10_REPAIR_MANIFEST_RUN_ID = $RepairRunId
  }
  & node scripts/run-phase10-hosted-staging.mjs
  exit $LASTEXITCODE
} finally {
  foreach ($name in ($names + @('PHASE10_VERCEL_CLI','PHASE10_CANDIDATE_TREE','PHASE10_REPAIR_MANIFEST_RUN_ID'))) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
