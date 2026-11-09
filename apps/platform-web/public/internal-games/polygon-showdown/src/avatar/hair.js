// Every hairstyle, built around the head function. Vertex colours only carry
// shading (the colour comes from the shared hair material), so changing hair
// colour never rebuilds geometry.

import { Matrix4, Quaternion, Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, clamp, color, lerp, seeded, smoothPath, smoothstep, vec } from "./geometry.js";
import { crownPoint, headRadius } from "./head.js";

const PI = Math.PI;

function wrap(angle) {
  let a = (angle + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
}

/** Hairline as polar angle from the crown, by absolute azimuth from the nose. */
function polarLine(keys) {
  return (azimuth) => {
    const x = Math.abs(wrap(azimuth));
    let k = 0;
    while (k < keys.length - 2 && x > keys[k + 1][0]) k += 1;
    const a = keys[k];
    const b = keys[k + 1];
    const t = clamp((x - a[0]) / (b[0] - a[0]));
    return lerp(a[1], b[1], t * t * (3 - 2 * t));
  };
}

const NATURAL_LINE = polarLine([
  [0, 0.82],
  [0.6, 1.0],
  [1.2, 1.25],
  [1.6, 1.37],
  [2.15, 2.05],
  [PI, 2.3]
]);
const PULLED_LINE = polarLine([
  [0, 0.76],
  [0.6, 0.94],
  [1.2, 1.22],
  [1.6, 1.35],
  [2.15, 1.98],
  [PI, 2.22]
]);

function basisAround(axis) {
  const n = axis.clone().normalize();
  const helper = Math.abs(n.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const e1 = new Vector3().crossVectors(helper, n).normalize();
  const e2 = new Vector3().crossVectors(n, e1).normalize();
  return { e1, e2 };
}

/**
 * The scalp layer. `thickness(az, v)` is the height over the skin; ridges run
 * from the crown, or converge on `axis` for hair pulled to a tie.
 */
function addCap(builder, { line = NATURAL_LINE, thickness, ridges = 0, ridgeDepth = 0.006, axis = null, nu = 72, nv = 16, edgeShade = 0.78 }) {
  const basis = axis ? basisAround(axis) : null;
  const P = new Vector3();
  const ridgeAt = (az, polar) => {
    if (!ridges) return 0;
    if (!basis) return Math.sin(az * ridges);
    crownPoint(az, polar, 0, P);
    return Math.sin(Math.atan2(P.dot(basis.e2), P.dot(basis.e1)) * ridges);
  };
  builder.grid(
    nu,
    nv,
    (u, v, out) => {
      const az = TAU * u - PI;
      const polar = line(az) * v;
      const tuck = smoothstep(0.92, 1, v);
      const ridge = ridgeAt(az, polar) * ridgeDepth * smoothstep(0, 0.12, v);
      crownPoint(az, polar, (thickness(az, v) + ridge) * (1 - tuck) - 0.014 * tuck, out);
    },
    {
      wrapU: true,
      poleStart: true,
      flip: true,
      colorAt: (u, v, c) => {
        const az = TAU * u - PI;
        const polar = line(az) * v;
        const groove = ridges ? (0.5 - 0.5 * ridgeAt(az, polar)) * 0.26 * smoothstep(0, 0.12, v) : 0;
        c.setScalar((0.96 - groove) * lerp(1, edgeShade, smoothstep(0.6, 1, v)));
      }
    }
  );
}

const lockTaper = (t) => lerp(0.7, 1, smoothstep(0, 0.28, t)) * Math.pow(1 - Math.pow(t, 2.4), 0.85);
const panelTaper = (t) => lerp(0.62, 1, smoothstep(0, 0.3, t)) * Math.pow(1 - Math.pow(t, 7), 0.7);
const wavyTaper = (t) => lerp(0.62, 1, smoothstep(0, 0.3, t)) * Math.pow(1 - Math.pow(t, 3.2), 0.9);
const shadeAlong = (root, tip) => (t, c) => c.setScalar(lerp(root, tip, smoothstep(0, 0.55, t)));

function lock(builder, points, width, options = {}) {
  const { segments = 8, taper = lockTaper, flatten = 1.9, radial = 5, up = null, normalAt = null, ridges = 0, ridgeDepth = 0.16, root = 0.74, tip = 1 } = options;
  const radius = ridges ? (t, a) => width * taper(t) * (1 + ridgeDepth * Math.cos(a * ridges)) : (t) => width * taper(t);
  builder.tube(smoothPath(points, segments), radius, { radial, flatten, up, normalAt, capStart: false, capEnd: false, colorAt: shadeAlong(root, tip) });
}

/** A lock lying on the head from (az0, p0) to (az1, p1). */
function surfaceLock(builder, az0, p0, az1, p1, lift0, lift1, width, options = {}) {
  const points = [];
  const arch = options.arch ?? 0;
  for (let k = 0; k <= 4; k += 1) {
    const t = k / 4;
    points.push(crownPoint(lerp(az0, az1, t), lerp(p0, p1, t), lerp(lift0, lift1, t) + arch * Math.sin(PI * t)));
  }
  lock(builder, points, width, { up: points[0].clone().normalize(), ...options });
}

// --- long hair: a curtain that clears the shoulders ------------------------

const BEHIND_SHOULDERS = Object.freeze({ edge: 1.02, width: 0.36, zFront: -0.16, depth: 0.32, pull: true });
const STRAIGHT_DOWN = Object.freeze({ edge: 1.02, width: 0.36, zFront: -0.16, depth: 0.32, pull: false });

function curtainPoint(az, y, lift, out, shape = BEHIND_SHOULDERS) {
  const a = wrap(az);
  const sinA = Math.sin(a);
  const cosA = Math.cos(a);
  const head = headRadius(sinA, 0, cosA) + lift;
  let x = sinA * head;
  let z = cosA * head;
  if (shape.pull) {
    const side = a < 0 ? -1 : 1;
    const s = clamp((Math.abs(a) - shape.edge) / (PI - shape.edge));
    const th = (s * PI) / 2;
    const bodyX = side * (shape.width + lift) * Math.cos(th);
    const bodyZ = shape.zFront * (1 - Math.sin(th)) - (shape.depth + lift) * Math.sin(th);
    const k = smoothstep(-0.1, -0.52, y);
    x = lerp(x, bodyX, k);
    z = lerp(z, bodyZ, k);
  }
  return out.set(x, y, z);
}

function addDrape(builder, { hem, lift = 0.05, ridges = 16, ridgeDepth = 0.008, shape = BEHIND_SHOULDERS, nu = 60, headRows = 5, fallRows = 12, wave = null }) {
  const nv = headRows + fallRows;
  const azA = shape.edge;
  const azB = TAU - shape.edge;
  const lifted = (az, u, y) => {
    const edge = smoothstep(0, 0.07, u) * smoothstep(1, 0.93, u);
    const bulge = wave ? Math.sin((y * wave.freq + az * wave.spread) * TAU) * wave.amp * smoothstep(0, -0.2, y) : 0;
    return lift * lerp(0.3, 1, edge) + Math.sin(az * ridges) * ridgeDepth + bulge;
  };
  builder.grid(
    nu,
    nv,
    (u, v, out, i, j) => {
      const az = lerp(azA, azB, u);
      if (j <= headRows) {
        crownPoint(az, (PI / 2) * (j / headRows), lifted(az, u, 0.1), out);
      } else {
        const y = hem(az) * ((j - headRows) / fallRows);
        curtainPoint(az, y, lifted(az, u, y) * (j === nv ? 0.2 : 1), out, shape);
      }
    },
    {
      flip: true,
      colorAt: (u, v, c) => {
        const az = lerp(azA, azB, u);
        c.setScalar(0.96 - (0.5 - 0.5 * Math.sin(az * ridges)) * 0.24);
      }
    }
  );
  // Dark underside so the front view looks into shadow, not at the background.
  builder.grid(
    Math.floor(nu / 2),
    6,
    (u, v, out) => {
      const az = lerp(azA, azB, u);
      curtainPoint(az, lerp(0.02, hem(az) * 0.995, v), lift * 0.2, out, shape);
    },
    { tint: color("#3a3a3a") }
  );
}

function curtainLock(builder, az, y0, y1, width, options = {}) {
  const { lift = 0.058, drift = 0, wave = null, shape = BEHIND_SHOULDERS, crown = 0.55, ...rest } = options;
  const points = [crownPoint(az - drift * 0.3, crown, 0.05), crownPoint(az - drift * 0.2, 1.05, lift)];
  const P = new Vector3();
  const steps = wave ? 10 : 5;
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    const y = lerp(y0, y1, t);
    curtainPoint(az + drift * t, y, lift + (wave ? Math.sin(t * wave.count * TAU + (wave.phase ?? 0)) * wave.amp : 0), P, shape);
    points.push(P.clone());
  }
  lock(builder, points, width, { segments: wave ? 22 : 12, up: points[1].clone().normalize(), ...rest });
}

/** A lock that frames the face and falls in front of the shoulder. */
function frontLock(builder, side, width, y1, options = {}) {
  const { x = 0.31, z = 0.24, startAz = 0.5, temple = 1.12, wave = null, flatten = 2.2, panel = false, ...rest } = options;
  const points = [crownPoint(side * startAz, 0.5, 0.05), crownPoint(side * (temple - 0.28), 0.9, 0.06), crownPoint(side * temple, 1.27, 0.052)];
  const count = wave ? 9 : 4;
  for (let k = 1; k <= count; k += 1) {
    const t = k / count;
    const y = lerp(-0.05, y1, t);
    const wx = wave ? Math.sin(t * wave.count * TAU) * wave.amp : 0;
    points.push(vec(side * (lerp(0.452, x, smoothstep(0, 0.65, t)) + wx), y, lerp(0.2, z, smoothstep(0, 0.5, t))));
  }
  // A panel lies against the side of the head, then turns to face the front
  // as it falls over the chest, so it reads as a mass of hair and not a string.
  const normalAt = panel
    ? (t) => {
        const k = smoothstep(0.42, 0.72, t);
        return vec(side * lerp(0.92, 0.14, k), 0.08, lerp(0.38, 1, k)).normalize();
      }
    : null;
  lock(builder, points, width, { segments: wave ? 24 : 16, flatten, up: vec(side * 0.9, 0.1, 0.42).normalize(), normalAt, ...rest });
}

// --- textured hair ----------------------------------------------------------

/** A small closed curl: more convincing as coily texture than a smooth ball. */
function addCurl(builder, center, normal, radius, tubeRadius, rand) {
  const tangent = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(normal).normalize();
  const bitangent = new Vector3().crossVectors(normal, tangent).normalize();
  // Tilt the ring so some curls show their hole and some their edge.
  const tilt = 0.5 + rand() * 0.7;
  const axisA = tangent.clone();
  const axisB = bitangent.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(normal, Math.sin(tilt));
  const perpendicular = new Vector3().crossVectors(axisA, axisB).normalize();
  builder.grid(
    5,
    8,
    (u, v, out) => {
      const a = TAU * v;
      const b = TAU * u;
      const major = radius + Math.cos(b) * tubeRadius;
      const side = Math.sin(b) * tubeRadius;
      const ca = Math.cos(a) * major;
      const sa = Math.sin(a) * major;
      out.set(
        center.x + axisA.x * ca + axisB.x * sa + perpendicular.x * side,
        center.y + axisA.y * ca + axisB.y * sa + perpendicular.y * side,
        center.z + axisA.z * ca + axisB.z * sa + perpendicular.z * side
      );
    },
    { wrapU: true, wrapV: true, flip: true }
  );
}

function afroProfile(R) {
  return (az, v) => {
    const front = smoothstep(1.3, 0.2, Math.abs(wrap(az)));
    const depth = R * lerp(1, 0.74, front);
    return depth * Math.pow(Math.max(0, 1 - Math.pow(v, 3.2)), 0.5);
  };
}

const AFRO_LINE = polarLine([
  [0, 0.78],
  [0.6, 0.98],
  [1.2, 1.32],
  [1.6, 1.42],
  [2.15, 2.0],
  [PI, 2.25]
]);

function scatterOnCap(line, thickness, count, seed, place) {
  const rand = seeded(seed);
  const golden = PI * (3 - Math.sqrt(5));
  const P = new Vector3();
  for (let i = 0; i < count; i += 1) {
    const f = (i + 0.5) / count;
    const az = wrap(i * golden + (rand() - 0.5) * 0.08);
    const v = Math.pow(f, 0.62) * 0.985;
    const polar = line(az) * v;
    const lift = thickness(az, v);
    crownPoint(az, polar, lift, P);
    place(P.clone(), P.clone().normalize(), rand, f);
  }
}

function addAfro(builder, depth, count, tubeScale, seed) {
  const thickness = afroProfile(depth);
  const line = AFRO_LINE;
  addCap(builder, { line, thickness: (az, v) => thickness(az, v) * 0.97, nu: 48, nv: 18, edgeShade: 0.6 });
  // Fall-off shading comes from the curls themselves: base stays dark.
  const start = builder.colors.length;
  for (let i = 0; i < start; i += 4) {
    builder.colors[i] *= 0.42;
    builder.colors[i + 1] *= 0.42;
    builder.colors[i + 2] *= 0.42;
  }
  scatterOnCap(line, thickness, count, seed, (p, n, rand) => {
    const r = (0.036 + rand() * 0.018) * tubeScale;
    addCurl(builder, p.addScaledVector(n, -0.004 + rand() * 0.012), n, r, r * 0.88, rand);
  });
}

function addCoilSpring(builder, root, normal, length, radius, rand) {
  const tangent = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(normal).normalize();
  const bitangent = new Vector3().crossVectors(normal, tangent).normalize();
  const droop = new Vector3(0, -0.5, 0).addScaledVector(normal, 0.9).normalize();
  const turns = 2.4 + rand() * 0.8;
  const samples = Math.round(turns * 5);
  const points = [];
  const phase = rand() * TAU;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const a = phase + t * turns * TAU;
    const coil = radius * lerp(0.8, 1, t);
    points.push(
      root
        .clone()
        .addScaledVector(normal, length * t * (1 - 0.25 * t))
        .addScaledVector(droop, length * 0.28 * t * t)
        .addScaledVector(tangent, Math.cos(a) * coil)
        .addScaledVector(bitangent, Math.sin(a) * coil)
    );
  }
  builder.tube(points, (t) => (0.021 + 0.003 * Math.sin(t * 3)) * (t > 0.94 ? 0.75 : 1), { radial: 4, capStart: false, capEnd: "flat", colorAt: shadeAlong(0.62, 1) });
}

