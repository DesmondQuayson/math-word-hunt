// Tops, bottoms, outfits and jackets. Every garment is the body profile from
// frame.js offset outwards, so each one fits both frames without per-frame art.

import { MeshStandardMaterial } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, clamp, color, lerp, mixColor, shade, smoothPath, smoothstep, vec } from "./geometry.js";
import { fabricTexture } from "./materials.js";
import { paintPrint, printFor } from "./prints.js";

const PI = Math.PI;

const FIT = Object.freeze({ bottom: 0.016, bodice: 0.016, top: 0.026, thick: 0.044, suit: 0.054, jacket: 0.072, puffer: 0.1 });

function looseRing(frame, y, inflate, loose, yTop, yBottom) {
  const ring = frame.torsoAt(y);
  let rx = ring.rx;
  let rz = ring.rz;
  if (loose > 0 && y < yTop && y > yBottom) {
    const a = frame.torsoAt(yTop);
    const b = frame.torsoAt(yBottom);
    const t = (y - yBottom) / (yTop - yBottom);
    rx = Math.max(rx, lerp(rx, lerp(b.rx, a.rx, t), loose));
    rz = Math.max(rz, lerp(rz, lerp(b.rz, a.rz, t), loose));
  }
  return { rx: rx + inflate, rz: rz + inflate, cz: ring.cz };
}

const crewNeck = (drop = 0.035, y = 1.415) => (angle) => y - drop * Math.pow(Math.max(0, Math.cos(angle)), 2);
const vNeck = (y0, width, y = 1.415) => (angle) => {
  const a = Math.abs(angle);
  return y - (y - y0) * Math.pow(Math.max(0, 1 - a / width), 1.2);
};

function keyed(keys) {
  return (angle) => {
    const x = Math.abs(((angle + PI) % TAU + TAU) % TAU - PI);
    let k = 0;
    while (k < keys.length - 2 && x > keys[k + 1][0]) k += 1;
    const a = keys[k];
    const b = keys[k + 1];
    const t = clamp((x - a[0]) / (b[0] - a[0]));
    return lerp(a[1], b[1], t * t * (3 - 2 * t));
  };
}

/** Wide-strapped neckline shared by the dress and gown bodices. */
const STRAP_NECK = keyed([
  [0, 1.235],
  [0.42, 1.33],
  [0.72, 1.405],
  [1.02, 1.385],
  [1.5, 1.17],
  [2.05, 1.385],
  [2.42, 1.405],
  [2.9, 1.27],
  [PI, 1.25]
]);

/**
 * The torso layer of a garment. u runs round the body from the back seam
 * (front at u = 0.5); `gap` leaves the front open by that half-angle.
 */
function torsoShell(builder, frame, options) {
  const { hem, top, inflate, loose = 0, nu = 44, nv = 16, gap = 0, tint = null, colorAt = null, uvAt = null, rib = null } = options;
  const inflateAt = typeof inflate === "function" ? inflate : () => inflate;
  const gapAt = typeof gap === "function" ? gap : () => gap;
  const yTop = 1.22;
  // A little shade under the chin gives the torso depth without a shadow map.
  const neckShade = (v, c) => {
    const y = lerp(hem, 1.42, v);
    c.multiplyScalar(lerp(1, 0.8, smoothstep(1.22, 1.42, y)));
  };
  const shaded = (u, v, c) => {
    if (colorAt) colorAt(u, v, c);
    else if (tint) c.copy(tint);
    else c.setScalar(1);
    neckShade(v, c);
  };
  builder.grid(
    nu,
    nv,
    (u, v, out, i, j) => {
      const yNow = lerp(hem, 1.2, v);
      const opening = gapAt(yNow);
      const angle = opening > 0 ? lerp(opening, TAU - opening, u) : TAU * u - PI;
      const y = lerp(hem, top(angle), v);
      const ring = looseRing(frame, y, inflateAt(y, angle, v), loose, yTop, hem);
      const wobble = rib ? rib(angle, y, v) : 0;
      const inward = j === 0 ? 0.86 : 1;
      out.set(Math.sin(angle) * (ring.rx + wobble) * inward, y, ring.cz + Math.cos(angle) * (ring.rz + wobble) * inward);
    },
    { wrapU: gapAt(1) === 0, colorAt: shaded, uvAt }
  );
}

function neckPath(frame, top, inflate, samples = 34) {
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const angle = (i / samples) * TAU - PI;
    const y = top(angle);
    const ring = frame.torsoAt(y);
    points.push(vec(Math.sin(angle) * (ring.rx + inflate), y + 0.002, ring.cz + Math.cos(angle) * (ring.rz + inflate)));
  }
  return points;
}

function sleeve(builder, frame, side, options) {
  const { t1, t0 = 0, inflate, radial = 12, samples = 12, capEnd = "flat", tint = null, uvAt = null, bulge = null, colorAt = null } = options;
  const arm = frame.arms[side];
  const inflateAt = typeof inflate === "function" ? inflate : () => inflate;
  const shoulderEase = (t) => (t0 === 0 ? lerp(0.38, 1, smoothstep(0, 0.22 / t1, t)) : 1);
  const flare = (t) => arm.radius(lerp(t0, t1, t)) + inflateAt(t) * shoulderEase(t);
  builder.tube(arm.slice(t0, t1, samples), bulge ? (t, a) => flare(t) + bulge(t, a) : flare, { radial, capStart: "round", capEnd, tint, uvAt, colorAt });
}

function cuffBand(builder, frame, side, at, width, inflate, tint) {
  const arm = frame.arms[side];
  builder.tube(arm.slice(at - width, at + 0.006, 2), (t) => arm.radius(at) + inflate, { radial: 12, capStart: "flat", capEnd: "flat", tint });
}

function sleeveUV(u, v, uv, p) {
  uv.set(u * 0.3, (p.y - 0.7) / 0.75);
}

function bodyUV(hem, topY) {
  return (u, v, uv, p) => uv.set(u, clamp((p.y - hem) / (topY - hem)));
}

const part = (builder, material, extra = {}) => ({ geometry: builder.toGeometry(), material, parent: "body", ...extra });

function surfacePatch(builder, frame, options) {
  // A small panel lying on the torso, addressed by centre angle and y range.
  const { angle, halfAngle, y0, y1, inflate, tint, colorAt = null, nu = 10, nv = 6, skew = 0, puff = 0.004 } = options;
  builder.grid(
    nu,
    nv,
    (u, v, out) => {
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const a = angle + halfAngle * (u * 2 - 1) + skew * (v * 2 - 1);
      const y = lerp(y0, y1, v);
      const ring = frame.torsoAt(y);
      const extra = inflate + puff * Math.min(1, edge * 8) - (edge === 0 ? 0.008 : 0);
      out.set(Math.sin(a) * (ring.rx + extra), y, ring.cz + Math.cos(a) * (ring.rz + extra));
    },
    { tint, colorAt }
  );
}

function verticalSeam(builder, frame, angle, y0, y1, inflate, radius, tint, radial = 4) {
  const points = [];
  for (let i = 0; i <= 8; i += 1) {
    const y = lerp(y0, y1, i / 8);
    const ring = frame.torsoAt(y);
    points.push(vec(Math.sin(angle) * (ring.rx + inflate), y, ring.cz + Math.cos(angle) * (ring.rz + inflate)));
  }
  builder.tube(points, radius, { radial, capStart: false, capEnd: false, tint, up: vec(0, 0, 1) });
}

