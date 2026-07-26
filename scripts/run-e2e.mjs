import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const server = spawn(
  process.execPath,
  [resolve("scripts/serve-static.mjs"), "--port", "4173"],
  { stdio: ["ignore", "ignore", "inherit"] }
);

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:4173/docs/index.html");
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Static test server did not become ready");
}

let exitCode;
try {
  await waitForServer();
  const playwright = spawn(
    process.execPath,
    [
      resolve("node_modules/@playwright/test/cli.js"),
      "test",
      ...process.argv.slice(2),
      "--config=playwright.config.mjs"
    ],
    { stdio: "inherit" }
  );
  const [code] = await once(playwright, "exit");
  exitCode = code ?? 1;
} finally {
  server.kill();
  if (server.exitCode === null) {
    await Promise.race([
      once(server, "exit"),
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000))
    ]);
  }
}

process.exitCode = exitCode ?? 1;