/** One open ringlet hanging off the head. */
function addRinglet(builder, root, normal, length, radius, rand) {
  const down = new Vector3(0, -1, 0).addScaledVector(normal, 0.35).normalize();
  const side = new Vector3().crossVectors(down, normal).normalize();
  const out = new Vector3().crossVectors(side, down).normalize();
  const turns = 1.15 + rand() * 0.5;
  const samples = Math.round(turns * 7);
  const points = [];
  const phase = rand() * TAU;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const a = phase + t * turns * TAU;
    const coil = radius * lerp(0.55, 1, smoothstep(0, 0.4, t));
    points.push(
      root
        .clone()
        .addScaledVector(down, length * t)
        .addScaledVector(side, Math.cos(a) * coil)
        .addScaledVector(out, Math.sin(a) * coil + 0.012)
    );
  }
  builder.tube(points, (t) => lerp(0.027, 0.014, t * t), { radial: 4, flatten: 1.25, capStart: false, capEnd: "flat", colorAt: shadeAlong(0.7, 1) });
}

// --- braids, locs, twists ----------------------------------------------------

/** A rope with `lobes` strands twisting along it: braids and twists at small scale. */
function addRope(builder, path, radius, lobes, twists, options = {}) {
  const { radial = 9, shadow = 0.5 } = options;
  const n = path.length;
  const radiusAt = (t, angle) => radius(t) * (1 + 0.2 * Math.cos(angle * lobes + t * twists * TAU));
  const start = builder.vertexCount;
  builder.tube(path, radiusAt, { radial, capStart: false, capEnd: "round", capDepth: 1.4 });
  // Shade the valleys between strands; this is what makes the twist readable.
  const rows = n + 4;
  for (let j = 0; j < rows; j += 1) {
    const t = clamp((j - 0) / (n - 1));
    for (let i = 0; i <= radial; i += 1) {
      const angle = (i / radial) * TAU;
      const s = lerp(shadow, 1, 0.5 + 0.5 * Math.cos(angle * lobes + t * twists * TAU));
      const index = (start + j * (radial + 1) + i) * 4;
      builder.colors[index] = s;
      builder.colors[index + 1] = s;
      builder.colors[index + 2] = s;
    }
  }
}

