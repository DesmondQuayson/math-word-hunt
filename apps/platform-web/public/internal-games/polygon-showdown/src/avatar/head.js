// The head as one radial function. Everything that sits on the face (brows,
// lips, beards, hairlines, hats) samples this function, so it hugs the same
// surface the skin is drawn on.

import { Matrix4, Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, clamp, lerp, smoothstep } from "./geometry.js";

const HEAD_A = 0.438;
const HEAD_B = 0.432;
const HEAD_C = 0.412;

const rad = (degrees) => (degrees * Math.PI) / 180;

export const EYE = Object.freeze({ yaw: 0.47, pitch: -0.075, radius: 0.108, sink: 0.56, corner: rad(54) });
export const NOSE_PITCH = -0.33;
export const MOUTH_PITCH = -0.665;
export const MOUTH_YAW = 0.33;

const EYE_X = Math.sin(EYE.yaw) * Math.cos(EYE.pitch);
const EYE_Y = Math.sin(EYE.pitch);
const NOSE_Y = Math.sin(NOSE_PITCH);
const MOUTH_Y = Math.sin(MOUTH_PITCH);

// The face texture is a frontal projection of this window of the head.
export const FACE_WINDOW = Object.freeze({ width: 1.0, height: 1.0, centerY: -0.04 });

const bump = (x, y, x0, y0, wx, wy, amount) => {
  const a = (x - x0) / wx;
  const b = (y - y0) / wy;
  return amount * Math.exp(-(a * a + b * b));
};

// Features in the frontal plane of the unit direction: no yaw/pitch pole to
// pinch the chin. x is mirrored, so the face is symmetric by construction.
function featureOffset(dx, dy) {
  const x = Math.abs(dx);
  let f = 0;
  f += bump(x, dy, 0, 0.56, 0.85, 0.33, 0.016); // forehead
  f += bump(x, dy, 0.55, -0.44, 0.34, 0.28, 0.058); // cheeks
  f += bump(x, dy, EYE_X, EYE_Y, 0.2, 0.17, -0.05); // sockets
  f += bump(x, dy, 0.32, 0.27, 0.38, 0.075, 0.016); // brow ridge
  f += bump(x, dy, 0, -0.14, 0.05, 0.17, 0.016); // nose bridge
  f += bump(x, dy, 0, NOSE_Y, 0.078, 0.07, 0.08); // nose tip
  f += bump(x, dy, 0.098, NOSE_Y - 0.038, 0.046, 0.04, 0.032); // nostril wings
  f += bump(x, dy, 0, MOUTH_Y, 0.29, 0.13, 0.022); // mouth mound
  f += bump(x, dy, 0, -0.79, 0.18, 0.045, -0.01); // under the lip
  f += bump(x, dy, 0, -0.9, 0.28, 0.12, 0.016); // chin
  return f;
}

export function headRadius(dx, dy, dz) {
  const q = (dx * dx) / (HEAD_A * HEAD_A) + (dy * dy) / (HEAD_B * HEAD_B) + (dz * dz) / (HEAD_C * HEAD_C);
  let r = 1 / Math.sqrt(q);
  r *= 1 - 0.09 * smoothstep(0.2, -0.8, dy) * Math.abs(dx);
  r *= 1 - 0.13 * smoothstep(0.1, -0.8, dy) * smoothstep(0.15, -0.8, dz);
  if (dz > 0) r *= 1 + featureOffset(dx, dy) * smoothstep(0, 0.35, dz);
  return r;
}

