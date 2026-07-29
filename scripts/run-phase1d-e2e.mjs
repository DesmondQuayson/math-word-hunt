import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, resolve } from "node:path";
import {
  registerVerificationNextProcess,
  stopRegisteredVerificationNextProcesses,
  stopVerificationNextProcess
} from "./verification-processes.mjs";

const repositoryRoot = realpathSync(resolve(import.meta.dirname, ".."));
const appRoot = realpathSync(resolve(repositoryRoot, "apps/platform-web"));
const buildRoot = resolve(appRoot, ".next");
const platformPort = 3000;
const staticPort = 4173;
const playwrightArgs = process.argv.slice(2);

if (dirname(buildRoot) !== appRoot || basename(buildRoot) !== ".next") {
  throw new Error("Refusing unsafe Phase 1D generated-state cleanup target.");
}

async function verifyPortIsFree(port) {
  await new Promise((resolveCheck, rejectCheck) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => rejectCheck(new Error(`Verification port ${port} is already in use.`)));
    probe.listen({ host: "127.0.0.1", port }, () => probe.close(resolveCheck));
  });
}

async function removeGeneratedNextState() {
  if (process.platform === "win32") {
    const cleanupScript = [
      "$ErrorActionPreference = 'Stop'",
      "$target = $env:MATH_HUNT_PHASE1D_BUILD_ROOT",
      "$deadline = (Get-Date).AddSeconds(30)",
      "while (Test-Path -LiteralPath $target) {",
      "  try { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop }",
      "  catch { if ((Get-Date) -ge $deadline) { throw }; Start-Sleep -Milliseconds 500 }",
      "  if ((Test-Path -LiteralPath $target) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }",
      "}"
    ].join("\n");
    const cleanup = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cleanupScript], {
      env: { ...process.env, MATH_HUNT_PHASE1D_BUILD_ROOT: buildRoot },
      stdio: "inherit",
      windowsHide: true
    });
    const [exitCode] = await once(cleanup, "exit");
    if (exitCode !== 0) throw new Error("Phase 1D generated Next state could not be removed.");
  } else {
    rmSync(buildRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
  if (existsSync(buildRoot)) throw new Error("Phase 1D generated Next state still exists after cleanup.");
}

await stopRegisteredVerificationNextProcesses();
await Promise.all([verifyPortIsFree(platformPort), verifyPortIsFree(staticPort)]);
await removeGeneratedNextState();

function localStatus() {
  const output = execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const status = JSON.parse(output);
  for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
    if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);
  }
  return status;
}

const status = localStatus();
const publicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  APP_BASE_URL: "http://127.0.0.1:3000",
  LEGACY_GAME_URL: "http://127.0.0.1:4173/docs/index.html"
};
const staticServer = spawn(process.execPath, [resolve("scripts/serve-static.mjs"), "--port", String(staticPort)], {
  cwd: repositoryRoot,
  stdio: ["ignore", "ignore", "inherit"]
});
const nextCommand = [resolve("node_modules/next/dist/bin/next"), "dev", appRoot, "--hostname", "127.0.0.1", "--port", String(platformPort)];
const platformServer = spawn(process.execPath, nextCommand, {
  cwd: repositoryRoot,
  env: { ...process.env, ...publicEnvironment },
  stdio: ["ignore", "inherit", "inherit"]
});
registerVerificationNextProcess(platformServer);
console.log(`[phase1d-server] pid=${platformServer.pid} port=${platformPort} cwd=${repositoryRoot}`);
console.log(`[phase1d-server] command=${process.execPath} ${nextCommand.join(" ")}`);

async function waitFor(url, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`[phase1d-server] ready ${label} status=${response.status} url=${response.url}`);
        return;
      }
    } catch { /* starting */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`${label} did not become ready.`);
}
async function stop(child, isNext = false) {
  if (isNext) return stopVerificationNextProcess(child);
  child.kill();
  if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise((done) => setTimeout(done, 2_000))]);
}

let exitCode = 1;
try {
  await waitFor(`http://127.0.0.1:${staticPort}/docs/index.html`, "canonical game");
  await waitFor(`http://127.0.0.1:${platformPort}/sign-in`, "sign-in route");
  await waitFor(`http://127.0.0.1:${platformPort}/auth/callback?next=https://attacker.example/steal`, "callback route");
  await waitFor(`http://127.0.0.1:${platformPort}/teacher/classes/new`, "class creation route");
  await waitFor(`http://127.0.0.1:${platformPort}/teacher/classes/phase1d-readiness-probe`, "class detail route");
  const test = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase1d.config.mjs", ...playwrightArgs], { env: { ...process.env, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY }, stdio: "inherit" });
  [exitCode] = await once(test, "exit");
} finally {
  await Promise.all([stop(platformServer, true), stop(staticServer)]);
  await Promise.all([verifyPortIsFree(platformPort), verifyPortIsFree(staticPort)]);
  console.log(`[phase1d-server] shutdown complete pid=${platformServer.pid} ports=${platformPort},${staticPort}`);
}
process.exitCode = exitCode ?? 1;