function button(builder, frame, y, inflate, radius, tint, angle = 0) {
  const ring = frame.torsoAt(y);
  builder.ellipsoid(Math.sin(angle) * (ring.rx + inflate), y, ring.cz + Math.cos(angle) * (ring.rz + inflate), radius, radius, radius * 0.5, { nu: 8, nv: 5, tint });
}

/** A collar flap on one side, from the side of the neck down to the throat. */
function collarFlap(builder, frame, side, options) {
  const { inflate = 0.03, length = 0.1, y0 = 1.44, tint, spread = 0.11 } = options;
  builder.grid(
    10,
    5,
    (u, v, out, i, j) => {
      const a = lerp(side * 1.25, side * 0.05, u);
      const y = lerp(y0, 1.395, u) - v * length * lerp(0.75, 1.3, u);
      const ring = frame.torsoAt(y);
      const fold = 0.016 + v * 0.018 + (j === 0 ? 0 : 0.004);
      const out1 = Math.sin(a) * (ring.rx + inflate + fold) + side * spread * v * u * 0.55;
      out.set(out1, y, ring.cz + Math.cos(a) * (ring.rz + inflate + fold));
    },
    { tint, flip: side > 0 }
  );
}

// --- prints ------------------------------------------------------------------

function printedMaterial(print, item, roughness) {
  const canvas = paintPrint(print, item.color, item.accent);
  return new MeshStandardMaterial({ map: fabricTexture(canvas), roughness, metalness: 0 });
}

/** The cloth layer of an item: printed if the item has a print, else plain. */
function clothFor(item, materials, shared, roughness) {
  const print = printFor(item);
  if (!print) return { material: shared, tint: color(item.color), owns: false, print: null };
  return { material: printedMaterial(print, item, roughness), tint: null, owns: true, print };
}

// --- tops ---------------------------------------------------------------------

function buildTee(item, frame, materials) {
  const cloth = clothFor(item, materials, materials.soft, 0.66);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.72);
  const hem = 0.84;
  const top = crewNeck();
  torsoShell(main, frame, { hem, top, inflate: FIT.top, loose: 0.55, tint: cloth.tint, uvAt: bodyUV(hem, 1.42) });
  trim.tube(neckPath(frame, top, FIT.top + 0.002), 0.0125, { radial: 5, capStart: false, capEnd: false, tint: accent });
  for (const side of [1, -1]) {
    sleeve(main, frame, side, { t1: 0.4, inflate: (t) => lerp(0.02, 0.034, t), tint: cloth.tint, uvAt: sleeveUV });
    cuffBand(trim, frame, side, 0.4, 0.035, 0.037, accent);
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.soft)];
}

function buildLong(item, frame, materials) {
  const satin = item.tier === "premium" || item.tier === "luxury";
  const cloth = clothFor(item, materials, satin ? materials.satin : materials.soft, satin ? 0.38 : 0.7);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.78);
  const hem = 0.84;
  const collared = Boolean(item.accent);
  const top = collared ? vNeck(1.3, 0.55) : crewNeck();
  torsoShell(main, frame, { hem, top, inflate: FIT.top, loose: 0.6, tint: cloth.tint, uvAt: bodyUV(hem, 1.42) });
  if (collared) {
    for (const side of [1, -1]) collarFlap(trim, frame, side, { tint: accent, inflate: FIT.top + 0.004 });
    trim.tube(neckPath(frame, top, FIT.top + 0.003), 0.008, { radial: 5, capStart: false, capEnd: false, tint: accent });
    verticalSeam(trim, frame, 0, 0.88, 1.28, FIT.top + 0.004, 0.012, shade(accent, 0.8));
    for (let i = 0; i < 4; i += 1) button(trim, frame, 0.95 + i * 0.1, FIT.top + 0.014, 0.0115, accent);
  } else {
    trim.tube(neckPath(frame, top, FIT.top + 0.002), 0.0115, { radial: 5, capStart: false, capEnd: false, tint: accent });
  }
  for (const side of [1, -1]) {
    sleeve(main, frame, side, { t1: 0.975, inflate: (t) => lerp(0.018, 0.028, t), tint: cloth.tint, uvAt: sleeveUV });
    cuffBand(trim, frame, side, 0.975, 0.06, 0.032, accent);
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.soft)];
}

function buildPolo(item, frame, materials) {
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.8);
  const hem = 0.84;
  const top = vNeck(1.31, 0.42);
  torsoShell(main, frame, { hem, top, inflate: FIT.top, loose: 0.5, tint: base });
  for (const side of [1, -1]) {
    collarFlap(trim, frame, side, { tint: accent, inflate: FIT.top + 0.006, length: 0.1 });
    sleeve(main, frame, side, { t1: 0.42, inflate: (t) => lerp(0.02, 0.034, t), tint: base });
    cuffBand(trim, frame, side, 0.42, 0.05, 0.039, accent);
  }
  // Placket with buttons.
  surfacePatch(trim, frame, { angle: 0, halfAngle: 0.062, y0: 1.17, y1: 1.32, inflate: FIT.top + 0.004, tint: accent });
  for (let i = 0; i < 2; i += 1) button(trim, frame, 1.21 + i * 0.07, FIT.top + 0.014, 0.0115, shade(base, 0.7));
  return [part(main, materials.soft), part(trim, materials.soft)];
}

function ribbedHem(builder, frame, y0, y1, inflate, tint, stripes = null, loose = 0) {
  builder.grid(
    60,
    3,
    (u, v, out, i, j) => {
      const angle = TAU * u - PI;
      const y = lerp(y0, y1, v);
      const ring = looseRing(frame, Math.max(y, (y0 + y1) / 2), inflate, loose, 1.22, y0);
      const rib = 0.0035 * Math.sin(angle * 26);
      const inward = j === 0 ? 0.88 : 1;
      out.set(Math.sin(angle) * (ring.rx + rib) * inward, y, ring.cz + Math.cos(angle) * (ring.rz + rib) * inward);
    },
    { wrapU: true, tint: stripes ? null : tint, colorAt: stripes }
  );
}

function ribbedCuff(builder, frame, side, t0, t1, inflate, tint) {
  const arm = frame.arms[side];
  builder.tube(arm.slice(t0, t1, 2), (t, a) => arm.radius(lerp(t0, t1, t)) + inflate + 0.0025 * Math.sin(a * 9), { radial: 18, capStart: "flat", capEnd: "flat", tint });
}

