import{spawnSync}from"node:child_process";import{createHash}from"node:crypto";import{readFileSync}from"node:fs";
import{cleanPlatformGeneratedNextState}from"./verification-processes.mjs";
const npm=process.platform==="win32"?"npm.cmd":"npm",protectedFiles=["docs/index.html","docs/vocab.js","math-word-hunt-v1.html","math-word-hunt-v2.html","math-word-hunt-v3.html","math-word-hunt-v4.html","math-word-hunt-v5.html","docs/index-v5-backup.html","docs/index-v6-backup.html"];
const gates=[
  [npm,["run","lint"]],[npm,["run","typecheck"]],
  [npm,["run","test:phase8:content-cleanup"]],
  [npm,["run","test:phase8:content-cleanup:security"]],
  ...["8a","8b","8c","8d","8e","8f","8g","8h"].map(phase=>[npm,["run",`test:phase${phase}`]]),
  [npm,["run","db:reset"]],[npm,["run","db:test"]],
  ...["8a","8c","8d","8e","8f","8g","8h"].map(phase=>[npm,["run",`test:e2e:phase${phase}`]]),
  ...["8a","8b","8c","8d","8e","8f","8g","8h"].map(phase=>[npm,["run",`test:phase${phase}:security`]]),
  [npm,["run","build"]],[npm,["run","test:security"]],[npm,["run","test:billing:security"]],
  [npm,["run","test:production-default"]],[npm,["run","test:e2e:canonical"]],
  [npm,["run","test:e2e","--","e2e/math-word-hunt-v5.spec.ts"]],[npm,["audit","--audit-level=high"]],
  ["git",["diff","--check"]],["git",["diff","--exit-code","--",...protectedFiles]]
];
await cleanPlatformGeneratedNextState();
for(const[command,args]of gates){const result=spawnSync(command,args,{stdio:"inherit",shell:process.platform==="win32"});if(result.status!==0)process.exit(result.status??1)}
for(const[path,digest]of[["docs/index.html","10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"],["docs/vocab.js","caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]]){const actual=createHash("sha256").update(readFileSync(path)).digest("hex");if(actual!==digest)throw new Error(`${path} changed: ${actual}`)}
console.log("Authoritative Phase 8 verification passed: all local unit, migration, RLS, admin, upload, publication, operations, accessibility, security, build, dependency, canonical, historical, and rollback contracts are green.");
