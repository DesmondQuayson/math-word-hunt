import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './geo-measure.mjs';
const panel = { version: 1, questions: [{ id: 'q1', question: 'Example question?', branded: false }, { id: 'q2', question: 'Brand question?', branded: true }] };
const observation = { questionId: 'q1', exactQuestion: 'Example question?', provider: 'fixture', surface: 'consumer-ai', visibleModelOrVersion: 'unknown', locale: 'en-US / US', mode: 'new chat, search on', observedAtUtc: '2026-11-20T12:00:00Z', status: 'completed', mathnexaMention: true, linkedCitation: 'https://mathnexa.com/homework-pdfs', citedCompetitors: [], sourceRelevanceVerified: true, minimalEvidenceReference: 'synthetic test fixture; not a measurement' };
const now = new Date('2026-11-27T12:00:00Z');
test('empty/unavailable observations are unavailable, never zero visibility', () => {
  assert.equal(summarize(panel, [], now).status, 'not-measured');
  const r = summarize(panel, [{ ...observation, status: 'unavailable', mathnexaMention: null, linkedCitation: null }], now);
  assert.equal(r.groups[0].mentionRate, null);
  assert.equal(r.groups[0].completed, 0);
});
test('consumer AI, model API and branded questions retain separate denominators', () => {
  const r = summarize(panel, [observation, { ...observation, surface: 'model-api', mathnexaMention: false, linkedCitation: null }, { ...observation, questionId: 'q2', exactQuestion: 'Brand question?' }], now);
  assert.equal(r.groups.length, 3);
  assert.equal(r.groups[1].mentionRate, 0);
  assert.equal(r.groups[2].branded, true);
});
test('rejects duplicate sampling, prompt drift, missing evidence and private citation URLs', () => {
  assert.throws(() => summarize(panel, [observation, observation], now), /Duplicate/);
  for (const patch of [{ exactQuestion: 'changed' }, { minimalEvidenceReference: '' }, { linkedCitation: 'https://mathnexa.com/?token=private' }, { observedAtUtc: '2099-01-01T00:00:00Z' }, { status: 'unavailable' }]) {
    assert.throws(() => summarize(panel, [{ ...observation, ...patch }], now));
  }
});
