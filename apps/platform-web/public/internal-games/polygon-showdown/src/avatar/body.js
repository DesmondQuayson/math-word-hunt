// Skin below the head: torso, neck, arms, hands, legs. Feet are not modelled
// because the shoes slot is always filled.

import { Matrix4, Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, lerp, smoothstep, smoothPath, vec } from "./geometry.js";

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
