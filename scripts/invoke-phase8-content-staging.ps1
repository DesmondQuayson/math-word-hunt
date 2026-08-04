param(
  [string]$VaultPath = (Join-Path $env:USERPROFILE '.mathnexa-secrets\phase7d-credentials.clixml')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath $VaultPath)) { throw 'Phase 8 staging credential vault is unavailable.' }

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
  if ((git branch --show-current).Trim() -ne 'codex/admin-content-operations') {
    throw 'Phase 8 content staging requires the approved feature branch.'
  }
  git diff --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Stage the complete candidate before hosted verification.' }
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { throw 'No staged Phase 8 candidate is available.' }
  $candidateTree = (git write-tree).Trim()
  if ($candidateTree -notmatch '^[a-f0-9]{40}$') { throw 'Candidate tree could not be frozen.' }
  $indexHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'docs\index.html').Hash
  $vocabHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'docs\vocab.js').Hash
  if ($indexHash -ne '10D0E49CD5DECF316615A10F6BDE37DC89796B2D8817EB1CF5D9EE25D263747E' -or
      $vocabHash -ne 'CAEB8FBB590FFFD8CBC169F88F174A38C26DE2D16A7E1B0C1CF5E83AC9F01C46') {
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
  $env:PHASE8_VERCEL_CLI = $vercel
  $env:PHASE8_CANDIDATE_TREE = $candidateTree
  & node scripts/run-phase8-content-staging.mjs
  exit $LASTEXITCODE
} finally {
  foreach ($name in ($names + @('PHASE8_VERCEL_CLI','PHASE8_CANDIDATE_TREE'))) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  foreach ($entry in $vault.Values.PSObject.Properties) { $entry.Value.Dispose() }
  $vault = $null
}
