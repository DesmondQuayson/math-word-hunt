// Shared geometry of the 3D arena. Everything is in metres; the rope runs
// along world X with the centre knot at x = 0 and the Turquoise side on -X.
// These mirror the SVG scene's proportions (38 units per pull in a 1000-unit
// field) so both renderers frame the same match the same way.

import { TUG_LIMIT } from "../tug.js";

export const FIELD_UNITS_TO_METRES = 12 / 1000;
export const STEP = 38 * FIELD_UNITS_TO_METRES; // 0.456 m per pull
export const LINE_X = TUG_LIMIT * STEP; // 3.19 m: a victory line on each side
export const ROPE_Y = 0.87;
export const ROPE_RADIUS = 0.022;
export const FRONT_OFFSET = 1.3; // front puller's rope slot from the centre knot
export const SPACING = 1.0; // slot spacing within a team
export const BODY_SIDE = 0.22; // pullers stand this far behind the rope line (away from the camera)
export const HAND_GAP = 0.14; // the two hands sit this far apart along the rope
export const PULLERS_PER_TEAM = 3;

export const TEAM = Object.freeze({
  turquoise: Object.freeze({ dir: -1, color: 0x12bccf, bright: 0x5fe0ee, dark: 0x087f8c, band: 0x06606a, label: "Turquoise", mark: "wave" }),
  pink: Object.freeze({ dir: 1, color: 0xff4f9a, bright: 0xff8dc0, dark: 0xc01d67, band: 0x8f0f4b, label: "Pink", mark: "star" })
});

export const TEAMS = Object.freeze(["turquoise", "pink"]);

export function otherTeam(team) {
  return team === "turquoise" ? "pink" : "turquoise";
}

/** World x of a puller's rope slot (before the tug offset is applied). */
export function slotX(team, index) {
  return TEAM[team].dir * (FRONT_OFFSET + index * SPACING);
}

export const ASSET_BASE = "/internal-games/math-tug-of-war/models/";
export const CHARACTER_DOCUMENT = "characters.gltf";
export const CHARACTER_NAMES = Object.freeze(["puller-a", "puller-b", "puller-c", "puller-d", "puller-e", "puller-f"]);
export const TEAM_CHARACTERS = Object.freeze({
  turquoise: Object.freeze(["puller-a", "puller-b", "puller-c"]),
  pink: Object.freeze(["puller-d", "puller-e", "puller-f"])
});
