import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";

import { GAME_SUITE_THUMBNAIL_CONTENT as content } from "./game-suite-thumbnail-content.mjs";

const root = resolve(import.meta.dirname, "..");
const expectedAudioHash = "6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369";
const audioPaths = [
  "apps/platform-web/public/media/audio/cosmic-candy-catchers.mp3",
  "apps/platform-web/public/internal-games/number-cross/audio/music/cosmic-candy-catchers.mp3",
  "apps/platform-web/public/internal-games/number-logic/assets/oldskool-cc0-CQNT44Pl.mp3",
  "apps/platform-web/public/internal-games/crosscalc-v2/assets/oldskool-cc0-CQNT44Pl.mp3"
];
const thumbnails = [
  ["math-vocabulary-hunt", content.mathVocabularyHunt.assets],
  ["number-logic", content.numberLogic.assets],
  ["number-cross", content.numberCross.assets]
];

function bytes(path) { return readFileSync(resolve(root, path)); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

const engineSource = bytes("apps/platform-web/public/internal-games/number-cross/src/game-engine.js");
const {
  calculatePlayerValues,
  calculateTargets,
  generatePuzzle,
  getLineStatus,
  solvePuzzle
} = await import(`data:text/javascript;base64,${engineSource.toString("base64")}`);

for (const path of audioPaths) {
  assert.equal(sha256(bytes(path)), expectedAudioHash, path);
  assert.equal(statSync(resolve(root, path)).size, 1_024_417, path);
}
assert.equal(existsSync(resolve(root, "apps/platform-web/public/internal-games/number-cross/audio/music/determined-pursuit.mp3")), false);

for (const [key, expectedAssets] of thumbnails) {
  for (const format of ["webp", "avif"]) {
    const path = `apps/platform-web/public/media/games/${key}.${format}`;
    const image = bytes(path);
    const metadata = await sharp(image).metadata();
    assert.deepEqual([metadata.width, metadata.height], [1200, 675], path);
    assert.ok(statSync(resolve(root, path)).size < 120_000, path);
    assert.equal(image.byteLength, expectedAssets[format].bytes, `${path}: reviewed byte size`);
    assert.equal(sha256(image), expectedAssets[format].sha256, `${path}: reviewed content hash`);
  }
}

const crossCalcThumbnailPath = "apps/platform-web/public/media/games/crosscalc-v2-rc.webp";
const crossCalcThumbnail = bytes(crossCalcThumbnailPath);
const crossCalcMetadata = await sharp(crossCalcThumbnail).metadata();
assert.deepEqual([crossCalcMetadata.width, crossCalcMetadata.height], [1200, 675], crossCalcThumbnailPath);
assert.equal(crossCalcThumbnail.byteLength, content.crossCalc.webp.bytes, crossCalcThumbnailPath);
assert.equal(sha256(crossCalcThumbnail), content.crossCalc.webp.sha256, crossCalcThumbnailPath);

const canonicalVocabulary = bytes("docs/vocab.js").toString("utf8");
assert.equal(content.mathVocabularyHunt.readableClues.length, 0, "The artwork contains no readable definition that could contradict canonical copy.");
for (const term of content.mathVocabularyHunt.visibleTerms) {
  assert.ok(canonicalVocabulary.includes(`"${term}"`), `Thumbnail term is absent from canonical vocabulary: ${term}`);
  assert.ok(canonicalVocabulary.includes(content.mathVocabularyHunt.canonicalDefinitions[term]), `Canonical definition drifted for: ${term}`);
}

const logic = content.numberLogic;
const logicLines = Object.freeze({
  "Left line": ["T", "ML", "BL"],
  "Center line": ["T", "MC", "BC"],
  "Right line": ["T", "MR", "BR"],
  "Middle row": ["ML", "MC", "MR"],
  "Bottom row": ["BL", "BC", "BR"]
});
assert.deepEqual([...new Set(logic.inventory)].sort((a, b) => a - b), logic.inventory, "Number Logic inventory must be unique and ordered.");
for (const [position, value] of Object.entries(logic.fixedPlacements)) assert.equal(logic.uniqueSolution[position], value, `Number Logic fixed clue ${position}`);
for (const move of logic.solverBackedMoves) assert.equal(logic.uniqueSolution[move.position], move.value, `Number Logic solver move ${move.message}`);
for (const [name, positions] of Object.entries(logicLines)) {
  const total = positions.reduce((sum, position) => sum + logic.uniqueSolution[position], 0);
  assert.equal(total, logic.target, `Number Logic solution route: ${name}`);
}
for (const route of logic.visibleRoutes) {
  assert.match(route.expression, /^(?:\d+|\?)(?: \+ (?:\d+|\?)){2}(?: = \d+)?$/, `Number Logic route grammar: ${route.name}`);
  assert.doesNotMatch(route.expression, /\+\s*=|=\s*$|\+\s*\+/, `Number Logic malformed route: ${route.name}`);
  if (route.state === "SATISFIED") {
    const match = route.expression.match(/^(\d+) \+ (\d+) \+ (\d+) = (\d+)$/);
    assert.ok(match, `Satisfied Number Logic route must be complete: ${route.name}`);
    assert.equal(Number(match[1]) + Number(match[2]) + Number(match[3]), Number(match[4]), `Number Logic equation: ${route.expression}`);
    assert.equal(Number(match[4]), logic.target, `Number Logic shared target: ${route.expression}`);
  } else {
    assert.equal(route.state, "FEASIBLE", `Number Logic partial route state: ${route.name}`);
    assert.ok(route.expression.includes("?"), `Number Logic partial route must use the game's explicit unknown marker: ${route.name}`);
    assert.equal(route.expression.includes("="), false, `Number Logic partial route must not claim equality: ${route.name}`);
  }
}
assert.equal(logic.feasibility, "PROVEN_POSSIBLE");

const cross = content.numberCross;
const generated = generatePuzzle({ mode: cross.mode, difficulty: cross.difficulty, seed: cross.seed });
assert.equal(generated.id, cross.puzzleId);
assert.deepEqual(generated.grid, cross.grid);
assert.deepEqual(generated.rowTargets, cross.rowTargets);
assert.deepEqual(generated.columnTargets, cross.columnTargets);
assert.deepEqual(generated.solution, cross.solution);
assert.deepEqual(calculateTargets(generated.grid, generated.solution, generated.mode), {
  rows: cross.rowTargets,
  columns: cross.columnTargets
});
assert.equal(solvePuzzle(generated, 2).count, cross.uniqueSolutionCount, "Number Cross must remain uniquely solvable.");
for (let row = 0; row < generated.grid.length; row += 1) {
  const values = generated.grid[row].filter((_, column) => generated.solution[row][column]);
  assert.equal(values.reduce((sum, value) => sum + value, 0), generated.rowTargets[row], `Number Cross solution row ${row + 1}`);
}
for (let column = 0; column < generated.grid.length; column += 1) {
  const values = generated.grid.flatMap((row, rowIndex) => generated.solution[rowIndex][column] ? [row[column]] : []);
  assert.equal(values.reduce((sum, value) => sum + value, 0), generated.columnTargets[column], `Number Cross solution column ${column + 1}`);
}
for (const index of cross.captureCrossedIndices) {
  const row = Math.floor(index / generated.grid.length);
  const column = index % generated.grid.length;
  assert.equal(generated.solution[row][column], false, `Number Cross capture may cross only a solution-excluded cell: ${index}`);
}
const player = calculatePlayerValues(generated.grid, new Set(cross.captureCrossedIndices), generated.mode);
assert.deepEqual(player.rows, cross.capturePlayerRows);
assert.deepEqual(player.columns, cross.capturePlayerColumns);
const captureStatuses = [
  ...player.rows.map((value, index) => getLineStatus(value, generated.rowTargets[index], generated.mode)),
  ...player.columns.map((value, index) => getLineStatus(value, generated.columnTargets[index], generated.mode))
];
assert.equal(captureStatuses.filter((status) => status === "correct").length, cross.captureCorrectLineCount);
assert.equal(captureStatuses.includes("impossible"), false, "Number Cross captured state must remain feasible.");

const captureSource = bytes("scripts/capture-authentic-game-thumbnails.mjs").toString("utf8");
for (const marker of [logic.route, cross.route, logic.puzzleId, cross.puzzleId, "PROVEN_POSSIBLE", "Capture attempted remote requests"]) {
  assert.ok(captureSource.includes(marker) || JSON.stringify(content).includes(marker), `Authentic capture contract marker: ${marker}`);
}

const attributionTargets = [
  "apps/platform-web/features/games/number-logic/document.ts",
  "apps/platform-web/features/games/crosscalc-v2/document.ts",
  "apps/platform-web/public/internal-games/number-cross/src/app.js",
  "apps/platform-web/lib/game-access/canonical-runtime-enhancements.ts"
];
for (const path of attributionTargets) {
  const source = bytes(path).toString("utf8");
  for (const value of ["Cosmic Candy Catchers", "Eric Matyas", "soundimage.org", "CC BY 3.0"]) assert.ok(source.includes(value), `${path}: ${value}`);
}

for (const path of [
  "apps/platform-web/public/game-suite/math-vocabulary-music.js",
  "apps/platform-web/public/internal-games/number-cross/src/engagement.js",
  "apps/platform-web/public/internal-games/number-logic/assets/index-DXexJzA-.js",
  "apps/platform-web/public/internal-games/crosscalc-v2/assets/index-B0m_QJed.js"
]) {
  const source = bytes(path).toString("utf8");
  assert.doesNotMatch(source, /opengameart\.org|https?:\/\/[^"'`\s]+\.(?:mp3|ogg|wav)/i, path);
}

for (const [path, expected] of [
  ["docs/index.html", "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]) assert.equal(sha256(bytes(path)), expected, path);

console.log("Game-suite media audit passed: protected sources, reviewed 1200x675 assets, authentic puzzle-state math, canonical vocabulary, local music, attribution, and runtime network boundaries are intact.");
