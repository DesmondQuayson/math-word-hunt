// Hats, glasses and jewelry. Head-worn items are in head space (origin at the
// centre of the head), so they follow it wherever the figure is posed.

import { Matrix4, Quaternion, Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, clamp, color, lerp, mixColor, shade, smoothPath, smoothstep, vec } from "./geometry.js";
import { earLobe } from "./head.js";
import { addSparkle } from "./hair.js";

const PI = Math.PI;

// --- how each hat presses the hair under it --------------------------------

const rimLine = (y, tilt) => (z) => y + tilt * clamp(z / 0.42, -1, 1);

const HATS = Object.freeze({
  cap: { rim: rimLine(0.158, 0.085), rx: 0.462, ry: 0.482, rz: 0.442, cy: 0, flare: 0.5 },
  beanie: { rim: rimLine(0.1, 0.1), rx: 0.482, ry: 0.53, rz: 0.46, cy: 0, flare: 0.45 },
  bucket: { rim: rimLine(0.17, 0.05), rx: 0.468, ry: 0.54, rz: 0.446, cy: 0, flare: 0.3 },
  fedora: { rim: rimLine(0.2, 0.045), rx: 0.466, ry: 0.56, rz: 0.446, cy: 0, flare: 0.3 },
  sunhat: { rim: rimLine(0.21, 0.04), rx: 0.47, ry: 0.5, rz: 0.45, cy: 0, flare: 0.2 },
  cone: { rim: rimLine(0.21, 0.05), rx: 0.462, ry: 0.5, rz: 0.442, cy: 0, flare: 0.3 }
});

/** The instructions hair.js uses to fit under this hat, or null. */
export function hatFit(model) {
  const hat = HATS[model];
  // Above the rim all hair is pressed close to the scalp, under any hat shape.
  if (hat) {
    const k = Math.sqrt(Math.max(0, 1 - (hat.rim(0) * hat.rim(0)) / (hat.ry * hat.ry)));
    return { type: "cover", rim: hat.rim, rx: 0.45, ry: 0.446, rz: 0.43, cy: 0, rimRx: hat.rx * k - 0.006, rimRz: hat.rz * k - 0.006, flare: hat.flare };
  }
  if (model === "visor") return { type: "band", y0: 0.15, y1: 0.28, radius: 0.405, slope: 0.6 };
  return null;
}

function domeRadius(hat, az, y) {
  const k = Math.sqrt(Math.max(0, 1 - ((y - hat.cy) * (y - hat.cy)) / (hat.ry * hat.ry)));
  return { x: Math.sin(az) * hat.rx * k, z: Math.cos(az) * hat.rz * k };
}

function rimPoint(hat, az, out) {
  const z0 = Math.cos(az) * hat.rz;
  const y = hat.rim(z0);
  const r = domeRadius(hat, az, y);
  return out.set(r.x, y, r.z);
}

function addDome(builder, hat, options = {}) {
  const { nu = 40, nv = 12, tint = null, colorAt = null, rib = null, crease = null } = options;
  builder.grid(
    nu,
    nv,
    (u, v, out) => {
      const az = TAU * u - PI;
      const rimY = hat.rim(Math.cos(az) * hat.rz);
      const pRim = Math.acos(clamp((rimY - hat.cy) / hat.ry, -1, 1));
      const polar = pRim * v;
      const radial = 1 + (rib ? rib(az, v) : 0);
      out.set(Math.sin(az) * Math.sin(polar) * hat.rx * radial, hat.cy + Math.cos(polar) * hat.ry, Math.cos(az) * Math.sin(polar) * hat.rz * radial);
      if (crease) crease(out, az, v);
    },
    { wrapU: true, poleStart: true, flip: true, tint, colorAt }
  );
}

/** A brim or visor round part of the rim. Top and underside are one strip. */
function addBrim(builder, hat, options) {
  const { az0 = -PI, az1 = PI, closed = true, width, droop, nu = 40, nv = 8, thickness = 0.012, tint = null, colorAt = null } = options;
  const P = new Vector3();
  builder.grid(
    nu,
    nv,
    (u, v, out, i, j) => {
      const az = lerp(az0, az1, u);
      const top = j <= nv / 2;
      const s = top ? j / (nv / 2) : (nv - j) / (nv / 2);
      rimPoint(hat, az, P);
      const outward = vec(Math.sin(az), 0, Math.cos(az));
      const extent = width(az) * s;
      const y = P.y + droop(az, s) + (top ? thickness * 0.5 : -thickness * 0.5) * Math.sin(Math.min(1, s * 6) * (PI / 2));
      out.set(P.x + outward.x * extent, y, P.z + outward.z * extent);
    },
    { wrapU: closed, flip: true, tint, colorAt }
  );
}