function fallPath(az, y0, y1, lift, options = {}) {
  const { wiggle = 0, seed = 1, shape = BEHIND_SHOULDERS, samples = 20, root = 0.4 } = options;
  const rand = seeded(seed);
  const a = rand() * TAU;
  const a0 = wrap(az);
  const points = [crownPoint(a0, root, 0.03), crownPoint(a0, 0.95, lift * 0.75)];
  const P = new Vector3();
  const steps = 7;
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    curtainPoint(az, lerp(y0, y1, t), lift + wiggle * Math.sin(a + t * 6), P, shape);
    points.push(P.clone());
  }
  return smoothPath(points, samples);
}

function addLocCap(builder, line = NATURAL_LINE) {
  addCap(builder, { line, thickness: (az, v) => lerp(0.05, 0.028, v), ridges: 18, ridgeDepth: 0.01, nu: 72, nv: 16, edgeShade: 0.7 });
}

// --- the styles ------------------------------------------------------------

function buildShort() {
  const main = new MeshBuilder();
  const thickness = (az, v) => lerp(0.052, 0.024, smoothstep(0.2, 1, v));
  addCap(main, { thickness, ridges: 20, ridgeDepth: 0.006 });
  const rand = seeded(11);
  for (let i = 0; i < 28; i += 1) {
    const az = (i / 28) * TAU - PI + (rand() - 0.5) * 0.12;
    const limit = NATURAL_LINE(az);
    surfaceLock(main, az, 0.1 + rand() * 0.3, az + (rand() - 0.5) * 0.2, limit * (0.92 + rand() * 0.1), 0.05, 0.022, 0.024 + rand() * 0.006, { arch: 0.02, flatten: 2.1, segments: 6 });
  }
  // A soft quiff, swept to the side off the part.
  for (let i = 0; i < 11; i += 1) {
    const t = i / 10;
    const az = lerp(-0.85, 0.75, t);
    surfaceLock(main, az - 0.3, 0.16, az + 0.34, 0.86 + 0.08 * Math.abs(az), 0.075, 0.03, 0.03, { arch: 0.03, flatten: 2.2, root: 0.85, segments: 6 });
  }
  return { main };
}

