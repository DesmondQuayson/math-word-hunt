import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = resolve(repositoryRoot, "apps/platform-web/public/internal-games/number-cross");
const standaloneRoot = process.env.NUMBER_CROSS_SOURCE_DIR
  ? resolve(process.env.NUMBER_CROSS_SOURCE_DIR)
  : resolve(repositoryRoot, "..", "..", "Number cross");

const preservedHashes = Object.freeze({
  "styles.css": "e5cfa20599767bce7ea12de62a4756a77cd9e5743b2b9b114f5fd8e4f5135c93",
  "src/game-engine.js": "77755f3124760720fd284db15da4ee7b8bc5c9e3d0de1846512442d40adcdcca",
  "src/preferences.js": "e7d83849afd55b11482cb5117bd26915a44ceb9f6e47188f261707a1e5e623a4",
  "src/storage-keys.js": "9f250ec9c27d13348847cb2572f717aa410d3ffd5399f2fd24c76c9a1e439887",
  "src/version.js": "882aafbb7184a7bba1327eccec88b9f756653f5be78ed871ba4b4a8d3021a963"
});
const musicHash = "6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("native Number Cross preserves every mathematical engine, storage, and base-style source byte", () => {
  for (const [relativePath, expectedHash] of Object.entries(preservedHashes)) {
    const nativePath = resolve(nativeRoot, relativePath);
    assert.equal(sha256(nativePath), expectedHash, relativePath);
    if (existsSync(standaloneRoot)) {
      assert.deepEqual(readFileSync(nativePath), readFileSync(resolve(standaloneRoot, relativePath)), relativePath);
    }
  }
});

test("the integrated application keeps native routing and one same-origin music source", () => {
  const application = readFileSync(resolve(nativeRoot, "src/app.js"), "utf8");
  assert.equal((application.match(/class="native-back-link"/g) ?? []).length, 1);
  assert.match(application, /href="\/games" aria-label="Back to MathNexa Games"/);
  assert.equal((application.match(/new Audio\(/g) ?? []).length, 1);
  assert.doesNotMatch(application, /number-cross\.vercel\.app|launch=/);
});

test("the hotfix tutorial teaches an authentic solvable board and music activation lifecycle", () => {
  const application = readFileSync(resolve(nativeRoot, "src/app.js"), "utf8");
  const integration = readFileSync(resolve(nativeRoot, "integration.css"), "utf8");
  for (const lesson of [
    "Read the targets",
    "Numbers above the board are column targets",
    "Cross out the extra number",
    "First row: keep 2 and 5",
    "Make both directions match",
    "Each move changes one row and one column"
  ]) assert.ok(application.includes(lesson), lesson);
  assert.match(application, /values = \[\[2, 5, 1\], \[4, 3, 2\], \[1, 2, 4\]\]/);
  assert.match(application, /columnTargets = addition \? \[7, 5, 6\] : \[8, 5, 8\]/);
  assert.match(application, /rowTargets = addition \? \[7, 6, 5\] : \[10, 8, 4\]/);
  assert.match(application, /crossed: \[2, 4, 7\], solved: true/);
  assert.match(application, /role="img" aria-label="\$\{description\}"/);
  assert.match(integration, /Authentic tutorial board/);
  assert.match(integration, /--tutorial-cell: 52px/);

  assert.match(application, /hasOwnProperty\.call\(rawSavedPrefs, "music"\)/);
  assert.match(application, /musicVolume <= 0\) savedPrefs\.musicVolume = DEFAULT_ACTIVE_MUSIC_VOLUME/);
  assert.match(application, /data-action="music-volume" type="range" min="0\.05"/);
  assert.match(application, /document\.addEventListener\("pointerdown", \(\) => audio\.activate\(\), \{ capture: true \}\)/);
  assert.match(application, /window\.__MATHNEXA_GAME_MUSIC__ = Object\.freeze/);
  assert.match(application, /activeMusicSources: this\.music && !this\.music\.paused \? 1 : 0/);
  assert.match(application, /window\.addEventListener\("pagehide"/);
  assert.match(application, /else audio\.dispose\(\)/);
});

test("representative native puzzles and Reasoning Index outputs match the standalone source", async (context) => {
  if (!existsSync(resolve(standaloneRoot, "src/game-engine.js"))) {
    context.diagnostic("Standalone checkout unavailable; byte-hash parity remains authoritative.");
    return;
  }
  const native = await import(pathToFileURL(resolve(nativeRoot, "src/game-engine.js")).href);
  const standalone = await import(pathToFileURL(resolve(standaloneRoot, "src/game-engine.js")).href);
  const cases = [
    ["addition", "beginner", "native-parity-addition-beginner"],
    ["addition", "medium", "native-parity-addition-medium"],
    ["addition", "expert", "native-parity-addition-expert"],
    ["multiplication", "beginner", "native-parity-multiplication-beginner"],
    ["multiplication", "medium", "native-parity-multiplication-medium"],
    ["multiplication", "expert", "native-parity-multiplication-expert"]
  ];
  for (const [mode, difficulty, seed] of cases) {
    const options = { mode, difficulty, seed };
    const nativePuzzle = native.generatePuzzle(options);
    const standalonePuzzle = standalone.generatePuzzle(options);
    assert.deepEqual(nativePuzzle, standalonePuzzle, `${mode} ${difficulty}`);
    assert.equal(native.solvePuzzle(nativePuzzle, 2).count, 1);
    assert.equal(standalone.solvePuzzle(standalonePuzzle, 2).count, 1);
    const decisions = nativePuzzle.solution.flat().filter((active) => !active).length;
    const telemetry = { puzzle: nativePuzzle, elapsedSeconds: 87, decisions, corrections: 1, hintLevels: [0] };
    assert.deepEqual(native.calculateReasoningIndex(telemetry), standalone.calculateReasoningIndex({ ...telemetry, puzzle: standalonePuzzle }));
  }
});

test("native storage stays namespaced and the optimized music asset is the only shipped recording", async () => {
  const storage = await import(pathToFileURL(resolve(nativeRoot, "src/storage-keys.js")).href);
  for (const value of Object.values(storage.STORAGE_KEYS)) assert.match(value, /^mathnexa:number-cross:/);
  assert.match(storage.bestTimeKey("addition", "expert"), /^mathnexa:number-cross:/);
  const audio = resolve(nativeRoot, "audio/music/cosmic-candy-catchers.mp3");
  assert.equal(statSync(audio).size, 1_024_417);
  assert.equal(sha256(audio), musicHash);
  assert.equal(readFileSync(audio).subarray(0, 2).toString("hex"), "fffb");
  assert.equal(existsSync(resolve(nativeRoot, "audio/music/determined-pursuit-source.wav")), false);
  assert.equal(existsSync(resolve(nativeRoot, "audio/music/determined-pursuit.mp3")), false);
  const engagement = readFileSync(resolve(nativeRoot, "src/engagement.js"), "utf8");
  for (const credit of ["Cosmic Candy Catchers", "Eric Matyas", "CC BY 3.0", "cosmic-candy-catchers.mp3"]) {
    assert.ok(engagement.includes(credit), credit);
  }
});