function ribbon(builder, hat, y0, y1, inflate, tint) {
  builder.grid(
    40,
    2,
    (u, v, out) => {
      const az = TAU * u - PI;
      const rimY = hat.rim(Math.cos(az) * hat.rz);
      const y = rimY + lerp(y0, y1, v);
      const r = domeRadius(hat, az, y);
      const k = 1 + inflate;
      out.set(r.x * k, y, r.z * k);
    },
    { wrapU: true, tint }
  );
}

function seamOnDome(builder, hat, az, tint) {
  const points = [];
  const rimY = hat.rim(Math.cos(az) * hat.rz);
  const pRim = Math.acos(clamp((rimY - hat.cy) / hat.ry, -1, 1));
  for (let i = 1; i <= 7; i += 1) {
    const polar = (pRim * i) / 7;
    points.push(vec(Math.sin(az) * Math.sin(polar) * hat.rx * 1.004, hat.cy + Math.cos(polar) * hat.ry * 1.004, Math.cos(az) * Math.sin(polar) * hat.rz * 1.004));
  }
  builder.tube(points, 0.0032, { radial: 3, capStart: false, capEnd: false, tint });
}

function star(builder, center, normal, size, tint) {
  const tangent = new Vector3(0, 1, 0).cross(normal).normalize();
  const bitangent = new Vector3().crossVectors(normal, tangent).normalize();
  builder.grid(
    10,
    1,
    (u, v, out, i) => {
      const a = TAU * u;
      const r = i % 2 === 0 ? size : size * 0.42;
      out.copy(center).addScaledVector(tangent, Math.sin(a) * r * v).addScaledVector(bitangent, Math.cos(a) * r * v);
    },
    { wrapU: true, poleStart: true, tint }
  );
}

function buildCap(item, materials) {
  const hat = HATS.cap;
  const crown = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.72);
  addDome(crown, hat, {
    colorAt: item.accent
      ? (u, v, c) => {
          const az = TAU * u - PI;
          c.copy(Math.abs(az) < 0.52 ? accent : base);
        }
      : (u, v, c) => c.copy(base)
  });
  for (let i = 0; i < 6; i += 1) seamOnDome(crown, hat, (i / 6) * TAU + PI / 6, shade(base, 0.62));
  crown.ellipsoid(0, hat.ry + 0.002, 0, 0.026, 0.014, 0.026, { nu: 10, nv: 6, tint: accent });
  addBrim(crown, hat, {
    az0: -0.98,
    az1: 0.98,
    closed: false,
    nu: 30,
    width: (az) => 0.29 * Math.pow(Math.max(0, Math.cos((az / 0.98) * (PI / 2))), 0.5),
    droop: (az, s) => -0.035 * s - 0.05 * (az / 0.98) * (az / 0.98) * s,
    thickness: 0.018,
    tint: accent
  });
  return { parts: [{ geometry: crown.toGeometry(), material: materials.soft, parent: "head" }], top: hat.ry + 0.02, halfWidth: 0.48 };
}

function buildBeanie(item, materials) {
  const hat = HATS.beanie;
  const body = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#FFFFFF"), 0.22);
  const ribs = 30;
  addDome(body, hat, {
    nu: 90,
    nv: 10,
    rib: (az, v) => 0.008 * Math.sin(az * ribs) * smoothstep(0.08, 0.3, v),
    colorAt: (u, v, c) => c.copy(base).multiplyScalar(0.84 + 0.16 * (0.5 + 0.5 * Math.sin((TAU * u - PI) * ribs)) * smoothstep(0.08, 0.3, v))
  });
  // Folded cuff.
  body.grid(
    90,
    4,
    (u, v, out, i, j) => {
      const az = TAU * u - PI;
      const rimY = hat.rim(Math.cos(az) * hat.rz);
      const y = rimY + lerp(-0.006, 0.115, v);
      const r = domeRadius(hat, az, y);
      const bulge = 1 + 0.03 + 0.03 * Math.sin(PI * v) + (j === 0 ? 0 : 0.011 * Math.sin(az * ribs));
      out.set(r.x * bulge, y, r.z * bulge);
    },
    {
      wrapU: true,
      colorAt: (u, v, c) => c.copy(base).multiplyScalar(0.8 + 0.2 * (0.5 + 0.5 * Math.sin((TAU * u - PI) * ribs)))
    }
  );
  // A round woolly pompom.
  const pom = new MeshBuilder();
  pom.ellipsoid(0, hat.ry + 0.05, 0, 0.1, 0.095, 0.1, { nu: 12, nv: 8, tint: shade(accent, 0.55) });
  const golden = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 52; i += 1) {
    const y = 1 - 2 * ((i + 0.5) / 52);
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    pom.ellipsoid(Math.cos(a) * r * 0.098, hat.ry + 0.05 + y * 0.092, Math.sin(a) * r * 0.098, 0.027, 0.027, 0.027, { nu: 6, nv: 4, tint: accent });
  }
  return {
    parts: [
      { geometry: body.toGeometry(), material: materials.matte, parent: "head" },
      { geometry: pom.toGeometry(), material: materials.matte, parent: "head" }
    ],
    top: hat.ry + 0.16,
    halfWidth: 0.5
  };
}