function buildFade() {
  const main = new MeshBuilder();
  const fade = new MeshBuilder();
  const line = polarLine([
    [0, 0.86],
    [0.7, 0.98],
    [1.6, 1.04],
    [PI, 1.16]
  ]);
  const profile = (v) => Math.pow(Math.max(0, 1 - Math.pow(v, 3.2)), 0.72);
  addCap(main, { line, thickness: (az, v) => 0.1 * profile(v) * lerp(1, 0.86, smoothstep(0.2, 1.4, Math.abs(wrap(az)))), ridges: 30, ridgeDepth: 0.005, edgeShade: 0.92 });
  const rand = seeded(21);
  for (let i = 0; i < 30; i += 1) {
    const az = (i / 30) * TAU - PI + (rand() - 0.5) * 0.1;
    const end = 0.74 + rand() * 0.18;
    const lift = (v) => 0.1 * profile(v) * lerp(1, 0.86, smoothstep(0.2, 1.4, Math.abs(wrap(az))));
    surfaceLock(main, az, line(az) * 0.2, az + (rand() - 0.5) * 0.2, line(az) * end, lift(0.2) - 0.004, lift(end) - 0.004, 0.019 + rand() * 0.006, { arch: 0.014, flatten: 1.6, segments: 5 });
  }
  const skinLine = polarLine([
    [0, 0.9],
    [0.6, 1.08],
    [1.2, 1.3],
    [1.6, 1.46],
    [2.15, 2.0],
    [PI, 2.28]
  ]);
  fade.grid(
    64,
    8,
    (u, v, out) => {
      const az = TAU * u - PI;
      crownPoint(az, lerp(line(az) * 0.82, skinLine(az), v), 0.0072, out);
    },
    { wrapU: true, flip: true, alphaAt: (u, v) => 1 - smoothstep(0.22, 1, v) }
  );
  return { main, fade };
}

function buildStraight() {
  const main = new MeshBuilder();
  addCap(main, { thickness: (az, v) => 0.058, ridges: 22, ridgeDepth: 0.005 });
  const hem = () => -0.4;
  addDrape(main, { hem, lift: 0.064, ridges: 20, ridgeDepth: 0.006, shape: STRAIGHT_DOWN, fallRows: 8 });
  // Blunt fringe.
  main.grid(
    44,
    6,
    (u, v, out) => {
      const az = lerp(-1.04, 1.04, u);
      const bottom = Math.asin(clamp(0.2 + 0.1 * (az * az), -1, 1));
      const polar = lerp(0.3, PI / 2 - bottom, v);
      crownPoint(az, polar, 0.066 + Math.sin(az * 34) * 0.004 - smoothstep(0.92, 1, v) * 0.03, out);
    },
    { flip: true, colorAt: (u, v, c) => c.setScalar(0.94 - (0.5 - 0.5 * Math.sin(lerp(-1.04, 1.04, u) * 34)) * 0.24) }
  );
  return { main };
}

function buildLong() {
  const main = new MeshBuilder();
  addCap(main, { thickness: (az, v) => 0.05, ridges: 18, ridgeDepth: 0.006 });
  const hem = (az) => -0.98 - 0.08 * Math.sin(az * 5);
  addDrape(main, { hem, lift: 0.056, ridges: 16, ridgeDepth: 0.01 });
  const rand = seeded(31);
  for (let i = 0; i < 12; i += 1) {
    const az = lerp(1.24, TAU - 1.24, i / 11);
    curtainLock(main, az, 0, -0.9 - rand() * 0.2, 0.028, { lift: 0.07, drift: (rand() - 0.5) * 0.2, flatten: 2.6, radial: 5, crown: 0.4 });
  }
  for (const side of [1, -1]) {
    frontLock(main, side, 0.026, -0.84, { x: 0.3, z: 0.255, flatten: 5.2, radial: 14, ridges: 5, ridgeDepth: 0.2, panel: true, taper: panelTaper });
    frontLock(main, side, 0.022, -0.6, { x: 0.39, z: 0.2, temple: 1.28, startAz: 0.82, flatten: 4.2, radial: 12, ridges: 4, ridgeDepth: 0.2, panel: true, taper: panelTaper });
  }
  for (let i = 0; i < 9; i += 1) {
    const az = lerp(-0.92, 0.82, i / 8);
    surfaceLock(main, az - 0.25, 0.18, az + 0.42, 0.92 + 0.14 * Math.abs(az), 0.07, 0.03, 0.032, { arch: 0.03, flatten: 2.2, root: 0.85, segments: 6 });
  }
  return { main };
}

function buildWaves() {
  const main = new MeshBuilder();
  addCap(main, { thickness: (az, v) => 0.058, ridges: 16, ridgeDepth: 0.008 });
  const hem = (az) => -1.04 - 0.1 * Math.sin(az * 4);
  addDrape(main, { hem, lift: 0.06, ridges: 14, ridgeDepth: 0.012, wave: { freq: 2.2, spread: 0.6, amp: 0.022 } });
  const rand = seeded(41);
  for (let i = 0; i < 13; i += 1) {
    const az = lerp(1.2, TAU - 1.2, i / 12);
    curtainLock(main, az, 0, -0.96 - rand() * 0.2, 0.038, { lift: 0.075, drift: (rand() - 0.5) * 0.15, flatten: 2.2, radial: 5, crown: 0.4, wave: { count: 2.4, amp: 0.042, phase: rand() * TAU } });
  }
  for (const side of [1, -1]) {
    frontLock(main, side, 0.021, -0.92, { x: 0.3, z: 0.255, flatten: 4.4, radial: 14, ridges: 5, ridgeDepth: 0.2, panel: true, taper: wavyTaper, wave: { count: 2.3, amp: 0.05 } });
    frontLock(main, side, 0.019, -0.66, { x: 0.4, z: 0.19, temple: 1.28, startAz: 0.85, flatten: 3.4, radial: 12, ridges: 4, ridgeDepth: 0.2, panel: true, taper: wavyTaper, wave: { count: 2, amp: 0.05 } });
  }
  for (let i = 0; i < 9; i += 1) {
    const az = lerp(-0.92, 0.82, i / 8);
    surfaceLock(main, az - 0.25, 0.18, az + 0.42, 0.9 + 0.14 * Math.abs(az), 0.078, 0.034, 0.034, { arch: 0.04, flatten: 2.2, root: 0.85, segments: 6 });
  }
  return { main };
}

