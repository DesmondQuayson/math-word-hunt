// Builds and updates the figure. Each slot remembers a signature of what it
// was last built from, so setAvatar only rebuilds what actually changed and
// frees exactly what it replaces.

import { Group, Mesh } from "../../../math-tug-of-war/src/vendor/three.js";
import { DEFAULT_AVATAR, SKIN_TONES, getItem } from "../engine/catalog.js";
import { HEAD_CENTER_Y, frameFor } from "./frame.js";
import { buildBodyGeometry } from "./body.js";
import { buildEyesGeometry, buildHeadGeometry } from "./head.js";
import { buildBrowsGeometry, buildFaceDetailGeometry, buildFacialHairGeometry, buildLipsGeometry, naturalLipColor, paintFace } from "./face.js";
import { buildHair, hairCoversEars } from "./hair.js";
import { buildBottom, buildJacket, buildOutfit, buildTop, chestInflate, jacketIsOpen, wristInflate } from "./clothing.js";
import { buildShoes, shoeLift } from "./shoes.js";
import { buildGlasses, buildHat, buildJewelry, hatFit } from "./accessories.js";
import { createMaterials, setHairFinish, setReflections } from "./materials.js";

const ITEM_SLOTS = ["hair", "hairColor", "facialHair", "lipstick", "eyeShadow", "blush", "eyeliner", "top", "bottom", "outfit", "jacket", "shoes", "hat", "glasses", "jewelry"];

const NOTHING = "none";
const active = (entry) => (entry && entry.model !== NOTHING ? entry : null);

const BARE_HEAD = Object.freeze({ top: 0.432, halfWidth: 0.44, ringTop: (radius) => 0.432 * Math.sqrt(Math.max(0, 1 - (radius * radius) / (0.44 * 0.44))) });

function resolveAvatar(raw) {
  const source = raw && typeof raw === "object" ? raw : DEFAULT_AVATAR;
  const fallbackSkin = SKIN_TONES.find((tone) => tone.id === DEFAULT_AVATAR.skin);
  const resolved = {
    base: source.base === "base-b" ? "base-b" : "base-a",
    skin: (SKIN_TONES.find((tone) => tone.id === source.skin) ?? fallbackSkin).color
  };
  for (const slot of ITEM_SLOTS) {
    const entry = getItem(source[slot]);
    resolved[slot] = entry && entry.slot === slot ? entry : getItem(DEFAULT_AVATAR[slot]);
  }
  return resolved;
}

