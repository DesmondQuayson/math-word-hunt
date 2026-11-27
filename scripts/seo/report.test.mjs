import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, renderReport, reportingWeek } from './report.mjs';

const audit = (date = '2026-11-23T13:00:00.000Z', count = 4) => ({
  schemaVersion: 1, observedAt: date, requestsUsed: 3, requestLimit: 30, complete: true,
  sites: [{ origin: 'https://mathnexa.com', robots: { url: 'https://mathnexa.com/robots.txt', status: 200 }, sitemap: { url: 'https://mathnexa.com/sitemap.xml', status: 200 }, pages: [{ url: 'https://mathnexa.com/', status: 200, title: 'Public', canonical: 'https://mathnexa.com/', h1Count: 1 }] }],
  findings: Array.from({ length: count }, (_, i) => ({ id: `test-${i}`, target: 'https://mathnexa.com/', severity: 'warning', message: `Observed issue ${i}` }))
});
test('initial and recurring limits, stable proposals, and approval preservation', () => {
  const first = buildReport(audit(), { now: new Date('2026-11-23T14:00:00Z') });
  assert.equal(first.newProposalIds.length, 3);
  first.proposals[0].status = 'owner-approved';
  const second = buildReport(audit('2026-11-30T13:00:00Z', 8), { previous: first, now: new Date('2026-11-30T14:00:00Z') });
  assert.equal(second.newProposalIds.length, 2);
  assert.equal(second.proposals[0].status, 'owner-approved');
  assert.equal(new Set(second.proposals.map(p => p.id)).size, second.proposals.length);
  assert.equal(second.comparison.comparableWeeklySnapshot, true);
});
test('network failure is not recorded as an issue resolved', () => {
  const first = buildReport(audit(), { now: new Date('2026-11-23T14:00:00Z') });
  const failed = audit('2026-11-30T13:00:00Z', 0);
  failed.complete = false;
  failed.sites[0].pages[0] = { url: 'https://mathnexa.com/', status: null, error: 'timeout' };
  const next = buildReport(failed, { previous: first, now: new Date('2026-11-30T14:00:00Z') });
  assert.equal(next.ledger[0].status, 'observed');
  assert.equal(next.proposals[0].currentObservation, 'unavailable');
  assert.equal(next.status, 'Partial');
});
test('manual reruns cannot exceed the combined weekly proposal budget', () => {
  const first = buildReport(audit(), { now: new Date('2026-11-23T14:00:00Z') });
  const repeat = buildReport(audit('2026-11-24T13:00:00Z', 8), { previous: first, now: new Date('2026-11-24T14:00:00Z') });
  assert.equal(repeat.newProposalIds.length, 0);
  assert.equal(repeat.proposalBudget.used, 3);
  const nextWeek = buildReport(audit('2026-11-30T13:00:00Z', 8), { previous: repeat, now: new Date('2026-11-30T14:00:00Z') });
  assert.equal(nextWeek.newProposalIds.length, 2);
  const nextRepeat = buildReport(audit('2026-12-01T13:00:00Z', 10), { previous: nextWeek, now: new Date('2026-12-01T14:00:00Z') });
  assert.equal(nextRepeat.newProposalIds.length, 0);
});
test('sitemap failures and unexpanded indexes do not clear membership findings', () => {
  const firstAudit = audit();
  firstAudit.findings = [{ id: 'https://mathnexa.com/#sitemap-membership', target: 'https://mathnexa.com/', severity: 'warning', message: 'Missing from sitemap' }];
  const first = buildReport(firstAudit, { now: new Date('2026-11-23T14:00:00Z') });
  for (const sitemap of [{ url: 'https://mathnexa.com/sitemap.xml', status: null, error: 'timeout' }, { url: 'https://mathnexa.com/sitemap.xml', status: 200, kind: 'index' }]) {
    const nextAudit = audit('2026-11-30T13:00:00Z', 0);
    nextAudit.sites[0].sitemap = sitemap;
    const next = buildReport(nextAudit, { previous: first, now: new Date('2026-11-30T14:00:00Z') });
    assert.equal(next.ledger[0].status, 'observed');
    assert.equal(next.proposals[0].currentObservation, 'unavailable');
  }
});
test('report week boundary follows Chicago rather than UTC, including DST', () => {
  assert.equal(reportingWeek(new Date('2026-11-30T02:00:00Z')), '2026-11-23');
  assert.equal(reportingWeek(new Date('2026-11-30T06:00:00Z')), '2026-11-30');
  assert.equal(reportingWeek(new Date('2026-07-06T05:00:00Z')), '2026-07-06');
});
test('offline replay does not refresh observation time or add proposals', () => {
  const report = buildReport(audit(), { mode: 'offline-replay', now: new Date('2026-11-26T13:00:00Z') });
  assert.equal(report.freshness.ageHours, 72);
  assert.equal(report.freshness.live, false);
  assert.equal(report.audit.observedAt, '2026-11-23T13:00:00.000Z');
  assert.deepEqual(report.newProposalIds, []);
});
test('report treats public HTML-like strings as text and states unavailable metrics', () => {
  const input = audit();
  input.sites[0].pages[0].title = '<img src=x onerror=alert(1)> [click](https://bad.example) |\n#header';
  const output = renderReport(buildReport(input, { now: new Date('2026-11-26T13:00:00Z') }));
  assert.ok(!output.includes('<img'));
  assert.ok(!output.includes('[click]'));
  assert.match(output, /missing is not zero/);
});
