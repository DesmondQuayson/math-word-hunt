import { mkdir, writeFile } from 'node:fs/promises';

// Optional manual lab check of the exact proposed public page. No API key,
// private URL, screenshots, raw HTML or additional scheduler is involved.
const target = 'https://mathnexa.com/homework-pdfs';
const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
url.searchParams.set('url', target);
url.searchParams.set('strategy', 'mobile');
for (const category of ['PERFORMANCE', 'ACCESSIBILITY', 'SEO']) url.searchParams.append('category', category);
let result = { target, observedAt: new Date().toISOString(), mode: 'mobile-lab', status: 'unavailable', scores: null, metrics: null };
try {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(55000) });
  result.httpStatus = response.status;
  if (response.ok) {
    const data = await response.json();
    const lhr = data.lighthouseResult;
    if (lhr && !lhr.runtimeError) {
      result = { ...result, status: 'observed', lighthouseVersion: lhr.lighthouseVersion, fetchTime: lhr.fetchTime, finalUrl: lhr.finalUrl,
        scores: Object.fromEntries(Object.entries(lhr.categories ?? {}).map(([key, value]) => [key, value.score])),
        metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map(key => [key, { value: lhr.audits?.[key]?.numericValue ?? null, unit: lhr.audits?.[key]?.numericUnit ?? null }])),
      };
    }
  }
} catch { result.failure = 'network-or-timeout'; }
await mkdir('.seo-output', { recursive: true });
await writeFile('.seo-output/mobile-audit.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (result.status !== 'observed') process.exitCode = 1;
