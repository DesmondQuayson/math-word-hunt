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

const webPackage = JSON.parse(readFileSync("apps/platform-web/package.json", "utf8"));
if (webPackage.dependencies?.stripe !== "20.4.0") throw new Error("The approved server Stripe SDK must be pinned exactly to 20.4.0");
if (Object.keys({ ...webPackage.dependencies, ...webPackage.devDependencies }).some((name) => name.startsWith("@stripe/"))) throw new Error("No client Stripe SDK is approved");
for (const path of candidates.filter((file) => file.startsWith("apps/platform-web/") && /\.(?:ts|tsx)$/.test(file))) {
  const contents = readFileSync(path, "utf8");
  if (/^["']use client["'];/m.test(contents) && /from ["']stripe["']/.test(contents)) throw new Error(`Stripe SDK imported by client module: ${path}`);
}

console.log(`Billing security audit passed: ${candidates.length} repository files scanned; exact server SDK only, with no secret/live-key marker or client Stripe import.`);
