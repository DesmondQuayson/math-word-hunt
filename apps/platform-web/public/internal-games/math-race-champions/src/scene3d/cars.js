// Original MathNexa car models, built from numbers: no downloaded mesh, no
// third-party design. Each car is a dense lofted shell (rounded cross-sections
// along its length, flared over the wheels, with the wheel arches carved out of
// it), a glass canopy with a painted roof, spoked wheels with brake discs, and
// its own lights, grille, mirrors and aero. Four garage cars, four silhouettes.
// The garage preview and the race use this same builder: what is shown is what
// is driven.

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry
} from "../../../math-tug-of-war/src/vendor/three.js";
import { PAINTS } from "../palette.js";

export { PAINTS };

/**
 * Every station is [share along the car (0 rear, 1 nose), half width, bottom, top, top taper].
 * `body` is painted; `cabin` is glass; `roof` (shares of the cabin) is painted.
 * `flare` is how far the shell swells over each wheel.
 */
const DESIGNS = Object.freeze({
  // A friendly, upright hatchback.
  starter: {
    length: 3.9,
    wheel: 0.31,
    axles: [0.19, 0.8],
    flare: 0.035,
    paint: PAINTS.turquoise,
    accent: 0xffffff,
    caliper: 0xff4f9a,
    body: [[0, 0.66, 0.44, 0.8, 0.1], [0.05, 0.8, 0.31, 0.92, 0.12], [0.25, 0.84, 0.27, 0.98, 0.14], [0.5, 0.84, 0.25, 0.96, 0.14], [0.75, 0.82, 0.26, 0.86, 0.16], [0.93, 0.76, 0.31, 0.75, 0.2], [1, 0.6, 0.42, 0.66, 0.22]],
    cabin: [[0.07, 0.58, 0.9, 1.0, 0.2], [0.15, 0.7, 0.9, 1.4, 0.28], [0.4, 0.71, 0.9, 1.46, 0.3], [0.55, 0.69, 0.88, 1.36, 0.3], [0.7, 0.6, 0.84, 0.9, 0.3]],
    roof: [0.14, 0.56],
    parts: ["stripe", "roof-rails", "b-pillar"]
  },
  // A low wedge with a ducktail.
  "turbo-sprint": {
    length: 4.3,
    wheel: 0.33,
    axles: [0.2, 0.8],
    flare: 0.05,
    paint: 0xa3e635,
    accent: 0x0b1622,
    caliper: 0xffc93c,
    body: [[0, 0.72, 0.42, 0.82, 0.1], [0.05, 0.86, 0.29, 0.92, 0.12], [0.22, 0.9, 0.23, 0.94, 0.14], [0.5, 0.9, 0.21, 0.84, 0.14], [0.75, 0.88, 0.21, 0.7, 0.16], [0.94, 0.82, 0.23, 0.54, 0.2], [1, 0.64, 0.32, 0.45, 0.22]],
    cabin: [[0.14, 0.54, 0.86, 0.94, 0.3], [0.28, 0.68, 0.86, 1.22, 0.34], [0.45, 0.7, 0.84, 1.25, 0.34], [0.63, 0.62, 0.76, 0.8, 0.34]],
    roof: [0.26, 0.47],
    parts: ["ducktail", "splitter", "stripe", "side-intakes", "exhausts"]
  },
  // A long-bonnet grand tourer with a fastback.
  "velocity-gt": {
    length: 4.65,
    wheel: 0.35,
    axles: [0.17, 0.78],
    flare: 0.06,
    paint: 0xff4f9a,
    accent: 0x1a0a14,
    caliper: 0x20cfe3,
    body: [[0, 0.76, 0.4, 0.86, 0.1], [0.06, 0.88, 0.27, 0.94, 0.12], [0.25, 0.92, 0.23, 0.96, 0.14], [0.5, 0.92, 0.21, 0.88, 0.14], [0.78, 0.9, 0.21, 0.8, 0.15], [0.95, 0.84, 0.23, 0.66, 0.2], [1, 0.68, 0.32, 0.55, 0.22]],
    cabin: [[0.03, 0.44, 0.88, 0.92, 0.3], [0.18, 0.66, 0.9, 1.2, 0.36], [0.34, 0.7, 0.88, 1.27, 0.36], [0.48, 0.68, 0.84, 1.16, 0.36], [0.59, 0.6, 0.8, 0.84, 0.36]],
    roof: [0.16, 0.36],
    parts: ["lip", "side-intakes", "exhausts", "splitter", "bonnet-vents", "twin-stripe"]
  },
  // A wide, low hypercar with a canopy and a tall wing.
  "thunder-x": {
    length: 4.5,
    wheel: 0.36,
    axles: [0.19, 0.8],
    flare: 0.075,
    paint: 0x6d28d9,
    accent: 0xffc93c,
    caliper: 0xffc93c,
    body: [[0, 0.82, 0.36, 0.78, 0.08], [0.05, 0.94, 0.25, 0.86, 0.1], [0.25, 0.98, 0.19, 0.84, 0.12], [0.5, 0.96, 0.17, 0.7, 0.14], [0.75, 0.94, 0.17, 0.58, 0.16], [0.93, 0.88, 0.19, 0.44, 0.2], [1, 0.72, 0.26, 0.37, 0.22]],
    cabin: [[0.28, 0.42, 0.76, 0.82, 0.4], [0.41, 0.62, 0.72, 1.08, 0.46], [0.55, 0.62, 0.66, 1.1, 0.46], [0.7, 0.5, 0.56, 0.7, 0.46]],
    roof: [0.4, 0.56],
    parts: ["wing", "fins", "splitter", "stripe", "exhausts", "side-intakes", "roof-scoop", "canards"]
  },
  // Online Race: one touring car for everybody, in the racer's own colour.
  "circuit-standard": {
    length: 4.3,
    wheel: 0.33,
    axles: [0.19, 0.8],
    flare: 0.045,
    paint: PAINTS.white,
    accent: 0x0b1622,
    caliper: 0xf2f5f9,
    body: [[0, 0.7, 0.42, 0.84, 0.1], [0.06, 0.84, 0.29, 0.94, 0.12], [0.25, 0.88, 0.25, 0.96, 0.14], [0.5, 0.88, 0.23, 0.92, 0.14], [0.76, 0.86, 0.23, 0.8, 0.16], [0.94, 0.8, 0.27, 0.66, 0.2], [1, 0.62, 0.36, 0.57, 0.22]],
    cabin: [[0.1, 0.54, 0.88, 0.96, 0.24], [0.22, 0.68, 0.88, 1.3, 0.32], [0.42, 0.7, 0.88, 1.36, 0.32], [0.56, 0.68, 0.84, 1.26, 0.32], [0.68, 0.6, 0.8, 0.86, 0.32]],
    roof: [0.2, 0.57],
    parts: ["lip", "splitter", "stripe", "number-roundel", "exhausts", "b-pillar"]
  }
});