function buildHoodie(item, frame, materials) {
  const cloth = clothFor(item, materials, materials.soft, 0.7);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const hood = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.74);
  const hem = 0.86;
  const hemBand = 0.82;
  const top = crewNeck(0.02, 1.43);
  torsoShell(main, frame, { hem, top, inflate: FIT.thick, loose: 0.85, tint: cloth.tint, uvAt: bodyUV(hem, 1.42) });
  ribbedHem(trim, frame, hemBand, hem + 0.008, FIT.thick + 0.003, shade(base, 0.8), null, 0.85);
  // Hood resting on the shoulders, with a soft rim round the neck.
  hood.ellipsoid(0, 1.435, -0.135, 0.21, 0.135, 0.125, { nu: 18, nv: 10, tint: shade(base, 0.92) });
  const rimPoints = [];
  for (let i = 0; i <= 28; i += 1) {
    const a = (i / 28) * TAU - PI;
    const y = 1.47 - 0.05 * Math.pow(Math.max(0, Math.cos(a)), 2) + 0.02 * Math.pow(Math.max(0, -Math.cos(a)), 2);
    rimPoints.push(vec(Math.sin(a) * 0.155, y, -0.014 + Math.cos(a) * 0.135));
  }
  hood.tube(rimPoints, 0.034, { radial: 7, capStart: false, capEnd: false, tint: shade(base, 0.86) });
  // Kangaroo pocket.
  surfacePatch(main, frame, { angle: 0, halfAngle: 0.68, y0: 0.885, y1: 1.05, inflate: FIT.thick + 0.003, tint: cloth.tint ? shade(cloth.tint, 0.9) : null, nu: 18, nv: 6, puff: 0.006, colorAt: cloth.tint ? null : (u, v, c) => c.setScalar(0.86) });
  // Drawstrings.
  for (const side of [1, -1]) {
    const points = smoothPath([vec(side * 0.05, 1.41, 0.17), vec(side * 0.06, 1.33, 0.22), vec(side * 0.064, 1.2, 0.235)], 8);
    trim.tube(points, 0.0072, { radial: 5, capStart: false, capEnd: "round", tint: accent });
    trim.ellipsoid(side * 0.064, 1.195, 0.235, 0.011, 0.018, 0.011, { nu: 7, nv: 5, tint: shade(accent, 0.75) });
  }
  for (const side of [1, -1]) {
    sleeve(main, frame, side, { t1: 0.93, inflate: (t) => lerp(0.03, 0.044, t), tint: cloth.tint, uvAt: sleeveUV });
    ribbedCuff(trim, frame, side, 0.93, 0.995, 0.027, accent);
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(hood, materials.soft), part(trim, materials.soft)];
}

function buildSweater(item, frame, materials) {
  const cloth = clothFor(item, materials, materials.matte, 0.92);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.76);
  const hem = 0.875;
  const top = crewNeck(0.03, 1.43);
  torsoShell(main, frame, { hem, top, inflate: FIT.thick - 0.004, loose: 0.8, tint: cloth.tint, uvAt: bodyUV(hem, 1.42) });
  ribbedHem(trim, frame, 0.83, hem + 0.008, FIT.thick + 0.002, accent, null, 0.8);
  trim.tube(neckPath(frame, top, FIT.thick - 0.002), (t, a) => 0.02 + 0.0015 * Math.sin(a * 4), { radial: 8, capStart: false, capEnd: false, tint: accent });
  for (const side of [1, -1]) {
    sleeve(main, frame, side, { t1: 0.93, inflate: (t) => lerp(0.028, 0.036, t), tint: cloth.tint, uvAt: sleeveUV });
    ribbedCuff(trim, frame, side, 0.93, 0.995, 0.024, accent);
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.soft)];
}

const TOPS = { tee: buildTee, long: buildLong, polo: buildPolo, hoodie: buildHoodie, sweater: buildSweater };

export function buildTop(item, frame, materials) {
  return (TOPS[item.model] ?? buildTee)(item, frame, materials);
}

function topFit(item) {
  if (!item) return FIT.bodice;
  return item.model === "hoodie" || item.model === "sweater" ? FIT.thick : FIT.top;
}

// --- bottoms ------------------------------------------------------------------

function pelvis(builder, frame, options) {
  const { waistY = 0.92, inflate = FIT.bottom, tint = null, uvAt = null } = options;
  builder.grid(
    36,
    8,
    (u, v, out) => {
      const angle = TAU * u - PI;
      const y = lerp(0.705, waistY, v);
      const ring = frame.torsoAt(y);
      const scale = v === 0 ? 0 : 1;
      const ease = Math.min(1, (y - 0.705) / 0.04);
      // Fuller at the seat: the thighs then leave the hips low down, at a clear
      // angle, along one clean line instead of skimming the surface.
      // (Below every shirt hem, which starts at 0.84.)
      const seat = 0.03 * smoothstep(0.835, 0.775, y) * smoothstep(0.705, 0.75, y);
      out.set(Math.sin(angle) * (ring.rx + inflate + seat) * scale, y, ring.cz + Math.cos(angle) * (ring.rz + inflate * ease + seat) * scale);
    },
    { wrapU: true, poleStart: true, tint, uvAt }
  );
}

function trouserLeg(builder, frame, side, options) {
  const { t1 = 0.965, inflate = 0.02, straight = 0.02, tint = null, radial = 14, flare = 0, uvAt = null, cuff = false } = options;
  const leg = frame.legs[side];
  const radiusAt = (t) => {
    const x = t * t1;
    // The very top of the leg stays inside the hips of whatever is worn over it.
    const fitted = leg.radius(x) + inflate * smoothstep(0, 0.25, x);
    const line = lerp(leg.radius(0.1) * 0.86, 0.098 + flare, smoothstep(0, 1, x));
    return Math.max(fitted, lerp(fitted, line, Math.min(1, straight * 40))) * (cuff && t > 0.92 ? lerp(1, 0.82, smoothstep(0.92, 0.97, t)) : 1);
  };
  builder.tube(leg.slice(0, t1, 15), radiusAt, { radial, capStart: false, capEnd: "flat", tint, uvAt });
}

function waistband(builder, frame, y0, y1, inflate, tint) {
  builder.grid(
    48,
    4,
    (u, v, out) => {
      const angle = TAU * u - PI;
      const y = lerp(y0, y1, v);
      const ring = frame.torsoAt(y);
      out.set(Math.sin(angle) * (ring.rx + inflate), y, ring.cz + Math.cos(angle) * (ring.rz + inflate));
    },
    { wrapU: true, tint }
  );
}

function legStripe(builder, frame, side, tint, options = {}) {
  const { inset = 0, width = 0.016, t1 = 0.93 } = options;
  const leg = frame.legs[side];
  const path = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = lerp(0.02, t1, i / 18);
    const p = leg.point(t);
    const radial = Math.max(leg.radius(t) + 0.02, lerp(leg.radius(0.1) * 0.86, 0.098, t));
    path.push(p.add(vec(side * Math.cos(inset) * (radial + 0.003), 0, Math.sin(inset) * (radial + 0.003))));
  }
  builder.tube(path, width, { radial: 5, flatten: 0.4, up: vec(side, 0, 0), capStart: false, capEnd: false, tint });
}

