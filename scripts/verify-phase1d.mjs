import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const gates = [
  [npm, ["run", "lint"]], [npm, ["run", "typecheck"]], [npm, ["run", "test:unit"]],
  [npm, ["run", "test:content"]], [npm, ["run", "db:reset"]], [npm, ["run", "db:test"]],
  [npm, ["run", "test:e2e:platform"]], [npm, ["run", "test:e2e:platform:prototype"]],
  [npm, ["run", "test:e2e:scenarios"]], [npm, ["run", "test:e2e:visual"]],
  [npm, ["run", "test:e2e:phase1d"]], [npm, ["run", "test:production-default"]],
  [npm, ["run", "test:e2e:canonical"]], [npm, ["run", "test:e2e", "--", "e2e/math-word-hunt-v5.spec.ts"]],
  [npm, ["run", "build"]], [npm, ["run", "test:security"]], [npm, ["audit", "--audit-level=high"]],
  ["git", ["diff", "--check"]]
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
console.log("Phase 1D verification passed, including canonical hash preservation.");
