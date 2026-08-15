import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const protectedFiles = ["docs/index.html", "docs/vocab.js", "math-word-hunt-v1.html", "math-word-hunt-v2.html", "math-word-hunt-v3.html", "math-word-hunt-v4.html", "math-word-hunt-v5.html", "docs/index-v5-backup.html", "docs/index-v6-backup.html"];
const gates = [
  [npm, ["run", "test:phase8c"]],
  [npm, ["run", "test:e2e:phase8a"]],
  [npm, ["run", "test:e2e:phase8c"]],
  [npm, ["run", "test:phase8c:security"]],
  ["git", ["diff", "--check"]],
  ["git", ["diff", "--exit-code", "--", ...protectedFiles]]
];
for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const [path, digest] of [["docs/index.html", "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"], ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]]) {
  if (createHash("sha256").update(readFileSync(path)).digest("hex") !== digest) throw new Error(`${path} changed`);
}
console.log("Phase 8C verification passed. The command center remains hidden behind the Phase 8A owner/MFA/session boundary.");
