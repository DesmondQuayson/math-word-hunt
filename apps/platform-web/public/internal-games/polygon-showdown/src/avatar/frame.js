// Body proportions. Skin and every garment read the same profile, so a
// garment is just the body offset outwards: anything that fits the straight
// frame fits the curved frame without extra work.

import { Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { clamp, lerp, smoothPath } from "./geometry.js";

export const HEAD_CENTER_Y = 1.885;
const ANKLE_Y = 0.115;

// [y, half width, half depth, centre z]
const TORSO_STRAIGHT = [
  [0.7, 0.09, 0.07, 0],
  [0.765, 0.17, 0.122, 0],
  [0.83, 0.238, 0.152, -0.004],
  [0.9, 0.246, 0.164, -0.002],
  [1.0, 0.236, 0.154, 0],
  [1.1, 0.25, 0.16, 0.004],
  [1.2, 0.268, 0.17, 0.006],
  [1.285, 0.28, 0.166, 0.002],
  [1.335, 0.27, 0.15, -0.002],
  [1.385, 0.222, 0.128, -0.004],
  [1.425, 0.135, 0.104, -0.004],
  [1.45, 0.098, 0.092, -0.004]
];

const TORSO_CURVED = [
  [0.7, 0.1, 0.075, 0],
  [0.765, 0.2, 0.135, 0],
  [0.83, 0.285, 0.172, -0.008],
  [0.9, 0.278, 0.176, -0.006],
  [1.0, 0.206, 0.14, 0],
  [1.1, 0.226, 0.15, 0.006],
  [1.2, 0.25, 0.17, 0.01],
  [1.285, 0.258, 0.162, 0.004],
  [1.335, 0.25, 0.146, -0.002],
  [1.385, 0.21, 0.124, -0.004],
  [1.425, 0.128, 0.102, -0.004],
  [1.45, 0.096, 0.09, -0.004]
];

function hermiteTable(rows) {
  const count = rows.length;
  const width = rows[0].length;
  const tangents = rows.map((row, k) => {
    const before = rows[Math.max(k - 1, 0)];
    const after = rows[Math.min(k + 1, count - 1)];
    const dy = after[0] - before[0];
    const result = [];
    for (let n = 1; n < width; n += 1) result.push((after[n] - before[n]) / dy);
    return result;
  });
  return (y) => {
    const clamped = clamp(y, rows[0][0], rows[count - 1][0]);
    let k = 0;
    while (k < count - 2 && clamped > rows[k + 1][0]) k += 1;
    const y0 = rows[k][0];
    const h = rows[k + 1][0] - y0;
    const t = (clamped - y0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const value = (n) => h00 * rows[k][n] + h10 * h * tangents[k][n - 1] + h01 * rows[k + 1][n] + h11 * h * tangents[k + 1][n - 1];
    return { rx: value(1), rz: value(2), cz: value(3) };
  };
}

class Limb {
  constructor(points, radii) {
    this.line = smoothPath(points, 64);
    this.radii = radii;
  }

  point(t, out = new Vector3()) {
    const f = clamp(t) * 64;
    const i = Math.min(Math.floor(f), 63);
    return out.copy(this.line[i]).lerp(this.line[i + 1], f - i);
  }

  slice(t0, t1, samples) {
    const result = [];
    for (let s = 0; s <= samples; s += 1) result.push(this.point(lerp(t0, t1, s / samples)));
    return result;
  }

  radius(t) {
    const radii = this.radii;
    const x = clamp(t);
    let k = 0;
    while (k < radii.length - 2 && x > radii[k + 1][0]) k += 1;
    const a = radii[k];
    const b = radii[k + 1];
    const s = clamp((x - a[0]) / (b[0] - a[0]));
    return lerp(a[1], b[1], s * s * (3 - 2 * s));
  }
}

function makeFrame(id, curved) {
  const torsoAt = hermiteTable(curved ? TORSO_CURVED : TORSO_STRAIGHT);
  const shoulderX = curved ? 0.296 : 0.322;
  const hipX = curved ? 0.15 : 0.13;
  const thigh = curved ? 0.158 : 0.14;
  const makeArm = (side) =>
    new Limb(
      [
        new Vector3(side * shoulderX, 1.272, -0.002),
        new Vector3(side * (shoulderX + 0.052), 1.125, -0.01),
        new Vector3(side * (shoulderX + 0.09), 0.985, -0.016),
        new Vector3(side * (shoulderX + 0.122), 0.85, 0.004),
        new Vector3(side * (shoulderX + 0.15), 0.735, 0.03)
      ],
      [
        [0, 0.094],
        [0.22, 0.086],
        [0.5, 0.072],
        [0.68, 0.069],
        [1, 0.052]
      ]
    );
  const makeLeg = (side) =>
    new Limb(
      [
        new Vector3(side * hipX, 0.9, 0),
        new Vector3(side * hipX * 1.04, 0.66, 0.004),
        new Vector3(side * hipX * 1.03, 0.46, 0.012),
        new Vector3(side * hipX, 0.28, -0.004),
        new Vector3(side * hipX * 0.97, ANKLE_Y, 0)
      ],
      [
        [0, thigh * 0.8],
        [0.2, thigh],
        [0.32, thigh * 0.9],
        [0.57, 0.086],
        [0.72, 0.088],
        [0.93, 0.06],
        [1, 0.056]
      ]
    );
  return {
    id,
    curved,
    torsoBottom: 0.7,
    torsoTop: 1.45,
    torsoAt,
    shoulderX,
    hipX,
    arms: { 1: makeArm(1), [-1]: makeArm(-1) },
    legs: { 1: makeLeg(1), [-1]: makeLeg(-1) }
  };
}

const FRAMES = {
  "base-a": makeFrame("base-a", false),
  "base-b": makeFrame("base-b", true)
};

export function frameFor(base) {
  return FRAMES[base] ?? FRAMES["base-a"];
}
