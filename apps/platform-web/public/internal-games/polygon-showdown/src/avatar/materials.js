// One shared set of materials per stage. Garments carry their colours as
// vertex colours, so a fully dressed figure uses a handful of programs and
// swapping an item never allocates a material unless it has a printed fabric.

import { CanvasTexture, Color, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "../../../math-tug-of-war/src/vendor/three.js";
import { paintEyeTexture } from "./face.js";

const FACE_TEXTURE_SIZE = 768;

function canvasTexture(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

/** A tiling colour texture from an already painted canvas. */
export function fabricTexture(canvas) {
  const texture = canvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

export function createMaterials() {
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = FACE_TEXTURE_SIZE;
  faceCanvas.height = FACE_TEXTURE_SIZE;
  const faceTexture = canvasTexture(faceCanvas);

  const eyeCanvas = document.createElement("canvas");
  eyeCanvas.width = 256;
  eyeCanvas.height = 256;
  paintEyeTexture(eyeCanvas);
  const eyeTexture = canvasTexture(eyeCanvas);

  const standard = (options) => new MeshStandardMaterial(options);
  const fabric = (roughness, extra = {}) => standard({ vertexColors: true, roughness, metalness: 0, ...extra });

  const set = {
    faceCanvas,
    faceTexture,
    skinBody: standard({ color: new Color("#BC8158"), roughness: 0.58, metalness: 0, vertexColors: true }),
    skinHead: standard({ map: faceTexture, roughness: 0.56, metalness: 0 }),
    eye: standard({ map: eyeTexture, roughness: 0.14, metalness: 0 }),
    lips: standard({ color: new Color("#A5605A"), roughness: 0.44, metalness: 0 }),
    detail: standard({ vertexColors: true, roughness: 0.72, metalness: 0 }),
    hair: standard({ vertexColors: true, color: new Color("#17120F"), roughness: 0.5, metalness: 0 }),
    hairMatte: standard({ vertexColors: true, color: new Color("#17120F"), roughness: 0.74, metalness: 0 }),
    hairFade: standard({ vertexColors: true, color: new Color("#17120F"), roughness: 0.68, metalness: 0, transparent: true, depthWrite: false }),
    brow: standard({ vertexColors: true, color: new Color("#17120F"), roughness: 0.82, metalness: 0 }),
    matte: fabric(0.88),
    soft: fabric(0.66),
    satin: fabric(0.36),
    gloss: fabric(0.2),
    metal: standard({ vertexColors: true, roughness: 0.26, metalness: 0.92 }),
    gem: standard({ vertexColors: true, roughness: 0.08, metalness: 0.15 }),
    lens: standard({ vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, depthWrite: false, side: DoubleSide }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    lensGlow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, depthWrite: false, side: DoubleSide }),
    dispose() {
      for (const key of Object.keys(set)) {
        const material = set[key];
        if (material && material.isMaterial) material.dispose();
      }
      faceTexture.dispose();
      eyeTexture.dispose();
    }
  };
  return set;
}

/** Metal needs a stronger reflection than cloth, or gold reads as brown. */
export function setReflections(materials, environment) {
  materials.metal.envMap = environment;
  materials.metal.envMapIntensity = 1.5;
  materials.gem.envMap = environment;
  materials.gem.envMapIntensity = 1.2;
  materials.metal.needsUpdate = true;
  materials.gem.needsUpdate = true;
}

export function setHairFinish(materials, finish, hex) {
  const value = new Color(hex);
  const metallic = finish === "metal";
  for (const material of [materials.hair, materials.hairMatte, materials.hairFade]) {
    material.color.copy(value);
    material.metalness = metallic ? 0.55 : 0;
    material.roughness = metallic ? 0.36 : material === materials.hair ? 0.5 : 0.74;
  }
  materials.brow.color.copy(value);
  materials.brow.metalness = metallic ? 0.25 : 0;
  materials.brow.roughness = metallic ? 0.5 : 0.82;
}
