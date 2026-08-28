import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const protectedFiles = [
  "docs/index.html",
  "docs/vocab.js",
  "math-word-hunt-v1.html",
  "math-word-hunt-v2.html",
  "math-word-hunt-v3.html",
  "math-word-hunt-v4.html",
  "math-word-hunt-v5.html",
  "docs/index-v5-backup.html",
  "docs/index-v6-backup.html"
];

const gates = [
  [npm, ["run", "typecheck"]],
  [npm, ["run", "lint"]],
  [npm, ["run", "test:content"]],
  [npm, ["run", "test:unit"]],
  [npm, ["run", "test:game-suite:media"]],
  [npm, ["run", "test:number-logic"]],
  [npm, ["run", "test:number-logic:native"]],
  [npm, ["run", "test:number-logic:security"]],
  [npm, ["run", "test:number-cross"]],
  [npm, ["run", "test:number-cross:native"]],
  [npm, ["run", "test:number-cross:security"]],
  [npm, ["run", "test:crosscalc:v2"]],
  [npm, ["run", "test:crosscalc:v2:native"]],
  [npm, ["run", "db:reset"]],
  [npm, ["run", "db:test"]],
  [npm, ["run", "test:e2e:canonical"]],
  [npm, ["run", "test:e2e:number-logic"]],
  [npm, ["run", "test:e2e:number-cross"]],
  [npm, ["run", "test:e2e:crosscalc:v2"]],
  [npm, ["run", "test:e2e:game-suite"]],
  [npm, ["run", "build"]],
  [npm, ["run", "test:security"]],
  [process.execPath, ["scripts/audit-production-default.mjs"]],
  [npm, ["audit", "--omit=dev"]],
  ["git", ["diff", "--check"]],
  ["git", ["diff", "--exit-code", "--", ...protectedFiles]]
];

for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const [path, expected] of [
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) throw new Error(`${path} changed: ${actual}`);
}

console.log("Four-game premium polish verification passed: protected games, math engines, media, accessibility, local access, browsers, build, security, and dependencies are green.");