function buildPants(item, frame, materials) {
  const shiny = item.tier === "premium";
  const cloth = clothFor(item, materials, shiny ? materials.satin : materials.matte, shiny ? 0.4 : 0.85);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.72);
  const jogger = /jogger|track|tristripe|nebula/.test(item.id);
  const uv = (u, v, out, p) => out.set(u, clamp((p.y - 0.1) / 0.95));
  pelvis(main, frame, { tint: cloth.tint, uvAt: uv });
  for (const side of [1, -1]) {
    trouserLeg(main, frame, side, { tint: cloth.tint, straight: jogger ? 0.008 : 0.025, inflate: 0.022, cuff: jogger, uvAt: uv });
    if (item.accent) {
      legStripe(trim, frame, side, accent, { inset: 0, width: 0.021 });
      legStripe(trim, frame, side, shade(accent, 0.9), { inset: 0.42, width: 0.009 });
      legStripe(trim, frame, side, shade(accent, 0.9), { inset: -0.42, width: 0.009 });
    }
    if (jogger) {
      const leg = frame.legs[side];
      trim.tube(leg.slice(0.92, 0.985, 3), (t) => 0.078, { radial: 18, capStart: "flat", capEnd: "flat", tint: shade(base, 0.74) });
    }
    if (/cargo/.test(item.id)) {
      const leg = frame.legs[side];
      const center = leg.point(0.42);
      trim.ellipsoid(center.x + side * 0.112, center.y, center.z + 0.01, 0.024, 0.066, 0.062, { nu: 10, nv: 8, tint: shade(base, 0.84) });
      trim.ellipsoid(center.x + side * 0.124, center.y + 0.052, center.z + 0.01, 0.02, 0.022, 0.066, { nu: 10, nv: 6, tint: shade(base, 0.74) });
    }
    if (/jeans|denim/.test(item.id)) {
      // Pocket stitching on the upper thigh, below where a top's hem falls.
      const leg = frame.legs[side];
      const p = leg.point(0.27);
      const r = Math.max(leg.radius(0.27) + 0.022, lerp(leg.radius(0.1) * 0.86, 0.098, 0.27));
      const points = smoothPath([vec(p.x + side * r * 0.86, p.y + 0.04, p.z + r * 0.5), vec(p.x + side * r * 0.42, p.y, p.z + r * 0.91), vec(p.x - side * r * 0.3, p.y + 0.012, p.z + r * 0.95)], 8);
      trim.tube(points, 0.0048, { radial: 4, capStart: false, capEnd: false, tint: mixColor(base, color("#D9B67A"), 0.75) });
    }
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.soft)];
}

function buildShorts(item, frame, materials) {
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const uvBase = base;
  pelvis(main, frame, { tint: uvBase });
  for (const side of [1, -1]) {
    const leg = frame.legs[side];
    main.tube(leg.slice(0, 0.42, 8), (t) => Math.max(leg.radius(t * 0.42) + 0.022 * smoothstep(0, 0.6, t), 0.125 + 0.018 * t), { radial: 16, capStart: false, capEnd: "flat", tint: base });
    trim.tube(leg.slice(0.385, 0.425, 1), () => 0.146, { radial: 16, capStart: "flat", capEnd: "flat", tint: shade(base, 0.8) });
  }
  return [part(main, materials.matte), part(trim, materials.soft)];
}

/** Outer radius of a skirt at height y, so a long coat can clear it. */
function skirtProfile(frame, waistY, hemY, flare, y) {
  const t = clamp((waistY - y) / (waistY - hemY));
  const hip = frame.torsoAt(Math.max(y, 0.86));
  const widest = frame.torsoAt(0.86);
  const rx = Math.max(hip.rx, widest.rx * smoothstep(0, 0.4, t) + hip.rx * (1 - smoothstep(0, 0.4, t)));
  const rz = Math.max(hip.rz, widest.rz * smoothstep(0, 0.4, t) + hip.rz * (1 - smoothstep(0, 0.4, t)));
  const spread = flare * Math.pow(t, 1.35);
  return { rx: rx + spread, rz: rz + spread, cz: hip.cz };
}

function addSkirt(builder, frame, options) {
  const { waistY, hemY, flare, inflate = FIT.bottom, pleats = 0, pleatDepth = 0.012, ruffle = 0, tint = null, colorAt = null, uvAt = null, nu = 96, nv = 10 } = options;
  builder.grid(
    nu,
    nv,
    (u, v, out, i, j) => {
      const angle = TAU * u - PI;
      const t = 1 - v;
      const y = lerp(waistY, hemY, t);
      const profile = skirtProfile(frame, waistY, hemY, flare, y);
      let radial = inflate;
      if (pleats) radial += pleatDepth * Math.abs(Math.sin(angle * pleats)) * smoothstep(0.02, 0.5, t);
      if (ruffle) radial += ruffle * Math.sin(angle * 11) * smoothstep(0.25, 1, t);
      const inward = j === 0 ? 0.74 : 1;
      out.set(Math.sin(angle) * (profile.rx + radial) * inward, j === 0 ? y + 0.012 : y, profile.cz + Math.cos(angle) * (profile.rz + radial) * inward);
    },
    { wrapU: true, tint, colorAt, uvAt }
  );
}

function buildSkirt(item, frame, materials) {
  const pleated = /pleat/.test(item.id);
  const cloth = clothFor(item, materials, item.tier === "luxury" ? materials.satin : materials.soft, 0.55);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.76);
  const waistY = 1.045;
  const hemY = 0.5;
  const flare = pleated ? 0.13 : 0.1;
  const uv = (u, v, out, p) => out.set(u * 3, clamp((p.y - hemY) / (waistY - hemY)));
  addSkirt(main, frame, { waistY, hemY, flare, pleats: pleated ? 16 : 0, pleatDepth: 0.016, ruffle: /wave/.test(item.id) ? 0.009 : 0, tint: cloth.tint, uvAt: uv });
  if (item.accent) {
    trim.grid(
      96,
      3,
      (u, v, out) => {
        const angle = TAU * u - PI;
        const y = lerp(hemY + 0.005, hemY + 0.06, v);
        const profile = skirtProfile(frame, waistY, hemY, flare, y);
        const pleat = pleated ? 0.016 * Math.abs(Math.sin(angle * 16)) * smoothstep(0.02, 0.5, (waistY - y) / (waistY - hemY)) : 0;
        const wave = /wave/.test(item.id) ? 0.009 * Math.sin(angle * 11) * smoothstep(0.25, 1, (waistY - y) / (waistY - hemY)) : 0;
        out.set(Math.sin(angle) * (profile.rx + FIT.bottom + pleat + wave + 0.0035), y, profile.cz + Math.cos(angle) * (profile.rz + FIT.bottom + pleat + wave + 0.0035));
      },
      { wrapU: true, tint: accent }
    );
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.soft)];
}

export function buildBottom(item, frame, materials) {
  if (item.model === "shorts") return buildShorts(item, frame, materials);
  if (item.model === "skirt") return buildSkirt(item, frame, materials);
  return buildPants(item, frame, materials);
}

// --- outfits ------------------------------------------------------------------

function bodice(builder, frame, tint, uvAt = null) {
  torsoShell(builder, frame, { hem: 0.975, top: STRAP_NECK, inflate: FIT.bodice, nu: 64, nv: 12, tint, uvAt });
}

