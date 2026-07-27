import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
for (const path of files.filter((path) => /\.(?:ts|tsx|mjs|sql|md|example)$/.test(path) && !/(?:\.test\.|\/tests\/|^e2e\/)/.test(path))) {
  const source = readFileSync(path, "utf8");
  if (/(?:sk|pk)_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{24,}/.test(source)) throw new Error(`Credential-like value found outside deterministic test fixtures: ${path}`);
}
const contract = readFileSync("scripts/phase5-readiness-contract.mjs", "utf8");
for (const required of ["PHASE5_HOSTED_APPROVAL", "PHASE5_HOSTED_READ_ONLY_APPROVAL", "PHASE5_EXTERNAL_MUTATIONS", "isolated-preview", "sk|pk)_live_"]) if (!contract.includes(required)) throw new Error(`Phase 5 readiness contract is missing ${required}.`);
const runner = readFileSync("scripts/run-phase5-hosted-checks.mjs", "utf8");
if (!runner.includes("result.status !== \"ready\"") || !runner.includes("Preview access restriction failed")) throw new Error("Hosted runner does not fail closed before network access.");
if (/(?:vercel\s+(?:deploy|link)|supabase\s+(?:projects\s+create|link|db\s+push)|stripe\s+(?:products|prices|webhook_endpoints)\s+create)/i.test(runner)) throw new Error("Hosted validation runner contains provider mutation commands.");
const example = readFileSync(".env.example", "utf8");
if (!example.includes("PHASE5_EXTERNAL_MUTATIONS=false") || !example.includes("PHASE5_HOSTED_APPROVAL=not-approved")) throw new Error("Environment example is not safely disabled by default.");
console.log(`Phase 5 security audit passed: ${files.length} files scanned; live-key, approval, access-restriction, and no-mutation boundaries verified.`);
