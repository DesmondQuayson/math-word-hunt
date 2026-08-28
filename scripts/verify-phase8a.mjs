import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const protectedFiles = [
  "docs/index.html", "docs/vocab.js", "math-word-hunt-v1.html", "math-word-hunt-v2.html",
  "math-word-hunt-v3.html", "math-word-hunt-v4.html", "math-word-hunt-v5.html",
  "docs/index-v5-backup.html", "docs/index-v6-backup.html"
];
const gates = [
  [npm, ["run", "phase7e:verify"]],
  [npm, ["run", "db:reset"]],
  [npm, ["run", "db:test"]],
  [npm, ["run", "test:phase8a"]],
  [npm, ["run", "test:e2e:phase8a"]],
  [npm, ["run", "test:phase8a:security"]],
  ["git", ["diff", "--check"]],
  ["git", ["diff", "--exit-code", "--", ...protectedFiles]]
];
for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const expected = new Map([
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  if (createHash("sha256").update(readFileSync(path)).digest("hex") !== digest) throw new Error(`${path} changed`);
}
console.log("Phase 8A verification passed. Admin functionality remains an owner-only disabled-by-default security shell; no deployment was performed.");