function buildDress(item, frame, materials) {
  const cloth = clothFor(item, materials, materials.soft, 0.6);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#FFFFFF"), 0.45);
  const waistY = 1.0;
  const hemY = 0.46;
  const flare = 0.17;
  const uv = (u, v, out, p) => out.set(u * 4, p.y * 2);
  bodice(main, frame, cloth.tint, uv);
  addSkirt(main, frame, { waistY, hemY, flare, inflate: FIT.bodice, ruffle: 0.006, tint: cloth.tint, uvAt: uv });
  // Sash and hem trim.
  waistband(trim, frame, 0.965, 1.02, FIT.bodice + 0.008, accent);
  trim.tube(neckPath(frame, STRAP_NECK, FIT.bodice + 0.002, 96), 0.0085, { radial: 5, capStart: false, capEnd: false, tint: accent });
  trim.grid(
    96,
    2,
    (u, v, out) => {
      const angle = TAU * u - PI;
      const y = lerp(hemY + 0.005, hemY + 0.04, v);
      const profile = skirtProfile(frame, waistY, hemY, flare, y);
      const wave = 0.006 * Math.sin(angle * 11) * smoothstep(0.25, 1, (waistY - y) / (waistY - hemY));
      out.set(Math.sin(angle) * (profile.rx + FIT.bodice + wave + 0.004), y, profile.cz + Math.cos(angle) * (profile.rz + FIT.bodice + wave + 0.004));
    },
    { wrapU: true, tint: accent }
  );
  if (/wrap/.test(item.id)) {
    const points = [];
    for (let i = 0; i <= 10; i += 1) {
      const t = i / 10;
      const y = lerp(1.0, 1.3, t);
      const a = lerp(-0.62, 0.42, t);
      const ring = frame.torsoAt(y);
      points.push(vec(Math.sin(a) * (ring.rx + FIT.bodice + 0.004), y, ring.cz + Math.cos(a) * (ring.rz + FIT.bodice + 0.004)));
    }
    trim.tube(points, 0.009, { radial: 5, capStart: false, capEnd: false, tint: accent });
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.soft)];
}

function buildGown(item, frame, materials, underJacket) {
  const cloth = clothFor(item, materials, materials.satin, 0.34);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#FFFFFF"), 0.5);
  const waistY = 0.985;
  const hemY = 0.03;
  const flare = /ball|prism|moon|celest/.test(item.id) || item.tier === "luxury" || item.tier === "legendary" ? 0.5 : 0.36;
  const uv = (u, v, out, p) => out.set(u * 3, p.y * 1.4);
  bodice(main, frame, cloth.tint, uv);
  addSkirt(main, frame, { waistY, hemY, flare, inflate: FIT.bodice, pleats: 15, pleatDepth: 0.02, nu: 120, nv: 12, tint: cloth.tint, uvAt: uv });
  waistband(trim, frame, 0.95, 1.01, FIT.bodice + 0.01, accent);
  trim.tube(neckPath(frame, STRAP_NECK, FIT.bodice + 0.002, 96), 0.0105, { radial: 6, capStart: false, capEnd: false, tint: accent });
  // A scalloped overlay at the hem.
  trim.grid(
    120,
    3,
    (u, v, out) => {
      const angle = TAU * u - PI;
      const y = lerp(hemY + 0.006, hemY + 0.075 + 0.012 * Math.sin(angle * 15), v);
      const profile = skirtProfile(frame, waistY, hemY, flare, y);
      const pleat = 0.02 * Math.abs(Math.sin(angle * 15)) * smoothstep(0.02, 0.5, (waistY - y) / (waistY - hemY));
      out.set(Math.sin(angle) * (profile.rx + FIT.bodice + pleat + 0.004), y, profile.cz + Math.cos(angle) * (profile.rz + FIT.bodice + pleat + 0.004));
    },
    { wrapU: true, tint: accent }
  );
  for (const side of underJacket ? [] : [1, -1]) {
    const arm = frame.arms[side];
    main.tube(arm.slice(0, 0.2, 8), (t) => arm.radius(0) + 0.008 + 0.03 * Math.sin(Math.min(1, t * 1.15) * PI), { radial: 18, capStart: "round", capEnd: "flat", tint: cloth.tint ?? base, uvAt: (u, v, out) => out.set(0.01, 0.97) });
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.satin)];
}

function lapel(builder, frame, side, options) {
  const { inflate, y0, width, tint, top = 1.41 } = options;
  // A wide lapel from the throat to the button point, folded out over the chest.
  builder.grid(
    8,
    4,
    (u, v, out, i, j) => {
      const t = u;
      const y = lerp(y0, top - 0.04 * (1 - t), t);
      const center = lerp(0.03, 0.52, Math.pow(t, 0.85));
      const a = side * (center + v * width * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.1))));
      const ring = frame.torsoAt(y);
      const lift = inflate + (j === 0 ? 0 : 0.006);
      out.set(Math.sin(a) * (ring.rx + lift), y, ring.cz + Math.cos(a) * (ring.rz + lift));
    },
    { tint, flip: side > 0 }
  );
}

function buildSuit(item, frame, materials) {
  const lux = item.tier === "legendary" || item.tier === "rare";
  const fabric = lux ? materials.satin : materials.soft;
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const shirt = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : color("#FFFFFF");
  const shirtColor = mixColor(accent, color("#FFFFFF"), item.tier === "premium" ? 0.86 : 0.35);
  const hem = 0.79;
  const open = vNeck(1.03, 0.82, 1.43);
  // Shirt and tie in the V.
  torsoShell(shirt, frame, { hem: 0.98, top: crewNeck(0.008, 1.43), inflate: FIT.top - 0.004, nu: 40, nv: 12, tint: shirtColor });
  for (const side of [1, -1]) collarFlap(shirt, frame, side, { inflate: FIT.top, tint: mixColor(shirtColor, color("#FFFFFF"), 0.3), length: 0.085, y0: 1.435, spread: 0.06 });
  const tieColor = item.tier === "premium" ? accent : shade(base, 0.72);
  const tiePoints = smoothPath([vec(0, 1.4, 0.158), vec(0, 1.27, 0.194), vec(0, 1.08, 0.2)], 8);
  shirt.tube(tiePoints, (t) => lerp(0.018, 0.04, smoothstep(0.1, 0.9, t)) * (t > 0.96 ? 0.2 : 1), { radial: 6, flatten: 0.3, up: vec(1, 0, 0), capStart: "flat", capEnd: "flat", tint: tieColor });
  shirt.ellipsoid(0, 1.4, 0.16, 0.026, 0.02, 0.016, { nu: 8, nv: 5, tint: shade(tieColor, 0.9) });
  if (/three/.test(item.id) || item.tier === "legendary") {
    torsoShell(shirt, frame, { hem: 0.92, top: vNeck(1.11, 0.7, 1.4), inflate: FIT.thick - 0.014, nu: 40, nv: 10, tint: shade(base, 0.82) });
    for (let i = 0; i < 3; i += 1) button(shirt, frame, 0.98 + i * 0.065, FIT.thick - 0.004, 0.0095, accent);
  }
  // Blazer.
  torsoShell(main, frame, { hem, top: open, inflate: FIT.suit, loose: 0.55, tint: base, nu: 56, nv: 18 });
  for (const side of [1, -1]) {
    lapel(trim, frame, side, { inflate: FIT.suit + 0.003, y0: 1.02, width: 0.3, tint: shade(base, 0.76), top: 1.42 });
    sleeve(main, frame, side, { t1: 0.965, inflate: (t) => lerp(0.04, 0.042, t), tint: base });
    cuffBand(trim, frame, side, 0.93, 0.008, 0.044, lux ? accent : shade(base, 0.7));
    surfacePatch(trim, frame, { angle: side * 0.92, halfAngle: 0.17, y0: 0.9, y1: 0.915, inflate: FIT.suit + 0.002, tint: shade(base, 0.78), nu: 6, nv: 2 });
  }
  verticalSeam(trim, frame, 0, hem, 1.03, FIT.suit + 0.002, 0.0036, shade(base, 0.6));
  button(trim, frame, 1.0, FIT.suit + 0.008, 0.013, accent);
  button(trim, frame, 0.92, FIT.suit + 0.008, 0.013, accent);
  surfacePatch(trim, frame, { angle: 0.56, halfAngle: 0.13, y0: 1.2, y1: 1.235, inflate: FIT.suit + 0.002, tint: accent, nu: 6, nv: 2 });
  // Trousers.
  pelvis(main, frame, { waistY: 0.86, tint: base });
  for (const side of [1, -1]) trouserLeg(main, frame, side, { tint: base, straight: 0.025, inflate: 0.022 });
  for (const side of [1, -1]) {
    const leg = frame.legs[side];
    const points = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = lerp(0.25, 0.94, i / 12);
      const p = leg.point(t);
      const r = Math.max(leg.radius(t) + 0.022, lerp(leg.radius(0.1) * 0.86, 0.098, t));
      points.push(p.add(vec(0, 0, r + 0.0015)));
    }
    trim.tube(points, 0.0032, { radial: 4, capStart: false, capEnd: false, tint: shade(base, 0.68) });
  }
  return [part(main, fabric), part(shirt, materials.soft), part(trim, fabric)];
}

