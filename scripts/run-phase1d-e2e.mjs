import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

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
const staticServer = spawn(process.execPath, [resolve("scripts/serve-static.mjs"), "--port", "4173"], { stdio: ["ignore", "ignore", "inherit"] });
const platformServer = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", "3000"], { env: { ...process.env, ...publicEnvironment }, stdio: ["ignore", "ignore", "inherit"] });

async function waitFor(url, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`${label} did not become ready.`);
}
async function stop(child) {
  child.kill();
  if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise((done) => setTimeout(done, 2_000))]);
}

let exitCode = 1;
try {
  await Promise.all([waitFor("http://127.0.0.1:4173/docs/index.html", "Static game server"), waitFor("http://127.0.0.1:3000/sign-in", "Platform server")]);
  const test = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase1d.config.mjs"], { env: { ...process.env, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY }, stdio: "inherit" });
  [exitCode] = await once(test, "exit");
} finally {
  await Promise.all([stop(platformServer), stop(staticServer)]);
}
process.exitCode = exitCode ?? 1;
