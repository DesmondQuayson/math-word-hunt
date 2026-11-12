// Colours and scenery choices shared by screens that must not load the 3D
// library just to know them.

/** Car paints. A colour is cosmetic: it changes nothing about how a car performs. */
export const PAINTS = Object.freeze({
  turquoise: 0x20cfe3,
  pink: 0xff4f9a,
  gold: 0xffc93c,
  green: 0x35d07f,
  red: 0xf2463d,
  purple: 0x8b5cf6,
  orange: 0xff8a2a,
  white: 0xf2f5f9,
  rival: 0x7c8794
});

export const COLOUR_NAMES = Object.freeze({
  turquoise: "Turquoise",
  pink: "Pink",
  gold: "Gold",
  green: "Green",
  red: "Red",
  purple: "Purple",
  orange: "Orange",
  white: "White"
});

export function cssColour(name) {
  const value = PAINTS[name] ?? PAINTS.turquoise;
  return `#${value.toString(16).padStart(6, "0")}`;
}

const STAGE_THEMES = Object.freeze(["coast", "coast", "forest", "forest", "desert", "desert", "alpine", "alpine", "night", "night"]);
export const THEME_TITLES = Object.freeze({ coast: "Coast Road", forest: "Forest Run", desert: "Desert Highway", alpine: "Alpine Pass", night: "Neon City" });

export function themeForStage(stage) {
  return STAGE_THEMES[Math.min(10, Math.max(1, stage)) - 1];
}

export const ONLINE_THEME = "night";
