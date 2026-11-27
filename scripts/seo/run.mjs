import { mkdir, readFile, writeFile, open, unlink, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { auditPublicSites } from './public-audit.mjs';
import { buildReport, renderReport } from './report.mjs';

const { values } = parseArgs({ options: {
  config: { type: 'string', default: 'docs/seo/config.json' },
  output: { type: 'string', default: '.seo-output' },
  previous: { type: 'string' }, snapshot: { type: 'string' }, offline: { type: 'boolean', default: false }
} });
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const lockPath = join(output, '.lock');
let lock;
try {
  lock = await open(lockPath, 'wx');
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  const config = JSON.parse(await readFile(resolve(values.config), 'utf8'));
  const previous = values.previous ? JSON.parse(await readFile(resolve(values.previous), 'utf8')) : null;
  if (values.offline && !values.snapshot) throw new Error('--offline requires --snapshot with a saved public audit JSON');
  const audit = values.offline ? JSON.parse(await readFile(resolve(values.snapshot), 'utf8')) : await auditPublicSites(config);
  const runId = process.env.GITHUB_RUN_ID;
  const runUrl = /^\d+$/.test(runId ?? '') ? `https://github.com/DesmondQuayson/math-word-hunt/actions/runs/${runId}` : null;
  const commit = process.env.GITHUB_SHA;
  const report = buildReport(audit, { previous, mode: values.offline ? 'offline-replay' : 'live', sourceCommit: /^[a-f\d]{40}$/.test(commit ?? '') ? commit : null, runUrl });
  const markdown = renderReport(report);
  // .lock prevents concurrent writers; publication occurs only after all files exist.
  await writeFile(join(output, 'audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(output, 'report.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(`SEO ${report.status}; ${audit.requestsUsed} bounded requests; ${audit.findings.length} findings. Saved ${output}`);
  if (!audit.complete) process.exitCode = 1;
} catch (error) {
  // Do not echo response bodies, tokens, remote error details, or supplied path contents.
  console.error(error.code === 'EEXIST' ? 'SEO output is locked by another run. Inspect its .lock before retrying.' : 'SEO run failed. Check configuration, input files, and the saved public report if present.');
  process.exitCode = 1;
} finally {
  if (lock) { await lock.close(); await unlink(lockPath); }
}