function buildBucket(item, materials) {
  const hat = HATS.bucket;
  const body = new MeshBuilder();
  const base = color(item.color);
  const dark = shade(base, 0.76);
  addDome(body, hat, { tint: base, crease: (p, az, v) => {
    // A flatter crown.
    if (v < 0.5) p.y -= (0.5 - v) * 0.13;
  } });
  addBrim(body, hat, {
    width: () => 0.17,
    droop: (az, s) => -0.1 * s,
    thickness: 0.014,
    colorAt: (u, v, c) => {
      const s = v <= 0.5 ? v * 2 : (1 - v) * 2;
      c.copy(base).multiplyScalar(Math.round(s * 7) % 3 === 0 ? 0.86 : 1);
    },
    nv: 12
  });
  ribbon(body, hat, 0.0, 0.05, 0.01, dark);
  return { parts: [{ geometry: body.toGeometry(), material: materials.soft, parent: "head" }], top: hat.ry - 0.06, halfWidth: 0.66 };
}

function buildVisor(item, materials) {
  const hat = { rim: () => 0.18, rx: 0.47, ry: 0.5, rz: 0.45, cy: 0 };
  const body = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.7);
  // Band with an open top.
  body.grid(
    64,
    6,
    (u, v, out, i, j) => {
      const az = TAU * u - PI;
      const y = lerp(0.17, 0.27, v);
      const r = domeRadius(hat, az, y);
      const k = j === 0 || j === 6 ? 0.985 : 1.02;
      out.set(r.x * k, y, r.z * k);
    },
    { wrapU: true, tint: base }
  );
  // Inside of the band, so the open top reads as a band and not a hole.
  body.grid(
    64,
    1,
    (u, v, out) => {
      const az = TAU * u - PI;
      const y = lerp(0.27, 0.17, v);
      const r = domeRadius(hat, az, y);
      out.set(r.x * 0.99, y, r.z * 0.99);
    },
    { wrapU: true, tint: shade(base, 0.45) }
  );
  addBrim(body, hat, {
    az0: -1.0,
    az1: 1.0,
    closed: false,
    nu: 32,
    width: (az) => 0.3 * Math.pow(Math.max(0, Math.cos((az / 1.0) * (PI / 2))), 0.55),
    droop: (az, s) => -0.03 * s - 0.04 * az * az * s,
    thickness: 0.016,
    tint: accent
  });
  return { parts: [{ geometry: body.toGeometry(), material: materials.satin, parent: "head" }], top: 0.3, halfWidth: 0.5 };
}

function buildFedora(item, materials) {
  const hat = HATS.fedora;
  const body = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.5);
  addDome(body, hat, {
    nu: 48,
    nv: 16,
    tint: base,
    crease: (p, az, v) => {
      // A lengthwise crease on top and a pinch at the front.
      const near = 1 - smoothstep(0, 0.2, Math.abs(p.x));
      if (v < 0.75) p.y -= near * smoothstep(0.75, 0.05, v) * 0.1;
      if (p.z > 0.1 && v < 0.75) p.x *= 1 - 0.14 * smoothstep(0.1, 0.4, p.z) * smoothstep(0.75, 0.3, v);
    }
  });
  ribbon(body, hat, 0.0, 0.1, 0.012, accent);
  addBrim(body, hat, {
    width: (az) => 0.22 - 0.03 * Math.abs(Math.sin(az)),
    droop: (az, s) => {
      const side = Math.abs(Math.sin(az));
      const front = Math.max(0, Math.cos(az));
      return s * s * (0.1 * side * side - 0.07 * front * front - 0.03);
    },
    thickness: 0.014,
    tint: shade(base, 0.92)
  });
  return { parts: [{ geometry: body.toGeometry(), material: materials.soft, parent: "head" }], top: hat.ry - 0.03, halfWidth: 0.7 };
}

