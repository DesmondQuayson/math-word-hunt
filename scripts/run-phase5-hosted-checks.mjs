import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { evaluatePhase5Readiness, formatPhase5Readiness } from "./phase5-readiness-contract.mjs";

const result = evaluatePhase5Readiness(process.env);
console.log(formatPhase5Readiness(result));
if (result.status === "blocked") process.exit(1);
if (result.status !== "ready") {
  console.log("PENDING: No hosted request was made. Owner approval, an isolated preview, and hosted credentials are not configured.");
  process.exit(0);
}

const origin = new URL(process.env.MVH_PREVIEW_URL).origin;
const unprivileged = await fetch(`${origin}/status`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
if (unprivileged.status === 200) throw new Error("Preview access restriction failed: /status was public without the automation bypass.");
if (![301, 302, 303, 307, 308, 401, 403, 451].includes(unprivileged.status)) throw new Error(`Preview access restriction returned unexpected HTTP ${unprivileged.status}.`);
console.log(`READY: Preview access restriction denied an unprivileged request with HTTP ${unprivileged.status}.`);

const command = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase5-hosted.config.mjs"], { env: process.env, stdio: "inherit" });
if (command.status !== 0) process.exit(command.status ?? 1);
console.log("PENDING: Hosted teacher authentication and cross-account tests require separately approved disposable adult-teacher fixtures.");
console.log("PENDING: Stripe lifecycle tests require separately approved Stripe sandbox resources and test credentials.");