export function buildOutfit(item, frame, materials, underJacket = false) {
  if (item.model === "gown") return buildGown(item, frame, materials, underJacket);
  if (item.model === "suit") return buildSuit(item, frame, materials);
  return buildDress(item, frame, materials);
}

function outfitFit(item) {
  if (!item) return null;
  return item.model === "suit" ? FIT.suit : FIT.bodice;
}

// --- jackets ------------------------------------------------------------------

function jacketTop(tall = 1.45) {
  return crewNeck(0.02, tall);
}

function closedJacketBody(builder, frame, options) {
  const { hem = 0.84, inflate = FIT.jacket, loose = 0.75, tint, top = jacketTop(), uvAt = null, colorAt = null } = options;
  torsoShell(builder, frame, { hem, top, inflate, loose, tint, colorAt, uvAt, nu: 48, nv: 16 });
}

function openJacketBody(builder, frame, options) {
  const { hem = 0.84, inflate = FIT.jacket, loose = 0.75, tint, top = jacketTop(), gap = 0.24, uvAt = null } = options;
  torsoShell(builder, frame, { hem, top, inflate, loose, tint, gap, uvAt, nu: 48, nv: 16 });
  // Finish the front edges so the shell has thickness.
  for (const side of [1, -1]) {
    const points = [];
    const gapAt = typeof gap === "function" ? gap : () => gap;
    for (let i = 0; i <= 18; i += 1) {
      const y = lerp(hem, 1.32, i / 18);
      const g = gapAt(y) * side;
      const ring = looseRing(frame, y, inflate, loose, 1.22, hem);
      points.push(vec(Math.sin(g) * ring.rx, y, ring.cz + Math.cos(g) * ring.rz));
    }
    builder.tube(points, 0.015, { radial: 6, capStart: false, capEnd: false, tint: tint ? shade(tint, 0.82) : null, up: vec(0, 0, 1) });
  }
}

function jacketSleeves(builder, frame, options) {
  const { inflate = 0.05, t1 = 0.97, tint, uvAt = null } = options;
  for (const side of [1, -1]) sleeve(builder, frame, side, { t1, inflate, tint, uvAt, radial: 14 });
}

function zipper(builder, frame, y0, y1, inflate, tint, angle = 0) {
  verticalSeam(builder, frame, angle, y0, y1, inflate, 0.0085, tint, 5);
  const ring = frame.torsoAt(y1 - 0.02);
  builder.ellipsoid(Math.sin(angle) * (ring.rx + inflate + 0.008), y1 - 0.04, ring.cz + Math.cos(angle) * (ring.rz + inflate + 0.008), 0.011, 0.02, 0.006, { nu: 7, nv: 5, tint });
}

function buildWindbreaker(item, frame, materials, ctx) {
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const panel = mixColor(base, color("#FFFFFF"), 0.62);
  const dark = shade(base, 0.62);
  const hem = ctx.hem ?? 0.84;
  const colorAt = (u, v, c) => {
    const y = lerp(hem, 1.42, v);
    c.copy(y > 1.09 && y < 1.2 ? panel : base);
  };
  closedJacketBody(main, frame, { hem, inflate: FIT.jacket, tint: null, colorAt });
  for (const side of [1, -1]) {
    sleeve(main, frame, side, { t1: 0.97, inflate: 0.052, tint: base, radial: 14 });
    cuffBand(trim, frame, side, 0.3, 0.06, 0.056, panel);
    ribbedCuff(trim, frame, side, 0.945, 1.0, 0.04, dark);
  }
  trim.tube(neckPath(frame, jacketTop(1.45), FIT.jacket - 0.005), 0.034, { radial: 9, capStart: false, capEnd: false, tint: dark });
  ribbedHem(trim, frame, hem - 0.02, hem + 0.02, FIT.jacket + 0.005, dark, null, 0.75);
  zipper(trim, frame, hem, 1.42, FIT.jacket + 0.002, color("#D7DEE9"));
  return [part(main, materials.satin), part(trim, materials.soft)];
}

function buildTrucker(item, frame, materials, ctx) {
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const dark = shade(base, 0.7);
  const stitch = color("#E5C48E");
  const hem = ctx.hem ?? 0.87;
  openJacketBody(main, frame, { hem, inflate: FIT.jacket, gap: 0.2, tint: base });
  jacketSleeves(main, frame, { tint: base, inflate: 0.05 });
  for (const side of [1, -1]) {
    collarFlap(trim, frame, side, { inflate: FIT.jacket, length: 0.13, tint: dark, y0: 1.46 });
    ribbedCuff(trim, frame, side, 0.93, 0.985, 0.046, dark);
    surfacePatch(trim, frame, { angle: side * 0.66, halfAngle: 0.26, y0: 1.2, y1: 1.26, inflate: FIT.jacket + 0.002, tint: dark, nu: 8, nv: 3 });
    button(trim, frame, 1.23, FIT.jacket + 0.012, 0.0115, stitch, side * 0.66);
    verticalSeam(trim, frame, side * 0.34, hem, 1.32, FIT.jacket + 0.002, 0.0035, stitch);
    verticalSeam(trim, frame, side * 1.0, hem, 1.2, FIT.jacket + 0.002, 0.0035, stitch);
    for (let i = 0; i < 4; i += 1) button(trim, frame, 0.94 + i * 0.1, FIT.jacket + 0.01, 0.01, stitch, side * 0.28);
  }
  ribbedHem(trim, frame, hem - 0.04, hem + 0.012, FIT.jacket + 0.005, dark, null, 0.75);
  return [part(main, materials.matte), part(trim, materials.soft)];
}

function varsityStripes(main, accent) {
  return (u, v, c) => {
    const band = Math.floor(v * 5);
    c.copy(band === 1 || band === 3 ? main : accent);
  };
}

