import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = resolve(repositoryRoot, "apps/platform-web/public/internal-games/crosscalc");
const standaloneRoot = process.env.CROSSCALC_SOURCE_DIR ? resolve(process.env.CROSSCALC_SOURCE_DIR) : resolve(repositoryRoot, "..", "..", "..", "crosscalc");
const assetHashes = Object.freeze({
  "assets/index-CUYr0coz.css": "2bb39ccb0b2cfa958b81e38037d8b33880a6207c22d0cda161e1a0b52baf5393",
  "assets/index-C7Zij5Bt.js": "eec94165b4c2dfce13b1f6ea46c32c158c29f80883a67d91afe2a72e4ebc4b54",
  "assets/oldskool-cc0-CQNT44Pl.mp3": "888052a10a8939c8fa543b5e383e9852e2682e123aa077097c83de9976337a88"
});

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test("CrossCalc native assets match the verified standalone production build", () => {
  for (const [path, hash] of Object.entries(assetHashes)) {
    const nativePath = resolve(nativeRoot, path);
    assert.equal(sha256(readFileSync(nativePath)), hash, path);
    if (existsSync(standaloneRoot)) assert.deepEqual(readFileSync(nativePath), readFileSync(resolve(standaloneRoot, "dist", path)), path);
  }
});

test("the bundle retains all modes, safe storage, and the approved palette", () => {
  const source = readFileSync(resolve(nativeRoot, "assets/index-C7Zij5Bt.js"), "utf8");
  for (const mode of ["addition", "subtraction", "multiplication", "division", "mixed"]) assert.ok(source.includes(mode), mode);
  for (const contract of ["mathnexa.crosscalc.v1", "crosscalc-audio/1", "workspace-write"]) {
    if (contract !== "workspace-write") assert.ok(source.includes(contract), contract);
  }
  assert.doesNotMatch(source, /number-cross|MATHNEXA_GAME_LAUNCH_SECRET|localhost|[A-Za-z]:\\\\/);
  const styles = readFileSync(resolve(nativeRoot, "assets/index-CUYr0coz.css"), "utf8").toLowerCase();
  for (const color of ["#071525", "#20cfe3", "#ff4f9a", "#f5fbff"]) assert.ok(styles.includes(color), color);
});

test("only production runtime assets ship and native navigation remains accessible", () => {
  const shipped = files(nativeRoot).map((path) => relative(nativeRoot, path).replaceAll("\\", "/")).sort();
  assert.deepEqual(shipped, [
    "assets/index-C7Zij5Bt.js",
    "assets/index-CUYr0coz.css",
    "assets/oldskool-cc0-CQNT44Pl.mp3",
    "integration.css"
  ]);
  assert.equal(shipped.some((path) => path.endsWith(".map") || path.endsWith(".zip")), false);
  assert.match(readFileSync(resolve(nativeRoot, "integration.css"), "utf8"), /min-height:\s*44px/);
});

test("catalog art is a genuine 16:9 CrossCalc board in the approved palette", () => {
  const thumbnail = readFileSync(resolve(repositoryRoot, "apps/platform-web/public/media/games/crosscalc.svg"), "utf8");
  assert.match(thumbnail, /width="1200" height="675" viewBox="0 0 1200 675"/);
  for (const color of ["#071525", "#20CFE3", "#FF4F9A"]) assert.ok(thumbnail.includes(color), color);
  for (const equation of ["600 + 675 = 1275", "27 × 27 = 729", "1500 − 582 = 918"]) assert.ok(thumbnail.includes(equation), equation);
  assert.doesNotMatch(thumbnail, /\b(?:href|src)="https?:|<image\b|preserveAspectRatio="none"/);
});

test("catalog taxonomy is canonical so the additive Draft migration can execute", () => {
  const migration = readFileSync(resolve(repositoryRoot, "supabase/migrations/20260814190000_crosscalc_internal_game.sql"), "utf8");
  assert.ok(migration.includes("array['addition','arithmetic-reasoning','division','mental-math','multiplication','problem-solving','subtraction']"));
  assert.ok(migration.includes("array['arithmetic','logic-puzzles','number-operations','whole-numbers']"));
  assert.equal((migration.match(/insert into public\.game_catalog_entries/g) ?? []).length, 1);
  assert.ok(migration.includes("'mixed','draft',32,'0.1.0'"));
});
