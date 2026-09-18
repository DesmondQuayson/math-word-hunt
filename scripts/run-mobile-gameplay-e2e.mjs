/**
 * Mobile gameplay fit certification runner.
 *
 * Starts the mobile gameplay harness (shipped game documents, real route CSPs,
 * real public assets) and runs the Playwright suite in e2e/mobile-gameplay
 * against it. No account, database or payment stack is involved: the layout
 * contract depends only on what the game documents render.
 *
 *   node scripts/run-mobile-gameplay-e2e.mjs                         # every project
 *   node scripts/run-mobile-gameplay-e2e.mjs --project webkit-mobile contract.spec.ts
 */
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startMobileGameplayHarness } from "./mobile-gameplay-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await startMobileGameplayHarness(Number(process.env.MOBILE_GAMEPLAY_PORT ?? 4195));
const { port } = server.address();
process.stdout.write(`Mobile gameplay harness: http://127.0.0.1:${port}\n`);

const run = spawn(process.execPath, [
  join(root, "node_modules", "@playwright", "test", "cli.js"),
  "test",
  "--config",
  "playwright.mobile-gameplay.config.mjs",
  ...process.argv.slice(2)
], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, MOBILE_GAMEPLAY_URL: `http://127.0.0.1:${port}` }
});
run.on("exit", (code) => {
  server.close();
  process.exit(code ?? 1);
});
