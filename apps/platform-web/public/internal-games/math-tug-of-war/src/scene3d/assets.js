// Character asset loading. One glTF document holds all six pullers; it is
// fetched once per page (same-origin, plain glTF + WebP, no decoders, no
// blob: URLs so the game's CSP stays untouched) and cloned per match.

import { Color, FrontSide, GLTFLoader, LinearMipmapLinearFilter, LinearFilter, SRGBColorSpace, cloneSkinned } from "../vendor/three.js";
import { ASSET_BASE, CHARACTER_DOCUMENT, CHARACTER_NAMES } from "./constants.js";

let documentPromise = null;
let loaded = null;

/** Start fetching the characters (safe to call many times). */
export function loadCharacters(version = "") {
  if (documentPromise) return documentPromise;
  const loader = new GLTFLoader();
  const suffix = version ? `?v=${version}` : "";
  loader.setPath(ASSET_BASE);
  // Version the sub-resources too (bin + textures) so a new deployment never pairs
  // a cached buffer with a new JSON.
  loader.manager.setURLModifier((url) => (url.startsWith(ASSET_BASE) && !url.includes("?") ? `${url}${suffix}` : url));
  documentPromise = new Promise((resolve, reject) => {
    loader.load(
      `${CHARACTER_DOCUMENT}${suffix}`,
      (gltf) => {
        try {
          loaded = prepareDocument(gltf);
          resolve(loaded);
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      (error) => {
        documentPromise = null;
        reject(error instanceof Error ? error : new Error("Character models could not be loaded."));
      }
    );
  });
  return documentPromise;
}

export function charactersReady() {
  return loaded;
}

function prepareDocument(gltf) {
  const scene = gltf.scene;
  const characters = new Map();
  for (const name of CHARACTER_NAMES) {
    const root = scene.getObjectByName(name);
    if (!root) continue;
    root.traverse((object) => {
      if (object.isMesh) {
        object.frustumCulled = false;
        const material = object.material;
        if (material?.map) {
          material.map.colorSpace = SRGBColorSpace;
          material.map.minFilter = LinearMipmapLinearFilter;
          material.map.magFilter = LinearFilter;
          material.map.anisotropy = 4;
        }
        if (material) {
          material.envMapIntensity = 0.45;
          if (material.alphaMode !== "MASK" && !material.transparent) material.side = FrontSide;
          // Hair and lashes come through as alpha-masked; keep them two-sided.
          if (material.alphaTest > 0) material.side = 2; // DoubleSide
        }
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    characters.set(name, root);
  }
  if (characters.size === 0) throw new Error("No characters in the model document.");
  return { gltf, characters };
}

const SHIRT_PATTERN = /shirt|polo|tee|top|suit/i;
const SKIN_PATTERN = /\.body$|body/i;

/**
 * Clone a character for use in a scene. Materials are cloned so team tint
 * and per-instance tweaks never leak into the shared document.
 */
export function instantiateCharacter(name, { teamColor } = {}) {
  if (!loaded) throw new Error("Characters are not loaded yet.");
  const source = loaded.characters.get(name) ?? loaded.characters.values().next().value;
  const root = cloneSkinned(source);
  const meshes = [];
  const materials = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes.push(object);
    const material = object.material.clone();
    object.material = material;
    materials.push(material);
    if (teamColor !== undefined && SHIRT_PATTERN.test(material.name) && !SKIN_PATTERN.test(material.name)) {
      material.color = new Color(teamColor);
      material.roughness = Math.max(material.roughness, 0.75);
    }
  });
  return { root, meshes, materials };
}

/** Release everything a clone created (geometry stays shared with the document). */
export function disposeCharacter(instance) {
  for (const material of instance.materials) material.dispose();
  instance.root.removeFromParent();
}
