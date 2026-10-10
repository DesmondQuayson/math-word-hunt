# Math Tug of War 3D — asset provenance and licences

Every model, texture and library shipped by the 3D scene is listed here with
its source, licence and the checksum of the file it was built from. Nothing
in this list requires attribution in the product, nothing is redistributed as
a standalone asset, and nothing is fetched at runtime from a third party.

## Runtime library

| Item | Version | Licence | Source | SHA-256 of the fetched package |
| --- | --- | --- | --- | --- |
| three.js (subset bundle `src/vendor/three.js`) | 0.186.1 | MIT | npm `three@0.186.1` | `8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7` (`three-0.186.1.tgz`, 4,648,523 bytes) |

The bundle is produced by `scripts/math-tug-of-war-3d/bundle-three.mjs` from
the exact class list in `three-entry.js`: tree-shaken, minified, one ES
module, no dynamic imports, no workers, no WebAssembly, no `eval`. The MIT
notice is kept in the file header. `lib/games/math-tug-of-war/runtime.test.ts`
asserts all of this on every run.

## Characters (`models/characters.gltf`, `characters.bin`, `*.webp`)

The six pullers are original MathNexa characters generated with
**MakeHuman** data through **MPFB2** inside Blender. Everything that ends up in
the game is CC0 (public domain):

| Pack | What we use | Licence | Source | SHA-256 | Size |
| --- | --- | --- | --- | --- | ---: |
| MakeHuman base mesh, body targets, Mixamo-named rig and weights (bundled in MPFB 2.0.18) | the body, proportions, skeleton | CC0 (MakeHuman assets); MPFB itself is GPL-3.0 tooling and ships nothing to the browser | extensions.blender.org `add-on-mpfb-v2.0.18.zip` | `c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad` | 45,956,992 |
| MakeHuman system assets | skins (`young_*`), eyes (`low-poly`), eyebrows, eyelashes, teeth, hair (`short01-03`, `ponytail01`, `afro01`, `bob01`), shoes (`shoes01-06`) | CC0 | files.makehumancommunity.org `makehuman_system_assets_cc0.zip` | `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107` | 280,737,770 |
| Shirts 01 | `toigo_basic_tucked_t-shirt` (MargaretToigo), `namuhekam_male_polo_shirt` | CC0 | `shirts01_cc0.zip` | `a5a723b0e84a109bb190fcfeac7f1de4138d875da3e30fe5b3340eac9f38bcd3` | 24,479,483 |
| Pants 01 | `cortu_cargo_pants` (Cortu) | CC0 | `pants01_cc0.zip` | `e4e0ec60db34f279be291a83cfd7b342a7c5cf09bb7676682a5f39f4f6ac4ad9` | 21,908,723 |
| Eyebrows 01 / Eyelashes 01 | inspected; the shipped eyebrows and lashes come from the system assets | CC0 | `eyebrows01_cc0.zip`, `eyelashes01_cc0.zip` | `5425891dce613bef85c7117f7843cd49d57d1fb28127e76d77d2a2eaccb4fe78`, `b7b5eb97cfb930d93e8c067885801443bcab2dcbbe6c2c2cfff7ad87992077e8` | 11,477,790 / 3,493,692 |
| Face units 01 (ARKit-style face targets by Mika Suominen) | the 27 facial morph targets (brows, eyes, jaw, mouth) that drive expressions | CC0 | files.makehumancommunity.org `functional/faceunits01.zip` | `d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146` | 257,821 |
| Shoes 01 | inspected only (boots and flats); not shipped | CC0 | `shoes01_cc0.zip` | `ded3f70428505eabbf1f6d7b5f61196a7366ef20757103d276ad0ed336c35ada` | 82,953,569 |

Build tooling (not shipped): Blender 4.5.9 LTS portable
(`blender-4.5.9-windows-x64.zip`, SHA-256
`41da973b9bf95bb312cbeff4d1982feb13259b43c821686b9bafea4dfe5477cf`, matches
`blender-4.5.9.sha256` from download.blender.org), MPFB 2.0.18, and the
Node tools in `scripts/math-tug-of-war-3d/` (`@gltf-transform/*` MIT,
`meshoptimizer` MIT, `sharp` Apache-2.0).

Every shipped character is therefore original work generated from CC0 data.
Nothing from Mixamo, Sketchfab, Quaternius, Ready Player Me or any other
licensed library is used. Quaternius' Universal Base Characters (Quaternius
Asset License v1.0, commercial use allowed, no redistribution) were evaluated
as a fallback and not needed.

## The character recipe

`scripts/math-tug-of-war-3d/build_characters.py` (run inside Blender with MPFB
enabled) and `characters.json` describe each puller: phenotype sliders,
skin, hair, eyes, eyebrows, eyelashes, teeth and outfit. The script

1. builds the human with the Mixamo-named rig (joint helpers kept so the
   rig fits the A-pose mesh);
2. bakes the body-shape targets, loads the ARKit face units as shape keys and
   carries them to eyebrows, eyelashes and teeth;
3. deletes the body under shirt and trousers (nothing can poke through
   clothing), removes helper geometry, downsizes textures;
4. exports glTF (separate `.bin` and WebP textures) and a preview render.

`optimize-characters.mjs` then merges the six exports into one document,
simplifies meshes with the head locked (blinks and smiles keep full detail),
quantizes geometry (`KHR_mesh_quantization`), stores morph targets sparsely,
resizes textures (1024 px skin, 512 px clothes and hair), shares one skin per
character, and writes `models/`. The runtime reads it with three.js' plain
GLTFLoader: no Draco, meshopt, workers or `blob:` image URLs, so the game's
strict CSP (`script-src 'self'`, `worker-src 'none'`, `img-src 'self'`) is
unchanged.
