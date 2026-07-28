import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const protectedFiles = [
  "docs/index.html", "docs/vocab.js",
  "math-word-hunt-v1.html", "math-word-hunt-v2.html", "math-word-hunt-v3.html", "math-word-hunt-v4.html", "math-word-hunt-v5.html",
  "docs/index-v5-backup.html", "docs/index-v6-backup.html"
];
const gates = [
  [npm, ["run", "phase5:verify"]],
  [npm, ["run", "test:phase6"]],
  [npm, ["run", "test:e2e:phase6"]],
  [npm, ["run", "test:e2e:platform", "--", "pilot-experience.spec.ts"]],
  [npm, ["run", "test:e2e:phase4"]],
  [npm, ["run", "test:phase6:security"]],
  [npm, ["run", "test:phase4"]],
  [npm, ["run", "test:production-default"]],
  [npm, ["run", "test:security"]],
  [npm, ["run", "test:billing:security"]],
  [npm, ["run", "test:capabilities:security"]],
  [npm, ["run", "test:e2e:canonical"]],
  [npm, ["run", "test:e2e", "--", "e2e/math-word-hunt-v5.spec.ts"]],
  [npm, ["audit", "--audit-level=high"]],
  [npm, ["run", "build"]],
  ["git", ["diff", "--check"]],
  ["git", ["diff", "--exit-code", "--", ...protectedFiles]]
];

for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const expected = new Map([
  ["docs/index.html", "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== digest) throw new Error(`${path} changed: ${actual}`);
}
console.log("Phase 6 verification passed. Pilot policy remains inactive; Phase 6B activation, real email, billing, Production, public access, participant invitations, and permanent deletion remain unapproved.");
