import { spawn } from "node:child_process";
import { once } from "node:events";

import { buildPhase7dEnvironment } from "./phase7d-hosted-contract.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = buildPhase7dEnvironment({
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  supabasePublishableKey: "sb_publishable_phase7d_build_placeholder",
  supabaseSecretKey: "sb_secret_phase7d_build_server_only_placeholder",
  supabaseProjectRef: "abcdefghijklmnopqrst",
  stripePublishableKey: "pk_test_phase7dbuild12345",
  stripeSecretKey: "sk_test_phase7dbuild12345",
  stripeWebhookSecret: "whsec_phase7dbuild12345",
  stagingAccessToken: "A".repeat(43),
  buildId: "phase7d-staging-build",
  emailVerified: false
});

const build = spawn(npm, ["run", "build"], {
  env: { ...process.env, NODE_ENV: "production", ...environment },
  stdio: "inherit",
  shell: process.platform === "win32"
});
const [exitCode] = await once(build, "exit");
process.exitCode = exitCode ?? 1;
