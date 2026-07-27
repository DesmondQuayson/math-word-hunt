import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { registerVerificationNextProcess, stopVerificationNextProcess } from "./verification-processes.mjs";

const prototypeMode = process.argv.includes("--prototype");
const playwrightArgs = process.argv.slice(2).filter((argument) => argument !== "--prototype");

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
