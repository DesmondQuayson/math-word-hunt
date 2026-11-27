import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assertPrivateDestination, periods, googleRead, collect } from './google-readonly.mjs';

test('private analytics refuses public CI and output inside a Git repository', () => {
  assert.throws(() => assertPrivateDestination(resolve('qa-artifacts'), { CI: 'true' }), /PRIVATE_EXECUTOR/);
  assert.throws(() => assertPrivateDestination(resolve('.seo-private'), {}), /OUTSIDE_GIT/);
  assert.throws(() => assertPrivateDestination('relative', {}), /ABSOLUTE/);
});
test('complete comparison windows handle month boundaries without overlap', () => {
  assert.deepEqual(periods('2026-11-24'), { current: { startDate: '2026-10-28', endDate: '2026-11-24' }, previous: { startDate: '2026-09-30', endDate: '2026-10-27' } });
  assert.throws(() => periods('2026-02-30'), /INVALID/);
});
test('Google token never reaches an arbitrary host, mutation endpoint or redirected fetch', async () => {
  let calls = 0;
  const fake = async (url, options) => { calls++; assert.equal(options.redirect, 'error'); throw new Error('secret body/token'); };
  for (const url of ['https://evil.invalid/', 'https://analyticsadmin.googleapis.com/v1beta/properties/123', 'https://www.googleapis.com/webmasters/v3/sites']) {
    await assert.rejects(googleRead(url, 'test-token', { mutation: true }, fake), /ENDPOINT_REJECTED/);
  }
  assert.equal(calls, 0);
  await assert.rejects(googleRead('https://www.googleapis.com/webmasters/v3/sites', 'test-token', undefined, fake), /^Error: GOOGLE_NETWORK_UNAVAILABLE$/);
});
test('discovery preserves one authorized source when the other is unavailable', async () => {
  const result = await collect({ mode: 'discover' }, async url => {
    if (url.includes('analyticsadmin')) throw new Error('private provider payload');
    return { siteEntry: [] };
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.sources[0].data.siteEntry.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /private provider/);
});
test('baseline refuses a different site stream before acquiring analytics', async () => {
  const calls = [];
  await assert.rejects(collect({ mode: 'baseline', site: 'sc-domain:mathnexa.com', property: '123', endDate: '2026-11-24' }, async url => {
    calls.push(url);
    return url.includes('dataStreams') ? { dataStreams: [{ webStreamData: { defaultUri: 'https://unrelated.example' } }] } : { timeZone: 'America/Chicago' };
  }), /STREAM_NOT_VERIFIED/);
  assert.equal(calls.length, 2);
});
