// Original MathNexa car models, built from numbers: no downloaded mesh, no
// third-party design. Each car is a lofted body (rounded cross-sections placed
// along its length), a glass canopy, a roof panel, four spoked wheels and its
// own details, so the four garage cars have four different silhouettes. The
// garage preview and the race use this same builder: what is shown is what is
// driven.

import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TorusGeometry
} from "../../../math-tug-of-war/src/vendor/three.js";
import { PAINTS } from "../palette.js";

export { PAINTS };

/**
 * Every station is [share along the car (0 rear, 1 nose), half width, bottom, top, top taper].
 * `body` is painted; `cabin` is glass; `roof` (shares of the cabin) is painted.
 */
const DESIGNS = Object.freeze({
  // A friendly, upright hatchback.
  starter: {
    length: 3.9,
    wheel: 0.31,
    track: 0.78,
    axles: [0.19, 0.8],
    paint: PAINTS.turquoise,
    accent: 0xffffff,
    body: [[0, 0.68, 0.42, 0.8, 0.1], [0.06, 0.82, 0.3, 0.93, 0.12], [0.25, 0.86, 0.26, 0.98, 0.14], [0.5, 0.86, 0.24, 0.96, 0.14], [0.75, 0.84, 0.25, 0.86, 0.16], [0.93, 0.78, 0.3, 0.74, 0.2], [1, 0.6, 0.4, 0.64, 0.22]],
    cabin: [[0.07, 0.6, 0.9, 1.0, 0.2], [0.15, 0.72, 0.9, 1.4, 0.28], [0.4, 0.73, 0.9, 1.46, 0.3], [0.55, 0.71, 0.88, 1.36, 0.3], [0.7, 0.62, 0.84, 0.9, 0.3]],
    roof: [0.14, 0.56],
    parts: ["stripe"]
  },
  // A low wedge with a ducktail.
  "turbo-sprint": {
    length: 4.3,
    wheel: 0.33,
    track: 0.84,
    axles: [0.2, 0.8],
    paint: 0xa3e635,
    accent: 0x0b1622,
    body: [[0, 0.74, 0.4, 0.82, 0.1], [0.05, 0.88, 0.28, 0.92, 0.12], [0.22, 0.92, 0.22, 0.94, 0.14], [0.5, 0.92, 0.2, 0.84, 0.14], [0.75, 0.9, 0.2, 0.7, 0.16], [0.94, 0.84, 0.22, 0.54, 0.2], [1, 0.66, 0.3, 0.44, 0.22]],
    cabin: [[0.14, 0.56, 0.86, 0.94, 0.3], [0.28, 0.7, 0.86, 1.22, 0.34], [0.45, 0.72, 0.84, 1.25, 0.34], [0.63, 0.64, 0.76, 0.8, 0.34]],
    roof: [0.26, 0.47],
    parts: ["ducktail", "splitter", "stripe"]
  },
  // A long-bonnet grand tourer with a fastback.
  "velocity-gt": {
    length: 4.65,
    wheel: 0.35,
    track: 0.86,
    axles: [0.17, 0.78],
    paint: 0xff4f9a,
    accent: 0x1a0a14,
    body: [[0, 0.78, 0.38, 0.86, 0.1], [0.06, 0.9, 0.26, 0.94, 0.12], [0.25, 0.94, 0.22, 0.96, 0.14], [0.5, 0.94, 0.2, 0.88, 0.14], [0.78, 0.92, 0.2, 0.8, 0.15], [0.95, 0.86, 0.22, 0.66, 0.2], [1, 0.7, 0.3, 0.54, 0.22]],
    cabin: [[0.03, 0.46, 0.88, 0.92, 0.3], [0.18, 0.68, 0.9, 1.2, 0.36], [0.34, 0.72, 0.88, 1.27, 0.36], [0.48, 0.7, 0.84, 1.16, 0.36], [0.59, 0.62, 0.8, 0.84, 0.36]],
    roof: [0.16, 0.36],
    parts: ["lip", "vents", "exhausts", "splitter"]
  },
  // A wide, low hypercar with a canopy and a tall wing.
  "thunder-x": {
    length: 4.5,
    wheel: 0.36,
    track: 0.92,
    axles: [0.19, 0.8],
    paint: 0x6d28d9,
    accent: 0xffc93c,
    body: [[0, 0.84, 0.34, 0.78, 0.08], [0.05, 0.96, 0.24, 0.86, 0.1], [0.25, 1.0, 0.18, 0.84, 0.12], [0.5, 0.98, 0.16, 0.7, 0.14], [0.75, 0.96, 0.16, 0.58, 0.16], [0.93, 0.9, 0.18, 0.44, 0.2], [1, 0.74, 0.24, 0.36, 0.22]],
    cabin: [[0.28, 0.44, 0.76, 0.82, 0.4], [0.41, 0.64, 0.72, 1.08, 0.46], [0.55, 0.64, 0.66, 1.1, 0.46], [0.7, 0.52, 0.56, 0.7, 0.46]],
    roof: [0.4, 0.56],
    parts: ["wing", "fins", "splitter", "stripe", "exhausts"]
  },
  // Online Race: one touring car for everybody, in the racer's own colour.
  "circuit-standard": {
    length: 4.3,
    wheel: 0.33,
    track: 0.82,
    axles: [0.19, 0.8],
    paint: PAINTS.white,
    accent: 0x0b1622,
    body: [[0, 0.72, 0.4, 0.84, 0.1], [0.06, 0.86, 0.28, 0.94, 0.12], [0.25, 0.9, 0.24, 0.96, 0.14], [0.5, 0.9, 0.22, 0.92, 0.14], [0.76, 0.88, 0.22, 0.8, 0.16], [0.94, 0.82, 0.26, 0.66, 0.2], [1, 0.64, 0.34, 0.56, 0.22]],
    cabin: [[0.1, 0.56, 0.88, 0.96, 0.24], [0.22, 0.7, 0.88, 1.3, 0.32], [0.42, 0.72, 0.88, 1.36, 0.32], [0.56, 0.7, 0.84, 1.26, 0.32], [0.68, 0.62, 0.8, 0.86, 0.32]],
    roof: [0.2, 0.57],
    parts: ["lip", "splitter", "stripe"]
  }
});

