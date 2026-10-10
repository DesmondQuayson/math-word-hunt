#!/usr/bin/env node
/**
 * Math Tug of War 3D — character asset optimizer.
 *
 * Takes the per-character glTF folders written by build_characters.py
 * (Blender + MPFB, CC0 MakeHuman assets) and produces ONE runtime document:
 *
 *   <out>/characters.gltf   JSON (one root node per character)
 *   <out>/characters.bin    quantized geometry (KHR_mesh_quantization)
 *   <out>/*.webp            textures (external, so the strict game CSP
 *                           never needs blob: for image loading)
 *
 * Steps per character: face-locked mesh simplification (meshoptimizer; the
 * head keeps full detail so blinks and smiles survive), material clean-up
 * (opaque body/clothes, alpha-masked hair and lashes), merge, weld, dedup,
 * quantize, sparse morph targets, texture resize, prune. No runtime decoder
 * is needed: the output is plain glTF.
 *
 *   node scripts/math-tug-of-war-3d/optimize-characters.mjs --in <chars-dir> --out <runtime-dir>
 *
 * Tooling is MIT (@gltf-transform, meshoptimizer) plus sharp (Apache-2.0) and
 * lives in this folder's own package.json so the platform's root
 * dependencies stay untouched.
 */
import { mkdirSync, readdirSync, existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { NodeIO, Document } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { compactPrimitive, dedup, mergeDocuments, prune, quantize, sparse, textureCompress, unpartition, weld } = require("@gltf-transform/functions");
const { MeshoptSimplifier } = require("meshoptimizer");
const sharp = require("sharp");

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const inDir = resolve(option("--in", "chars"));
const outDir = resolve(option("--out", "out"));
const bodyRatio = Number(option("--body-ratio", "0.5"));
const faceLockY = Number(option("--face-lock-y", "1.38")); // metres: everything above the collar keeps full detail
const errorBudget = Number(option("--error", "0.0015"));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function characterDirs() {
  return readdirSync(inDir)
    .filter((name) => statSync(join(inDir, name)).isDirectory() && existsSync(join(inDir, name, `${name}.gltf`)))
    .sort();
}

/** Simplify one primitive with meshoptimizer, optionally locking vertices above `lockY` (character-local metres). */
function simplifyPrimitive(primitive, { ratio, lockY = -Infinity, error, lockBorder = false }) {
  const indicesAccessor = primitive.getIndices();
  const position = primitive.getAttribute("POSITION");
  if (!indicesAccessor || !position) return null;
  const indices = indicesAccessor.getArray();
  const positions = position.getArray();
  const vertexCount = position.getCount();
  const lock = new Uint8Array(vertexCount);
  let locked = 0;
  if (Number.isFinite(lockY)) {
    for (let index = 0; index < vertexCount; index += 1) {
      if (positions[index * 3 + 1] >= lockY) {
        lock[index] = 1;
        locked += 1;
      }
    }
  }
  const sourceIndices = indices instanceof Uint32Array ? indices : new Uint32Array(indices);
  const positions32 = positions instanceof Float32Array ? positions : new Float32Array(positions);
  const targetCount = Math.max(3, Math.floor((sourceIndices.length * ratio) / 3) * 3);
  const [result] = MeshoptSimplifier.simplifyWithAttributes(
    sourceIndices,
    positions32,
    3,
    new Float32Array(0),
    0,
    [],
    lock,
    targetCount,
    error,
    lockBorder ? ["LockBorder"] : []
  );
  indicesAccessor.setArray(vertexCount <= 65535 ? new Uint16Array(result) : new Uint32Array(result));
  compactPrimitive(primitive);
  return { before: sourceIndices.length / 3, after: result.length / 3, locked, vertices: primitive.getAttribute("POSITION").getCount() };
}

function tidyMaterials(document) {
  for (const material of document.getRoot().listMaterials()) {
    const name = material.getName().toLowerCase();
    const hairLike = /hair|afro|bob|braid|ponytail|short0|long0|eyebrow|eyelash/.test(name);
    if (hairLike) {
      material.setAlphaMode("MASK").setAlphaCutoff(0.3).setDoubleSided(true);
    } else {
      material.setAlphaMode("OPAQUE").setDoubleSided(false);
    }
    if (/body/.test(name)) material.setRoughnessFactor(0.62).setMetallicFactor(0);
    if (/teeth/.test(name)) material.setRoughnessFactor(0.35);
    if (/low-poly|high-poly|eye$/.test(name)) material.setRoughnessFactor(0.2);
  }
}

const KEEP_FACE_UNITS = new Set([
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
  "jawOpen", "mouthFrownLeft", "mouthFrownRight", "mouthSmileLeft", "mouthSmileRight",
  "mouthPressLeft", "mouthPressRight", "mouthStretchLeft", "mouthStretchRight", "noseSneerLeft", "noseSneerRight",
  "cheekSquintLeft", "cheekSquintRight", "mouthShrugLower", "mouthDimpleLeft", "mouthDimpleRight"
]);
const MORPH_THRESHOLD = 0.00045; // metres: smaller deltas are noise and are zeroed so sparse storage stays small

/** Drop unused face units and quiet tiny deltas on every morph target. */
function trimMorphs(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    const extras = mesh.getExtras() ?? {};
    const names = Array.isArray(extras.targetNames) ? extras.targetNames.slice() : [];
    const keptNames = [];
    let first = true;
    for (const primitive of mesh.listPrimitives()) {
      const targets = primitive.listTargets();
      targets.forEach((target, index) => {
        const name = names[index];
        if (name && !KEEP_FACE_UNITS.has(name)) {
          primitive.removeTarget(target);
          target.dispose();
          return;
        }
        if (first) keptNames.push(name ?? `target${index}`);
        const accessor = target.getAttribute("POSITION");
        if (!accessor) return;
        const array = accessor.getArray();
        const limit = MORPH_THRESHOLD * MORPH_THRESHOLD;
        for (let v = 0; v < array.length; v += 3) {
          const dx = array[v], dy = array[v + 1], dz = array[v + 2];
          if (dx * dx + dy * dy + dz * dz < limit) {
            array[v] = 0;
            array[v + 1] = 0;
            array[v + 2] = 0;
          }
        }
        accessor.setArray(array);
      });
      first = false;
    }
    if (names.length) mesh.setExtras({ ...extras, targetNames: keptNames });
    // Blender writes default weights for every original target; three.js
    // sizes morphTargetInfluences from this array and drops the names when
    // the counts disagree, which would silence every expression.
    mesh.setWeights(new Array(keptNames.length).fill(0));
  }
}

