# MathNexa school-network diagnostic (read-only).
# Run while connected to the SCHOOL WiFi. No administrator rights needed.
# Collects ONLY network reachability results for MathNexa and one control site.
# Never touches passwords, cookies, history, files, or student data.
#
# Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\diagnose-school-network.ps1
# Report is written to the Desktop as school-network-diagnostic.txt

$ErrorActionPreference = "Continue"
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "school-network-diagnostic.txt"
$lines = New-Object System.Collections.Generic.List[string]
function Say([string]$s) { $lines.Add($s); Write-Host $s }

$hosts = @(
  @{ Name = "CUSTOM_DOMAIN";  Host = "mathnexa.com" },
  @{ Name = "WWW_DOMAIN";     Host = "www.mathnexa.com" },
  @{ Name = "SHOWME";         Host = "showme.mathnexa.com" },
  @{ Name = "VERCEL_DIRECT";  Host = "mathnexa-platform-production.vercel.app" },
  @{ Name = "CONTROL_GOOGLE"; Host = "www.google.com" }
)

Say ("MathNexa school-network diagnostic - " + (Get-Date))
Say ("Machine DNS servers:")
try { Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | ForEach-Object { Say ("  " + $_.InterfaceAlias + ": " + ($_.ServerAddresses -join ", ")) } } catch { Say "  (unavailable)" }
Say ("System proxy:")
try { (netsh winhttp show proxy) | ForEach-Object { Say ("  " + $_) } } catch { Say "  (unavailable)" }
Say ""

foreach ($h in $hosts) {
  $tag = $h.Name; $target = $h.Host
  Say ("==== " + $tag + " (" + $target + ") ====")

  # 1) DNS via the school's resolver
  $dnsOk = $false
  try {
    $a = Resolve-DnsName $target -Type A -ErrorAction Stop | Where-Object { $_.IPAddress }
    if ($a) { $dnsOk = $true; Say ("DNS_PASS " + $tag + " -> " + (($a | Select-Object -ExpandProperty IPAddress) -join ", ")) }
  } catch {}
  if (-not $dnsOk) { Say ("DNS_FAIL " + $tag + " (school resolver did not return an address)") }

  # 1b) DNS via a public resolver, for comparison
  try {
    $p = Resolve-DnsName $target -Type A -Server 1.1.1.1 -ErrorAction Stop | Where-Object { $_.IPAddress }
    if ($p) { Say ("DNS_PUBLIC_PASS " + $tag + " -> " + (($p | Select-Object -ExpandProperty IPAddress) -join ", ")) }
  } catch { Say ("DNS_PUBLIC_FAIL " + $tag + " (public resolver 1.1.1.1 unreachable or blocked)") }

  # 2) TCP 443
  $tcpOk = $false
  try {
    $t = Test-NetConnection $target -Port 443 -WarningAction SilentlyContinue
    if ($t.TcpTestSucceeded) { $tcpOk = $true; Say ("TCP443_PASS " + $tag) } else { Say ("TCP443_FAIL " + $tag) }
  } catch { Say ("TCP443_FAIL " + $tag) }

  # 3) Full HTTPS request (TLS + HTTP) via curl.exe (ships with Windows 10/11)
  if ($tcpOk -or $dnsOk) {
    $curlOut = & curl.exe -sIv --max-time 20 ("https://" + $target + "/") 2>&1 | Out-String
    $status = ($curlOut -split "`n" | Where-Object { $_ -match "^HTTP/" } | Select-Object -First 1)
    $tlsLine = ($curlOut -split "`n" | Where-Object { $_ -match "SSL connection using|TLSv" } | Select-Object -First 1)
    $issuer  = ($curlOut -split "`n" | Where-Object { $_ -match "issuer:" } | Select-Object -First 1)
    if ($tlsLine) { Say ("TLS_PASS " + $tag + " - " + $tlsLine.Trim()) } else { Say ("TLS_FAIL " + $tag + " (no TLS handshake completed)") }
    if ($issuer) { Say ("TLS_ISSUER " + $tag + " - " + $issuer.Trim()) }
    if ($status) { Say ("HTTP_PASS " + $tag + " - " + $status.Trim()) } else { Say ("HTTP_FAIL " + $tag) }
    $err = ($curlOut -split "`n" | Where-Object { $_ -match "curl: \(\d+\)" } | Select-Object -First 1)
    if ($err) { Say ("CURL_ERROR " + $tag + " - " + $err.Trim()) }
  } else {
    Say ("TLS_SKIP " + $tag + " (no DNS/TCP)")
    Say ("HTTP_SKIP " + $tag)
  }
  Say ""
}

Say "==== SUMMARY GUIDE ===="
Say "DNS_FAIL on MathNexa but DNS_PASS on CONTROL_GOOGLE  -> school DNS/content filter blocks the name (Case A)."
Say "DNS_PASS + TCP443_FAIL                               -> firewall blocks the connection (Case B)."
Say "TCP443_PASS + TLS_FAIL / connection closed            -> TLS inspection or SNI-based block (Case C)."
Say "CUSTOM_DOMAIN fails but VERCEL_DIRECT passes          -> domain categorization issue (Case D)."
Say "Both CUSTOM_DOMAIN and VERCEL_DIRECT fail             -> hosting-provider level block (Case E)."
Say "Everything passes here but the browser still fails    -> managed browser policy/extension (Case F)."

$lines | Set-Content -Path $report -Encoding utf8
Write-Host ""
Write-Host ("Report saved to: " + $report)
Write-Host "Please send that file back for analysis."
