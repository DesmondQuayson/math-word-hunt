import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = resolve(repositoryRoot, "apps/platform-web/public/internal-games/number-logic");
const standaloneRoot = process.env.NUMBER_LOGIC_SOURCE_DIR
  ? resolve(process.env.NUMBER_LOGIC_SOURCE_DIR)
  : resolve(repositoryRoot, "..", "..", "Number Logic");

const assetHashes = Object.freeze({
  "assets/index-0S0ADVv9.css": "d29f4a432ea37e570e61ed9d83720ab0107922fc9f6ca15e0c3db54e20d2be29",
  "assets/index-Dk-vovPM.js": "16eb20992dca938f3f3677ac6e26b3f868ae1e9afc9d04358670e23885f2dec7",
  "assets/oldskool-cc0-CQNT44Pl.mp3": "888052a10a8939c8fa543b5e383e9852e2682e123aa077097c83de9976337a88"
});

const sourceAggregates = Object.freeze({
  math: "0f125d147d628173dd883235b230186ba5617be49c00f3c8c2212977dc28c2a5",
  resultContracts: "36f2f20505c80774c1815d6291b37e9d494c8d23da363025ec15ed42a86615a5",
  hostStorage: "85979ddd233322299622a4f62fb49c86a76b2ee55cf9d1c965ff04bc2512c2ea",
  audio: "7ef933cf688e9fea453122af10da2865a86a29336c502f92fce00d207e7fdfa8"
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function runtimeFiles(...directories) {
  return directories.flatMap((directory) => files(resolve(standaloneRoot, directory)))
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(path));
}

function aggregate(paths) {
  const entries = paths.map((path) => ({
    path: relative(standaloneRoot, path).replaceAll("\\", "/"),
    hash: sha256(readFileSync(path))
  })).sort((left, right) => left.path.localeCompare(right.path));
  return sha256(entries.map(({ path, hash }) => `${path}\0${hash}\n`).join(""));
}

test("the native assets are the verified build from the approved standalone source", () => {
  for (const [path, hash] of Object.entries(assetHashes)) {
    const nativePath = resolve(nativeRoot, path);
    assert.equal(sha256(readFileSync(nativePath)), hash, path);
    if (existsSync(standaloneRoot)) {
      assert.deepEqual(readFileSync(nativePath), readFileSync(resolve(standaloneRoot, "dist", path)), path);
    }
  }
  assert.equal(statSync(resolve(nativeRoot, "assets/oldskool-cc0-CQNT44Pl.mp3")).size, 1_295_630);
});

test("approved mathematical, result, adapter, and audio sources have no native drift", (context) => {
  if (!existsSync(resolve(standaloneRoot, "src"))) {
    context.diagnostic("Standalone checkout unavailable; checked-in aggregate and asset hashes remain authoritative.");
    return;
  }
  const math = runtimeFiles("src/core", "src/modes").filter((path) => path.endsWith(".ts"));
  assert.equal(aggregate(math), sourceAggregates.math, "mathematical engine aggregate");
  assert.equal(aggregate(runtimeFiles("src/core/contracts", "src/progress")), sourceAggregates.resultContracts, "result contracts aggregate");
  assert.equal(aggregate(runtimeFiles("src/adapters")), sourceAggregates.hostStorage, "host and storage aggregate");
  assert.equal(aggregate(runtimeFiles("src/audio")), sourceAggregates.audio, "audio aggregate");
});

test("one bundle retains all six modes, exact contracts, and collision-safe storage", () => {
  const source = readFileSync(resolve(nativeRoot, "assets/index-Dk-vovPM.js"), "utf8");
  for (const mode of ["lines-of-3", "u-sums", "magic-h", "equal-sums", "square-sums", "product-square"]) {
    assert.match(source, new RegExp(`\\b${mode.replaceAll("-", "\\-")}\\b`), mode);
  }
  for (const contract of [
    "cross-mode-result/1.0.0",
    "number-logic-progress/1",
    "number-logic-audio/1",
    "mathnexa:number-logic:v1:app",
    "mathnexa:number-logic-progress:1",
    "mathnexa:number-logic-audio:1"
  ]) assert.ok(source.includes(contract), contract);
  assert.equal((source.match(/createBufferSource\(/g) ?? []).length, 1);
  assert.ok(source.includes("musicVolume:.35"));
  assert.ok(source.includes("soundEffectsVolume:.6"));
  assert.doesNotMatch(source, /number-cross|MATHNEXA_GAME_LAUNCH_SECRET|localhost|[A-Za-z]:\\\\/);
});

test("only production runtime assets ship and navigation stays native", () => {
  const shipped = files(nativeRoot).map((path) => relative(nativeRoot, path).replaceAll("\\", "/")).sort();
  assert.deepEqual(shipped, [
    "assets/index-0S0ADVv9.css",
    "assets/index-Dk-vovPM.js",
    "assets/oldskool-cc0-CQNT44Pl.mp3",
    "integration.css"
  ]);
  assert.equal(shipped.some((path) => path.endsWith(".map") || path.endsWith(".zip")), false);
  const integration = readFileSync(resolve(nativeRoot, "integration.css"), "utf8");
  assert.match(integration, /min-height:\s*44px/);
});
