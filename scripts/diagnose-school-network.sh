#!/bin/sh
# MathNexa school-network diagnostic (macOS). Read-only, no admin rights.
# Run on the SCHOOL WiFi:  sh diagnose-school-network.sh
# Report: ~/Desktop/school-network-diagnostic.txt
# Collects network reachability only - never passwords, cookies, history, or files.

REPORT="$HOME/Desktop/school-network-diagnostic.txt"
: > "$REPORT"
say() { echo "$1" | tee -a "$REPORT"; }

say "MathNexa diagnostic - $(date)"
say "DNS servers: $(scutil --dns 2>/dev/null | grep 'nameserver\[' | awk '{print $3}' | sort -u | tr '\n' ' ')"
say ""

for entry in "MATHNEXA mathnexa.com" "WWW www.mathnexa.com" "SHOWME showme.mathnexa.com" "VERCEL_DIRECT mathnexa-platform-production.vercel.app" "CONTROL www.google.com"; do
  tag=$(echo "$entry" | cut -d' ' -f1)
  host=$(echo "$entry" | cut -d' ' -f2)
  say "==== $tag ($host) ===="

  ips=$(dig +short A "$host" 2>/dev/null | tr '\n' ' ')
  if [ -n "$ips" ]; then say "DNS_PASS $ips"; else say "DNS_FAIL (school resolver returned nothing)"; fi
  pub=$(dig +short A "$host" @1.1.1.1 2>/dev/null | tr '\n' ' ')
  if [ -n "$pub" ]; then say "DNS_PUBLIC_PASS $pub"; else say "DNS_PUBLIC_FAIL (1.1.1.1 unreachable)"; fi

  if nc -z -w 8 "$host" 443 2>/dev/null; then say "TCP_PASS"; else say "TCP_FAIL"; fi

  curlout=$(curl -sIv --max-time 20 "https://$host/" 2>&1)
  tlsline=$(echo "$curlout" | grep -E "SSL connection using|TLSv" | head -1)
  httpline=$(echo "$curlout" | grep -E "^HTTP/" | head -1)
  locline=$(echo "$curlout" | grep -i "^location:" | head -1)
  errline=$(echo "$curlout" | grep -E "curl: \([0-9]+\)" | head -1)
  if [ -n "$tlsline" ]; then say "TLS_PASS $tlsline"; else say "TLS_FAIL (handshake did not complete)"; fi
  if [ -n "$httpline" ]; then say "HTTP_PASS $httpline"; else say "HTTP_FAIL"; fi
  [ -n "$locline" ] && say "REDIRECT $locline"
  [ -n "$errline" ] && say "CURL $errline"
  say ""
done

say "Interpretation: see Cases A-F in docs/operations/mathnexa-school-network-compatibility.md"
echo "Saved: $REPORT"