/**
 * One skin per character. Quantization can leave one skin per mesh; skins
 * that bind the very same joint nodes (identity, never names: every
 * character shares the Mixamo names) with the same bind matrices are merged.
 */
function shareSkins(document) {
  const root = document.getRoot();
  const byHips = new Map();
  const same = (a, b) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-6);
  for (const node of root.listNodes()) {
    const skin = node.getSkin();
    if (!skin) continue;
    const joints = skin.listJoints();
    const hips = joints[0];
    const matrices = skin.getInverseBindMatrices()?.getArray() ?? [];
    const candidates = byHips.get(hips) ?? [];
    const shared = candidates.find((other) => other.listJoints().every((joint, index) => joint === joints[index]) && same(other.getInverseBindMatrices()?.getArray() ?? [], matrices));
    if (shared && shared !== skin) node.setSkin(shared);
    else if (!shared) {
      candidates.push(skin);
      byHips.set(hips, candidates);
    }
  }
}

/** 16-bit indices wherever the vertex count allows (three.js reads both; this halves the index data). */
function shrinkIndices(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute("POSITION");
      if (!indices || !position || position.getCount() > 65535) continue;
      const array = indices.getArray();
      if (!(array instanceof Uint16Array)) indices.setArray(new Uint16Array(array));
    }
  }
}

