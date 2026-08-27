# MathNexa school-network diagnostic (Windows). Read-only, no admin rights.
# Run on the SCHOOL WiFi:
#   powershell -ExecutionPolicy Bypass -File .\diagnose-school-network.ps1
# Report: Desktop\school-network-diagnostic.txt
# Collects network reachability only - never passwords, cookies, history, or files.

$ErrorActionPreference = "Continue"
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "school-network-diagnostic.txt"
$out = New-Object System.Collections.Generic.List[string]
function Say([string]$s) { $out.Add($s); Write-Host $s }

$targets = @(
  @{ Tag = "MATHNEXA";      Host = "mathnexa.com" },
  @{ Tag = "WWW";           Host = "www.mathnexa.com" },
  @{ Tag = "SHOWME";        Host = "showme.mathnexa.com" },
  @{ Tag = "VERCEL_DIRECT"; Host = "mathnexa-platform-production.vercel.app" },
  @{ Tag = "CONTROL";       Host = "www.google.com" }
)

Say ("MathNexa diagnostic - " + (Get-Date))
try { Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | ForEach-Object { Say ("DNS servers (" + $_.InterfaceAlias + "): " + ($_.ServerAddresses -join ", ")) } } catch {}
try { (netsh winhttp show proxy) | ForEach-Object { Say $_ } } catch {}
Say ""

foreach ($t in $targets) {
  $tag = $t.Tag; $target = $t.Host
  Say ("==== " + $tag + " (" + $target + ") ====")
  $dnsOk = $false
  try { $a = Resolve-DnsName $target -Type A -ErrorAction Stop | Where-Object { $_.IPAddress }; if ($a) { $dnsOk = $true; Say ("DNS_PASS " + (($a.IPAddress) -join ", ")) } } catch {}
  if (-not $dnsOk) { Say "DNS_FAIL (school resolver returned nothing)" }
  try { $p = Resolve-DnsName $target -Type A -Server 1.1.1.1 -ErrorAction Stop | Where-Object { $_.IPAddress }; if ($p) { Say ("DNS_PUBLIC_PASS " + (($p.IPAddress) -join ", ")) } } catch { Say "DNS_PUBLIC_FAIL (1.1.1.1 unreachable)" }
  $tcpOk = $false
  try { $c = Test-NetConnection $target -Port 443 -WarningAction SilentlyContinue; if ($c.TcpTestSucceeded) { $tcpOk = $true; Say "TCP_PASS" } else { Say "TCP_FAIL" } } catch { Say "TCP_FAIL" }
  if ($dnsOk -or $tcpOk) {
    $curl = & curl.exe -sIv --max-time 20 ("https://" + $target + "/") 2>&1 | Out-String
    $tlsLine = ($curl -split "`n" | Where-Object { $_ -match "SSL connection using|TLSv" } | Select-Object -First 1)
    $http = ($curl -split "`n" | Where-Object { $_ -match "^HTTP/" } | Select-Object -First 1)
    $loc = ($curl -split "`n" | Where-Object { $_ -match "^location:" } | Select-Object -First 1)
    $err = ($curl -split "`n" | Where-Object { $_ -match "curl: \(\d+\)" } | Select-Object -First 1)
    if ($tlsLine) { Say ("TLS_PASS " + $tlsLine.Trim()) } else { Say "TLS_FAIL (handshake did not complete)" }
    if ($http) { Say ("HTTP_PASS " + $http.Trim()) } else { Say "HTTP_FAIL" }
    if ($loc) { Say ("REDIRECT " + $loc.Trim()) }
    if ($err) { Say ("CURL " + $err.Trim()) }
  } else { Say "TLS_SKIP"; Say "HTTP_SKIP" }
  Say ""
}

Say "Interpretation: see Cases A-F in docs/operations/mathnexa-school-network-compatibility.md"
$out | Set-Content -Path $report -Encoding utf8
Write-Host ("Saved: " + $report)
