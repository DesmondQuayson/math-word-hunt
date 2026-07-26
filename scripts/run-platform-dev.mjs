import { spawn } from "node:child_process";
import { resolve } from "node:path";

const children = [
  spawn(
    process.execPath,
    [resolve("scripts/serve-static.mjs"), "--port", "4173"],
    { stdio: "inherit" }
  ),
  spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "dev",
      resolve("apps/platform-web"),
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000"
    ],
    {
      env: {
        ...process.env,
        LEGACY_GAME_URL: "http://127.0.0.1:4173/docs/index.html"
      },
      stdio: "inherit"
    }
  )
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = exitCode;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(0));
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}
