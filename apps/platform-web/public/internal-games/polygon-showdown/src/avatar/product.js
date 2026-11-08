// How each kind of product is photographed and previewed. Every view is built
// by the same figure the avatar wears, from the same catalog entry, so a shop
// image cannot show one thing while the avatar receives another.

import { DEFAULT_AVATAR } from "../engine/catalog.js";

/** Plain enough to keep attention on the product. */
const DISPLAY_AVATAR = Object.freeze({
  ...DEFAULT_AVATAR,
  skin: "skin-5",
  hair: "hair-bald",
  hairColor: "hc-dark-brown",
  top: "top-long-gray",
  bottom: "bottom-denim-shorts",
  shoes: "shoes-simple-flats",
  outfit: null,
  jacket: null,
  hat: null,
  glasses: null,
  jewelry: null
});

const FORM_TINT = "#BCC3CE";
const VELVET_TINT = "#222A3C";

const withItem = (item, extra = {}) => ({ ...DISPLAY_AVATAR, ...extra, [item.slot]: item.id });

/** On a torso form, with the garment's own shape setting how far the form runs. */
const onForm = (item, parts, form) => ({
  avatar: withItem(item),
  show: [...parts, "form"],
  frameOn: [item.slot, "form"],
  form,
  shadow: 0.7,
  yaw: -0.42,
  pitch: 0.06,
  fill: 0.9
});

/** The product alone. */
const alone = (item, yaw, pitch, fill) => ({
  avatar: withItem(item),
  show: [item.slot],
  frameOn: [item.slot],
  form: null,
  shadow: 1,
  yaw,
  pitch,
  fill
});

/** A portrait: the shoulders run out of the bottom of the frame. */
const portrait = (item, parts, yaw, fill, extra, frameOn = ["head", ...parts]) => ({
  avatar: withItem(item, { bottom: "bottom-joggers", ...extra }),
  show: ["body", "top", "bottom", "head", "faceDetail", ...parts],
  frameOn,
  form: null,
  shadow: 0,
  yaw,
  pitch: 0.03,
  fill
});

export function productView(item) {
  switch (item.slot) {
    case "top":
      return onForm(item, ["top"], { kind: "torso", below: -0.012, neck: true, tint: FORM_TINT });
    case "bottom":
      return { ...onForm(item, ["bottom"], { kind: "torso", waist: true, neck: false, tint: FORM_TINT }), frameOn: ["bottom"] };
    case "outfit":
      return onForm(item, ["outfit"], { kind: "torso", from: 0.74, neck: true, tint: FORM_TINT });
    case "jacket":
      return onForm(item, ["top", "jacket"], { kind: "torso", below: -0.012, neck: true, tint: FORM_TINT });
    case "shoes":
      return alone(item, -0.72, 0.26, 0.9);
    case "hat":
      return alone(item, -0.5, 0.3, 0.9);
    case "glasses":
      return alone(item, -0.4, 0.06, 0.9);
    case "jewelry":
      return jewelryView(item);
    case "hair":
      return portrait(item, ["hair"], -0.52, 0.86);
    case "hairColor":
      return portrait(item, ["hair"], -0.52, 0.86, { hair: "hair-long" });
    case "facialHair":
      return portrait(item, ["hair", "facialHair"], -0.34, 0.9, { hair: "hair-fade" });
    default:
      // Lipstick, eye shadow, blush and eyeliner are worn on a face or not at all.
      return portrait(item, ["hair"], -0.26, 0.9, { hair: "hair-bun" }, ["head"]);
  }
}

function jewelryView(item) {
  if (item.model === "studs" || item.model === "hoops") {
    return portrait(item, ["hair", "jewelry"], -0.86, 0.82, { hair: "hair-bun" }, ["head"]);
  }
  if (item.model === "watch" || item.model === "bracelet") {
    return { ...alone(item, -1.22, 0.14, 0.92), show: ["jewelry", "form"], form: { kind: "wrist", tint: VELVET_TINT }, shadow: 0.7 };
  }
  // Necklaces lie on a dark velvet bust.
  return { ...onForm(item, ["jewelry"], { kind: "torso", from: 0.86, neck: true, tint: VELVET_TINT }), frameOn: ["jewelry"], yaw: -0.14, pitch: 0.05, fill: 0.84, shadow: 0 };
}

/** Where the camera goes while an item from this shop tab is being looked at. */
export function framingForSlot(slot) {
  switch (slot) {
    case "hair":
    case "hairColor":
    case "facialHair":
    case "lipstick":
    case "eyeShadow":
    case "blush":
    case "eyeliner":
    case "hat":
    case "glasses":
      return "face";
    case "shoes":
      return "feet";
    case "top":
    case "jacket":
    case "jewelry":
      return "upper";
    case "bottom":
      return "legs";
    default:
      return "full";
  }
}