function buildSunhat(item, materials) {
  const hat = HATS.sunhat;
  const body = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.7);
  const weave = (u, v, c) => c.copy(base).multiplyScalar(0.92 + 0.08 * Math.sin(v * 80));
  addDome(body, hat, { tint: null, colorAt: weave });
  addBrim(body, hat, {
    width: () => 0.44,
    droop: (az, s) => s * s * (-0.16 + 0.05 * Math.sin(az * 5)),
    thickness: 0.012,
    nu: 72,
    nv: 12,
    colorAt: (u, v, c) => {
      const s = v <= 0.5 ? v * 2 : (1 - v) * 2;
      c.copy(base).multiplyScalar(0.93 + 0.07 * Math.sin(s * 44));
    }
  });
  ribbon(body, hat, 0.0, 0.085, 0.014, accent);
  // A bow at the side.
  const side = 0.82;
  const anchor = vec(Math.sin(side) * 0.47, 0.27, Math.cos(side) * 0.45);
  for (const dir of [1, -1]) {
    body.ellipsoid(anchor.x + Math.cos(side) * dir * 0.06, anchor.y + 0.012, anchor.z - Math.sin(side) * dir * 0.06, 0.06, 0.038, 0.014, { nu: 10, nv: 6, tint: accent, rotation: new Quaternion().setFromAxisAngle(vec(0, 1, 0), side) });
  }
  body.ellipsoid(anchor.x, anchor.y + 0.012, anchor.z, 0.022, 0.03, 0.02, { nu: 8, nv: 6, tint: shade(accent, 0.82) });
  return { parts: [{ geometry: body.toGeometry(), material: materials.soft, parent: "head" }], top: hat.ry, halfWidth: 0.94 };
}

function buildCone(item, materials) {
  const hat = HATS.cone;
  const body = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 1.6);
  const spine = smoothPath([vec(0, 0.26, -0.01), vec(0.01, 0.5, -0.03), vec(0.04, 0.74, -0.09), vec(0.11, 0.92, -0.16), vec(0.2, 1.0, -0.22)], 18);
  const radiusAt = (t) => lerp(0.47, 0.01, Math.pow(t, 0.88));
  body.tube(spine, radiusAt, { radial: 26, capStart: "flat", capEnd: "round", flatten: 0.95, up: vec(0, 0, 1), tint: base });
  addBrim(body, hat, { width: () => 0.26, droop: (az, s) => s * (-0.06 + 0.02 * Math.sin(az * 4)), thickness: 0.016, tint: shade(base, 0.88), nu: 72 });
  ribbon(body, { ...hat, rx: 0.482, rz: 0.462 }, 0, 0.09, 0.004, accent);
  const stars = new MeshBuilder();
  const place = (t, az, size) => {
    const index = Math.floor(t * 18);
    const center = spine[index];
    const r = radiusAt(index / 18) + 0.004;
    const n = vec(Math.sin(az), 0.15, Math.cos(az)).normalize();
    star(stars, center.clone().add(vec(Math.sin(az) * r * 0.95, 0, Math.cos(az) * r)), n, size, accent);
  };
  place(0.16, 0.5, 0.05);
  place(0.3, -0.6, 0.042);
  place(0.47, 0.25, 0.036);
  place(0.14, -0.9, 0.034);
  place(0.42, 1.6, 0.034);
  place(0.24, 2.6, 0.04);
  place(0.5, -2.3, 0.03);
  return {
    parts: [
      { geometry: body.toGeometry(), material: materials.soft, parent: "head" },
      { geometry: stars.toGeometry(), material: materials.glow, parent: "head" }
    ],
    top: 1.02,
    halfWidth: 0.72
  };
}