function buildBraids() {
  const main = new MeshBuilder();
  addLocCap(main);
  const rand = seeded(51);
  const count = 15;
  for (let i = 0; i < count; i += 1) {
    const az = lerp(1.08, TAU - 1.08, i / (count - 1));
    const length = -0.78 - rand() * 0.14;
    const path = fallPath(az, 0.02, length, 0.066, { seed: 100 + i, wiggle: 0.008, samples: 26, root: 0.3 + rand() * 0.3 });
    addRope(main, path, (t) => 0.037 * lerp(1, 0.72, t * t) * (t > 0.96 ? 0.7 : 1), 3, 12 + rand() * 3);
  }
  for (const side of [1, -1]) {
    const points = [crownPoint(side * 0.45, 0.42, 0.04), crownPoint(side * 0.95, 0.96, 0.055), crownPoint(side * 1.14, 1.32, 0.052), vec(side * 0.455, -0.1, 0.2), vec(side * 0.395, -0.42, 0.24), vec(side * 0.34, -0.74, 0.26)];
    addRope(main, smoothPath(points, 26), (t) => 0.035 * lerp(1, 0.72, t * t) * (t > 0.96 ? 0.7 : 1), 3, 12);
  }
  return { main };
}

function buildLocs() {
  const main = new MeshBuilder();
  addLocCap(main);
  const rand = seeded(61);
  const count = 26;
  const plump = (seed, base) => {
    const local = seeded(seed);
    const a = local() * TAU;
    const b = local() * TAU;
    const size = base + local() * 0.008;
    return (t) => size * (1 + 0.09 * Math.sin(a + t * 13) + 0.05 * Math.sin(b + t * 29)) * (t > 0.965 ? 0.82 : 1);
  };
  for (let i = 0; i < count; i += 1) {
    const az = lerp(1.1, TAU - 1.1, i / (count - 1));
    const back = smoothstep(1.2, 2.6, Math.abs(wrap(az)));
    const length = lerp(-0.46, -0.76, back) - rand() * 0.08;
    const path = fallPath(az, 0.04, length, 0.05 + (i % 2) * 0.03, { seed: 200 + i, wiggle: 0.01, samples: 16, root: 0.15 + rand() * 0.5 });
    main.tube(path, plump(300 + i, 0.034), { radial: 6, capStart: false, capEnd: "round", capDepth: 1.2, colorAt: (t, c) => c.setScalar(lerp(0.7, 1 - (i % 3) * 0.08, smoothstep(0, 0.3, t))) });
  }
  // Locs framing the face, tucked behind the temples.
  for (const side of [1, -1]) {
    for (const [offset, end] of [
      [0, -0.4],
      [0.13, -0.5]
    ]) {
      const points = [crownPoint(side * (0.3 + offset), 0.2, 0.04), crownPoint(side * (0.86 + offset), 0.86, 0.06), crownPoint(side * (1.06 + offset), 1.28, 0.06), vec(side * (0.47 + offset * 0.05), -0.12, 0.18 - offset * 0.5), vec(side * (0.45 + offset * 0.1), end, 0.19 - offset * 0.8)];
      main.tube(smoothPath(points, 16), plump(400 + side + offset * 100, 0.032), { radial: 6, capStart: false, capEnd: "round", capDepth: 1.2, colorAt: shadeAlong(0.72, 1) });
    }
  }
  // Roots running from a centre part: the top reads as sectioned, not smooth.
  for (let i = 0; i < 18; i += 1) {
    const f = i / 17;
    const az = lerp(-2.95, 2.95, f);
    const reach = Math.min(0.95, NATURAL_LINE(az) * 0.97);
    main.tube(smoothPath([crownPoint(az, 0.1, 0.03), crownPoint(az, reach * 0.58, 0.058), crownPoint(az, reach, 0.04)], 6), (t) => 0.028 * Math.sin(Math.PI * clamp(t, 0.04, 0.96)) + 0.006, { radial: 5, capStart: false, capEnd: false, colorAt: shadeAlong(0.66, 0.92) });
  }
  return { main };
}

function buildLocsLong() {
  const main = new MeshBuilder();
  addLocCap(main);
  const rand = seeded(71);
  const count = 24;
  for (let i = 0; i < count; i += 1) {
    const az = lerp(1.08, TAU - 1.08, i / (count - 1));
    const length = -1.08 - rand() * 0.18;
    const path = fallPath(az, 0.04, length, 0.06 + (i % 3) * 0.018, { seed: 500 + i, wiggle: 0.01, samples: 30, root: 0.25 + rand() * 0.45 });
    addRope(main, path, (t) => (0.03 + (i % 2) * 0.004) * lerp(1, 0.68, t * t), 2, 12 + rand() * 3, { radial: 6, shadow: 0.55 });
  }
  for (const side of [1, -1]) {
    for (const [offset, y] of [
      [0, -0.98],
      [0.05, -0.8]
    ]) {
      const points = [crownPoint(side * (0.42 + offset), 0.42, 0.042), crownPoint(side * (0.96 + offset), 0.96, 0.056), crownPoint(side * (1.14 + offset), 1.32, 0.054), vec(side * (0.452 + offset * 0.3), -0.12, 0.2 - offset), vec(side * (0.385 + offset), -0.45, 0.245 - offset), vec(side * (0.33 + offset), y, 0.265)];
      addRope(main, smoothPath(points, 30), (t) => 0.03 * lerp(1, 0.68, t * t), 2, 13, { radial: 6, shadow: 0.55 });
    }
  }
  return { main };
}

function buildCurly() {
  const main = new MeshBuilder();
  const thickness = (az, v) => 0.1 * Math.pow(Math.max(0, 1 - Math.pow(v, 4)), 0.5);
  const line = polarLine([
    [0, 0.8],
    [0.6, 1.0],
    [1.2, 1.36],
    [1.6, 1.6],
    [2.15, 2.25],
    [PI, 2.45]
  ]);
  addCap(main, { line, thickness, nu: 48, nv: 14, edgeShade: 0.55 });
  for (let i = 0; i < main.colors.length; i += 4) {
    main.colors[i] *= 0.4;
    main.colors[i + 1] *= 0.4;
    main.colors[i + 2] *= 0.4;
  }
  scatterOnCap(line, thickness, 112, 81, (p, n, rand) => {
    addRinglet(main, p.addScaledVector(n, -0.01), n, 0.11 + rand() * 0.07, 0.038 + rand() * 0.012, rand);
  });
  return { main, matte: true };
}

function buildAfro(depth, count, scale, seed) {
  const main = new MeshBuilder();
  addAfro(main, depth, count, scale, seed);
  return { main, matte: true };
}

function buildAfroBig() {
  const built = buildAfro(0.42, 178, 1.42, 91);
  const glow = new MeshBuilder();
  const rand = seeded(92);
  const thickness = afroProfile(0.42);
  const tints = [color("#FFE08A"), color("#FFFFFF"), color("#7CEBF7")];
  scatterOnCap(AFRO_LINE, thickness, 26, 93, (p, n) => addSparkle(glow, p.addScaledVector(n, 0.075), n, 0.05 + rand() * 0.03, tints[Math.floor(rand() * 3)]));
  built.glow = glow;
  return built;
}

