import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const [command, args] of [
  [npm, ["run", "phase1d:verify"]],
  [npm, ["run", "test:billing:security"]]
]) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Phase 2A contract-regression verification passed. Repository billing defaults remain disabled.");
