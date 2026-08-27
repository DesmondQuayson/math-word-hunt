// Ultra-light network diagnostic endpoint for school/district IT.
// No React, no auth, no database, no Supabase, no Stripe, no JavaScript, no
// external assets, no PII. Renders instantly if — and only if — the network
// path to mathnexa.com works, which is exactly what it exists to prove.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const host = new URL(request.url).hostname;
  const now = new Date().toISOString();
  const body = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>MathNexa Network Check</title>
<body style="margin:2rem;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#071525">
<h1 style="font-size:1.3rem;margin:0 0 .5rem">MathNexa Network Check</h1>
<p><strong>Connection to MathNexa successful.</strong></p>
<p>Host: ${host}<br>Server time (UTC): ${now}<br>Transport: HTTPS (TCP 443)</p>
<p>This page is served entirely from this host with no scripts, images, fonts,
or third-party requests. If you can read it, the network path to MathNexa works.</p>
<p>District IT information: <a href="/school-network">mathnexa.com/school-network</a></p>
</body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex"
    }
  });
}
