import { existsSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Deliberately separate from the public cloud workflow. No refresh credentials,
// tracking writes, billing data, customer dimensions or public output support.
export function assertPrivateDestination(output, env = process.env) {
  if (env.GITHUB_ACTIONS || env.CI) throw new Error('PRIVATE_EXECUTOR_REQUIRED');
  if (!output || !isAbsolute(output)) throw new Error('ABSOLUTE_PRIVATE_OUTPUT_REQUIRED');
  let existing = resolve(output);
  const suffix = [];
  while (!existsSync(existing)) {
    suffix.unshift(basename(existing));
    existing = dirname(existing);
  }
  // Resolve existing junctions/symlinks before deciding a destination is outside Git.
  const canonical = resolve(realpathSync(existing), ...suffix);
  let current = canonical;
  while (true) {
    if (existsSync(join(current, '.git'))) throw new Error('OUTPUT_MUST_BE_OUTSIDE_GIT');
    if (current === parse(current).root) break;
    current = dirname(current);
  }
  return canonical;
}

export function periods(endDate, days = 28) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || ![7, 28].includes(days)) throw new Error('INVALID_PERIOD');
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(end.valueOf()) || end.toISOString().slice(0, 10) !== endDate) throw new Error('INVALID_PERIOD');
  const day = (delta) => new Date(end.valueOf() + delta * 86400000).toISOString().slice(0, 10);
  return { current: { startDate: day(1 - days), endDate }, previous: { startDate: day(1 - 2 * days), endDate: day(-days) } };
}

export async function googleRead(url, token, body, fetchImpl = fetch) {
  const u = new URL(url);
  const allowed = !u.username && !u.password && !u.port && u.protocol === 'https:' && (
    (u.origin === 'https://www.googleapis.com' && (
      (u.pathname === '/webmasters/v3/sites' && !body) ||
      (/^\/webmasters\/v3\/sites\/[^/]+\/searchAnalytics\/query$/.test(u.pathname) && !!body))) ||
    (u.origin === 'https://analyticsadmin.googleapis.com' && !body &&
      /^\/v1beta\/(accountSummaries|properties\/\d+(\/dataStreams)?)$/.test(u.pathname)) ||
    (u.origin === 'https://analyticsdata.googleapis.com' && !!body && /^\/v1beta\/properties\/\d+:runReport$/.test(u.pathname))
  );
  if (!allowed) throw new Error('GOOGLE_READ_ENDPOINT_REJECTED');
  if (!token) throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN_REQUIRED');
  let response;
  try {
    response = await fetchImpl(u.href, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error('GOOGLE_NETWORK_UNAVAILABLE'); }
  if (!response.ok) throw new Error(`GOOGLE_HTTP_${response.status}`);
  try { return await response.json(); } catch { throw new Error('GOOGLE_RESPONSE_INVALID'); }
}

async function paged(read, url, key) {
  const items = [];
  let pageToken;
  for (let page = 0; page < 20; page++) {
    const u = new URL(url);
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const result = await read(u.href);
    items.push(...(result[key] ?? []));
    pageToken = result.nextPageToken;
    if (!pageToken) return { items, truncated: false };
  }
  return { items, truncated: true };
}

export async function collect({ mode, site, property, endDate, days = 28 }, read) {
  if (mode === 'discover') {
    const results = await Promise.allSettled([
      read('https://www.googleapis.com/webmasters/v3/sites'),
      paged(read, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', 'accountSummaries'),
    ]);
    return { status: results.every(r => r.status === 'fulfilled') ? 'available' : 'partial', sources: results.map((r, i) => ({ source: i ? 'GA4' : 'GSC', ...(r.status === 'fulfilled' ? { data: r.value } : { unavailable: 'AUTHORIZATION_OR_API_ACCESS_FAILED' }) })) };
  }
  if (mode !== 'baseline' || !['sc-domain:mathnexa.com', 'https://mathnexa.com/'].includes(site) || !/^\d+$/.test(property ?? '')) throw new Error('VERIFIED_PROPERTY_SELECTION_REQUIRED');
  const windows = periods(endDate, days);
  const metadata = await read(`https://analyticsadmin.googleapis.com/v1beta/properties/${property}`);
  const streams = await paged(read, `https://analyticsadmin.googleapis.com/v1beta/properties/${property}/dataStreams?pageSize=200`, 'dataStreams');
  const matches = streams.items.some(s => {
    try { return new URL(s.webStreamData?.defaultUri).hostname === 'mathnexa.com'; } catch { return false; }
  });
  if (!matches || streams.truncated) throw new Error('MATHNEXA_STREAM_NOT_VERIFIED');
  const output = { status: 'available', windows, hostnameScope: 'mathnexa.com only; ShowMe cross-subdomain journey remains unverified', propertyTimeZone: metadata.timeZone, gscTimeZone: 'America/Los_Angeles', sources: {}, caveats: [
    'Owner selects the latest complete end date; GSC final data and GA4 processing can lag.',
    'GSC query rows are suppressed/truncated and are not the site total or backlink inventory.',
    'GA4 organic attribution is session based. Events, subscriptions and revenue require separate verification.',
    'No customer, transaction, event-value or payment data is requested.',
  ] };
  for (const [name, dates] of Object.entries(windows)) {
    const source = {};
    const base = { ...dates, type: 'web', dataState: 'final', rowLimit: 25000, dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'includingRegex', expression: '^https://mathnexa[.]com/' }] }] };
    for (const [label, dimensions] of [['daily', ['date']], ['pages', ['page']], ['queries', ['query']], ['countries', ['country']], ['devices', ['device']]]) {
      const data = await read(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { ...base, dimensions });
      source[`gsc_${label}`] = { ...data, mayBeTruncated: (data.rows?.length ?? 0) >= 25000 };
    }
    source.ga4 = await read(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
      dateRanges: [dates], dimensions: [{ name: 'date' }, { name: 'landingPage' }],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'totalUsers' }], limit: '10000',
      dimensionFilter: { andGroup: { expressions: [
        { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: 'mathnexa.com' } } },
        { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search' } } },
      ] } },
      returnPropertyQuota: true,
    });
    source.ga4.mayBeTruncated = (source.ga4.rowCount ?? 0) > 10000;
    output.sources[name] = source;
  }
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length % 2) throw new Error('EXPECTED_NAMED_ARGUMENT_PAIRS');
  const opts = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2].replace(/^--/, ''), args[i * 2 + 1]]));
  const output = assertPrivateDestination(opts.output);
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (!token) throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN_REQUIRED');
  const result = await collect({ ...opts, endDate: opts.end, days: opts.days ? Number(opts.days) : 28 }, (url, body) => googleRead(url, token, body));
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeFile(join(output, `google-${Date.now()}.json`), JSON.stringify({ observedAt: new Date().toISOString(), ...result }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Private Google result saved. No data printed.');
  if (result.status !== 'available') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(/^[A-Z_0-9]+$/.test(error.message) ? error.message : 'PRIVATE_GOOGLE_RUN_FAILED'); process.exitCode = 1; });
}
