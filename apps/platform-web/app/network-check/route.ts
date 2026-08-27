// MathNexa network diagnostic endpoint (school/district IT).
// No auth, no Supabase, no Stripe, no database, no client JavaScript, no
// images, no fonts, no PII. If this page renders, the network path to
// MathNexa works; if the homepage then fails, the issue is application-level.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const hostname = new URL(request.url).hostname;
  const body = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>MathNexa Network Check</title>
<body style="margin:2rem;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#071525">
<h1 style="font-size:1.25rem;margin:0 0 .5rem">MathNexa Network Check</h1>
<p><strong>Connection to MathNexa successful.</strong></p>
<p>Hostname:<br>${hostname}</p>
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
