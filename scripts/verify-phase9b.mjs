import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const gates = [
  [npm, ["run", "phase8:verify"]],
  [npm, ["run", "test:e2e:phase9"]],
  [npm, ["run", "test:phase9b:security"]],
  ["git", ["diff", "--check"]]
];
for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Authoritative Phase 9B verification passed: legacy Phase 8, all-access, hierarchy, customer flow, security, build, dependency, canonical, and historical gates are green.");
