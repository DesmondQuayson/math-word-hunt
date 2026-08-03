import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const repositoryRoot = resolve(".");
const staticBundleRoot = resolve("apps/platform-web/.next/static");
const coreSourceRoot = resolve("packages/platform-core/src");

const forbiddenBundlePatterns = [
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /SUPABASE_SECRET_KEY/i,
  /STRIPE_SECRET_KEY/i,
  /STRIPE_WEBHOOK_SECRET/i,
  /sk_test_[a-z0-9]+/i,
  /sk_live_[a-z0-9]+/i,
  /service_role["'=:]/i
];

const forbiddenCorePatterns = [
  /from\s+["']react["']/i,
  /from\s+["']next(?:\/[^"']*)?["']/i,
  /supabase/i,
  /stripe/i,
  /\bwindow\s*\./,
  /\bdocument\s*\./,
  /\blocalStorage\s*\./,
  /\bsessionStorage\s*\./,
  /\bprocess\./,
  /from\s+["']node:/
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

const bundleFiles = (await filesUnder(staticBundleRoot)).filter((file) =>
  [".js", ".css", ".json"].includes(extname(file))
);
for (const file of bundleFiles) {
  const contents = await readFile(file, "utf8");
  for (const pattern of forbiddenBundlePatterns) {
    if (pattern.test(contents)) {
      throw new Error(`Forbidden secret marker found in client bundle: ${file}`);
    }
  }
}

const coreFiles = (await filesUnder(coreSourceRoot)).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts")
);
for (const file of coreFiles) {
  const contents = await readFile(file, "utf8");
  for (const pattern of forbiddenCorePatterns) {
    if (pattern.test(contents)) {
      throw new Error(`Forbidden platform-core dependency found: ${file}`);
    }
  }
}

console.log(
  `Platform security audit passed: ${bundleFiles.length} client assets and ${coreFiles.length} core source files inspected under ${repositoryRoot}`
);