/** A four-point sparkle, flat and facing out. */
export function addSparkle(builder, center, normal, size, tint) {
  const tangent = new Vector3(0.3, 1, 0.1).cross(normal).normalize();
  const bitangent = new Vector3().crossVectors(normal, tangent).normalize();
  builder.grid(
    8,
    1,
    (u, v, out) => {
      const a = TAU * u;
      const r = (u * 8) % 2 < 1e-6 ? size : size * 0.26;
      out.copy(center).addScaledVector(tangent, Math.cos(a) * r * v).addScaledVector(bitangent, Math.sin(a) * r * v);
    },
    { wrapU: true, poleStart: true, tint, flip: true }
  );
}

function buildCoils() {
  const main = new MeshBuilder();
  const thickness = (az, v) => 0.1 * Math.pow(Math.max(0, 1 - Math.pow(v, 4)), 0.5);
  const line = AFRO_LINE;
  addCap(main, { line, thickness, nu: 48, nv: 14, edgeShade: 0.6 });
  for (let i = 0; i < main.colors.length; i += 4) {
    main.colors[i] *= 0.4;
    main.colors[i + 1] *= 0.4;
    main.colors[i + 2] *= 0.4;
  }
  scatterOnCap(line, thickness, 108, 101, (p, n, rand) => {
    addCoilSpring(main, p.addScaledVector(n, -0.02), n, 0.17 + rand() * 0.08, 0.033 + rand() * 0.008, rand);
  });
  return { main, matte: true };
}

function addBun(builder, cx, cy, cz, radius, spin = 1) {
  builder.grid(
    36,
    18,
    (u, v, out) => {
      const a = TAU * u;
      const phi = PI * v - PI / 2;
      const cp = Math.cos(phi);
      const r = radius * (1 + 0.05 * Math.sin(a * 2 + phi * 10 * spin));
      out.set(cx + Math.sin(a) * cp * r, cy + Math.sin(phi) * r * 0.9, cz + Math.cos(a) * cp * r);
    },
    {
      wrapU: true,
      poleStart: true,
      poleEnd: true,
      colorAt: (u, v, c) => {
        const a = TAU * u;
        const phi = PI * v - PI / 2;
        c.setScalar(0.92 - (0.5 - 0.5 * Math.sin(a * 2 + phi * 10 * spin)) * 0.34);
      }
    }
  );
}

function addTie(builder, center, axis, radius, tube, tint) {
  const { e1, e2 } = basisAround(axis);
  const n = axis.clone().normalize();
  builder.grid(
    6,
    20,
    (u, v, out) => {
      const a = TAU * v;
      const b = TAU * u;
      const major = radius + Math.cos(b) * tube;
      out.copy(center).addScaledVector(e1, Math.cos(a) * major).addScaledVector(e2, Math.sin(a) * major).addScaledVector(n, Math.sin(b) * tube);
    },
    { wrapU: true, wrapV: true, tint, flip: true }
  );
}

const TIE_TURQUOISE = "#20CFE3";
const TIE_PINK = "#FF4F9A";

function slickCap(builder, tiePoint, options = {}) {
  addCap(builder, { line: PULLED_LINE, thickness: (az, v) => 0.034 + 0.016 * (1 - v), ridges: 26, ridgeDepth: 0.006, axis: tiePoint, nu: 96, nv: 18, edgeShade: 0.82, ...options });
}

function buildBun(fit) {
  const main = new MeshBuilder();
  const tie = new MeshBuilder();
  const top = vec(0, 0.46, -0.1);
  slickCap(main, top);
  addBun(main, 0, 0.56, -0.1, 0.2);
  addTie(tie, vec(0, 0.455, -0.1), vec(0, 1, -0.2), 0.135, 0.02, color(TIE_TURQUOISE));
  // The bun is narrower than a crown's ring, so a crown sits on the hair around it.
  return { main, tie, crownOnScalp: fit?.type === "crown" };
}

function buildTwinBuns(fit) {
  const main = new MeshBuilder();
  const tie = new MeshBuilder();
  // A crown would otherwise balance on the two buns and float over the head.
  // Under one they stand closer together, inside its ring, and it sits on the hair.
  const crowned = fit?.type === "crown";
  const reach = crowned ? 0.155 : 0.3;
  const bunRadius = crowned ? 0.118 : 0.16;
  addCap(main, { line: PULLED_LINE, thickness: (az, v) => 0.034 + 0.014 * (1 - v), ridges: 28, ridgeDepth: 0.006, axis: vec(0, 0.2, 0.0).add(vec(1, 0, 0)), nu: 96, nv: 18, edgeShade: 0.82 });
  for (const side of [1, -1]) {
    const center = vec(side * reach, crowned ? 0.455 : 0.42, -0.04);
    addBun(main, center.x, center.y, center.z, bunRadius, side);
    addTie(tie, center.clone().add(vec(-side * bunRadius * 0.5, -bunRadius * 0.6, 0)), vec(side * 0.55, 0.8, 0), bunRadius * 0.625, 0.017, color(side > 0 ? TIE_PINK : TIE_TURQUOISE));
  }
  // Two soft tendrils in front of the ears.
  for (const side of [1, -1]) {
    const points = [crownPoint(side * 1.0, 1.1, 0.03), vec(side * 0.432, 0.02, 0.14), vec(side * 0.445, -0.14, 0.16), vec(side * 0.425, -0.27, 0.17)];
    lock(main, points, 0.012, { segments: 14, flatten: 1.8, up: vec(side, 0, 0.4).normalize() });
  }
  return { main, tie, crownOnScalp: crowned };
}

