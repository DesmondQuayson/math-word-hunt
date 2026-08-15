import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanPlatformGeneratedNextState } from "./verification-processes.mjs";

const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const appRoot = realpathSync(resolve(repositoryRoot, "apps/platform-web"));
await cleanPlatformGeneratedNextState();

const nextEnvironmentPath = resolve(appRoot, "next-env.d.ts");
const originalNextEnvironment = existsSync(nextEnvironmentPath) ? readFileSync(nextEnvironmentPath) : null;
const build = spawn(process.execPath, [resolve(repositoryRoot, "node_modules/next/dist/bin/next"), "build", appRoot], { cwd: repositoryRoot, stdio: "inherit" });
const [exitCode] = await once(build, "exit");
if (originalNextEnvironment) writeFileSync(nextEnvironmentPath, originalNextEnvironment);
process.exitCode = exitCode ?? 1;
