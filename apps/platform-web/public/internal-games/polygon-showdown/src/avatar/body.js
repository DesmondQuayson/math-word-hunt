// Skin below the head: torso, neck, arms, hands, legs. Feet are not modelled
// because the shoes slot is always filled.

import { Matrix4, Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, clamp, color, lerp, smoothstep, smoothPath, vec } from "./geometry.js";

function addHand(builder, arm, side) {
  const wrist = arm.point(1);
  const tangent = wrist.clone().sub(arm.point(0.92)).normalize();
  const ez = new Vector3(0, 0, 1).addScaledVector(tangent, -tangent.z).normalize();
  const ex = new Vector3().crossVectors(tangent, ez).normalize();
  const matrix = new Matrix4().makeBasis(ex, tangent, ez).setPosition(wrist);
  const inward = side; // local +x points at the body on the right arm
  builder.withMatrix(matrix, () => {
    builder.ellipsoid(0, 0.058, 0, 0.034, 0.072, 0.056, { nu: 10, nv: 7 });
    const fingers = [
      [-0.036, 0.046, 0.0132],
      [-0.013, 0.056, 0.0145],
      [0.011, 0.056, 0.0145],
      [0.034, 0.046, 0.0132]
    ];
    for (const [z, length, radius] of fingers) {
      const start = vec(0, 0.1, z);
      const path = smoothPath([start, vec(inward * 0.004, 0.1 + length * 0.55, z * 1.04), vec(inward * 0.018, 0.1 + length, z * 1.06)], 3);
      builder.tube(path, radius, { radial: 5, capStart: false, capEnd: "round" });
    }
    const thumb = smoothPath([vec(inward * 0.008, 0.04, 0.044), vec(inward * 0.022, 0.082, 0.072), vec(inward * 0.03, 0.122, 0.078)], 3);
    builder.tube(thumb, (t) => lerp(0.02, 0.0155, t), { radial: 5, capStart: false, capEnd: "round" });
  });
}

export function buildBodyGeometry(frame) {
  const builder = new MeshBuilder();
  const nv = 22;
  builder.grid(
    28,
    nv,
    (u, v, out, i, j) => {
      const a = TAU * u;
      const y = lerp(frame.torsoBottom, frame.torsoTop, v);
      const ring = frame.torsoAt(y);
      const scale = j === 0 || j === nv ? 0 : 1;
      out.set(Math.sin(a) * ring.rx * scale, y, ring.cz + Math.cos(a) * ring.rz * scale);
    },
    { wrapU: true, poleStart: true, poleEnd: true }
  );
  builder.lathe(
    [
      [0.118, 1.37],
      [0.11, 1.44],
      [0.106, 1.52],
      [0.108, 1.6],
      [0.118, 1.72]
    ],
    {
      nu: 16,
      cz: -0.012,
      colorAt: (u, v, c) => c.setScalar(lerp(1, 0.66, smoothstep(0.32, 0.62, v)))
    }
  );
  for (const side of [1, -1]) {
    const arm = frame.arms[side];
    builder.tube(arm.slice(0, 1, 13), (t) => arm.radius(t), { radial: 10, capStart: "round", capEnd: false });
    addHand(builder, arm, side);
    const leg = frame.legs[side];
    builder.tube(leg.slice(0, 1, 14), (t) => leg.radius(t), { radial: 12, capStart: false, capEnd: false });
    // The ankle runs on down into the shoe, so no cut end ever shows.
    const ankle = leg.point(1);
    builder.tube([ankle, ankle.clone().add(vec(0, -0.08, 0.01))], leg.radius(1), { radial: 12, capStart: false, capEnd: "flat" });
  }
  return builder.toGeometry();
}

/**
 * A display form for products: a closed torso with an optional neck, or a
 * wrist. Clothes are built round the same frame, so they fit it exactly.
 */
export function buildFormGeometry(frame, form) {
  const builder = new MeshBuilder();
  const tint = color(form.tint);
  if (form.kind === "wrist") {
    const arm = frame.arms[1];
    builder.tube(arm.slice(0.74, 1, 8), (t) => lerp(arm.radius(0.74), arm.radius(1), t), { radial: 18, capStart: "round", capEnd: "round", tint });
    return builder.toGeometry();
  }
  const low = clamp(form.from, frame.torsoBottom, frame.torsoTop);
  const high = clamp(form.to, low + 0.01, frame.torsoTop);
  const rows = 18;
  builder.grid(
    30,
    rows,
    (u, v, out, i, j) => {
      const a = TAU * u;
      const y = lerp(low, high, Math.max(j - 1, 0) / (rows - 1));
      const ring = frame.torsoAt(y);
      const end = j === 0 ? 0 : j === rows && !form.neck ? 0.96 : 1;
      out.set(Math.sin(a) * ring.rx * end, y, ring.cz + Math.cos(a) * ring.rz * end);
    },
    { wrapU: true, poleStart: true, tint }
  );
  if (!form.neck) {
    // Close the waist with a flat disc.
    const ring = frame.torsoAt(high);
    builder.grid(30, 1, (u, v, out, i, j) => {
      const a = TAU * u;
      out.set(Math.sin(a) * ring.rx * 0.96 * (1 - j), high, ring.cz + Math.cos(a) * ring.rz * 0.96 * (1 - j));
    }, { wrapU: true, poleEnd: true, tint });
  }
  if (form.neck) {
    builder.lathe(
      [
        [0.098, 1.445],
        [0.104, 1.5],
        [0.108, 1.56],
        [0.112, 1.64],
        [0.1, 1.668],
        [0.062, 1.682],
        [0, 1.686]
      ],
      { nu: 20, cz: -0.012, tint, poleEnd: true }
    );
  }
  return builder.toGeometry();
}
