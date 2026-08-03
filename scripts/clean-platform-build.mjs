import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stopRegisteredVerificationNextProcesses } from "./verification-processes.mjs";

const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const appRoot = realpathSync(resolve(repositoryRoot, "apps/platform-web"));
const buildRoot = resolve(appRoot, ".next");
if (dirname(buildRoot) !== appRoot || basename(buildRoot) !== ".next") throw new Error("Refusing unsafe build cleanup target");

await stopRegisteredVerificationNextProcesses();

if (process.platform === "win32") {
  const cleanupScript = [
    "$ErrorActionPreference = 'Stop'",
    "$target = $env:MATH_HUNT_BUILD_ROOT",
    "$extendedTarget = '\\\\?\\' + $target",
    "$deadline = (Get-Date).AddSeconds(30)",
    "while (Test-Path -LiteralPath $target) {",
    "  try { [System.IO.Directory]::Delete($extendedTarget, $true) }",
    "  catch {",
    "    if (Test-Path -LiteralPath $target) {",
    "      Get-ChildItem -LiteralPath $target -Force -Recurse -ErrorAction SilentlyContinue |",
    "        Sort-Object { $_.FullName.Length } -Descending |",
    "        ForEach-Object {",
    "          $extendedChild = '\\\\?\\' + $_.FullName",
    "          try { if ($_.PSIsContainer) { [System.IO.Directory]::Delete($extendedChild, $false) } else { [System.IO.File]::Delete($extendedChild) } } catch { }",
    "        }",
    "      try { [System.IO.Directory]::Delete($extendedTarget, $true) } catch { }",
    "    }",
    "    if ((Test-Path -LiteralPath $target) -and (Get-Date) -ge $deadline) { throw }",
    "    Start-Sleep -Milliseconds 500",
    "  }",
    "  if ((Test-Path -LiteralPath $target) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }",
    "}"
  ].join("\n");
  const cleanup = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cleanupScript], {
    env: { ...process.env, MATH_HUNT_BUILD_ROOT: buildRoot },
    stdio: "inherit",
    windowsHide: true
  });
  const [cleanupExitCode] = await once(cleanup, "exit");
  if (cleanupExitCode !== 0) throw new Error("Clean build directory could not be removed by PowerShell");
} else {
  rmSync(buildRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
if (existsSync(buildRoot)) throw new Error("Clean build directory could not be removed");

const nextEnvironmentPath = resolve(appRoot, "next-env.d.ts");
const originalNextEnvironment = existsSync(nextEnvironmentPath) ? readFileSync(nextEnvironmentPath) : null;
const build = spawn(process.execPath, [resolve(repositoryRoot, "node_modules/next/dist/bin/next"), "build", appRoot], { cwd: repositoryRoot, stdio: "inherit" });
const [exitCode] = await once(build, "exit");
if (originalNextEnvironment) writeFileSync(nextEnvironmentPath, originalNextEnvironment);
process.exitCode = exitCode ?? 1;
