import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testResultsRoot = resolve(repositoryRoot, "test-results");
const workRoot = resolve(testResultsRoot, "phase7c-sandbox-supabase");
const evidencePath = resolve(testResultsRoot, "phase7c-sandbox-evidence.json");
const resultPath = resolve(testResultsRoot, "phase7c-sandbox-result.json");
const supabaseCli = resolve(repositoryRoot, "node_modules/supabase/dist/supabase.js");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function required(name, prefix) {
  const value = process.env[name]?.trim() ?? "";
  if (!value.startsWith(prefix)) throw new Error(`invalid-${name.toLowerCase()}`);
  return value;
}

function runSupabase(args) {
  return execFileSync(process.execPath, [supabaseCli, ...args, "--workdir", workRoot], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function writeResult(value) {
  mkdirSync(testResultsRoot, { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizedDiagnostic(test, secrets) {
  let value = [test.error?.code, test.stdout, test.stderr]
    .filter(Boolean)
    .join("\n");
  for (const secret of secrets) value = value.replaceAll(secret, "[REDACTED]");
  value = value
    .replaceAll(/(?:sk|pk)_test_[A-Za-z0-9_]+/g, "[REDACTED]")
    .replaceAll(/whsec_[A-Za-z0-9_]+/g, "[REDACTED]");
  return value.slice(-4_000);
}

const publishableKey = required("STRIPE_PUBLISHABLE_KEY", "pk_test_");
const secretKey = required("STRIPE_SECRET_KEY", "sk_test_");
const productId = required("STRIPE_PRODUCT_MATHNEXA", "prod_");
const priceId = required("STRIPE_PRICE_MATHNEXA_MONTHLY", "price_");
const portalId = required("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_");

let supabaseStarted = false;
let outcome = { passed: false, blocker: "sandbox-lifecycle-not-started", cleanupToZero: false };

try {
  rmSync(workRoot, { recursive: true, force: true });
  rmSync(evidencePath, { force: true });
  mkdirSync(workRoot, { recursive: true });
  cpSync(resolve(repositoryRoot, "supabase"), resolve(workRoot, "supabase"), { recursive: true });

  const configPath = resolve(workRoot, "supabase/config.toml");
  const config = readFileSync(configPath, "utf8").replaceAll("5432", "5532");
  writeFileSync(configPath, config, "utf8");

  runSupabase(["start"]);
  supabaseStarted = true;
  runSupabase(["db", "reset", "--local"]);
  const status = JSON.parse(runSupabase(["status", "-o", "json"]));
  for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
    if (typeof status[key] !== "string" || status[key].length < 10) {
      throw new Error(`local-supabase-missing-${key.toLowerCase()}`);
    }
  }

  const webhookSecret = `whsec_${randomUUID().replaceAll("-", "")}`;
  const test = spawnSync(
    npm,
    [
      "run", "test", "--workspace", "@math-vocabulary-hunt/platform-web", "--",
      "lib/billing/consumer-stripe-lifecycle.external.test.ts"
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        MVH_PHASE7C_SANDBOX_LIFECYCLE: "true",
        SUPABASE_TEST_URL: status.API_URL,
        SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY,
        STRIPE_PUBLISHABLE_KEY: publishableKey,
        STRIPE_SECRET_KEY: secretKey,
        STRIPE_WEBHOOK_SECRET: webhookSecret,
        STRIPE_PRODUCT_MATHNEXA: productId,
        STRIPE_PRICE_MATHNEXA_MONTHLY: priceId,
        STRIPE_PORTAL_CONFIGURATION_ID: portalId,
        PHASE7C_SANDBOX_EVIDENCE_PATH: evidencePath
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const evidence = existsSync(evidencePath)
    ? JSON.parse(readFileSync(evidencePath, "utf8"))
    : {
        passed: false,
        blocker: test.error?.code
          ? `sandbox-test-process-${String(test.error.code).toLowerCase()}`
          : "sandbox-lifecycle-produced-no-evidence",
        stripeCleanupZero: false,
        diagnostic: sanitizedDiagnostic(test, [publishableKey, secretKey, webhookSecret])
      };
  if (test.status !== 0 || evidence.passed !== true || evidence.stripeCleanupZero !== true) {
    outcome = {
      passed: false,
      blocker: evidence.blocker ?? "sandbox-lifecycle-failed",
      cleanupToZero: false,
      evidence
    };
    throw new Error("sandbox-lifecycle-failed");
  }

  runSupabase(["db", "reset", "--local"]);
  const cleanup = spawnSync(process.execPath, [resolve(repositoryRoot, "scripts/verify-phase7c-sandbox-cleanup.mjs")], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_TEST_URL: status.API_URL,
      SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (cleanup.status !== 0) {
    outcome = { passed: false, blocker: "local-cleanup-to-zero-failed", cleanupToZero: false, evidence };
    throw new Error("local-cleanup-to-zero-failed");
  }
  outcome = { passed: true, blocker: null, cleanupToZero: true, evidence };
} catch (error) {
  if (outcome.blocker === "sandbox-lifecycle-not-started") {
    outcome = {
      passed: false,
      blocker: error instanceof Error ? error.message : "sandbox-lifecycle-failed",
      cleanupToZero: false
    };
  }
} finally {
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  if (supabaseStarted) {
    try { runSupabase(["stop", "--no-backup"]); } catch { /* Reported as cleanup failure below. */ }
  }
  rmSync(workRoot, { recursive: true, force: true });
  rmSync(evidencePath, { force: true });
  writeResult(outcome);
}

process.exitCode = outcome.passed ? 0 : 1;
