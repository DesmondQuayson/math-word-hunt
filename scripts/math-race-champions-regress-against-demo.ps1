# Runs ANOTHER live game's browser suite against an already running Math Race
# Champions review server (node scripts/run-math-race-champions.mjs demo), to
# show the shared /join router and room-code guard did not disturb it.
#   powershell -File scripts/math-race-champions-regress-against-demo.ps1 bingo --project=chromium live.spec.ts
#   powershell -File scripts/math-race-champions-regress-against-demo.ps1 polygon --project=chromium showdown.spec.ts
param([Parameter(Mandatory = $true)][ValidateSet("bingo", "polygon", "tug-online")][string]$Game, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest)
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
$status = (& cmd /c "node node_modules\supabase\dist\supabase.js status -o json 2>nul") | Out-String | ConvertFrom-Json
if ($status.API_URL -notmatch '^http://127\.0\.0\.1:\d+$') { throw "Local Supabase only." }
$origin = "http://127.0.0.1:3103"
$env:MATH_RACE_CHAMPIONS_URL = $origin
$env:POLYGON_SHOWDOWN_URL = $origin
$env:MATH_BINGO_LIVE_URL = $origin
$env:SUPABASE_TEST_URL = $status.API_URL
$env:SUPABASE_TEST_SECRET_KEY = $status.SECRET_KEY
$env:BINGO_TEACHER_EMAIL = "bingo-teacher@example.test"
$env:BINGO_TEACHER_PASSWORD = "BingoTeacher42!"
$env:POLYGON_SCHOOL_CODE = "RACE-LOCAL"
$env:POLYGON_ACCOUNTS = '{"owner":{"email":"polygon-owner@example.test","password":"PolygonOwner42!"},"creator":{"email":"polygon-creator@example.test","password":"PolygonCreator42!"},"joiner":{"email":"polygon-joiner@example.test","password":"PolygonJoiner42!"},"shopper":{"email":"polygon-shopper@example.test","password":"PolygonShopper42!"},"teacher":{"email":"bingo-teacher@example.test","password":"BingoTeacher42!"}}'
$config = @{ bingo = "playwright.math-bingo-live.config.mjs"; polygon = "playwright.polygon-showdown.config.mjs"; "tug-online" = "playwright.math-tug-of-war-online.config.mjs" }[$Game]
node node_modules/@playwright/test/cli.js test "--config=$config" @Rest
exit $LASTEXITCODE