function anglesToDir(yaw, pitch, out = new Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

/** A point on the head surface, `lift` above it. */
export function headPoint(yaw, pitch, lift = 0, out = new Vector3()) {
  anglesToDir(yaw, pitch, out);
  return out.multiplyScalar(headRadius(out.x, out.y, out.z) + lift);
}

/** Point with polar angle from the crown and azimuth from the nose. */
export function crownPoint(azimuth, polar, lift = 0, out = new Vector3()) {
  const sp = Math.sin(polar);
  out.set(Math.sin(azimuth) * sp, Math.cos(polar), Math.cos(azimuth) * sp);
  return out.multiplyScalar(headRadius(out.x, out.y, out.z) + lift);
}

function faceUV(u, v, out, p) {
  if (p.z < -0.02) out.set(0.003, 0.003);
  else out.set(p.x / FACE_WINDOW.width + 0.5, (p.y - FACE_WINDOW.centerY) / FACE_WINDOW.height + 0.5);
}

export function eyeFrame(side) {
  const dir = anglesToDir(side * EYE.yaw, EYE.pitch);
  const surface = dir.clone().multiplyScalar(headRadius(dir.x, dir.y, dir.z));
  const forward = new Vector3(side * 0.13, 0.015, 1).normalize();
  const center = surface.clone().addScaledVector(forward, -EYE.radius * EYE.sink);
  const ex = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize();
  const ey = new Vector3().crossVectors(forward, ex).normalize();
  return { side, center, forward, ex, ey };
}

export function eyePoint(frame, alpha, beta, radius, out = new Vector3()) {
  const cb = Math.cos(beta);
  const x = Math.sin(alpha) * cb * radius;
  const y = Math.sin(beta) * radius;
  const z = Math.cos(alpha) * cb * radius;
  return out.copy(frame.center).addScaledVector(frame.ex, x).addScaledVector(frame.ey, y).addScaledVector(frame.forward, z);
}

export function upperLidElevation(alpha, side) {
  const s = clamp((alpha * side) / EYE.corner, -1, 1);
  const corner = lerp(rad(-10), rad(8), (s + 1) / 2);
  return corner + rad(34) * Math.pow(1 - s * s, 0.62);
}

export function lowerLidElevation(alpha, side) {
  const s = clamp((alpha * side) / EYE.corner, -1, 1);
  const corner = lerp(rad(-10), rad(8), (s + 1) / 2);
  return corner - rad(25) * Math.pow(1 - s * s, 0.8);
}

/** Surface normal of the skin in a given direction, by finite differences. */
function headNormal(direction, out = new Vector3()) {
  const d = direction.clone().normalize();
  const helper = Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const t1 = new Vector3().crossVectors(helper, d).normalize();
  const t2 = new Vector3().crossVectors(d, t1).normalize();
  const sample = (a, b) => {
    const p = d.clone().addScaledVector(t1, a).addScaledVector(t2, b).normalize();
    return p.multiplyScalar(headRadius(p.x, p.y, p.z));
  };
  const step = 0.012;
  const a = sample(step, 0).sub(sample(-step, 0));
  const b = sample(0, step).sub(sample(0, -step));
  return out.crossVectors(a, b).normalize();
}

function addLid(builder, frame, upper) {
  const firstVertex = builder.vertexCount;
  const limit = rad(82);
  const far = upper ? rad(78) : rad(-78);
  const sign = upper ? 1 : -1;
  const radius = EYE.radius;
  const nv = 5;
  const columns = 20;
  builder.grid(
    columns,
    nv,
    (u, v, out, i, j) => {
      const alpha = lerp(-limit, limit, u);
      const edge = upper ? upperLidElevation(alpha, frame.side) : lowerLidElevation(alpha, frame.side);
      if (j === 0) {
        eyePoint(frame, alpha, edge, radius * 0.985, out);
      } else if (j === 1) {
        eyePoint(frame, alpha, edge + sign * rad(2.2), radius * 1.05, out);
      } else {
        // An apron from the lid edge down onto the skin: no crease, no pouch.
        const t = (j - 1) / (nv - 1);
        eyePoint(frame, alpha, lerp(edge + sign * rad(2.2), far, t), radius * (1.05 + (upper ? 0.02 * Math.sin(Math.PI * t) : 0)), out);
        const length = out.length();
        const skin = headRadius(out.x / length, out.y / length, out.z / length) - 0.002;
        out.multiplyScalar(lerp(length, skin, Math.pow(t, upper ? 1.6 : 0.8)) / length);
      }
    },
    { flip: !upper, uvAt: faceUV }
  );
  // Aprons take the skin's shading as they leave the lid, so no dark ring.
  const stride = columns + 1;
  const P = new Vector3();
  const N = new Vector3();
  for (let j = 2; j <= nv; j += 1) {
    const weight = smoothstep(0, upper ? 0.9 : 0.45, (j - 1) / (nv - 1));
    for (let i = 0; i <= columns; i += 1) {
      const index = firstVertex + j * stride + i;
      P.set(builder.positions[index * 3], builder.positions[index * 3 + 1], builder.positions[index * 3 + 2]);
      headNormal(P, N);
      for (let n = 0; n < 3; n += 1) builder.normals[index * 3 + n] = lerp(builder.normals[index * 3 + n], N.getComponent(n), weight);
    }
  }
}

function earFrame() {
  const base = headPoint(1.6, -0.08, -0.03);
  const out = new Vector3(Math.cos(0.42), 0.05, Math.sin(0.42)).normalize();
  const up = new Vector3(0.0, 1, -0.16).normalize();
  const side = new Vector3().crossVectors(up, out).normalize();
  const trueUp = new Vector3().crossVectors(out, side).normalize();
  return { base, out, trueUp, matrix: new Matrix4().makeBasis(side, trueUp, out).setPosition(base) };
}

/** The point on an earlobe where an earring hangs (head space). */
export function earLobe(side) {
  const { base, out, trueUp } = earFrame();
  const point = base.clone().addScaledVector(trueUp, -0.098).addScaledVector(out, 0.028);
  point.x *= side;
  return point;
}

function addEar(builder) {
  const { matrix } = earFrame();
  const rx = 0.078;
  const ry = 0.125;
  const rz = 0.036;
  builder.withMatrix(matrix, () => {
    builder.grid(
      14,
      10,
      (u, v, p) => {
        const a = TAU * u;
        const phi = Math.PI * v - Math.PI / 2;
        const cp = Math.cos(phi);
        // A pear shape: wide helix on top, a soft lobe below.
        const pear = 1 - 0.3 * smoothstep(-0.2, -1, Math.sin(phi));
        let x = Math.sin(a) * cp * rx * pear;
        const y = Math.sin(phi) * ry;
        let z = Math.cos(a) * cp * rz;
        const inPlane = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry));
        if (z > 0) z -= 0.05 * smoothstep(0.82, 0.36, inPlane);
        x += 0.018 * smoothstep(-0.2, 1, y / ry) * (1 - 0.4 * cp);
        p.set(x, y, z + 0.02);
      },
      { wrapU: true, poleStart: true, poleEnd: true, uvAt: faceUV }
    );
  });
}

