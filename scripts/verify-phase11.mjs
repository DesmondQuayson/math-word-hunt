import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const gates = [
  [npm, ["run", "lint"]],
  [npm, ["run", "typecheck"]],
  [npm, ["run", "test:content"]],
  [npm, ["run", "test:unit"]],
  [npm, ["run", "test:phase11:security"]],
  [npm, ["run", "test:number-cross"]],
  [npm, ["run", "test:e2e:phase7b"]],
  [npm, ["run", "test:e2e:phase9"]],
  [npm, ["run", "test:e2e:canonical"]],
  [npm, ["run", "test:security"]],
  [npm, ["run", "test:phase10:security"]],
  [npm, ["run", "build"]],
  [npm, ["audit", "--omit=dev"]],
  ["git", ["diff", "--check"]]
];

for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Phase 11 verification passed: public Auth UX, SSR identity, direct protected launch, responsive product visuals, accessibility, security, canonical regression, production build, and dependency gates are green.");