export const CAR_MODEL_KEYS = Object.freeze(Object.keys(DESIGNS));

const ROUNDNESS = 3.4;

function pow(value, exponent) {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

/** Catmull-Rom through the design stations, so twelve numbers give a smooth hull. */
function refine(stations, steps) {
  const out = [];
  for (let index = 0; index < stations.length - 1; index += 1) {
    const p0 = stations[Math.max(0, index - 1)];
    const p1 = stations[index];
    const p2 = stations[index + 1];
    const p3 = stations[Math.min(stations.length - 1, index + 2)];
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      out.push(p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)));
    }
  }
  out.push([...stations[stations.length - 1]]);
  return out;
}

/** A closed hull through rounded cross-sections. z runs rear (−) to nose (+). */
function loft(stations, length, ring) {
  const positions = [];
  const indices = [];
  for (const [share, half, bottom, top, taper] of stations) {
    const z = (share - 0.5) * length;
    for (let j = 0; j < ring; j += 1) {
      const angle = (j / ring) * Math.PI * 2;
      const ex = pow(Math.cos(angle), 2 / ROUNDNESS);
      const ey = pow(Math.sin(angle), 2 / ROUNDNESS);
      const up = (ey + 1) / 2;
      positions.push(Math.max(0.02, half) * ex * (1 - taper * up * up), bottom + (top - bottom) * up, z);
    }
  }
  for (let i = 0; i < stations.length - 1; i += 1) {
    for (let j = 0; j < ring; j += 1) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = a + ring;
      const d = b + ring;
      indices.push(a, c, b, b, c, d);
    }
  }
  // End caps.
  for (const end of [0, stations.length - 1]) {
    const [share, , bottom, top] = stations[end];
    const centre = positions.length / 3;
    positions.push(0, (bottom + top) / 2, (share - 0.5) * length);
    for (let j = 0; j < ring; j += 1) {
      const a = end * ring + j;
      const b = end * ring + ((j + 1) % ring);
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

function buildWheel(radius, width, materials, detailed) {
  const wheel = new Group();
  const tube = radius * 0.3;
  const tyre = new Mesh(new TorusGeometry(radius - tube, tube, detailed ? 10 : 6, detailed ? 22 : 12), materials.tyre);
  tyre.rotation.y = Math.PI / 2;
  tyre.scale.z = width / (tube * 2);
  wheel.add(tyre);
  const rim = new Mesh(new CylinderGeometry(radius * 0.66, radius * 0.66, width * 0.72, detailed ? 18 : 10), materials.rimDark);
  rim.rotation.z = Math.PI / 2;
  wheel.add(rim);
  if (detailed) {
    for (let spoke = 0; spoke < 5; spoke += 1) {
      const arm = new Mesh(new BoxGeometry(width * 0.8, radius * 1.22, radius * 0.16), materials.rim);
      arm.rotation.x = (spoke / 5) * Math.PI;
      wheel.add(arm);
    }
    const hub = new Mesh(new CylinderGeometry(radius * 0.2, radius * 0.2, width * 0.86, 12), materials.accent);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
  } else {
    const face = new Mesh(new CylinderGeometry(radius * 0.5, radius * 0.5, width * 0.8, 8), materials.rim);
    face.rotation.z = Math.PI / 2;
    wheel.add(face);
  }
  return wheel;
}

/**
 * Build one car. `paint` overrides the design's colour (Online Race colours,
 * the computer's car); `detail` "low" is the lighter model used for cars in the
 * distance and on slower devices.
 */
export function buildCar(modelKey, { paint = null, detail = "high" } = {}) {
  const design = DESIGNS[modelKey] ?? DESIGNS.starter;
  const detailed = detail !== "low";
  const ring = detailed ? 18 : 10;
  const steps = detailed ? 4 : 2;
  const colour = paint ?? design.paint;
  const materials = {
    paint: new MeshStandardMaterial({ color: colour, metalness: 0.55, roughness: 0.3, side: DoubleSide }),
    glass: new MeshStandardMaterial({ color: 0x0c1826, metalness: 0.85, roughness: 0.1, side: DoubleSide }),
    accent: new MeshStandardMaterial({ color: design.accent, metalness: 0.4, roughness: 0.45 }),
    dark: new MeshStandardMaterial({ color: 0x10151c, metalness: 0.2, roughness: 0.7 }),
    tyre: new MeshStandardMaterial({ color: 0x0e0f12, metalness: 0, roughness: 0.92 }),
    rim: new MeshStandardMaterial({ color: 0xd6dde6, metalness: 0.9, roughness: 0.22 }),
    rimDark: new MeshStandardMaterial({ color: 0x2a3038, metalness: 0.7, roughness: 0.4 }),
    head: new MeshBasicMaterial({ color: 0xfff6d8 }),
    tail: new MeshBasicMaterial({ color: 0xff2d3d })
  };

  const car = new Group();
  const chassis = new Group(); // pitches and rolls; the wheels stay on the road
  car.add(chassis);
  const length = design.length;
  const lift = design.wheel - 0.31; // bigger wheels raise the whole shell a little

  const hull = new Mesh(loft(refine(design.body, steps), length, ring), materials.paint);
  hull.position.y = lift;
  chassis.add(hull);
  const canopy = new Mesh(loft(refine(design.cabin, steps), length, ring), materials.glass);
  canopy.position.y = lift;
  chassis.add(canopy);

  // Painted roof panel over the middle of the canopy.
  const cabin = refine(design.cabin, steps).filter(station => station[0] >= design.roof[0] && station[0] <= design.roof[1]);
  if (cabin.length >= 2) {
    const roof = new Mesh(loft(cabin.map(([share, half, , top, taper]) => [share, half * (1 - taper) * 0.98, top - 0.05, top + 0.025, 0.1]), length, ring), materials.paint);
    roof.position.y = lift;
    chassis.add(roof);
  }

  const nose = design.body[design.body.length - 1];
  const tail = design.body[0];
  const front = length / 2;
  const rear = -length / 2;
  const widest = Math.max(...design.body.map(station => station[1]));

  // Lights: what makes a shape read as a car at a glance.
  for (const side of [-1, 1]) {
    chassis.add(box(nose[1] * 0.5, 0.07, 0.06, materials.head, side * nose[1] * 0.62, lift + nose[3] - 0.06, front - 0.05));
    chassis.add(box(tail[1] * 0.55, 0.07, 0.06, materials.tail, side * tail[1] * 0.6, lift + tail[3] - 0.08, rear + 0.04));
  }
  chassis.add(box(nose[1] * 1.1, 0.12, 0.05, materials.dark, 0, lift + nose[2] + 0.1, front - 0.02)); // grille
  chassis.add(box(widest * 1.7, 0.1, length * 0.5, materials.dark, 0, lift + 0.2, 0)); // floor between the wheels

  const parts = new Set(detailed ? design.parts : design.parts.filter(part => part === "wing" || part === "ducktail"));
  if (parts.has("stripe")) {
    const bonnet = design.body[design.body.length - 2];
    chassis.add(box(0.34, 0.012, length * 0.26, materials.accent, 0, lift + bonnet[3] + 0.004, front - length * 0.17));
  }
  if (parts.has("splitter")) chassis.add(box(nose[1] * 2.3, 0.035, 0.32, materials.dark, 0, lift + nose[2] - 0.02, front - 0.1));
  if (parts.has("lip")) chassis.add(box(tail[1] * 1.9, 0.04, 0.2, materials.dark, 0, lift + tail[3] + 0.03, rear + 0.14));
  if (parts.has("ducktail")) {
    const duck = box(tail[1] * 2.0, 0.07, 0.34, materials.paint, 0, lift + tail[3] + 0.1, rear + 0.2);
    duck.rotation.x = -0.32;
    chassis.add(duck);
  }
  if (parts.has("wing")) {
    for (const side of [-1, 1]) chassis.add(box(0.05, 0.36, 0.2, materials.dark, side * widest * 0.55, lift + tail[3] + 0.2, rear + 0.34));
    const blade = box(widest * 2.02, 0.045, 0.4, materials.accent, 0, lift + tail[3] + 0.4, rear + 0.3);
    blade.rotation.x = -0.14;
    chassis.add(blade);
    for (const side of [-1, 1]) chassis.add(box(0.035, 0.17, 0.44, materials.paint, side * widest * 1.0, lift + tail[3] + 0.43, rear + 0.3));
  }
  if (parts.has("fins")) {
    for (const side of [-1, 1]) {
      const fin = box(0.04, 0.2, 0.9, materials.paint, side * widest * 0.5, lift + tail[3] + 0.06, rear + 0.75);
      fin.rotation.x = 0.12;
      chassis.add(fin);
    }
  }
  if (parts.has("vents")) {
    for (const side of [-1, 1]) chassis.add(box(0.03, 0.14, 0.5, materials.dark, side * (widest - 0.005), lift + 0.52, length * 0.1));
  }
  if (parts.has("exhausts")) {
    for (const side of [-1, 1]) {
      const pipe = new Mesh(new CylinderGeometry(0.055, 0.055, 0.16, 10), materials.rim);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * 0.3, lift + tail[2] + 0.05, rear + 0.02);
      chassis.add(pipe);
    }
  }

  // Wheels, with a dark arch liner behind each so they sit "in" the body.
  const wheels = [];
  const wheelWidth = design.wheel * 0.72;
  for (const share of design.axles) {
    for (const side of [-1, 1]) {
      const wheel = buildWheel(design.wheel, wheelWidth, materials, detailed);
      wheel.position.set(side * design.track, design.wheel, (share - 0.5) * length);
      car.add(wheel);
      wheels.push(wheel);
      const arch = new Mesh(new CylinderGeometry(design.wheel * 1.16, design.wheel * 1.16, 0.3, detailed ? 18 : 10), materials.dark);
      arch.rotation.z = Math.PI / 2;
      arch.position.set(side * (design.track - 0.16), design.wheel + 0.02 + lift, (share - 0.5) * length);
      chassis.add(arch);
    }
  }

  const shadow = new Mesh(new CircleGeometry(1, 20), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(widest * 1.25, length * 0.56, 1);
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
    dispose() {
      car.traverse(node => {
        node.geometry?.dispose?.();
      });
      for (const material of Object.values(materials)) material.dispose();
      shadow.material.dispose();
    }
  };
}
