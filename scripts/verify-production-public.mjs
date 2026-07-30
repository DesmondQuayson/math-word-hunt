import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const gates = [
  [npm, ["run", "phase6b:verify"]],
  [npm, ["run", "test:production-public"]],
  [npm, ["run", "test:production-public:security"]],
  [npm, ["run", "test:e2e:production-public"]],
  ["git", ["diff", "--check"]],
  ["git", ["diff", "--exit-code", "--", "docs/index.html", "docs/vocab.js", "math-word-hunt-v1.html", "math-word-hunt-v2.html", "math-word-hunt-v3.html", "math-word-hunt-v4.html", "math-word-hunt-v5.html", "docs/index-v5-backup.html", "docs/index-v6-backup.html"]]
];

for (const [command, args] of gates) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Production-public verification passed. The release contains no Production Supabase/Auth, teacher workspace, pilot, invitation, billing, fixture, deletion, organization-label, or student-data capability.");
