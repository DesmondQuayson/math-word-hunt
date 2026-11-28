import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('fresh dependency-free CLI replays a snapshot with all network access forbidden', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mathnexa-seo-replay-'));
  const snapshot = { schemaVersion: 1, observedAt: '2026-01-01T00:00:00.000Z', requestsUsed: 1, requestLimit: 30, complete: true, sites: [], findings: [] };
  const snapshotPath = join(dir, 'snapshot.json');
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  const child = spawnSync(process.execPath, [
    '--import', 'data:text/javascript,globalThis.fetch=()=>{throw Error("NETWORK FORBIDDEN")}',
    resolve('scripts/seo/run.mjs'), '--config', resolve('docs/seo/config.json'),
    '--offline', '--snapshot', snapshotPath, '--output', join(dir, 'output')
  ], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(await readFile(join(dir, 'output', 'report.json'), 'utf8'));
  assert.equal(report.mode, 'offline-replay');
  assert.equal(report.audit.observedAt, snapshot.observedAt);
  assert.equal(report.freshness.live, false);
  await assert.rejects(access(join(dir, 'output', '.lock')));
});

test('a held output lock blocks another run and is never removed by that run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mathnexa-seo-lock-'));
  await writeFile(join(dir, '.lock'), 'existing owner');
  const child = spawnSync(process.execPath, [resolve('scripts/seo/run.mjs'), '--output', dir, '--offline'], { encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /locked/);
  assert.equal(await readFile(join(dir, '.lock'), 'utf8'), 'existing owner');
});