export const CAR_MODEL_KEYS = Object.freeze(Object.keys(DESIGNS));

const ROUNDNESS = 3.2;
const ARCH = 1.2; // wheel arch radius, in wheel radii

function pow(value, exponent) {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

/** Catmull-Rom through the design stations, then evenly re-spaced along the car. */
function resample(stations, count) {
  const dense = [];
  for (let index = 0; index < stations.length - 1; index += 1) {
    const p0 = stations[Math.max(0, index - 1)];
    const p1 = stations[index];
    const p2 = stations[index + 1];
    const p3 = stations[Math.min(stations.length - 1, index + 2)];
    for (let step = 0; step < 12; step += 1) {
      const t = step / 12;
      dense.push(p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)));
    }
  }
  dense.push([...stations[stations.length - 1]]);
  // The spline may wobble the share a hair; keep it rising so lookups work.
  for (let index = 1; index < dense.length; index += 1) dense[index][0] = Math.max(dense[index][0], dense[index - 1][0] + 1e-6);
  const from = stations[0][0];
  const to = stations[stations.length - 1][0];
  const out = [];
  let cursor = 0;
  for (let step = 0; step <= count; step += 1) {
    const share = from + ((to - from) * step) / count;
    while (cursor < dense.length - 2 && dense[cursor + 1][0] < share) cursor += 1;
    const a = dense[cursor];
    const b = dense[cursor + 1];
    const t = Math.min(1, Math.max(0, (share - a[0]) / Math.max(1e-9, b[0] - a[0])));
    out.push(a.map((value, k) => (k === 0 ? share : value + (b[k] - value) * t)));
  }
  return out;
}

