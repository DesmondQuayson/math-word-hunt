import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import {
  cleanPlatformGeneratedNextState,
  registerVerificationNextProcess,
  stopVerificationNextProcess
} from "./verification-processes.mjs";

const prototypeMode = process.argv.includes("--prototype");
const playwrightArgs = process.argv.slice(2).filter((argument) => argument !== "--prototype");

await cleanPlatformGeneratedNextState();

async function getFreeLoopbackPort() {
  const reservation = createServer();
  reservation.unref();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") {
    reservation.close();
    throw new Error("Could not reserve a loopback port for platform verification");
  }
  const port = address.port;
  reservation.close();
  await once(reservation, "close");
  return port;
}

const platformPort = await getFreeLoopbackPort();
const platformBaseUrl = `http://127.0.0.1:${platformPort}`;

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
    String(platformPort)
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

async function waitFor(url, label, requiredMarker = null) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (platformServer.exitCode !== null) {
      throw new Error(`${label} process exited before readiness`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        if (requiredMarker === null || (await response.text()).includes(requiredMarker)) return;
      }
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
    waitFor(
      prototypeMode ? `${platformBaseUrl}/teacher` : platformBaseUrl,
      "Platform server",
      prototypeMode ? "Demonstration data" : null
    )
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
        MVH_PLATFORM_TEST_BASE_URL: platformBaseUrl,
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
