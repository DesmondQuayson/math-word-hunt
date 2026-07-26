import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((path) => !path.startsWith("apps/platform-web/.next/") && !path.startsWith("test-results/"))
  .filter((path) => ["", ".cjs", ".js", ".json", ".md", ".mjs", ".sql", ".ts", ".tsx", ".example"].includes(extname(path)) || path === ".env.example");

const forbidden = [
  { label: "Stripe secret-shaped value", pattern: /\bsk_(?:test|live)_[A-Za-z0-9]{16,}\b/ },
  { label: "Stripe webhook-secret-shaped value", pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
  { label: "publicly exposed server secret name", pattern: /NEXT_PUBLIC_(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY)/ },
  { label: "live Stripe marker", pattern: /\b(?:pk|sk)_live_[A-Za-z0-9]+\b/ }
];

for (const path of candidates) {
  const contents = readFileSync(path, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(contents)) throw new Error(`${rule.label} found in ${path}`);
  }
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const allDependencies = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies
};
if (Object.keys(allDependencies).some((name) => name === "stripe" || name.startsWith("@stripe/"))) {
  throw new Error("Stripe SDK was installed before Phase 2B approval");
}

console.log(`Billing security audit passed: ${candidates.length} repository files scanned; no secret/live-key marker or Stripe SDK found.`);

