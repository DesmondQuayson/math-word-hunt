import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { registerVerificationNextProcess, stopVerificationNextProcess } from "./verification-processes.mjs";

const baseUrl = "http://127.0.0.1:4180";
const routes = [
  "/teacher",
  "/teacher/classes",
  "/teacher/classes/algebra-foundations",
  "/teacher/activities",
  "/teacher/sessions",
  "/teacher/reports",
  "/account"
];
const forbiddenMarkers = [
  "Demonstration data",
  "data-prototype-fixture",
  "Algebra foundations",
  "Math language lab",
  "Demonstration teacher"
];

const platformServer = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    resolve("apps/platform-web"),
    "--hostname",
    "127.0.0.1",
    "--port",
    "4180"
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      // An explicit fixture request must still be ignored by a production server.
      MVH_TEACHER_PROTOTYPE_MODE: "enabled"
    },
    stdio: ["ignore", "inherit", "inherit"]
  }
);
registerVerificationNextProcess(platformServer);

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  let lastResult = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl + "/teacher");
      if (response.ok) return;
      lastResult = `HTTP ${response.status}`;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Production platform server did not become ready: ${lastResult}`);
}

async function stopServer() {
  await stopVerificationNextProcess(platformServer);
}

try {
  await waitForServer();
  for (const route of routes) {
    const response = await fetch(baseUrl + route);
    if (!response.ok) throw new Error(`${route} returned ${response.status}`);
    const html = await response.text();
    for (const marker of forbiddenMarkers) {
      if (html.includes(marker)) {
        throw new Error(`${route} exposed forbidden production fixture marker: ${marker}`);
      }
    }
  }
  console.log(`Production-default audit passed for ${routes.length} fixture-sensitive routes.`);
} finally {
  await stopServer();
}