function buildVarsity(item, frame, materials, ctx) {
  const main = new MeshBuilder();
  const sleeves = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : color("#F2EDE4");
  const hem = ctx.hem ?? 0.85;
  closedJacketBody(main, frame, { hem, inflate: FIT.jacket, tint: base });
  jacketSleeves(sleeves, frame, { tint: accent, inflate: 0.05 });
  const stripes = varsityStripes(base, accent);
  ribbedHem(trim, frame, hem - 0.03, hem + 0.05, FIT.jacket + 0.006, null, stripes, 0.75);
  trim.tube(neckPath(frame, jacketTop(1.45), FIT.jacket - 0.002), 0.03, { radial: 9, capStart: false, capEnd: false, tint: accent });
  for (const side of [1, -1]) ribbedCuff(trim, frame, side, 0.925, 0.995, 0.046, base);
  verticalSeam(trim, frame, 0, hem, 1.4, FIT.jacket + 0.002, 0.0048, accent);
  for (let i = 0; i < 5; i += 1) button(trim, frame, 0.9 + i * 0.105, FIT.jacket + 0.009, 0.0125, accent);
  // Chest letter: a bold N for MathNexa, built from three bars.
  const bar = (x0, y0, x1, y1) => {
    const points = [];
    for (let i = 0; i <= 3; i += 1) {
      const t = i / 3;
      const a = lerp(x0, x1, t);
      const y = lerp(y0, y1, t);
      const ring = looseRing(frame, y, FIT.jacket + 0.003, 0.75, 1.22, hem);
      points.push(vec(Math.sin(a) * ring.rx, y, ring.cz + Math.cos(a) * ring.rz));
    }
    trim.tube(points, 0.0115, { radial: 5, flatten: 0.5, up: vec(0, 0, 1), capStart: "flat", capEnd: "flat", tint: accent });
  };
  bar(0.42, 1.17, 0.42, 1.28);
  bar(0.62, 1.17, 0.62, 1.28);
  bar(0.42, 1.28, 0.62, 1.17);
  return [part(main, materials.soft), part(sleeves, materials.satin), part(trim, materials.soft)];
}

function buildBomber(item, frame, materials, ctx) {
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.7);
  const hem = ctx.hem ?? 0.85;
  closedJacketBody(main, frame, { hem, inflate: (y) => FIT.jacket + 0.012 * Math.sin(clamp((y - hem) / 0.4) * PI), loose: 0.95, tint: base });
  for (const side of [1, -1]) {
    sleeve(main, frame, side, { t1: 0.93, inflate: (t) => 0.055 + 0.012 * Math.sin(t * PI), tint: base, radial: 14 });
    ribbedCuff(trim, frame, side, 0.92, 0.995, 0.044, accent);
    // Utility pocket on the sleeve.
    const arm = frame.arms[side];
    const center = arm.point(0.26);
    trim.ellipsoid(center.x + side * 0.112, center.y, center.z + 0.012, 0.012, 0.042, 0.03, { nu: 8, nv: 6, tint: accent });
    surfacePatch(trim, frame, { angle: side * 0.62, halfAngle: 0.16, y0: 0.94, y1: 0.95, inflate: FIT.jacket + 0.008, tint: accent, nu: 6, nv: 2, skew: side * 0.06 });
  }
  ribbedHem(trim, frame, hem - 0.04, hem + 0.05, FIT.jacket + 0.018, accent, null, 0.95);
  trim.tube(neckPath(frame, jacketTop(1.45), FIT.jacket - 0.002), 0.034, { radial: 9, capStart: false, capEnd: false, tint: accent });
  zipper(trim, frame, hem, 1.42, FIT.jacket + 0.012, color("#D7DEE9"));
  return [part(main, materials.satin), part(trim, materials.soft)];
}

function buildMoto(item, frame, materials, ctx) {
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const metal = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : color("#BAC2CF");
  const hem = ctx.hem ?? 0.86;
  closedJacketBody(main, frame, { hem, inflate: FIT.jacket, loose: 0.6, tint: base });
  jacketSleeves(main, frame, { tint: base, inflate: 0.05 });
  // Diagonal zip, the signature of the shape.
  const zipPoints = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const y = lerp(hem, 1.4, t);
    const a = lerp(-0.1, 0.5, smoothstep(0.25, 1, t));
    const ring = looseRing(frame, y, FIT.jacket + 0.003, 0.6, 1.22, hem);
    zipPoints.push(vec(Math.sin(a) * ring.rx, y, ring.cz + Math.cos(a) * ring.rz));
  }
  metal.tube(zipPoints, 0.0078, { radial: 5, capStart: false, capEnd: false, tint: accent });
  // Wide lapels.
  for (const side of [1, -1]) {
    const start = side > 0 ? 0.5 : -0.5;
    trim.grid(
      10,
      4,
      (u, v, out, i, j) => {
        const y = lerp(1.2, 1.44, u);
        const center = lerp(start, side * 0.2, u);
        const a = center + side * v * lerp(0.42, 0.2, u);
        const ring = looseRing(frame, y, FIT.jacket + (j === 0 ? 0 : 0.007), 0.6, 1.22, hem);
        out.set(Math.sin(a) * ring.rx, y, ring.cz + Math.cos(a) * ring.rz);
      },
      { tint: shade(base, 1.5), flip: side > 0 }
    );
    surfacePatch(trim, frame, { angle: side * 0.92, halfAngle: 0.24, y0: 0.94, y1: 0.955, inflate: FIT.jacket + 0.004, tint: shade(base, 1.8), nu: 6, nv: 2 });
    metal.ellipsoid(side * frame.shoulderX * 0.96, 1.355, 0.0, 0.012, 0.012, 0.012, { nu: 8, nv: 5, tint: accent });
    for (let i = 0; i < 3; i += 1) {
      const arm = frame.arms[side];
      const p = arm.point(0.78 + i * 0.05);
      metal.ellipsoid(p.x + side * 0.1, p.y, p.z, 0.007, 0.007, 0.007, { nu: 6, nv: 4, tint: accent });
    }
    metal.ellipsoid(side * 0.18, 1.0, 0.205, 0.012, 0.012, 0.008, { nu: 6, nv: 4, tint: accent });
  }
  // Belt with a buckle.
  ribbedHem(trim, frame, hem - 0.008, hem + 0.05, FIT.jacket + 0.007, shade(base, 1.3), null, 0.6);
  const ring = looseRing(frame, hem + 0.02, FIT.jacket + 0.012, 0.6, 1.22, hem);
  metal.grid(
    10,
    3,
    (u, v, out) => {
      const a = lerp(-0.1, 0.1, u);
      const y = lerp(hem - 0.015, hem + 0.055, v);
      out.set(Math.sin(a) * ring.rx, y, ring.cz + Math.cos(a) * ring.rz);
    },
    { tint: accent }
  );
  return [part(main, materials.gloss), part(trim, materials.satin), part(metal, materials.metal)];
}

