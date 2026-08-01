import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  registerVerificationNextProcess,
  stopRegisteredVerificationNextProcesses,
  stopVerificationNextProcess
} from "./verification-processes.mjs";

const prototypeMode = process.argv.includes("--prototype");
const playwrightArgs = process.argv.slice(2).filter((argument) => argument !== "--prototype");
const repositoryRoot = realpathSync(resolve(import.meta.dirname, ".."));
const appRoot = realpathSync(resolve(repositoryRoot, "apps/platform-web"));
const buildRoot = resolve(appRoot, ".next");

if (dirname(buildRoot) !== appRoot || basename(buildRoot) !== ".next") {
  throw new Error("Refusing unsafe platform browser generated-state cleanup target.");
}

async function removeGeneratedNextState() {
  if (process.platform === "win32") {
    const cleanupScript = [
      "$ErrorActionPreference = 'Stop'",
      "$target = $env:MATH_HUNT_PLATFORM_BUILD_ROOT",
      "$deadline = (Get-Date).AddSeconds(30)",
      "while (Test-Path -LiteralPath $target) {",
      "  try { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop }",
      "  catch { if ((Get-Date) -ge $deadline) { throw }; Start-Sleep -Milliseconds 500 }",
      "  if ((Test-Path -LiteralPath $target) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }",
      "}"
    ].join("\n");
    const cleanup = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cleanupScript], {
      env: { ...process.env, MATH_HUNT_PLATFORM_BUILD_ROOT: buildRoot },
      stdio: "inherit",
      windowsHide: true
    });
    const [cleanupExitCode] = await once(cleanup, "exit");
    if (cleanupExitCode !== 0) throw new Error("Platform browser generated Next state could not be removed.");
  } else {
    rmSync(buildRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
  if (existsSync(buildRoot)) throw new Error("Platform browser generated Next state still exists after cleanup.");
}

await stopRegisteredVerificationNextProcesses();
await removeGeneratedNextState();

const staticServer = spawn(
  process.execPath,
  [resolve("scripts/serve-static.mjs"), "--port", "4173"],
  { stdio: ["ignore", "ignore", "inherit"] }
);

const platformServer = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    resolve("apps/platform-web"),
    "--hostname",
    "127.0.0.1",
    "--port",
    "4180"
  ],
  {
    env: {
      ...process.env,
      LEGACY_GAME_URL: "http://127.0.0.1:4173/docs/index.html",
      MVH_EMAIL_DELIVERY: "disabled",
      MVH_PILOT_STATE: "inactive",
      ...(prototypeMode ? { MVH_TEACHER_PROTOTYPE_MODE: "enabled" } : {})
    },
    stdio: ["ignore", "ignore", "inherit"]
  }
);
registerVerificationNextProcess(platformServer);

async function waitFor(url, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(label + " did not become ready");
}

async function stopProcess(processToStop, isNext = false) {
  if (isNext) return stopVerificationNextProcess(processToStop);
  processToStop.kill();
  if (processToStop.exitCode === null) {
    await Promise.race([
      once(processToStop, "exit"),
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000))
    ]);
  }
}

let exitCode;
try {
  await Promise.all([
    waitFor("http://127.0.0.1:4173/docs/index.html", "Static game server"),
    waitFor("http://127.0.0.1:4180", "Platform server")
  ]);
  const playwright = spawn(
    process.execPath,
    [
      resolve("node_modules/@playwright/test/cli.js"),
      "test",
      "--config=playwright.platform.config.mjs",
      ...playwrightArgs
    ],
    {
      env: {
        ...process.env,
        MVH_EMAIL_DELIVERY: "disabled",
        MVH_PILOT_STATE: "inactive",
        ...(prototypeMode ? { MVH_TEACHER_PROTOTYPE_TEST: "enabled" } : {})
      },
      stdio: "inherit"
    }
  );
  const [code] = await once(playwright, "exit");
  exitCode = code ?? 1;
} finally {
  await Promise.all([
    stopProcess(platformServer, true),
    stopProcess(staticServer)
  ]);
}

process.exitCode = exitCode ?? 1;
