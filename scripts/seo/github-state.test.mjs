import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { githubClient, restoreState, publishState, validatePublicReport } from './github-state.mjs';

const report = { schemaVersion: 1, kind: 'mathnexa-public-seo', publicDataOnly: true, mode: 'live', audit: { sites: [] }, proposals: [], ledger: [] };
async function output() {
  const dir = await mkdtemp(join(tmpdir(), 'mathnexa-seo-'));
  await writeFile(join(dir, 'report.json'), JSON.stringify(report));
  await writeFile(join(dir, 'report.md'), 'Public checks only');
  return dir;
}
test('offline results cannot be published as a new live cloud run', () => {
  assert.throws(() => validatePublicReport({ ...report, mode: 'offline-replay' }));
});
test('token goes only to fixed GitHub repository with redirects forbidden', async () => {
  const api = githubClient({ token: 'test-token', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/DesmondQuayson/math-word-hunt/git/ref/heads/seo-reports');
    assert.equal(options.redirect, 'error');
    return new Response('{}', { status: 200 });
  } });
  await api('/git/ref/heads/seo-reports');
  await assert.rejects(api('https://example.com'));
});
test('first run creates an orphan evidence branch without touching main', async () => {
  const calls = [];
  let created = false;
  const api = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path === '/git/ref/heads/seo-reports') return created ? { object: { sha: 'new-commit' } } : null;
    if (path === '/git/trees') return { sha: 'new-tree' };
    if (path === '/git/commits') { assert.deepEqual(options.body.parents, []); return { sha: 'new-commit' }; }
    if (path === '/git/refs') { assert.equal(options.body.ref, 'refs/heads/seo-reports'); created = true; return {}; }
    throw new Error('Unexpected endpoint');
  };
  assert.equal(await publishState(api, { output: await output(), runId: '123', attempt: '1' }), 'new-commit');
  assert.ok(calls.every(c => !c.path.includes('main')));
});
test('existing history is preserved and reference updates never force', async () => {
  let updated = false;
  const api = async (path, options = {}) => {
    if (path === '/git/ref/heads/seo-reports') return { object: { sha: updated ? 'new' : 'old' } };
    if (path === '/git/commits/old') return { tree: { sha: 'old-tree' } };
    if (path === '/git/trees') { assert.equal(options.body.base_tree, 'old-tree'); return { sha: 'tree' }; }
    if (path === '/git/commits') { assert.deepEqual(options.body.parents, ['old']); return { sha: 'new' }; }
    if (path === '/git/refs/heads/seo-reports') { assert.equal(options.body.force, false); updated = true; return {}; }
    throw new Error('Unexpected endpoint');
  };
  assert.equal(await publishState(api, { output: await output(), runId: '123', attempt: '2', expectedParent: 'old' }), 'new');
});
test('concurrent remote changes fail before a write', async () => {
  const api = async (path, options = {}) => { assert.equal(options.method, undefined); return { object: { sha: 'changed' } }; };
  await assert.rejects(publishState(api, { output: await output(), runId: '123', attempt: '1', expectedParent: 'old' }), /changed/);
});
test('restore pins previous content to the exact remote commit', async () => {
  const dir = await output();
  const api = async path => {
    if (path === '/git/ref/heads/seo-reports') return { object: { sha: 'old' } };
    assert.equal(path, '/contents/reports/latest.json?ref=old');
    return { encoding: 'base64', size: 200, content: Buffer.from(JSON.stringify(report)).toString('base64') };
  };
  assert.equal(await restoreState(api, dir), true);
  assert.equal((await readFile(join(dir, 'parent.txt'), 'utf8')).trim(), 'old');
});