/** The section of a resampled shell nearest `share`. */
function sectionAt(stations, share) {
  let best = stations[0];
  for (const station of stations) if (Math.abs(station[0] - share) < Math.abs(best[0] - share)) best = station;
  return { share: best[0], half: best[1], bottom: best[2], top: best[3], taper: best[4] };
}

/**
 * A closed shell through rounded cross-sections; z runs rear (−) to nose (+).
 * `wells` (optional) flares the shell over each axle and carves the wheel arch
 * out of it: [{ z, radius, inner, flare }].
 */
function loft(stations, length, ring, wells = []) {
  const positions = [];
  const indices = [];
  const rows = [];
  // A smaller ring before each end rounds the bumpers instead of slicing them flat.
  const first = stations[0];
  const last = stations[stations.length - 1];
  const all = [[first[0] - 0.012, first[1] * 0.62, first[2] + (first[3] - first[2]) * 0.2, first[3] - (first[3] - first[2]) * 0.2, first[4]], ...stations, [last[0] + 0.012, last[1] * 0.62, last[2] + (last[3] - last[2]) * 0.2, last[3] - (last[3] - last[2]) * 0.2, last[4]]];
  for (const [share, half, bottom, top, taper] of all) {
    const z = (share - 0.5) * length;
    let swell = 0;
    let hump = 0;
    for (const well of wells) {
      const away = Math.min(1, Math.abs(z - well.z) / (well.radius * 1.7));
      const near = Math.cos((Math.PI / 2) * away) ** 2;
      swell = Math.max(swell, well.flare * near);
      // A low shell rises into a fender over each wheel, so the tyre is always covered.
      hump = Math.max(hump, Math.max(0, well.wheel + well.radius + 0.035 - top) * Math.min(1, near * 1.6));
    }
    const row = [];
    for (let j = 0; j < ring; j += 1) {
      const angle = (j / ring) * Math.PI * 2;
      const ex = pow(Math.cos(angle), 2 / ROUNDNESS);
      const ey = pow(Math.sin(angle), 2 / ROUNDNESS);
      const up = (ey + 1) / 2;
      let width = Math.max(0.02, half) * (1 - taper * up * up);
      width *= 1 + 0.03 * Math.exp(-(((up - 0.52) / 0.15) ** 2)); // a shoulder line
      if (up < 0.2) width *= 0.92 + 0.08 * (up / 0.2); // tucked sills
      width += swell * (1 - up * 0.7);
      let x = width * ex;
      const outer = Math.min(1, Math.max(0, (Math.abs(ex) - 0.4) / 0.4));
      const y = bottom + (top + hump * outer * outer * (3 - 2 * outer) - bottom) * up;
      for (const well of wells) {
        if (Math.abs(x) <= well.inner) continue;
        // Inside the arch the shell steps in to make the wheel well; the edge is
        // eased over a few centimetres so it reads as a curve, not as steps.
        const depth = (well.radius - Math.hypot(z - well.z, y - well.wheel)) / 0.07;
        if (depth > 0) x = Math.sign(x) * (Math.abs(x) + (well.inner - Math.abs(x)) * Math.min(1, depth));
      }
      row.push(positions.length / 3);
      positions.push(x, y, z);
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let j = 0; j < ring; j += 1) {
      const a = rows[i][j];
      const b = rows[i][(j + 1) % ring];
      const c = rows[i + 1][j];
      const d = rows[i + 1][(j + 1) % ring];
      indices.push(a, c, b, b, c, d);
    }
  }
  for (const end of [0, rows.length - 1]) {
    const [share, , bottom, top] = all[end];
    const centre = positions.length / 3;
    positions.push(0, (bottom + top) / 2, (share - 0.5) * length);
    for (let j = 0; j < ring; j += 1) {
      const a = rows[end][j];
      const b = rows[end][(j + 1) % ring];
      if (end === 0) indices.push(centre, a, b);
      else indices.push(centre, b, a);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function box(width, height, depth, material, x, y, z) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

let shadowTexture = null;
/** A soft round shadow, drawn once and shared by every car. */
function softShadow() {
  if (!shadowTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.62)");
    gradient.addColorStop(0.55, "rgba(0,0,0,0.34)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    shadowTexture = new CanvasTexture(canvas);
  }
  return shadowTexture;
}

function buildWheel(radius, width, materials, detailed) {
  const assembly = new Group(); // stays level: holds the brake caliper
  const spinner = new Group(); // turns with the road
  assembly.add(spinner);
  const tube = radius * 0.3;
  const tyre = new Mesh(new TorusGeometry(radius - tube, tube, detailed ? 12 : 6, detailed ? 28 : 12), materials.tyre);
  tyre.rotation.y = Math.PI / 2;
  tyre.scale.z = width / (tube * 2);
  spinner.add(tyre);
  const barrel = new Mesh(new CylinderGeometry(radius * 0.7, radius * 0.7, width * 0.74, detailed ? 24 : 10), materials.rimDark);
  barrel.rotation.z = Math.PI / 2;
  spinner.add(barrel);
  if (detailed) {
    // Five split spokes, a polished lip on each face and a centre cap.
    for (let spoke = 0; spoke < 5; spoke += 1) {
      for (const lean of [-0.16, 0.16]) {
        const arm = new Mesh(new BoxGeometry(width * 0.82, radius * 0.66, radius * 0.075), materials.rim);
        arm.position.y = radius * 0.36;
        const holder = new Group();
        holder.rotation.x = (spoke / 5) * Math.PI * 2 + lean;
        holder.add(arm);
        spinner.add(holder);
      }
    }
    for (const side of [-1, 1]) {
      const lip = new Mesh(new TorusGeometry(radius * 0.69, radius * 0.035, 6, 28), materials.rim);
      lip.rotation.y = Math.PI / 2;
      lip.position.x = side * width * 0.4;
      spinner.add(lip);
    }
    const cap = new Mesh(new CylinderGeometry(radius * 0.17, radius * 0.17, width * 0.9, 14), materials.accent);
    cap.rotation.z = Math.PI / 2;
    spinner.add(cap);
    const disc = new Mesh(new CylinderGeometry(radius * 0.56, radius * 0.56, width * 0.14, 24), materials.disc);
    disc.rotation.z = Math.PI / 2;
    spinner.add(disc);
    const caliper = new Mesh(new BoxGeometry(width * 0.34, radius * 0.3, radius * 0.5), materials.caliper);
    caliper.position.set(0, radius * 0.18, radius * 0.44);
    assembly.add(caliper);
  } else {
    const face = new Mesh(new CylinderGeometry(radius * 0.52, radius * 0.52, width * 0.8, 8), materials.rim);
    face.rotation.z = Math.PI / 2;
    spinner.add(face);
  }
  return { assembly, spinner };
}

/**
 * Build one car. `paint` overrides the design's colour (Online Race colours,
 * the computer's car); `detail` "low" is the lighter model used for cars in the
 * distance and on slower devices.
 */
const TAIL_REST = 0x8f1822;
const TAIL_NIGHT = 0xc9202d;
const TAIL_BRAKE = 0xff4250;

export function buildCar(modelKey, { paint = null, detail = "high" } = {}) {
  const design = DESIGNS[modelKey] ?? DESIGNS.starter;
  const detailed = detail !== "low";
  const ring = detailed ? 36 : 12;
  const colour = paint ?? design.paint;
  const materials = {
    paint: new MeshStandardMaterial({ color: colour, metalness: 0.62, roughness: 0.24, envMapIntensity: 1.25, side: DoubleSide }),
    glass: new MeshStandardMaterial({ color: 0x0a1420, metalness: 0.9, roughness: 0.06, envMapIntensity: 1.6, side: DoubleSide }),
    accent: new MeshStandardMaterial({ color: design.accent, metalness: 0.45, roughness: 0.4 }),
    dark: new MeshStandardMaterial({ color: 0x0f141b, metalness: 0.25, roughness: 0.65 }),
    trim: new MeshStandardMaterial({ color: 0x1b222c, metalness: 0.5, roughness: 0.45 }),
    tyre: new MeshStandardMaterial({ color: 0x0c0d10, metalness: 0, roughness: 0.94 }),
    rim: new MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.95, roughness: 0.18 }),
    rimDark: new MeshStandardMaterial({ color: 0x232830, metalness: 0.75, roughness: 0.4 }),
    disc: new MeshStandardMaterial({ color: 0x8d99a6, metalness: 0.9, roughness: 0.35 }),
    caliper: new MeshStandardMaterial({ color: design.caliper, metalness: 0.3, roughness: 0.4 }),
    head: new MeshBasicMaterial({ color: 0xfff8e1 }),
    lens: new MeshStandardMaterial({ color: 0xdfeaf5, metalness: 0.4, roughness: 0.08, transparent: true, opacity: 0.55 }),
    // Tail lamps rest dull red and light up under braking (see `brake`); they are lamps, so not tone mapped.
    tail: new MeshBasicMaterial({ color: TAIL_REST, toneMapped: false }),
    plate: new MeshBasicMaterial({ color: 0xf2f5f9 }),
    shadow: new MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false })
  };

  const car = new Group();
  const chassis = new Group(); // pitches and rolls; the wheels stay on the road
  car.add(chassis);
  const length = design.length;
  const lift = design.wheel - 0.31; // bigger wheels raise the whole shell a little
  const wheelWidth = design.wheel * 0.74;

  const body = resample(design.body, detailed ? 96 : 22);
  const cabin = resample(design.cabin, detailed ? 30 : 10);

  // Where each axle is, how wide the shell is there, and the arch cut for it.
  const axles = design.axles.map(share => {
    const section = sectionAt(body, share);
    const track = section.half + design.flare - wheelWidth / 2 + 0.012;
    return { share, z: (share - 0.5) * length, half: section.half + design.flare, track };
  });
  const wells = axles.map(axle => ({ z: axle.z, wheel: design.wheel - lift, radius: design.wheel * ARCH, inner: axle.track - wheelWidth / 2 - 0.05, flare: design.flare }));

  const hull = new Mesh(loft(body, length, ring, detailed ? wells : []), materials.paint);
  hull.position.y = lift;
  hull.castShadow = true;
  chassis.add(hull);
  const canopy = new Mesh(loft(cabin, length, ring), materials.glass);
  canopy.position.y = lift;
  canopy.castShadow = true;
  chassis.add(canopy);

  // Painted roof panel over the middle of the canopy.
  const roofStations = cabin.filter(station => station[0] >= design.roof[0] && station[0] <= design.roof[1]);
  if (roofStations.length >= 2) {
    const roof = new Mesh(loft(roofStations.map(([share, half, , top, taper]) => [share, half * (1 - taper) * 0.99, top - 0.05, top + 0.025, 0.1]), length, ring), materials.paint);
    roof.position.y = lift;
    chassis.add(roof);
  }

  const nose = sectionAt(body, 1);
  const tail = sectionAt(body, 0);
  const bonnet = sectionAt(body, 0.9);
  const boot = sectionAt(body, 0.06);
  // The bumpers are rounded off a little beyond the last section: these are their faces.
  const cap = 0.012 * length;
  const front = length / 2 + cap;
  const rear = -length / 2 - cap;
  /** A painted (or accent) band that follows the shell's own surface between two shares. */
  const band = (stations, from, to, half, material, raise = 0.006) => {
    const run = stations.filter(station => station[0] >= from && station[0] <= to);
    if (run.length < 2) return null;
    const mesh = new Mesh(loft(run.map(([share, , , top]) => [share, half, top - 0.03, top + raise, 0]), length, 10), material);
    mesh.position.y = lift;
    return mesh;
  };
  const widest = Math.max(...design.body.map(station => station[1]));
  const sill = Math.min(...design.body.map(station => station[2]));

  // ---- Lights: what makes a shape read as a car at a glance.
  for (const side of [-1, 1]) {
    const lamp = new Mesh(new SphereGeometry(0.11, 12, 8), materials.head);
    lamp.scale.set(nose.half * 0.42 / 0.11, 0.5, 0.5);
    lamp.position.set(side * nose.half * 0.56, lift + nose.top - 0.09, front - cap - 0.01);
    chassis.add(lamp);
    if (detailed) {
      const cover = new Mesh(new SphereGeometry(0.13, 12, 8), materials.lens);
      cover.scale.copy(lamp.scale).multiplyScalar(1.08);
      cover.position.copy(lamp.position);
      chassis.add(cover);
      chassis.add(box(nose.half * 0.36, 0.018, 0.03, materials.head, side * nose.half * 0.36, lift + nose.bottom + 0.2, front - 0.004)); // running light
    }
    chassis.add(box(tail.half * 0.46, 0.07, 0.07, materials.tail, side * tail.half * 0.6, lift + tail.top - 0.12, rear + cap + 0.005));
  }
  chassis.add(box(tail.half * 1.16, 0.02, 0.04, materials.tail, 0, lift + tail.top - 0.12, rear + 0.012)); // light bar
  chassis.add(box(nose.half * 1.1, 0.12, 0.05, materials.dark, 0, lift + nose.bottom + 0.1, front - 0.018)); // grille
  if (detailed) {
    for (let slat = 0; slat < 3; slat += 1) chassis.add(box(nose.half * 1.0, 0.012, 0.02, materials.rim, 0, lift + nose.bottom + 0.065 + slat * 0.035, front + 0.008));
    chassis.add(box(0.36, 0.1, 0.012, materials.plate, 0, lift + tail.bottom + 0.16, rear - 0.004)); // number plate
    // Door mirrors at the base of the windscreen.
    const screen = sectionAt(cabin, design.cabin[design.cabin.length - 1][0] - 0.06);
    const mirrorZ = (screen.share - 0.5) * length;
    for (const side of [-1, 1]) {
      chassis.add(box(0.14, 0.022, 0.045, materials.trim, side * (screen.half + 0.03), lift + screen.bottom + 0.1, mirrorZ));
      chassis.add(box(0.06, 0.08, 0.12, materials.paint, side * (screen.half + 0.12), lift + screen.bottom + 0.115, mirrorZ - 0.01));
    }
    // Sill skirts and a rear diffuser with fins.
    for (const side of [-1, 1]) chassis.add(box(0.05, 0.07, length * 0.42, materials.dark, side * (widest - 0.03), lift + sill + 0.035, (design.axles[0] + design.axles[1] - 1) * length * 0.5));
    chassis.add(box(tail.half * 1.5, 0.09, 0.26, materials.dark, 0, lift + tail.bottom + 0.02, rear + 0.14));
    for (let fin = -2; fin <= 2; fin += 1) chassis.add(box(0.014, 0.085, 0.24, materials.trim, fin * tail.half * 0.28, lift + tail.bottom + 0.005, rear + 0.12));
  }
  chassis.add(box(widest * 1.6, 0.08, length * 0.5, materials.dark, 0, lift + sill + 0.04, 0)); // floor between the wheels

  // ---- Each car's own details.
  const parts = new Set(detailed ? design.parts : design.parts.filter(part => part === "wing" || part === "ducktail"));
  const screenShare = design.cabin[design.cabin.length - 1][0];
  if (parts.has("stripe")) {
    const stripe = band(body, screenShare + 0.02, 0.985, 0.17, materials.accent);
    if (stripe) chassis.add(stripe);
  }
  if (parts.has("twin-stripe")) {
    for (const side of [-1, 1]) {
      const stripe = band(body, screenShare + 0.02, 0.985, 0.055, materials.accent);
      if (stripe) {
        stripe.position.x = side * 0.13;
        chassis.add(stripe);
      }
    }
  }
  // A painted hoop over the glass: the pillar between front and rear windows.
  if (parts.has("b-pillar")) {
    const middle = (design.roof[0] + design.roof[1]) / 2;
    const hoop = cabin.filter(station => Math.abs(station[0] - middle) <= 0.022);
    if (hoop.length >= 2) {
      const pillar = new Mesh(loft(hoop.map(([share, half, bottom, top, taper]) => [share, half * 1.012, bottom, top + 0.012, taper]), length, ring), materials.paint);
      pillar.position.y = lift;
      chassis.add(pillar);
    }
  }
  if (parts.has("splitter")) chassis.add(box(nose.half * 2.35, 0.03, 0.34, materials.dark, 0, lift + nose.bottom - 0.02, front - 0.1));
  if (parts.has("canards")) {
    for (const side of [-1, 1]) {
      const corner = sectionAt(body, 0.95);
      const canard = box(0.14, 0.016, 0.16, materials.dark, side * (corner.half + 0.03), lift + corner.bottom + 0.1, (0.95 - 0.5) * length);
      canard.rotation.set(0.25, 0, side * -0.2);
      chassis.add(canard);
    }
  }
  if (parts.has("lip")) chassis.add(box(boot.half * 1.8, 0.035, 0.2, materials.dark, 0, lift + boot.top + 0.02, rear + 0.16));
  if (parts.has("ducktail")) {
    const duck = box(boot.half * 1.7, 0.035, 0.24, materials.dark, 0, lift + boot.top + 0.045, rear + 0.2);
    duck.rotation.x = -0.42;
    chassis.add(duck);
  }
  if (parts.has("wing")) {
    for (const side of [-1, 1]) {
      const pylon = box(0.045, 0.36, 0.22, materials.dark, side * widest * 0.5, lift + boot.top + 0.17, rear + 0.36);
      pylon.rotation.x = 0.2;
      chassis.add(pylon);
    }
    const blade = box(widest * 2.04, 0.04, 0.42, materials.accent, 0, lift + boot.top + 0.37, rear + 0.3);
    blade.rotation.x = -0.14;
    chassis.add(blade);
    for (const side of [-1, 1]) chassis.add(box(0.03, 0.2, 0.48, materials.paint, side * widest * 1.01, lift + boot.top + 0.4, rear + 0.3));
  }
  if (parts.has("fins")) {
    for (const side of [-1, 1]) {
      const fin = box(0.035, 0.18, 0.9, materials.paint, side * widest * 0.46, lift + boot.top + 0.04, rear + 0.78);
      fin.rotation.x = 0.12;
      chassis.add(fin);
    }
  }
  if (parts.has("side-intakes")) {
    const middle = sectionAt(body, 0.42);
    for (const side of [-1, 1]) chassis.add(box(0.04, 0.1, 0.4, materials.dark, side * (middle.half + 0.02), lift + middle.bottom + (middle.top - middle.bottom) * 0.36, (0.36 - 0.5) * length));
  }
  if (parts.has("bonnet-vents")) for (const side of [-1, 1]) chassis.add(box(0.2, 0.012, 0.34, materials.dark, side * 0.3, lift + bonnet.top + 0.004, front - length * 0.24));
  if (parts.has("roof-scoop")) {
    const top = sectionAt(cabin, 0.5);
    chassis.add(box(0.26, 0.09, 0.42, materials.dark, 0, lift + top.top + 0.03, (0.47 - 0.5) * length));
  }
  if (parts.has("roof-rails")) {
    const top = sectionAt(cabin, 0.35);
    for (const side of [-1, 1]) chassis.add(box(0.03, 0.03, length * 0.3, materials.trim, side * top.half * 0.62, lift + top.top + 0.03, (0.35 - 0.5) * length));
  }
  if (parts.has("number-roundel")) {
    const middle = sectionAt(body, 0.45);
    for (const side of [-1, 1]) {
      const roundel = new Mesh(new CircleGeometry(0.19, 20), materials.plate);
      roundel.rotation.y = (side * Math.PI) / 2;
      roundel.position.set(side * (middle.half + 0.035), lift + middle.bottom + (middle.top - middle.bottom) * 0.56, (0.44 - 0.5) * length);
      chassis.add(roundel);
    }
  }
  if (parts.has("exhausts")) {
    for (const side of [-1, 1]) {
      const pipe = new Mesh(new CylinderGeometry(0.05, 0.055, 0.18, 12), materials.rim);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * tail.half * 0.42, lift + tail.bottom + 0.05, rear + 0.02);
      chassis.add(pipe);
    }
  }

  // ---- Wheels sit in their carved arches, each with a dark liner.
  const wheels = [];
  const steered = [];
  let tailRest = TAIL_REST;
  for (const axle of axles) {
    for (const side of [-1, 1]) {
      const wheel = buildWheel(design.wheel, wheelWidth, materials, detailed);
      wheel.assembly.position.set(side * axle.track, design.wheel, axle.z);
      wheel.assembly.traverse(node => {
        node.castShadow = true;
      });
      car.add(wheel.assembly);
      wheels.push(wheel.spinner);
      if (axle.share > 0.5) steered.push(wheel.assembly);
      if (detailed) {
        // Kept under the fender, so it never shows through a low bonnet.
        const liner = new Mesh(new CylinderGeometry(design.wheel * (ARCH - 0.02), design.wheel * (ARCH - 0.02), 0.16, 22), materials.dark);
        liner.rotation.z = Math.PI / 2;
        liner.position.set(side * (axle.track - 0.12), design.wheel, axle.z);
        chassis.add(liner);
      }
    }
  }

  const shadow = new Mesh(new CircleGeometry(1, 24), materials.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(widest * 1.55, length * 0.66, 1);
  shadow.position.y = 0.02;
  car.add(shadow);

  return {
    group: car,
    chassis,
    wheels,
    wheelRadius: design.wheel,
    length,
    width: widest * 2,
    height: Math.max(...design.cabin.map(station => station[3])) + lift,
    setPaint(next) {
      materials.paint.color.setHex(next);
    },
    /** Turn the wheels for `metres` of travel. */
    roll(metres) {
      const turn = metres / design.wheel;
      for (const wheel of wheels) wheel.rotation.x += turn;
    },
    /** Point the front wheels `angle` radians off straight ahead. */
    steer(angle) {
      for (const wheel of steered) wheel.rotation.y = angle;
    },
    /** Brake lamps on or off. */
    brake(on) {
      materials.tail.color.setHex(on ? TAIL_BRAKE : tailRest);
    },
    /** After dark the tail lamps are on all the time (brighter still under braking). */
    lamps(night) {
      tailRest = night ? TAIL_NIGHT : TAIL_REST;
      materials.tail.color.setHex(tailRest);
    },
    dispose() {
      car.traverse(node => {
        node.geometry?.dispose?.();
      });
      for (const material of Object.values(materials)) material.dispose();
    }
  };
}