const SMALL_TEXTURES = /hair|afro|bob|braid|ponytail|short0|long0|shoe|pants|cargo|teeth|eyebrow|eyelash/i;

async function loadCharacter(name) {
  const document = await io.read(join(inDir, name, `${name}.gltf`));
  const root = document.getRoot();
  const stats = { name, primitives: [] };
  for (const mesh of root.listMeshes()) {
    const meshName = mesh.getName().toLowerCase();
    const isFace = /teeth|eye|lash|brow/.test(meshName);
    const isBody = /base|body/.test(meshName) && !isFace;
    const isTeeth = /teeth/.test(meshName);
    const isHair = /hair|afro|bob|braid|ponytail|short0|long0/.test(meshName);
    const isShoe = /shoe/.test(meshName);
    for (const primitive of mesh.listPrimitives()) {
      let result = null;
      if (isBody) result = simplifyPrimitive(primitive, { ratio: bodyRatio, lockY: faceLockY, error: errorBudget, lockBorder: true });
      else if (isTeeth) result = simplifyPrimitive(primitive, { ratio: 0.3, error: 0.02 });
      else if (isHair) result = simplifyPrimitive(primitive, { ratio: 0.55, error: 0.01 });
      else if (isShoe) result = simplifyPrimitive(primitive, { ratio: 0.5, error: 0.01 });
      if (result) stats.primitives.push({ mesh: mesh.getName(), ...result });
    }
  }
  tidyMaterials(document);
  trimMorphs(document);
  shareSkins(document);
  const scene = root.listScenes()[0];
  for (const node of scene.listChildren()) {
    if (node.listChildren().length > 0) node.setName(name);
  }
  for (const texture of root.listTextures()) {
    if (!texture.getName()) texture.setName(`${name}-${texture.getURI() || "texture"}`);
  }
  return { document, stats };
}

async function main() {
  await MeshoptSimplifier.ready;
  const names = characterDirs();
  if (!names.length) throw new Error(`No character folders in ${inDir}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const merged = new Document();
  const report = [];
  for (const name of names) {
    const { document, stats } = await loadCharacter(name);
    report.push(stats);
    mergeDocuments(merged, document);
  }
  // mergeDocuments() keeps one scene per source; fold them into one.
  const root = merged.getRoot();
  const scenes = root.listScenes();
  const main = scenes[0];
  for (const scene of scenes.slice(1)) {
    for (const child of scene.listChildren()) main.addChild(child);
    scene.dispose();
  }
  root.setDefaultScene(main);

  await merged.transform(
    unpartition(),
    weld(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 78, resize: [512, 512], pattern: SMALL_TEXTURES }),
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 82, resize: [1024, 1024] }),
    // One quantization volume for the whole document keeps every mesh of a
    // character on the same transform, so one skin per character survives.
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12, quantizationVolume: "scene" }),
    sparse({ ratio: 1 / 3 }),
    prune()
  );
  shrinkIndices(merged);
  shareSkins(merged);
  await merged.transform(prune());

  // Keep textures external (strict CSP: no blob: image loads at runtime).
  const used = new Set();
  for (const texture of root.listTextures()) {
    const base = (texture.getURI() || texture.getName() || "texture").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
    let uri = `${base}.webp`;
    let counter = 2;
    while (used.has(uri)) uri = `${base}-${counter++}.webp`;
    used.add(uri);
    texture.setURI(uri);
  }
  for (const buffer of root.listBuffers()) buffer.setURI("characters.bin");
  await io.write(join(outDir, "characters.gltf"), merged);

  const sizes = Object.fromEntries(readdirSync(outDir).map((file) => [file, statSync(join(outDir, file)).size]));
  const total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
  const summary = { characters: names, triangles: {}, files: sizes, totalBytes: total };
  for (const stats of report) summary.triangles[stats.name] = stats.primitives;
  writeFileSync(join(outDir, "characters.report.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ characters: names, totalBytes: total, files: Object.keys(sizes).length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
