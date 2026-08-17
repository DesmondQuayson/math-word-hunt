import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import sharp from "sharp";

const [vocabularySource, numberLogicSource, numberCrossSource] = process.argv.slice(2);

if (!vocabularySource || !numberLogicSource || !numberCrossSource) {
  console.error("Usage: node scripts/prepare-game-suite-thumbnails.mjs <vocabulary.png> <number-logic.png> <number-cross.png>");
  process.exit(2);
}

const outputDirectory = resolve("apps/platform-web/public/media/games");
const thumbnails = [
  { key: "math-vocabulary-hunt", source: vocabularySource },
  { key: "number-logic", source: numberLogicSource },
  { key: "number-cross", source: numberCrossSource }
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

await mkdir(outputDirectory, { recursive: true });

for (const thumbnail of thumbnails) {
  const sourcePath = resolve(thumbnail.source);
  const source = await readFile(sourcePath);
  const metadata = await sharp(source, { failOn: "warning", limitInputPixels: 8192 * 8192 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 1200 || metadata.height < 675) {
    throw new Error(`${thumbnail.key} source is too small for the 1200x675 catalog contract.`);
  }

  const pipeline = sharp(source, { failOn: "warning", limitInputPixels: 8192 * 8192 })
    .rotate()
    .resize({ width: 1200, height: 675, fit: "cover", position: "centre" });
  const webpPath = resolve(outputDirectory, `${thumbnail.key}.webp`);
  const avifPath = resolve(outputDirectory, `${thumbnail.key}.avif`);

  await pipeline.clone().webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(webpPath);
  await pipeline.clone().avif({ quality: 58, effort: 6, chromaSubsampling: "4:2:0" }).toFile(avifPath);

  const webp = await readFile(webpPath);
  const avif = await readFile(avifPath);
  console.log(JSON.stringify({
    key: thumbnail.key,
    source: { width: metadata.width, height: metadata.height, bytes: source.byteLength, sha256: sha256(source) },
    webp: { width: 1200, height: 675, bytes: webp.byteLength, sha256: sha256(webp) },
    avif: { width: 1200, height: 675, bytes: avif.byteLength, sha256: sha256(avif) }
  }));
}
