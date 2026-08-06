import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const gates = [
  [npm, ["run", "phase9b:verify"]],
  [npm, ["run", "test:phase10:manifest"]],
  [npm, ["run", "test:phase10:map-prep-redirect"]],
  [npm, ["run", "test:phase10:security"]],
  [npm, ["run", "test:phase10:upgrade"]],
  ["git", ["diff", "--check"]]
];
for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Authoritative Phase 10 verification passed: the complete Phase 9B baseline, Admin product-model alignment, first-factor challenge security, migration/RLS contracts, authoring workflows, builds, dependency audit, canonical game, and upgrade preservation gates are green.");
