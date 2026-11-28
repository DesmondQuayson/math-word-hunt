import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Reviewed, intentionally narrow native Codex adapter; no Claude launcher/hooks.
const root = resolve('.seo-output/upstream/claude-seo');
const pin = 'c067311b497eff49110b73d4be33bdd3d7e6b40d';
const approved = {
  portability: ['portability_check.py', '0875531ab12c929dc339a29d48383ac3e04f42db3fdd59a1a28ed657edeaacc1'],
  claims: ['content_verify.py', 'b18ae0b8c8800a28a04d720d047f147e390b602a245fb2f5f40a12efb3634465'],
};
const task = process.argv[2];
if (!Object.hasOwn(approved, task)) throw new Error('Allowed tasks: portability, claims');
const git = (args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (result.status !== 0) throw new Error('Pinned checkout unavailable; see docs/seo/UPSTREAM_REVIEW.md');
  return result.stdout.trim();
};
if (git(['rev-parse', 'HEAD']) !== pin || git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Pinned source must be unchanged and clean');
const [script, hash] = approved[task];
const scriptPath = resolve(root, 'scripts', script);
if (createHash('sha256').update(readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n')).digest('hex') !== hash) throw new Error('Reviewed script hash mismatch');
const args = ['-I', scriptPath, '--json'];
const input = task === 'claims' ? readFileSync(resolve('docs/seo/AEO_CONTENT_REVIEW.md'), 'utf8') : undefined;
if (task === 'claims') args.push('-');
// No provider tokens or user Python packages passed into third-party code.
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
env.PYTHONIOENCODING = 'utf-8';
const result = spawnSync(process.env.SEO_PYTHON ?? 'python', args, { input, cwd: root, env, encoding: 'utf8', timeout: 30000, maxBuffer: 1000000, windowsHide: true });
if (result.error || result.signal) throw new Error('Python execution unavailable; set SEO_PYTHON to a trusted Python 3.10+ interpreter');
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
