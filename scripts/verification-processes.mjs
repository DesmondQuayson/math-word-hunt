import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = resolve(repositoryRoot, "apps/platform-web/.verification-next-pids.json");
const expectedAppPath = resolve(repositoryRoot, "apps/platform-web").toLowerCase();

function readRegistry() {
  if (!existsSync(registryPath)) return [];
  try {
    const value = JSON.parse(readFileSync(registryPath, "utf8"));
    return Array.isArray(value) ? value.filter((pid) => Number.isSafeInteger(pid) && pid > 0) : [];
  } catch { return []; }
}

function writeRegistry(pids) {
  const unique = [...new Set(pids)];
  if (unique.length === 0) {
    if (existsSync(registryPath)) unlinkSync(registryPath);
    return;
  }
  writeFileSync(registryPath, JSON.stringify(unique), { encoding: "utf8", flag: "w" });
}

function run(file, args) {
  return new Promise((resolveRun) => execFile(file, args, { windowsHide: true }, () => resolveRun()));
}

async function waitForChildExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    new Promise((done) => setTimeout(() => done(false), timeoutMs))
  ]);
  if (!exited) throw new Error(`Verification Next process ${child.pid ?? "unknown"} did not exit`);
}

async function commandLine(pid) {
  if (process.platform === "win32") {
    return new Promise((resolveCommand) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`], { windowsHide: true }, (_error, stdout) => resolveCommand(String(stdout).trim())));
  }
  return new Promise((resolveCommand) => execFile("ps", ["-p", String(pid), "-o", "command="], (_error, stdout) => resolveCommand(String(stdout).trim())));
}

async function terminatePid(pid) {
  if (process.platform === "win32") await run("taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
  else {
    try { process.kill(pid, "SIGTERM"); } catch { return; }
    while (true) {
      try { process.kill(pid, 0); await new Promise((done) => setTimeout(done, 50)); }
      catch { return; }
    }
  }
}

export function registerVerificationNextProcess(child) {
  if (!child.pid) throw new Error("Verification Next process has no PID");
  writeRegistry([...readRegistry(), child.pid]);
}

export async function stopVerificationNextProcess(child) {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32") {
        // Stop the tree while the parent PID still exists so Next workers cannot be orphaned.
        await terminatePid(pid);
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await waitForChildExit(child);
      } else {
        child.kill();
        const exited = await Promise.race([once(child, "exit").then(() => true), new Promise((done) => setTimeout(() => done(false), 5_000))]);
        if (!exited && child.exitCode === null && child.signalCode === null) {
          await terminatePid(pid);
          await waitForChildExit(child);
        }
      }
    }
  } finally {
    writeRegistry(readRegistry().filter((registeredPid) => registeredPid !== pid));
  }
}

export async function stopRegisteredVerificationNextProcesses() {
  for (const pid of readRegistry()) {
    const command = (await commandLine(pid)).toLowerCase();
    if (command.includes("next") && command.includes(expectedAppPath)) await terminatePid(pid);
  }
  writeRegistry([]);
}

export async function cleanPlatformGeneratedNextState() {
  await stopRegisteredVerificationNextProcesses();
  const appRoot = realpathSync(resolve(repositoryRoot, "apps/platform-web"));
  const buildRoot = resolve(appRoot, ".next");
  if (dirname(buildRoot) !== appRoot || basename(buildRoot) !== ".next") {
    throw new Error("Refusing unsafe generated Next state cleanup target");
  }
  if (!existsSync(buildRoot)) return;
  if (process.platform === "win32") {
    const cleanupScript = [
      "$ErrorActionPreference = 'Stop'",
      "$target = $env:MATH_HUNT_GENERATED_NEXT_ROOT",
      "$extendedTarget = '\\\\?\\' + $target",
      "$deadline = (Get-Date).AddSeconds(30)",
      "while (Test-Path -LiteralPath $target) {",
      "  try { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop }",
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
      env: { ...process.env, MATH_HUNT_GENERATED_NEXT_ROOT: buildRoot },
      stdio: "inherit",
      windowsHide: true
    });
    const [exitCode] = await once(cleanup, "exit");
    if (exitCode !== 0) throw new Error("Generated Next state could not be removed by PowerShell");
  } else {
    rmSync(buildRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
  if (existsSync(buildRoot)) throw new Error("Generated Next state still exists after cleanup");
}

export async function waitForLocalSupabaseAuth(client, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!result.error) return;
    } catch { /* Local Auth is still restarting. */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Local Supabase Auth did not become ready within the bounded verification window");
}