/** Skin of the head: skull, lids, ears. One mesh with one face texture. */
export function buildHeadGeometry() {
  const builder = new MeshBuilder();
  const nu = 60;
  const nv = 42;
  builder.grid(
    nu,
    nv,
    (u, v, out) => {
      const t = Math.PI * Math.pow(v, 1.28);
      const s = TAU * u;
      const st = Math.sin(t);
      const dx = st * Math.cos(s);
      const dy = st * Math.sin(s);
      const dz = Math.cos(t);
      const r = headRadius(dx, dy, dz);
      out.set(dx * r, dy * r, dz * r);
    },
    { wrapU: true, poleStart: true, poleEnd: true, flip: true, uvAt: faceUV }
  );
  addLid(builder, eyeFrame(1), true);
  addLid(builder, eyeFrame(1), false);
  addLid(builder, eyeFrame(-1), true);
  addLid(builder, eyeFrame(-1), false);
  builder.mirrorX(() => addEar(builder));
  return builder.toGeometry();
}

/** Both eyeballs; the shared eye texture paints sclera, iris and glints. */
export function buildEyesGeometry() {
  const builder = new MeshBuilder();
  for (const side of [1, -1]) {
    const frame = eyeFrame(side);
    builder.grid(
      26,
      12,
      (u, v, out) => {
        // Only the part behind the lids' opening is a true sphere; past it the
        // ball pulls in so it can never poke through the lid aprons.
        const t = 1.75 * v;
        const s = TAU * u;
        const st = Math.sin(t);
        const lx = st * Math.cos(s);
        const ly = st * Math.sin(s);
        const lz = Math.cos(t);
        const alpha = Math.atan2(lx, lz);
        const beta = Math.asin(clamp(ly, -1, 1));
        const margin = Math.max(beta - upperLidElevation(alpha, side), lowerLidElevation(alpha, side) - beta, Math.abs(alpha) - EYE.corner);
        const radius = EYE.radius * lerp(1, 0.62, smoothstep(0.02, 0.2, margin));
        out.copy(frame.center);
        out.addScaledVector(frame.ex, lx * radius);
        out.addScaledVector(frame.ey, ly * radius);
        out.addScaledVector(frame.forward, lz * radius);
      },
      {
        wrapU: true,
        poleStart: true,
        flip: true,
        uvAt: (u, v, uv) => {
          const t = 1.75 * v;
          const s = TAU * u;
          const st = Math.sin(t);
          uv.set(0.5 + 0.5 * st * Math.cos(s), 0.5 + 0.5 * st * Math.sin(s));
        }
      }
    );
  }
  return builder.toGeometry();
}
