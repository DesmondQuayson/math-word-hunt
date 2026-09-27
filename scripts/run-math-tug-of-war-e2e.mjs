/**
 * Math Tug of War local-mode certification runner.
 *
 * Serves the shipped game document (real route CSP, real public assets) with
 * the mobile gameplay harness and runs e2e/math-tug-of-war against it. No
 * account or database is involved; Online Match correctly reports itself
 * unavailable here, which is itself one of the checks.
 *
 *   node scripts/run-math-tug-of-war-e2e.mjs
 *   node scripts/run-math-tug-of-war-e2e.mjs --project webkit-mobile
 */
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startMobileGameplayHarness } from "./mobile-gameplay-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await startMobileGameplayHarness(Number(process.env.MATH_TUG_OF_WAR_PORT ?? 4197));
const { port } = server.address();
process.stdout.write(`Math Tug of War harness: http://127.0.0.1:${port}\n`);

const run = spawn(process.execPath, [
  join(root, "node_modules", "@playwright", "test", "cli.js"),
  "test",
  "--config",
  "playwright.math-tug-of-war.config.mjs",
  ...process.argv.slice(2)
], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, MATH_TUG_OF_WAR_URL: `http://127.0.0.1:${port}` }
});
run.on("exit", (code) => {
  server.close();
  process.exit(code ?? 1);
});