function buildPonytail() {
  const main = new MeshBuilder();
  const tie = new MeshBuilder();
  const anchor = vec(0, 0.3, -0.39);
  slickCap(main, anchor);
  // Swept over one shoulder, so it reads from the front as well as the back.
  const spine = [anchor.clone().add(vec(0, 0, 0.03)), vec(0.1, 0.42, -0.53), vec(0.33, 0.33, -0.47), vec(0.52, 0.08, -0.26), vec(0.55, -0.24, 0.0), vec(0.44, -0.54, 0.16), vec(0.34, -0.88, 0.235)];
  main.tube(smoothPath(spine, 30), (t, a) => (0.082 + 0.05 * Math.sin(Math.min(1, t * 1.7) * PI * 0.95)) * (1 - Math.pow(t, 3.4)) * (1 + 0.1 * Math.cos(a * 5 + t * 5)) + 0.002, {
    radial: 15,
    capStart: "flat",
    capEnd: false,
    colorAt: (t, c) => c.setScalar(lerp(0.72, 1, smoothstep(0, 0.22, t)))
  });
  const rand = seeded(13);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    const dx = Math.cos(a) * 0.05;
    const dz = Math.sin(a) * 0.05;
    const points = spine.map((p, k) => p.clone().add(vec(dx * (0.6 + k * 0.16), (rand() - 0.5) * 0.01, dz * (0.6 + k * 0.16))));
    points[points.length - 1].y -= 0.04 * rand();
    lock(main, points, 0.017, { segments: 20, flatten: 1.5, root: 0.82 });
  }
  addTie(tie, anchor.clone().add(vec(0, 0.015, -0.05)), vec(0, 0.3, -1), 0.078, 0.022, color(TIE_PINK));
  return { main, tie };
}

function addPuff(builder, center, radius, count, seed) {
  const base = new MeshBuilder();
  base.ellipsoid(center.x, center.y, center.z, radius * 0.94, radius * 0.86, radius * 0.94, { nu: 20, nv: 12, tint: color("#6b6b6b") });
  builder.append(base);
  const rand = seeded(seed);
  const golden = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - 2 * ((i + 0.5) / count);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * golden;
    const n = vec(Math.cos(a) * ring, y, Math.sin(a) * ring);
    if (y < -0.72) continue;
    const r = 0.04 + rand() * 0.016;
    const p = center.clone().add(vec(n.x * radius * 0.96, n.y * radius * 0.88, n.z * radius * 0.96));
    addCurl(builder, p, n, r, r * 0.88, rand);
  }
}

function buildPuff() {
  const main = new MeshBuilder();
  const tie = new MeshBuilder();
  const center = vec(0, 0.635, -0.1);
  slickCap(main, vec(0, 0.46, -0.1));
  addPuff(main, center, 0.36, 118, 111);
  addTie(tie, vec(0, 0.452, -0.09), vec(0, 1, -0.16), 0.19, 0.026, color(TIE_TURQUOISE));
  return { main, tie, matte: true };
}

function buildCrownBraids() {
  const main = new MeshBuilder();
  addCap(main, { line: PULLED_LINE, thickness: (az, v) => 0.03 + 0.012 * (1 - v), ridges: 30, ridgeDepth: 0.005, axis: vec(1, 0, 0), nu: 96, nv: 18, edgeShade: 0.9 });
  // The braid: two interleaved rows of plump strands round the head.
  const count = 30;
  const row = (phase, lean) => {
    for (let i = 0; i < count; i += 1) {
      const t = (i + phase) / count;
      const az = t * TAU - PI;
      const polar = lerp(0.84, 1.24, smoothstep(0.1, 1.4, Math.abs(wrap(az)))) + lean * 0.5 * 0.12;
      const p = crownPoint(az, polar, 0.06);
      const n = p.clone().normalize();
      const along = vec(Math.cos(az), 0, -Math.sin(az));
      const across = new Vector3().crossVectors(n, along).normalize();
      const q = new Quaternion();
      const zAxis = along.clone().multiplyScalar(Math.cos(lean * 0.7)).addScaledVector(across, Math.sin(lean * 0.7)).normalize();
      const yAxis = n;
      const xAxis = new Vector3().crossVectors(yAxis, zAxis).normalize();
      q.setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, zAxis));
      const center = p.clone().addScaledVector(across, lean * 0.03);
      main.ellipsoid(center.x, center.y, center.z, 0.042, 0.046, 0.076, { rotation: q, nu: 7, nv: 5, tint: color("#f2f2f2") });
    }
  };
  row(0, 1);
  row(0.5, -1);
  return { main };
}

function buildMohawk() {
  const main = new MeshBuilder();
  const fade = new MeshBuilder();
  fade.grid(
    64,
    10,
    (u, v, out) => {
      const az = TAU * u - PI;
      crownPoint(az, lerp(0.02, NATURAL_LINE(az) * 0.985, v), 0.0065, out);
    },
    { wrapU: true, poleStart: true, flip: true, alphaAt: (u, v) => lerp(0.5, 0.3, v) * (1 - smoothstep(0.72, 1, v)) }
  );
  // Separate tapered spikes from forehead to nape, tallest at the crown.
  const fins = 13;
  const rand = seeded(121);
  for (let i = 0; i < fins; i += 1) {
    const t = i / (fins - 1);
    const signed = lerp(0.74, -2.16, t);
    const az = signed > 0 ? 0 : PI;
    const polar = Math.abs(signed);
    const root = crownPoint(az, polar, 0.008);
    const n = root.clone().normalize();
    const lean = vec(0, 0.1, -0.18 - 0.3 * t).add(n).normalize();
    const height = lerp(0.3, 0.46, Math.sin(Math.min(1, t * 1.45) * PI * 0.86)) * (0.94 + rand() * 0.12);
    const tip = root.clone().addScaledVector(lean, height);
    const mid = root.clone().addScaledVector(n, height * 0.55).addScaledVector(lean, height * 0.02);
    main.tube(smoothPath([root.clone().addScaledVector(n, -0.03), mid, tip], 10), (x) => 0.058 * Math.pow(1 - x, 0.72) + 0.0015, {
      radial: 7,
      flatten: 1.5,
      up: vec(1, 0, 0),
      capStart: false,
      capEnd: false,
      colorAt: (x, c) => c.setScalar(lerp(0.66, 1, smoothstep(0.05, 0.75, x)))
    });
  }
  return { main, fade, crownOnScalp: true };
}