export function createAvatarFigure(environment = null) {
  const group = new Group();
  const bodyGroup = new Group();
  group.add(bodyGroup);
  const headGroup = new Group();
  headGroup.position.y = HEAD_CENTER_Y;
  bodyGroup.add(headGroup);
  const parents = { root: group, body: bodyGroup, head: headGroup };
  const materials = createMaterials();
  if (environment) setReflections(materials, environment);
  const slots = new Map();
  let faceSignature = "";
  let lipSignature = "";
  let hairColorSignature = "";
  let hairInfo = BARE_HEAD;
  let hatInfo = null;
  let extents = { top: 2.4, width: 1.5, headWidth: 1 };

  function release(entry) {
    for (const mesh of entry.meshes) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.userData.ownsMaterial) {
        mesh.material.map?.dispose();
        mesh.material.dispose();
      }
    }
  }

  function setSlot(name, signature, build) {
    const current = slots.get(name);
    if (current && current.signature === signature) return false;
    const meshes = [];
    try {
      for (const part of build() ?? []) {
        const mesh = new Mesh(part.geometry, part.material);
        mesh.userData.ownsMaterial = Boolean(part.ownsMaterial);
        mesh.userData.placement = part.placement ?? null;
        if (part.renderOrder) mesh.renderOrder = part.renderOrder;
        parents[part.parent ?? "body"].add(mesh);
        meshes.push(mesh);
      }
    } catch {
      // A cosmetic that fails to build is left off; the figure still draws.
      release({ meshes });
      meshes.length = 0;
    }
    if (current) release(current);
    slots.set(name, { signature, meshes });
    return true;
  }

  function apply(raw) {
    const avatar = resolveAvatar(raw);
    const { base, skin } = avatar;
    const frame = frameFor(base);
    let changed = false;
    const update = (name, signature, build) => {
      if (setSlot(name, signature, build)) changed = true;
    };

    // Skin, head and face.
    update("head", "static", () => [
      { geometry: buildHeadGeometry(), material: materials.skinHead, parent: "head" },
      { geometry: buildEyesGeometry(), material: materials.eye, parent: "head" },
      { geometry: buildLipsGeometry(), material: materials.lips, parent: "head" },
      { geometry: buildBrowsGeometry(), material: materials.brow, parent: "head" }
    ]);
    update("body", base, () => [{ geometry: buildBodyGeometry(frame), material: materials.skinBody }]);

    const blush = active(avatar.blush);
    const shadow = active(avatar.eyeShadow);
    const nextFace = `${skin}|${blush?.color ?? ""}|${shadow?.color ?? ""}|${shadow?.model ?? ""}`;
    if (nextFace !== faceSignature) {
      faceSignature = nextFace;
      paintFace(materials.faceCanvas, { skin, blush: blush?.color ?? null, shadow: shadow?.color ?? null, glitter: shadow?.model === "glitter" });
      materials.faceTexture.needsUpdate = true;
      materials.skinBody.color.set(skin);
      changed = true;
    }

    const liner = active(avatar.eyeliner);
    update("faceDetail", `${liner?.id ?? ""}|${skin}`, () => [{ geometry: buildFaceDetailGeometry(liner, skin), material: materials.detail, parent: "head" }]);

    const lipstick = active(avatar.lipstick);
    const lipHex = lipstick?.color ?? naturalLipColor(skin);
    const lipRough = lipstick?.model === "gloss" ? 0.1 : lipstick ? 0.36 : 0.46;
    if (`${lipHex}|${lipRough}` !== lipSignature) {
      lipSignature = `${lipHex}|${lipRough}`;
      materials.lips.color.set(lipHex);
      materials.lips.roughness = lipRough;
      changed = true;
    }

    // Hair and what sits on it.
    const hat = avatar.hat;
    const fit = hat ? hatFit(hat.model) : null;
    const hairModel = active(avatar.hair)?.model ?? "bald";
    update("hair", `${hairModel}|${fit ? hat.model : ""}`, () => {
      const built = buildHair(hairModel, fit, materials);
      hairInfo = built.info ?? BARE_HEAD;
      return built.parts;
    });
    if (`${avatar.hairColor?.id}` !== hairColorSignature) {
      hairColorSignature = `${avatar.hairColor?.id}`;
      setHairFinish(materials, avatar.hairColor?.model ?? "solid", avatar.hairColor?.color ?? "#17120F");
      changed = true;
    }
    update("hat", hat?.id ?? NOTHING, () => {
      hatInfo = null;
      if (!hat) return [];
      const built = buildHat(hat, materials);
      hatInfo = built;
      return built.parts;
    });
    let hatBase = 0;
    for (const mesh of slots.get("hat")?.meshes ?? []) {
      let y = 0;
      if (mesh.userData.placement === "crown") y = hairInfo.ringTop(hatInfo?.ringRadius ?? 0.31) - 0.04;
      else if (mesh.userData.placement === "halo") y = Math.max(hairInfo.top, 0.432) + 0.16;
      if (mesh.position.y !== y) {
        mesh.position.y = y;
        changed = true;
      }
      hatBase = Math.max(hatBase, y);
    }

    const facialHair = active(avatar.facialHair);
    update("facialHair", facialHair?.model ?? NOTHING, () => (facialHair ? [{ geometry: buildFacialHairGeometry(facialHair.model), material: materials.brow, parent: "head" }] : []));

    // Clothing, innermost first.
    const outfit = avatar.outfit;
    const jacket = avatar.jacket;
    const topVisible = !outfit && avatar.top && (!jacket || jacketIsOpen(jacket));
    update("top", topVisible ? `${avatar.top.id}|${base}` : "hidden", () => (topVisible ? buildTop(avatar.top, frame, materials) : []));
    update("bottom", outfit ? "hidden" : `${avatar.bottom?.id}|${base}`, () => (outfit || !avatar.bottom ? [] : buildBottom(avatar.bottom, frame, materials)));
    update("outfit", outfit ? `${outfit.id}|${base}|${jacket ? "covered" : ""}` : NOTHING, () => (outfit ? buildOutfit(outfit, frame, materials, Boolean(jacket)) : []));
    const wearingUnder = { outfitModel: outfit?.model ?? null, bottomModel: outfit ? null : (avatar.bottom?.model ?? null) };
    update("jacket", jacket ? `${jacket.id}|${base}|${wearingUnder.outfitModel}|${wearingUnder.bottomModel}` : NOTHING, () => (jacket ? buildJacket(jacket, frame, materials, wearingUnder) : []));

    const shoes = avatar.shoes;
    const lift = shoes ? shoeLift(shoes.model) : 0;
    const showsFoot = shoes?.model === "flat" || shoes?.model === "heel";
    const shinsCovered = outfit ? outfit.model === "suit" : avatar.bottom?.model === "pants";
    update("shoes", shoes ? `${shoes.id}|${base}|${showsFoot ? skin : ""}|${shinsCovered}` : NOTHING, () => (shoes ? buildShoes(shoes, frame, materials, skin, shinsCovered) : []));
    if (bodyGroup.position.y !== lift) {
      bodyGroup.position.y = lift;
      changed = true;
    }

    update("glasses", avatar.glasses?.id ?? NOTHING, () => (avatar.glasses ? buildGlasses(avatar.glasses, materials) : []));

    const jewelry = avatar.jewelry;
    const wearing = { chest: chestInflate(avatar), wrist: wristInflate(avatar), overHair: !fit && hairCoversEars(hairModel) };
    update("jewelry", jewelry ? `${jewelry.id}|${base}|${wearing.chest}|${wearing.wrist}|${wearing.overHair}` : NOTHING, () => (jewelry ? buildJewelry(jewelry, frame, materials, wearing) : []));

    const headTop = Math.max(hairInfo.top, hatInfo ? hatBase + hatInfo.top : 0);
    const halfWidth = Math.max(0.56, hairInfo.halfWidth, hatInfo?.halfWidth ?? 0, outfit?.model === "gown" ? 0.68 : 0);
    const nextExtents = { top: lift + HEAD_CENTER_Y + headTop, width: halfWidth * 2, headWidth: Math.max(hairInfo.halfWidth, hatInfo?.halfWidth ?? 0) * 2 };
    if (nextExtents.top !== extents.top || nextExtents.width !== extents.width) changed = true;
    extents = nextExtents;

    return changed;
  }

  return {
    group,
    apply,
    extents() {
      return extents;
    },
    dispose() {
      for (const entry of slots.values()) release(entry);
      slots.clear();
      materials.dispose();
    }
  };
}
