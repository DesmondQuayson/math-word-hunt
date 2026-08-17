import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = resolve(root, "apps/platform-web/public/internal-games/number-logic/assets/index-DXexJzA-.js");
let bundle = readFileSync(bundlePath, "utf8");

const replacements = [
  ["Oldskool · Of Far Different Nature", "Cosmic Candy Catchers · Eric Matyas"],
  ["children:`Oldskool`", "children:`Cosmic Candy Catchers`"],
  [
    "By Of Far Different Nature · CC0 1.0 Universal. The exact original MP3 is self-hosted and looped with a local in-memory seam crossfade.",
    "By Eric Matyas · CC BY 3.0. The verified MP3 derivative is self-hosted and looped with a local in-memory seam crossfade."
  ],
  ["https://opengameart.org/content/oldskool", "https://soundimage.org/"],
  ["View the verified Oldskool source on OpenGameArt", "Visit the credited artist at SoundImage"]
];

for (const [from, to] of replacements) {
  const occurrences = bundle.split(from).length - 1;
  assert.equal(occurrences, 1, `Expected one Number Logic credit occurrence for: ${from}`);
  bundle = bundle.replace(from, to);
}

writeFileSync(bundlePath, bundle);
console.log("Updated Number Logic's display-only music credit; puzzle and audio code were not rewritten.");
