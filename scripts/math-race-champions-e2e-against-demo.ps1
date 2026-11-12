# Runs the Math Race Champions browser tests against an ALREADY RUNNING local
# review server (node scripts/run-math-race-champions.mjs demo), instead of
# starting a second one. Local Supabase only.
#   powershell -File scripts/math-race-champions-e2e-against-demo.ps1 --project=chromium classroom.spec.ts
# Windows PowerShell 5.1 turns a native command's stderr into an error under
# "Stop", and `supabase status` always writes its stopped-services note there.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
$status = (& cmd /c "node node_modules\supabase\dist\supabase.js status -o json 2>nul") | Out-String | ConvertFrom-Json
if ($status.API_URL -notmatch '^http://127\.0\.0\.1:\d+$') { throw "Local Supabase only." }
$env:MATH_RACE_CHAMPIONS_URL = "http://127.0.0.1:3103"
$env:POLYGON_SHOWDOWN_URL = $env:MATH_RACE_CHAMPIONS_URL
$env:MATH_BINGO_LIVE_URL = $env:MATH_RACE_CHAMPIONS_URL
$env:SUPABASE_TEST_URL = $status.API_URL
$env:SUPABASE_TEST_SECRET_KEY = $status.SECRET_KEY
$env:RACE_SCHOOL_CODE = "RACE-LOCAL"
$env:RACE_ACCOUNTS = '{"owner":{"email":"race-owner@example.test","password":"RaceOwner42!"},"racer":{"email":"race-racer@example.test","password":"RaceRacer42!"},"creator":{"email":"race-creator@example.test","password":"RaceCreator42!"},"shopper":{"email":"race-shopper@example.test","password":"RaceShopper42!"}}'
node node_modules/@playwright/test/cli.js test --config=playwright.math-race-champions.config.mjs @args
exit $LASTEXITCODE