function buildCrown(item, materials) {
  const metal = new MeshBuilder();
  const gems = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : color("#FF4F9A");
  const sides = 8;
  const radius = 0.31;
  const height = 0.13;
  const spike = 0.13;
  // Each face is its own quad strip, so the polygon edges stay crisp.
  for (let k = 0; k < sides; k += 1) {
    const a0 = (k / sides) * TAU;
    const a1 = ((k + 1) / sides) * TAU;
    for (const sideSign of [1, -1]) {
      metal.grid(
        8,
        3,
        (u, v, out) => {
          // Straight-edged, so interpolate along the chord rather than the arc.
          const x = lerp(Math.sin(a0), Math.sin(a1), u) * (radius + (sideSign > 0 ? 0 : -0.012));
          const z = lerp(Math.cos(a0), Math.cos(a1), u) * (radius + (sideSign > 0 ? 0 : -0.012));
          const peak = 1 - Math.abs(u * 2 - 1);
          out.set(x * (1 + 0.1 * v), v * (height + spike * peak), z * (1 + 0.1 * v));
        },
        { flip: sideSign < 0, tint: sideSign > 0 ? base : shade(base, 0.7) }
      );
    }
    const mid = (a0 + a1) / 2;
    gems.ellipsoid(Math.sin(mid) * (radius * 1.1 + 0.002), height + spike + 0.012, Math.cos(mid) * (radius * 1.1 + 0.002), 0.024, 0.024, 0.024, { nu: 7, nv: 5, tint: accent });
    metal.ellipsoid(Math.sin(mid) * (radius * Math.cos(PI / sides) + 0.004), 0.06, Math.cos(mid) * (radius * Math.cos(PI / sides) + 0.004), 0.026, 0.026, 0.012, { nu: 7, nv: 5, tint: accent, rotation: new Quaternion().setFromAxisAngle(vec(0, 1, 0), mid) });
  }
  // A rim along the bottom.
  const rim = [];
  for (let i = 0; i <= sides; i += 1) {
    const a = (i / sides) * TAU;
    rim.push(vec(Math.sin(a) * radius * 1.012, 0.006, Math.cos(a) * radius * 1.012));
  }
  metal.tube(smoothPath(rim, sides * 3), 0.012, { radial: 5, capStart: false, capEnd: false, tint: shade(base, 1.08) });
  return {
    parts: [
      { geometry: metal.toGeometry(), material: materials.metal, parent: "head", placement: "crown" },
      { geometry: gems.toGeometry(), material: materials.gem, parent: "head", placement: "crown" }
    ],
    top: 0.3,
    halfWidth: 0.36,
    ringRadius: radius
  };
}

function buildHalo(item, materials) {
  const glow = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : color("#FFFFFF");
  const radius = 0.34;
  glow.grid(
    8,
    56,
    (u, v, out) => {
      const a = TAU * v;
      const b = TAU * u;
      const major = radius + Math.cos(b) * 0.024;
      out.set(Math.sin(a) * major, Math.sin(b) * 0.018, Math.cos(a) * major);
    },
    { wrapU: true, wrapV: true, tint: mixColor(base, color("#FFFFFF"), 0.3) }
  );
  const orbit = 8;
  for (let i = 0; i < orbit; i += 1) {
    const a = (i / orbit) * TAU;
    addSparkle(glow, vec(Math.sin(a) * (radius + 0.06), 0.03 * Math.sin(a * 3), Math.cos(a) * (radius + 0.06)), vec(Math.sin(a), 0.25, Math.cos(a)).normalize(), 0.046, accent);
  }
  // A faint disc of light inside the ring.
  const disc = new MeshBuilder();
  disc.grid(
    40,
    1,
    (u, v, out) => {
      const a = TAU * u;
      out.set(Math.sin(a) * radius * 0.98 * v, 0, Math.cos(a) * radius * 0.98 * v);
    },
    { wrapU: true, poleStart: true, flip: true, tint: base, alphaAt: (u, v) => 0.18 * v }
  );
  return {
    parts: [
      { geometry: glow.toGeometry(), material: materials.glow, parent: "head", placement: "halo" },
      { geometry: disc.toGeometry(), material: materials.lensGlow, parent: "head", placement: "halo", renderOrder: 2 }
    ],
    top: 0.08,
    halfWidth: 0.44
  };
}

const HAT_BUILDERS = { cap: buildCap, beanie: buildBeanie, bucket: buildBucket, visor: buildVisor, fedora: buildFedora, sunhat: buildSunhat, cone: buildCone, crown: buildCrown, halo: buildHalo };

export function buildHat(item, materials) {
  return (HAT_BUILDERS[item.model] ?? buildCap)(item, materials);
}

// --- glasses -------------------------------------------------------------------

const LENS_X = 0.186;
const LENS_Y = -0.028;
const LENS_Z = 0.474;
const wrapZ = (x) => LENS_Z - 0.34 * x * x;

function lensShape(model) {
  switch (model) {
    case "square":
      return { samples: 32, at: (t) => superEllipse(t, 0.132, 0.1, 5) };
    case "shades":
      return { samples: 32, at: (t) => { const p = superEllipse(t, 0.14, 0.108, 3.2); return [p[0], p[1] + (p[1] > 0 ? 0.008 : -0.008 * Math.abs(p[0] / 0.14))]; } };
    case "aviator":
      return {
        samples: 36,
        // A soft teardrop: flat along the brow, full towards the outer cheek.
        at: (t) => {
          const a = t * TAU;
          const c = Math.cos(a);
          const s = Math.sin(a);
          if (s >= 0) return [c * 0.128, s * 0.066];
          return [c * 0.128 + 0.016 * -s * (c + 0.55), s * 0.128];
        }
      };
    case "hex":
      return { samples: 30, at: (t) => hexOutline(t, 0.13) };
    default:
      return { samples: 32, at: (t) => [Math.cos(t * TAU) * 0.118, Math.sin(t * TAU) * 0.118] };
  }
}