function buildPuffer(item, frame, materials, ctx) {
  const cloth = clothFor(item, materials, materials.satin, 0.34);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.76);
  const hem = ctx.hem ?? 0.82;
  const bands = 7;
  const bandAt = (y) => {
    const x = clamp((y - hem) / (1.4 - hem)) * bands;
    return 0.5 + 0.5 * Math.cos((x - Math.floor(x) - 0.5) * TAU);
  };
  torsoShell(main, frame, {
    hem,
    top: jacketTop(1.45),
    inflate: (y) => FIT.puffer - 0.03 + 0.03 * Math.pow(bandAt(y), 0.55),
    loose: 0.92,
    nu: 40,
    nv: 42,
    tint: cloth.tint,
    colorAt: cloth.tint
      ? (u, v, c) => {
          const y = lerp(hem, 1.42, v);
          c.copy(cloth.tint).multiplyScalar(lerp(0.62, 1, Math.pow(bandAt(y), 0.45)));
        }
      : (u, v, c) => {
          const y = lerp(hem, 1.42, v);
          c.setScalar(lerp(0.66, 1, Math.pow(bandAt(y), 0.45)));
        },
    uvAt: bodyUV(hem, 1.42)
  });
  for (const side of [1, -1]) {
    const arm = frame.arms[side];
    const samples = 36;
    const t1 = 0.96;
    const cuffs = 6;
    const bump = (t) => 0.5 + 0.5 * Math.cos((t * cuffs - Math.floor(t * cuffs) - 0.5) * TAU);
    const path = arm.slice(0, t1, samples);
    const startVertex = main.vertexCount;
    main.tube(path, (t) => arm.radius(t * t1) + 0.045 + 0.033 * Math.pow(bump(t), 0.55), { radial: 11, capStart: "round", capEnd: "flat", tint: cloth.tint, uvAt: sleeveUV });
    const rows = samples + 1 + 5;
    for (let j = 0; j < rows; j += 1) {
      const t = clamp((j - 4) / samples);
      const s = lerp(0.68, 1, Math.pow(bump(t), 0.45));
      for (let i = 0; i <= 11; i += 1) {
        const index = (startVertex + j * 12 + i) * 4;
        main.colors[index] *= s;
        main.colors[index + 1] *= s;
        main.colors[index + 2] *= s;
      }
    }
    ribbedCuff(trim, frame, side, 0.94, 0.995, 0.044, shade(accent, 0.92));
  }
  // High quilted collar.
  const collar = [];
  for (let i = 0; i <= 28; i += 1) {
    const a = (i / 28) * TAU - PI;
    collar.push(vec(Math.sin(a) * 0.175, 1.482 - 0.02 * Math.cos(a), -0.012 + Math.cos(a) * 0.15));
  }
  main.tube(collar, 0.05, { radial: 8, capStart: false, capEnd: false, tint: cloth.tint ?? color("#FFFFFF"), uvAt: (u, v, uv) => uv.set(0.02, 0.98) });
  zipper(trim, frame, hem, 1.5, FIT.puffer + 0.002, accent);
  ribbedHem(trim, frame, hem - 0.018, hem + 0.018, FIT.puffer - 0.02, shade(accent, 0.8), null, 0.92);
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.soft)];
}

function buildCoat(item, frame, materials, ctx) {
  const cloth = clothFor(item, materials, materials.satin, 0.44);
  const main = new MeshBuilder();
  const trim = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : shade(base, 0.7);
  const shortened = ctx.skirted;
  const hem = shortened ? 0.84 : 0.4;
  const flareAt = (y) => (shortened ? 0 : 0.17 * Math.pow(clamp((0.96 - y) / 0.56), 1.4));
  const gap = (y) => (y > 1.0 ? lerp(0.16, 0.42, clamp((y - 1.0) / 0.42)) : lerp(0.16, 0.34, clamp((1.0 - y) / 0.6)));
  torsoShell(main, frame, {
    hem,
    top: jacketTop(1.45),
    inflate: (y) => FIT.jacket + flareAt(y) + (ctx.bottomRadius ? Math.max(0, ctx.bottomRadius(y)) : 0),
    loose: 0.5,
    gap,
    nu: 56,
    nv: 22,
    tint: cloth.tint,
    uvAt: bodyUV(hem, 1.42)
  });
  jacketSleeves(main, frame, { tint: cloth.tint, inflate: 0.056, uvAt: (u, v, uv) => uv.set(0.5, 0.75) });
  const frontEdge = (side) => {
    const points = [];
    for (let i = 0; i <= 24; i += 1) {
      const y = lerp(hem + 0.004, 1.41, i / 24);
      const a = side * gap(y);
      const ring = looseRing(frame, y, FIT.jacket + flareAt(y) + (ctx.bottomRadius ? Math.max(0, ctx.bottomRadius(y)) : 0), 0.5, 1.22, hem);
      points.push(vec(Math.sin(a) * ring.rx, y, ring.cz + Math.cos(a) * ring.rz));
    }
    return points;
  };
  for (const side of [1, -1]) {
    trim.tube(frontEdge(side), 0.021, { radial: 7, capStart: false, capEnd: false, flatten: 0.7, up: vec(0, 0, 1), tint: accent });
    ribbedCuff(trim, frame, side, 0.93, 0.975, 0.058, accent);
    collarFlap(trim, frame, side, { inflate: FIT.jacket + 0.004, length: 0.16, tint: accent, y0: 1.47, spread: 0.2 });
  }
  // Belt across the waist.
  const beltY = 0.99;
  for (const side of [1, -1]) {
    trim.grid(
      24,
      2,
      (u, v, out) => {
        const a = side * lerp(gap(beltY), PI, u);
        const y = lerp(beltY - 0.028, beltY + 0.028, v);
        const ring = looseRing(frame, y, FIT.jacket + flareAt(y) + 0.006, 0.5, 1.22, hem);
        out.set(Math.sin(a) * ring.rx, y, ring.cz + Math.cos(a) * ring.rz);
      },
      { tint: accent, flip: side < 0 }
    );
  }
  return [part(main, cloth.material, { ownsMaterial: cloth.owns }), part(trim, materials.satin)];
}

const JACKETS = { windbreaker: buildWindbreaker, trucker: buildTrucker, varsity: buildVarsity, bomber: buildBomber, moto: buildMoto, puffer: buildPuffer, coat: buildCoat };

/**
 * `wearing` describes what the jacket goes over: a flared skirt shortens a long
 * coat, a straight skirt only widens it.
 */
export function buildJacket(item, frame, materials, wearing) {
  const skirted = wearing.outfitModel === "dress" || wearing.outfitModel === "gown";
  const ctx = {
    skirted,
    hem: null,
    // A long coat widens just enough to clear a skirt under it.
    bottomRadius: wearing.bottomModel === "skirt" && !wearing.outfitModel ? (y) => smoothstep(0.98, 0.74, y) * Math.max(0, 0.13 * Math.pow(clamp((1.04 - y) / 0.54), 1.35) - 0.17 * Math.pow(clamp((0.96 - y) / 0.56), 1.4) + 0.012) : null
  };
  return (JACKETS[item.model] ?? buildWindbreaker)(item, frame, materials, ctx);
}

export function jacketIsOpen(item) {
  return item.model === "trucker" || item.model === "coat";
}

/** The radius a necklace must clear at chest height for what is being worn. */
export function chestInflate(avatar) {
  if (avatar.jacket && !jacketIsOpen(avatar.jacket)) return avatar.jacket.model === "puffer" ? FIT.puffer : FIT.jacket;
  if (avatar.outfit) return outfitFit(avatar.outfit);
  return topFit(avatar.top);
}

export function wristInflate(avatar) {
  if (avatar.jacket) return avatar.jacket.model === "puffer" ? 0.08 : 0.052;
  if (avatar.outfit?.model === "suit") return 0.042;
  if (avatar.outfit) return 0;
  if (avatar.top?.model === "long") return 0.03;
  if (avatar.top?.model === "hoodie" || avatar.top?.model === "sweater") return 0.04;
  return 0;
}

