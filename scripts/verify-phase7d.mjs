import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { PHASE7D_PROTECTED_HASHES } from "./phase7d-hosted-contract.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const protectedFiles = [
  "docs/index.html", "docs/vocab.js",
  "math-word-hunt-v1.html", "math-word-hunt-v2.html", "math-word-hunt-v3.html",
  "math-word-hunt-v4.html", "math-word-hunt-v5.html",
  "docs/index-v5-backup.html", "docs/index-v6-backup.html"
];
const gates = [
  [npm, ["run", "lint"]],
  [npm, ["run", "typecheck"]],
  [npm, ["run", "test:phase7d:contract"]],
  [npm, ["run", "test:phase7d:access"]],
  [npm, ["run", "build:phase7d"]],
  [npm, ["run", "test:phase7d:security"]],
  [npm, ["run", "test:security"]],
  [npm, ["audit", "--audit-level=high"]],
  ["git", ["diff", "--check"]],
  ["git", ["diff", "--exit-code", "--", ...protectedFiles]]
];

for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const [path, expected] of Object.entries(PHASE7D_PROTECTED_HASHES)) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
  if (actual !== expected) throw new Error(`${path} changed: ${actual}`);
}
console.log("Phase 7D repository verification passed. No provider was contacted and no Phase 7C gate was repeated.");