function superEllipse(t, a, b, n) {
  const angle = t * TAU;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}

function hexOutline(t, r) {
  const sides = 6;
  const f = (t * sides) % sides;
  const k = Math.floor(f);
  const u = f - k;
  const a0 = (k / sides) * TAU + PI / 6;
  const a1 = ((k + 1) / sides) * TAU + PI / 6;
  return [lerp(Math.cos(a0), Math.cos(a1), u) * r, lerp(Math.sin(a0), Math.sin(a1), u) * r * 0.92];
}

export function buildGlasses(item, materials) {
  const model = item.model;
  const shape = lensShape(model);
  const frame = new MeshBuilder();
  const lens = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#FFFFFF"), 0.25);
  const dark = model === "shades";
  const lensTint = dark ? mixColor(base, color("#0A0E16"), 0.55) : model === "aviator" ? color("#6E5A34") : mixColor(base, color("#CFEFFF"), 0.75);
  const lensAlpha = dark ? 0.92 : model === "aviator" ? 0.5 : 0.16;
  const rimRadius = model === "shades" ? 0.0135 : model === "round" || model === "aviator" ? 0.0085 : 0.0115;
  frame.mirrorX(() => {
    const point = (t, out = new Vector3()) => {
      const [dx, dy] = shape.at(t);
      const x = LENS_X + dx;
      return out.set(x, LENS_Y + dy, wrapZ(x));
    };
    const loop = [];
    for (let i = 0; i <= shape.samples; i += 1) loop.push(point(i / shape.samples));
    frame.tube(loop, rimRadius, { radial: 5, capStart: false, capEnd: false, flatten: model === "shades" || model === "square" ? 1.35 : 1, up: vec(0, 0, 1), tint: base });
    // Temple arm back to the ear.
    const hinge = point(model === "aviator" ? 0.08 : 0.04);
    const arm = smoothPath([hinge.clone().add(vec(0.012, 0.012, -0.01)), vec(0.385, 0.03, 0.34), vec(0.468, 0.04, 0.16), vec(0.478, 0.045, -0.03), vec(0.46, 0.0, -0.1)], 10);
    frame.tube(arm, 0.0088, { radial: 4, capStart: false, capEnd: "round", flatten: 1.4, up: vec(0, 0, 1), tint: item.accent ? accent : base });
  });
  // Bridge.
  const bridgeY = LENS_Y + (model === "aviator" ? 0.05 : 0.038);
  const inner = LENS_X - (model === "aviator" ? 0.122 : 0.112);
  frame.tube(smoothPath([vec(-inner, bridgeY, wrapZ(inner)), vec(0, bridgeY + 0.024, wrapZ(0)), vec(inner, bridgeY, wrapZ(inner))], 10), rimRadius * 0.9, { radial: 6, capStart: false, capEnd: false, tint: base });
  if (model === "aviator") frame.tube(smoothPath([vec(-inner * 1.06, bridgeY + 0.05, wrapZ(inner)), vec(0, bridgeY + 0.058, wrapZ(0)), vec(inner * 1.06, bridgeY + 0.05, wrapZ(inner))], 10), rimRadius * 0.7, { radial: 5, capStart: false, capEnd: false, tint: base });

  for (const side of [1, -1]) {
    lens.grid(
      shape.samples,
      1,
      (u, v, out) => {
        const [dx, dy] = shape.at(u);
        const x = side * (LENS_X + dx * v);
        out.set(x, LENS_Y + dy * v, wrapZ(x) - 0.002);
      },
      {
        wrapU: true,
        poleStart: true,
        flip: side > 0 ? false : true,
        tint: null,
        colorAt: dark && item.accent ? (u, v, c) => c.copy(lensTint).lerp(accent, 0.1) : (u, v, c) => c.copy(lensTint),
        alphaAt: () => lensAlpha
      }
    );
  }
  const parts = [
    { geometry: frame.toGeometry(), material: model === "aviator" ? materials.metal : materials.gloss, parent: "head" },
    { geometry: lens.toGeometry(), material: materials.lens, parent: "head", renderOrder: 3 }
  ];
  return parts;
}

// --- jewelry -------------------------------------------------------------------

