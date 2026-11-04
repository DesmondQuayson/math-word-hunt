#!/usr/bin/env node
// Computes the Math Bingo Live runtime content hash (see
// apps/platform-web/features/games/math-bingo-live/document.ts).
//   node scripts/math-bingo-live-runtime-hash.mjs          print the hash
//   node scripts/math-bingo-live-runtime-hash.mjs --write  update document.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/platform-web/public/internal-games/math-bingo-live/", import.meta.url));
const documentFile = fileURLToPath(new URL("../apps/platform-web/features/games/math-bingo-live/document.ts", import.meta.url));

// Every file the runtime can fetch: scripts, styles and its own SVG.
const RUNTIME_FILE = /\.(js|css|svg)$/;
const TEXT_FILE = /\.(js|css|svg)$/;

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
    if (TEXT_FILE.test(file)) {
      // Line endings are normalised so a CRLF checkout computes the same value.
      hash.update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
    } else {
      hash.update(readFileSync(file));
    }
    hash.update("\n");
  }
  return hash.digest("hex");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const value = runtimeHash();
  if (process.argv.includes("--write")) {
    const source = readFileSync(documentFile, "utf8");
    const next = source.replace(/MATH_BINGO_LIVE_RUNTIME_SHA256 = "[0-9a-f]{64}"/, `MATH_BINGO_LIVE_RUNTIME_SHA256 = "${value}"`);
    writeFileSync(documentFile, next);
  }
  process.stdout.write(`${value}\n`);
}