function buildUpdo() {
  const main = new MeshBuilder();
  const tie = new MeshBuilder();
  slickCap(main, vec(0, 0.5, -0.12));
  // A smooth raised crown rising out of a braid that follows the hairline.
  const center = vec(0, 0.36, -0.08);
  const ridge = (a, phi) => Math.sin(a * 13 + phi * 2.4);
  main.grid(
    64,
    14,
    (u, v, out) => {
      const a = TAU * u - PI;
      const phi = lerp(-0.2, PI / 2, v);
      const cp = Math.cos(phi);
      const r = 1 + 0.03 * ridge(a, phi) * cp;
      out.set(center.x + Math.sin(a) * cp * 0.335 * r, center.y + Math.sin(phi) * 0.45, center.z + Math.cos(a) * cp * 0.33 * r);
    },
    {
      wrapU: true,
      poleEnd: true,
      colorAt: (u, v, c) => {
        const a = TAU * u - PI;
        const phi = lerp(-0.2, PI / 2, v);
        c.setScalar(0.96 - (0.5 - 0.5 * ridge(a, phi)) * 0.28 * Math.cos(phi));
      }
    }
  );
  const ring = [];
  for (let i = 0; i <= 56; i += 1) {
    const az = (i / 56) * TAU - PI;
    ring.push(crownPoint(az, lerp(0.8, 1.2, smoothstep(0.1, 1.4, Math.abs(wrap(az)))), 0.062));
  }
  addRope(main, ring, () => 0.058, 3, 28, { radial: 9, shadow: 0.55 });
  // A jewel set at the front of the crown.
  tie.ellipsoid(0, 0.47, 0.25, 0.034, 0.042, 0.024, { nu: 10, nv: 8, tint: color("#FF4F9A") });
  for (const side of [1, -1]) {
    const points = [crownPoint(side * 0.92, 1.0, 0.03), vec(side * 0.43, 0.06, 0.16), vec(side * 0.455, -0.14, 0.15), vec(side * 0.44, -0.3, 0.17)];
    lock(main, points, 0.014, { segments: 16, flatten: 1.8, up: vec(side, 0, 0.4).normalize() });
  }
  return { main, tie };
}

const BUILDERS = {
  short: buildShort,
  long: buildLong,
  curly: buildCurly,
  straight: buildStraight,
  braids: buildBraids,
  locs: buildLocs,
  afro: () => buildAfro(0.27, 150, 1.16, 95),
  fade: buildFade,
  bun: buildBun,
  ponytail: buildPonytail,
  twinbuns: buildTwinBuns,
  puff: buildPuff,
  locslong: buildLocsLong,
  crownbraids: buildCrownBraids,
  coils: buildCoils,
  mohawk: buildMohawk,
  waves: buildWaves,
  updo: buildUpdo,
  afrobig: buildAfroBig
};

// Hair that hangs next to the ears, where earrings have to sit on top of it.
const COVERS_EARS = new Set(["long", "straight", "waves", "afro", "afrobig", "curly", "coils", "braids", "locs", "locslong"]);

export function hairCoversEars(model) {
  return COVERS_EARS.has(model);
}

function applyFit(builder, fit) {
  if (!fit) return;
  const positions = builder.positions;
  const count = positions.length / 3;
  const hidden = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    let x = positions[i * 3];
    let y = positions[i * 3 + 1];
    let z = positions[i * 3 + 2];
    const h = Math.hypot(x, z);
    if (fit.type === "cover") {
      const rim = fit.rim(z);
      const d = y - rim;
      if (d > 0) {
        const sx = x / fit.rx;
        const sy = (y - fit.cy) / fit.ry;
        const sz = z / fit.rz;
        const s = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (s > 1) {
          x /= s;
          y = fit.cy + (y - fit.cy) / s;
          z /= s;
        }
        if (d > 0.04) hidden[i] = 1;
      } else if (h > 0) {
        // Below the rim: hair stays inside the rim, then eases back out.
        const q = Math.sqrt((x * x) / (fit.rimRx * fit.rimRx) + (z * z) / (fit.rimRz * fit.rimRz));
        const limit = 1 + (fit.flare * -d) / fit.rimRx;
        if (q > limit) {
          const k = limit / q;
          x *= k;
          z *= k;
        }
      }
    } else if (fit.type === "band") {
      const distance = y < fit.y0 ? fit.y0 - y : y > fit.y1 ? y - fit.y1 : 0;
      const limit = fit.radius + fit.slope * distance;
      if (h > limit) {
        const k = limit / h;
        x *= k;
        z *= k;
      }
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  if (fit.type === "cover") {
    const kept = [];
    const indices = builder.indices;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      if (hidden[a] && hidden[b] && hidden[c]) continue;
      kept.push(a, b, c);
    }
    builder.indices = kept;
  }
}

function measure(builder) {
  let top = -Infinity;
  let halfWidth = 0;
  const positions = builder.positions;
  const seen = new Set(builder.indices);
  for (const i of seen) {
    const y = positions[i * 3 + 1];
    if (y > top) top = y;
    halfWidth = Math.max(halfWidth, Math.abs(positions[i * 3]));
  }
  return { top, halfWidth };
}

function topAtRing(builder, ringRadius, tolerance = 0.05) {
  let top = -Infinity;
  const positions = builder.positions;
  for (const i of new Set(builder.indices)) {
    const h = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
    if (Math.abs(h - ringRadius) > tolerance) continue;
    if (positions[i * 3 + 1] > top) top = positions[i * 3 + 1];
  }
  return top;
}

/**
 * The geometry for one hairstyle. `fit` compresses it to sit under a hat.
 * Returns the parts plus how high the hair reaches, so a crown or halo can
 * rest on top of whatever style is worn.
 */
export function buildHair(model, fit, materials) {
  const info = { top: 0.432, halfWidth: 0.44, ringTop: (radius) => 0.432 * Math.sqrt(Math.max(0, 1 - (radius * radius) / (0.44 * 0.44))) };
  const build = BUILDERS[model];
  if (!build) return { parts: [], info };
  const built = build(fit);
  const parts = [];
  const add = (builder, material, extra = {}) => {
    if (!builder) return;
    applyFit(builder, fit);
    if (builder.indices.length === 0) return;
    parts.push({ geometry: builder.toGeometry(), material, parent: "head", ...extra });
  };
  const measured = measure(built.main);
  const main = built.main;
  info.top = Math.max(measured.top, 0.432);
  info.halfWidth = Math.max(measured.halfWidth, 0.44);
  add(built.main, built.matte ? materials.hairMatte : materials.hair);
  add(built.fade, materials.hairFade, { renderOrder: 1 });
  add(built.tie, materials.soft);
  add(built.glow, materials.glow);
  if (fit) {
    const fitted = measure(main);
    info.top = Math.max(fitted.top, 0.432);
  }
  const ringCache = new Map();
  if (built.crownOnScalp) ringCache.set(0.31, -Infinity);
  info.ringTop = (radius) => {
    if (!ringCache.has(radius)) ringCache.set(radius, topAtRing(main, radius));
    const value = ringCache.get(radius);
    return value === -Infinity ? 0.432 * Math.sqrt(Math.max(0, 1 - (radius * radius) / (0.44 * 0.44))) + 0.01 : value;
  };
  return { parts, info };
}