function necklacePath(frame, inflate, drop, samples = 56) {
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const psi = (i / samples) * TAU - PI;
    const f = Math.pow((1 + Math.cos(psi)) / 2, 1.2);
    const y = lerp(1.44, 1.44 - drop, f);
    const ring = frame.torsoAt(y);
    points.push(vec(Math.sin(psi) * (ring.rx + inflate), y, ring.cz + Math.cos(psi) * (ring.rz + inflate)));
  }
  return points;
}

function addChain(builder, frame, inflate, drop, tint, thickness = 0.0075) {
  builder.tube(necklacePath(frame, inflate, drop), (t) => thickness * (1 + 0.24 * Math.sin(t * 620)), { radial: 4, capStart: false, capEnd: false, tint });
}

function addEarrings(item, wearing, materials) {
  const parts = [];
  const metal = new MeshBuilder();
  const gem = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#FFFFFF"), 0.3);
  for (const side of [1, -1]) {
    const lobe = earLobe(side);
    if (wearing.overHair) lobe.x += side * 0.06;
    if (item.model === "studs") {
      gem.ellipsoid(lobe.x + side * 0.014, lobe.y, lobe.z, 0.024, 0.024, 0.024, { nu: 12, nv: 8, tint: base });
      metal.ellipsoid(lobe.x + side * 0.012, lobe.y, lobe.z, 0.0285, 0.0285, 0.012, { nu: 12, nv: 6, tint: shade(base, 0.82) });
    } else {
      const radius = item.tier === "luxury" ? 0.092 : 0.074;
      const tubeRadius = item.tier === "luxury" ? 0.0115 : 0.0085;
      metal.grid(
        6,
        28,
        (u, v, out) => {
          const a = TAU * v;
          const b = TAU * u;
          const major = radius + Math.cos(b) * tubeRadius;
          out.set(lobe.x + side * 0.012 + Math.sin(b) * tubeRadius, lobe.y - radius + Math.cos(a) * major, lobe.z + Math.sin(a) * major);
        },
        { wrapU: true, wrapV: true, flip: true, tint: base }
      );
      if (item.tier === "luxury") {
        for (let i = 0; i < 9; i += 1) {
          const a = lerp(0.9, TAU - 0.9, i / 8) + PI;
          gem.ellipsoid(lobe.x + side * 0.012, lobe.y - radius + Math.cos(a) * (radius + tubeRadius * 0.5), lobe.z + Math.sin(a) * (radius + tubeRadius * 0.5), 0.0088, 0.0088, 0.0088, { nu: 7, nv: 5, tint: accent });
        }
      }
    }
  }
  parts.push({ geometry: metal.toGeometry(), material: materials.metal, parent: "head" });
  parts.push({ geometry: gem.toGeometry(), material: materials.gem, parent: "head" });
  return parts;
}

function addPendantShape(builder, gems, item, y, z, base, accent) {
  if (/infinity/.test(item.id)) {
    builder.grid(
      6,
      52,
      (u, v, out) => {
        const t = TAU * v;
        const scale = 0.056;
        const denom = 1 + Math.sin(t) * Math.sin(t);
        const cx = (scale * 1.5 * Math.cos(t)) / denom;
        const cy = (scale * 1.5 * Math.sin(t) * Math.cos(t)) / denom;
        const b = TAU * u;
        out.set(cx + Math.cos(b) * 0.0105 * Math.cos(t * 0), y + cy + Math.sin(b) * 0.0105, z + Math.cos(b) * 0.0105 * 0.6);
      },
      { wrapU: true, wrapV: true, tint: base }
    );
    gems.ellipsoid(0, y, z + 0.006, 0.017, 0.017, 0.012, { nu: 10, nv: 8, tint: accent });
    return;
  }
  const hex = (radius) => {
    const pts = [];
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const f = t * 6;
      const k = Math.floor(f) % 6;
      const u = f - Math.floor(f);
      const a0 = (k / 6) * TAU + PI / 6;
      const a1 = ((k + 1) / 6) * TAU + PI / 6;
      pts.push(vec(lerp(Math.cos(a0), Math.cos(a1), u) * radius, y + lerp(Math.sin(a0), Math.sin(a1), u) * radius, z));
    }
    return pts;
  };
  const large = item.tier === "rare" || item.tier === "legendary";
  const radius = large ? 0.052 : 0.04;
  builder.tube(hex(radius), 0.0075, { radial: 5, capStart: false, capEnd: false, tint: base });
  gems.grid(
    18,
    2,
    (u, v, out, i, j) => {
      const f = u * 6;
      const k = Math.floor(f) % 6;
      const s = f - Math.floor(f);
      const a0 = (k / 6) * TAU + PI / 6;
      const a1 = ((k + 1) / 6) * TAU + PI / 6;
      const r = radius * (j === 0 ? 0 : j === 1 ? 0.62 : 1);
      const dome = j === 0 ? 0.022 : j === 1 ? 0.016 : 0;
      out.set(lerp(Math.cos(a0), Math.cos(a1), s) * r, y + lerp(Math.sin(a0), Math.sin(a1), s) * r, z + dome);
    },
    { wrapU: true, poleStart: true, flip: true, tint: accent }
  );
}

