import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { registerVerificationNextProcess, stopVerificationNextProcess } from "./verification-processes.mjs";

const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [supabaseCli, "status", "-o", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
}));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);
}
if (status.API_URL !== "http://127.0.0.1:55321") throw new Error("Phase 8D browser verification is local-only.");

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const migration = await admin.from("resource_files").select("id", { count: "exact", head: true });
if (migration.error) throw new Error("Apply the Phase 8D local migration before browser verification.");

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: "http://127.0.0.1:3000",
  MVH_APP_ENVIRONMENT: "local",
  MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3000",
  MVH_SUPABASE_PROJECT_REF: "local-supabase",
  MVH_STRIPE_MODE: "disabled",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "allowed",
  MVH_DELETION_MODE: "dry-run",
  MVH_BUILD_ID: "phase8d-local-resource-workflow",
  MVH_ADMIN_ENABLED: "true",
  MVH_ADMIN_CSRF_SECRET: "phase8d-local-browser-only-secret-value",
  MVH_ADMIN_SESSION_MINUTES: "15",
  BILLING_ENABLED: "false",
  BILLING_CHECKOUT_ENABLED: "false",
  BILLING_PORTAL_ENABLED: "false",
  BILLING_WEBHOOK_ENABLED: "false"
};

const app = spawn(process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", "3000"],
  { env: environment, stdio: ["ignore", "inherit", "inherit"] });
registerVerificationNextProcess(app);

async function waitFor(url) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.status < 500) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Phase 8D local resource workflow did not become ready.");
}

let exitCode = 1;
try {
  await waitFor("http://127.0.0.1:3000/admin/sign-in");
  const tests = spawn(process.execPath,
    [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase8d.config.mjs"],
    { env: { ...environment, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY }, stdio: "inherit" });
  [exitCode] = await once(tests, "exit");
} finally {
  await stopVerificationNextProcess(app);
  execFileSync(process.execPath, [supabaseCli, "db", "reset", "--local"], { stdio: "inherit" });
}
process.exitCode = exitCode ?? 1;
