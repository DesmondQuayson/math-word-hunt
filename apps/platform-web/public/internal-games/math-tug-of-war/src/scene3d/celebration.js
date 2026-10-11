// The winning team's celebration: one shared plan per win that every winner
// follows on a common clock. Release the rope, turn to the teammates, walk
// into a huddle, wrap arms over shoulders, jump together, break, and line up
// arm-in-arm for the team pose with periodic cheers. The plan only exists
// after the game has confirmed the winner; it never decides anything.
//
// Positions are in the tug group's space (metres, the rope centre at the
// origin, +Z towards the camera). A member's yaw maps its +Z onto
// (sin yaw, 0, cos yaw), so yaw 0 faces the camera.

import { Vector3 } from "../vendor/three.js";
import { TEAM, slotX } from "./constants.js";
import { makeRandom } from "./math.js";

export const PHASES = Object.freeze(["release", "turn", "approach", "hug", "jump", "break", "pose"]);

const HUDDLE_RADIUS = 0.56;
const LINE_SPACING = 0.5;

/**
 * @param {object} options
 * @param {"turquoise"|"pink"} options.team
 * @param {object[]} options.pullers  the winning Puller instances, in slot order
 * @param {number} options.seed  varies the choreography between matches
 */
export function planCelebration({ team, pullers, seed }) {
  const random = makeRandom(seed);
  const dir = TEAM[team].dir;
  const count = pullers.length;
  const middle = Math.floor(count / 2);
  // The huddle forms off the rope line, a step towards the camera, around the middle slot.
  const centre = new Vector3(slotX(team, middle), 0, 0.82 + random() * 0.2);
  // Arc open towards the camera: the middle member at the far side, the others fanned ±spread.
  const spread = (56 + random() * 16) * (Math.PI / 180);
  const order = [...pullers].sort((a, b) => a.root.position.x - b.root.position.x); // left to right on screen
  const members = order.map((puller, index) => {
    const angle = (index - (count - 1) / 2) * spread; // 0 = straight behind the centre
    const position = new Vector3(centre.x + Math.sin(angle) * HUDDLE_RADIUS, 0, centre.z - Math.cos(angle) * HUDDLE_RADIUS);
    const linePosition = new Vector3(centre.x + (index - (count - 1) / 2) * LINE_SPACING, 0, centre.z + 0.12);
    return {
      puller,
      index,
      isMiddle: index === middle,
      slot: { position, yaw: Math.atan2(centre.x - position.x, centre.z - position.z) },
      line: { position: linePosition, yaw: 0 },
      left: null,
      right: null,
      offset: (random() - 0.5) * 0.05, // seconds, so the jumps are together but not mechanical
      finalKind: index === middle ? "shoulders" : ["up", "pump", "wave"][Math.floor(random() * 3)],
      lookEvery: 1.1 + random() * 0.6,
      cheerLead: random() < 0.5
    };
  });
  for (let index = 0; index < count; index += 1) {
    members[index].left = members[index - 1] ?? null;
    members[index].right = members[index + 1] ?? null;
  }
  const jumps = 3 + Math.floor(random() * 3);
  const period = 0.74 + random() * 0.1;
  const times = { turn: 0.45, approach: 0.95, hug: 2.35, jump: 3.0 };
  times.jumpEnd = times.jump + jumps * period;
  times.break = times.jumpEnd + 0.45;
  times.pose = times.break + 1.0;
  return {
    team,
    dir,
    t: 0,
    centre,
    members,
    jumps,
    period,
    times,
    cheerEvery: 2.2 + random() * 0.9,
    phase: "release"
  };
}

/** Which phase the shared clock is in. */
export function celebrationPhase(plan, t = plan.t) {
  const times = plan.times;
  if (t < times.turn) return "release";
  if (t < times.approach) return "turn";
  if (t < times.hug) return "approach";
  if (t < times.jump) return "hug";
  if (t < times.jumpEnd) return "jump";
  if (t < times.pose) return "break";
  return "pose";
}

/**
 * The shared jump profile: crouch, push, airborne, land. Returns
 * { lift, crouch, air, phase } for the clock `t` inside the jump phase.
 */
export function jumpProfile(plan, t) {
  const local = t - plan.times.jump;
  if (local < 0 || local >= plan.jumps * plan.period) return { lift: 0, crouch: 0, air: 0, phase: 0 };
  const phase = (local / plan.period) % 1;
  let crouch = 0;
  let air = 0;
  if (phase < 0.26) crouch = Math.sin((phase / 0.26) * Math.PI) * 0.13; // knees bend before the push
  else if (phase < 0.3) crouch = 0;
  else if (phase < 0.72) air = Math.sin(((phase - 0.3) / 0.42) * Math.PI);
  else crouch = Math.sin(((phase - 0.72) / 0.28) * Math.PI) * 0.09; // knees give on landing
  return { lift: air * 0.27, crouch, air, phase };
}