export function buildJewelry(item, frame, materials, wearing) {
  const model = item.model;
  if (model === "studs" || model === "hoops") return addEarrings(item, wearing, materials);
  const metal = new MeshBuilder();
  const gems = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#FFFFFF"), 0.3);
  if (model === "chain" || model === "pendant" || model === "pearls") {
    const inflate = wearing.chest + 0.008;
    if (model === "chain") {
      addChain(metal, frame, inflate, 0.14, base);
      if (item.accent) addChain(metal, frame, inflate + 0.004, 0.235, base, 0.0065);
    } else if (model === "pendant") {
      addChain(metal, frame, inflate, 0.205, base, 0.0058);
      const y = 1.44 - 0.205;
      const ring = frame.torsoAt(y - 0.05);
      const z = ring.cz + ring.rz + inflate + 0.012;
      metal.ellipsoid(0, y - 0.002, z - 0.002, 0.01, 0.014, 0.006, { nu: 8, nv: 5, tint: base });
      addPendantShape(metal, gems, item, y - 0.052 - (item.tier === "rare" || item.tier === "legendary" ? 0.008 : 0), z, base, accent);
    } else {
      const path = necklacePath(frame, inflate, 0.135, 120);
      const pearls = 27;
      for (let i = 0; i < pearls; i += 1) {
        const p = path[Math.round(((i + 0.5) / pearls) * 120)];
        gems.ellipsoid(p.x, p.y, p.z, 0.022, 0.022, 0.022, { nu: 8, nv: 5, tint: base });
      }
    }
  } else if (model === "watch" || model === "bracelet") {
    const arm = frame.arms[1];
    const center = arm.point(0.92);
    const tangent = arm.point(0.97).sub(arm.point(0.87)).normalize();
    const radius = arm.radius(0.92) + wearing.wrist + 0.006;
    const up = vec(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    const other = new Vector3().crossVectors(tangent, up).normalize();
    if (model === "watch") {
      metal.grid(
        12,
        28,
        (u, v, out) => {
          const a = TAU * v;
          const b = TAU * u;
          const r = radius + 0.004 + Math.cos(b) * 0.0065;
          out.copy(center).addScaledVector(up, Math.cos(a) * r).addScaledVector(other, Math.sin(a) * r).addScaledVector(tangent, Math.sin(b) * 0.021);
        },
        { wrapU: true, wrapV: true, flip: true, tint: base }
      );
      const face = center.clone().addScaledVector(up, radius + 0.012);
      const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(tangent, other, up));
      metal.withMatrix(new Matrix4().compose(face, quaternion, new Vector3(1, 1, 1)), () => {
        metal.lathe(
          [
            [0.0, -0.008],
            [0.034, -0.008],
            [0.036, 0.0],
            [0.031, 0.0065],
            [0.0, 0.0065]
          ],
          { nu: 16, tint: base, poleStart: true, poleEnd: true }
        );
      });
      const dial = new Matrix4().compose(face.clone().addScaledVector(up, 0.0078), quaternion, new Vector3(1, 1, 1));
      gems.withMatrix(dial, () => {
        gems.grid(
          16,
          2,
          (u, v, out) => {
            const a = TAU * u;
            out.set(Math.sin(a) * 0.027 * v, 0, Math.cos(a) * 0.027 * v);
          },
          { wrapU: true, poleStart: true, flip: true, tint: accent }
        );
      });
    } else {
      const beads = 19;
      for (let i = 0; i < beads; i += 1) {
        const a = (i / beads) * TAU;
        const p = center.clone().addScaledVector(up, Math.cos(a) * radius).addScaledVector(other, Math.sin(a) * radius);
        gems.ellipsoid(p.x, p.y, p.z, 0.0118, 0.0118, 0.0118, { nu: 8, nv: 6, tint: i % 3 === 0 ? mixColor(base, color("#FFFFFF"), 0.45) : base });
      }
    }
  }
  const parts = [];
  if (metal.vertexCount) parts.push({ geometry: metal.toGeometry(), material: materials.metal, parent: "body" });
  if (gems.vertexCount) parts.push({ geometry: gems.toGeometry(), material: materials.gem, parent: "body" });
  return parts;
}

