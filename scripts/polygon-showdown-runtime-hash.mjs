#!/usr/bin/env node
// Computes the Polygon Showdown runtime content hash (see
// apps/platform-web/features/games/polygon-showdown/document.ts).
//   node scripts/polygon-showdown-runtime-hash.mjs          print the hash
//   node scripts/polygon-showdown-runtime-hash.mjs --write  update document.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/platform-web/public/internal-games/polygon-showdown/", import.meta.url));
const documentFile = fileURLToPath(new URL("../apps/platform-web/features/games/polygon-showdown/document.ts", import.meta.url));

const RUNTIME_FILE = /\.(js|css|svg)$/;

export function runtimeFiles(directory = root) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...runtimeFiles(path));
    else if (RUNTIME_FILE.test(name)) files.push(path);
  }
  return files.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
}

export function runtimeHash() {
  const hash = createHash("sha256");
  for (const file of runtimeFiles()) {
    hash.update(relative(root, file).split("\\").join("/"));
    hash.update("\n");
    // Line endings are normalised so a CRLF checkout computes the same value.
    hash.update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
    hash.update("\n");
  }
  return hash.digest("hex");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const value = runtimeHash();
  if (process.argv.includes("--write")) {
    const source = readFileSync(documentFile, "utf8");
    writeFileSync(documentFile, source.replace(/POLYGON_SHOWDOWN_RUNTIME_SHA256 = "[0-9a-f]{64}"/, `POLYGON_SHOWDOWN_RUNTIME_SHA256 = "${value}"`));
  }
  process.stdout.write(`${value}\n`);
}
