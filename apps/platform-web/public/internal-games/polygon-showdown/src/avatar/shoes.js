// All six shoe shapes from one foot loft. Shoes that raise the foot (platforms
// and heels) report a lift so the whole figure stands on them.

import { MeshBuilder, TAU, clamp, color, lerp, mixColor, shade, smoothPath, smoothstep, vec } from "./geometry.js";

const HEEL_Z = -0.105;
const TOE_Z = 0.265;

const SPECS = Object.freeze({
  sneaker: { sole: 0.05, height: 0.78, toe: 1, lift: 0.02 },
  flat: { sole: 0.018, height: 0.62, toe: 0.86, lift: 0 },
  boot: { sole: 0.04, height: 0.82, toe: 1, lift: 0.015 },
  hightop: { sole: 0.05, height: 0.78, toe: 1, lift: 0.02 },
  platform: { sole: 0.115, height: 0.74, toe: 1, lift: 0.085 },
  heel: { sole: 0.014, height: 0.68, toe: 0.78, lift: 0.075 }
});

export function shoeLift(model) {
  return (SPECS[model] ?? SPECS.sneaker).lift;
}

// Half width and top height of the foot along its length (s: heel to toe).
function footWidth(s, toe) {
  const heel = Math.sqrt(clamp(s / 0.14));
  const tip = Math.sqrt(clamp((1 - s) / 0.2));
  return lerp(0.064, 0.086 * toe + 0.004, smoothstep(0.1, 0.72, s)) * heel * tip;
}

function footTop(s, height) {
  // A high collar behind the ankle sloping down the instep to a low toe box.
  const collar = lerp(0.2, 0.076, smoothstep(0.2, 0.68, s));
  return collar * height * lerp(0.82, 1, smoothstep(0, 0.12, s)) * Math.sqrt(clamp((1 - s) / 0.09));
}

function heelRaise(s, spec, model) {
  return model === "heel" ? spec.lift * smoothstep(0.66, 0.2, s) * 1.25 : 0;
}

function addFootBody(builder, cx, spec, model, options) {
  const { tint = null, colorAt = null, opening = null, shrink = 0, offsetY = 0 } = options;
  const nu = 20;
  const nv = 16;
  const yBase = spec.sole;
  const isOpen = opening;
  builder.grid(
    nu,
    nv,
    (u, v, out) => {
      const s = v;
      const a = TAU * u;
      const width = Math.max(0, footWidth(s, spec.toe) - shrink);
      const top = Math.max(0, footTop(s, spec.height) - shrink);
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      // Flat underneath, a soft dome on top.
      const y = sinA >= 0 ? Math.pow(sinA, 0.82) * top : sinA * 0.008;
      const x = cosA * width * (sinA >= 0 ? 1 : 1 - 0.18 * -sinA);
      out.set(cx + x, yBase + y + heelRaise(s, spec, model) + offsetY, lerp(HEEL_Z, TOE_Z, s));
    },
    {
      wrapU: true,
      poleStart: true,
      poleEnd: true,
      tint,
      colorAt,
      keepFace: isOpen ? (i, j) => !isOpen((i + 0.5) / nu, (j + 0.5) / nv) : null
    }
  );
}

function addSole(builder, cx, spec, model, tint, options = {}) {
  const { flare = 0.012, thickness = spec.sole } = options;
  const outline = (s) => footWidth(s, spec.toe) + flare * Math.min(1, s / 0.08, (1 - s) / 0.08);
  const zAt = (s) => lerp(HEEL_Z - flare, TOE_Z + flare, s);
  const rows = 12;
  builder.grid(
    6,
    rows,
    (u, v, out, i, j) => {
      const s = j / rows;
      const raise = heelRaise(s, spec, model);
      const w = outline(s);
      // A closed loop round the sole's cross-section.
      const px = [-1, -1, -1, 1, 1, 1, -1][i];
      const level = [1, 1, 0, 0, 1, 1, 1][i];
      const y = level === 1 ? thickness + raise : raise * 0.98 + 0.002;
      out.set(cx + px * w * (level === 1 ? 0.96 : 1), y, zAt(s));
    },
    { wrapU: true, tint }
  );
}

function addLaces(builder, cx, spec, tint) {
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const s = lerp(0.36, 0.66, i / (steps - 1));
    const z = lerp(HEEL_Z, TOE_Z, s);
    const y = spec.sole + footTop(s, spec.height) + 0.0035;
    const w = footWidth(s, spec.toe) * 0.46;
    const points = smoothPath([vec(cx - w, y - 0.012, z), vec(cx, y + 0.003, z), vec(cx + w, y - 0.012, z)], 4);
    builder.tube(points, 0.0072, { radial: 4, flatten: 0.6, up: vec(0, 1, 0), capStart: false, capEnd: false, tint });
  }
}

function addCollar(builder, cx, top, radius, tint, inflate = 0.008) {
  const points = [];
  for (let i = 0; i <= 14; i += 1) {
    const a = (i / 14) * TAU;
    points.push(vec(cx + Math.sin(a) * (radius + inflate), top, -0.01 + Math.cos(a) * (radius + inflate) * 1.08));
  }
  builder.tube(points, 0.016, { radial: 5, capStart: false, capEnd: false, tint });
}

/** A boot or high-top leg, always a little wider than the shin inside it. */
function addShaft(builder, cx, leg, y0, y1, clearance, tint) {
  const radiusAtY = (y) => {
    for (let i = 0; i <= 40; i += 1) {
      const t = 1 - i / 40;
      if (leg.point(t).y >= y) return leg.radius(t);
    }
    return leg.radius(0.5);
  };
  const rows = 6;
  const profile = [];
  for (let i = 0; i <= rows; i += 1) {
    const y = lerp(y0, y1, i / rows);
    profile.push([radiusAtY(y) + clearance, y]);
  }
  profile.push([radiusAtY(y1) + clearance * 0.5, y1 + 0.004]);
  builder.lathe(profile, { nu: 20, cx, cz: -0.004, tint });
}

function addHeelPost(builder, cx, spec, tint) {
  const z = lerp(HEEL_Z, TOE_Z, 0.14);
  builder.lathe(
    [
      [0.0, 0.0],
      [0.018, 0.0],
      [0.017, 0.03],
      [0.03, spec.lift * 1.25 + spec.sole],
      [0.0, spec.lift * 1.25 + spec.sole + 0.002]
    ],
    { nu: 12, cx, cz: z, tint, poleStart: true, poleEnd: true }
  );
}

/** Both shoes. `footX` is the ankle's distance from the centre line. */
export function buildShoes(item, frame, materials, skinHex, shinsCovered = false) {
  const model = SPECS[item.model] ? item.model : "sneaker";
  const spec = SPECS[model];
  const main = new MeshBuilder();
  const sole = new MeshBuilder();
  const detail = new MeshBuilder();
  const skin = new MeshBuilder();
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#000000"), 0.38);
  const soleTint = model === "boot" ? color("#2A241E") : model === "flat" || model === "heel" ? shade(base, 0.6) : model === "platform" ? mixColor(base, color("#FFFFFF"), 0.55) : color("#F4F6FA");
  const detailShade = shade(base, 0.82);

  for (const side of [1, -1]) {
    const leg = frame.legs[side];
    const ankle = leg.point(1);
    const cx = ankle.x;
    if (model === "flat" || model === "heel") {
      // An open vamp shows the top of the foot.
      const opening = (u, v) => {
        const top = Math.sin(TAU * u);
        return v > 0.17 && v < 0.62 && top > (model === "heel" ? 0.62 : 0.68);
      };
      addFootBody(skin, cx, spec, model, { shrink: 0.006, tint: color(skinHex) });
      addFootBody(main, cx, spec, model, {
        opening,
        colorAt: item.accent ? (u, v, c) => c.copy(v > 0.74 ? accent : base) : (u, v, c) => c.copy(base)
      });
      if (model === "heel") {
        addHeelPost(sole, cx, spec, accent);
        const sparkles = 7;
        for (let i = 0; i < sparkles; i += 1) {
          const s = lerp(0.68, 0.92, i / (sparkles - 1));
          const z = lerp(HEEL_Z, TOE_Z, s);
          detail.ellipsoid(cx + Math.sin(i * 2.4) * footWidth(s, spec.toe) * 0.5, spec.sole + footTop(s, spec.height) + 0.003, z, 0.007, 0.007, 0.007, { nu: 6, nv: 4, tint: accent });
        }
      } else {
        // A small bow on the toe.
        const z = lerp(HEEL_Z, TOE_Z, 0.78);
        const y = spec.sole + footTop(0.78, spec.height) + 0.004;
        for (const dir of [1, -1]) detail.ellipsoid(cx + dir * 0.018, y, z, 0.018, 0.011, 0.008, { nu: 8, nv: 5, tint: detailShade });
      }
    } else {
      addFootBody(main, cx, spec, model, {
        colorAt: (u, v, c) => {
          const top = Math.sin(TAU * u);
          const toeCap = v > 0.84;
          const heelCounter = v < 0.14 && top > 0.1;
          c.copy(model === "boot" ? (toeCap ? detailShade : base) : toeCap || heelCounter ? accent : base);
        }
      });
    }
    if (model !== "heel") addSole(sole, cx, spec, model, soleTint);
    else addSole(sole, cx, spec, model, shade(base, 0.55), { flare: 0.006 });

    if (model === "sneaker" || model === "hightop" || model === "platform") addLaces(detail, cx, spec, item.accent && model !== "sneaker" ? accent : color("#FFFFFF"));
    if (model === "sneaker") {
      addCollar(detail, cx, spec.sole + 0.128, 0.062, accent, 0.004);
      detail.ellipsoid(cx + side * 0.074, spec.sole + 0.05, lerp(HEEL_Z, TOE_Z, 0.5), 0.006, 0.019, 0.06, { nu: 8, nv: 6, tint: accent });
    }
    if (model === "platform") {
      for (let i = 0; i < 3; i += 1) {
        const y = 0.02 + i * 0.032;
        detail.grid(
          6,
          10,
          (u, v, out, a, b) => {
            const s = b / 10;
            const w = footWidth(s, spec.toe) + 0.0135 * Math.min(1, s / 0.08, (1 - s) / 0.08);
            const px = [-1, -1, 1, 1, -1, -1, -1][a];
            out.set(cx + px * w, y + (a === 0 || a === 3 || a === 4 ? 0.011 : 0), lerp(HEEL_Z - 0.0135, TOE_Z + 0.0135, s));
          },
          { wrapU: true, tint: accent }
        );
      }
      addCollar(detail, cx, spec.sole + 0.126, 0.062, accent, 0.004);
    }
    if (model === "hightop" || model === "boot") {
      const boot = model === "boot";
      const shaftTop = spec.sole + (boot ? 0.29 : 0.235);
      const radiusNear = (y) => {
        for (let i = 0; i <= 40; i += 1) {
          const t = 1 - i / 40;
          if (leg.point(t).y >= y) return leg.radius(t);
        }
        return 0.08;
      };
      const clearance = boot ? 0.02 : 0.016;
      // Long trousers go over the shaft, so only the foot of the boot is drawn.
      if (!shinsCovered) {
        addShaft(main, cx, leg, spec.sole + 0.08, shaftTop, clearance, base);
        addCollar(detail, cx, shaftTop + 0.004, radiusNear(shaftTop) + clearance - 0.006, boot ? detailShade : accent, 0.004);
        const rows = boot ? 4 : 3;
        for (let i = 0; i < rows; i += 1) {
          const y = spec.sole + 0.135 + i * (boot ? 0.04 : 0.032);
          const r = radiusNear(y) + clearance;
          const half = 0.034;
          const z = (k) => -0.004 + Math.sqrt(Math.max(0, r * r - k * k)) + 0.003;
          const points = smoothPath([vec(cx - half, y - 0.005, z(half)), vec(cx, y + 0.003, z(0) + 0.003), vec(cx + half, y - 0.005, z(half))], 4);
          detail.tube(points, 0.0064, { radial: 4, capStart: false, capEnd: false, tint: boot ? color("#D9C7A5") : item.accent ? accent : color("#FFFFFF") });
        }
      }
      if (boot) {
        addHeelPost(sole, cx, { lift: 0.0, sole: 0.0 }, soleTint);
        detail.grid(
          10,
          1,
          (u, v, out) => {
            const a = lerp(-1.3, 1.3, u);
            const y = lerp(spec.sole + 0.078, spec.sole + 0.1, v);
            out.set(cx + side * (shinsCovered ? 0.07 : 0.1) * Math.cos(a), y, -0.006 + Math.sin(a) * (shinsCovered ? 0.08 : 0.104));
          },
          { tint: shade(base, 0.62), flip: side > 0 }
        );
      } else {
        // Ankle badge.
        const y = spec.sole + 0.15;
        detail.ellipsoid(cx + side * (radiusNear(y) + clearance + 0.002), y, -0.01, 0.006, 0.026, 0.026, { nu: 10, nv: 8, tint: accent });
      }
    }
  }
  const finish = model === "heel" || model === "platform" ? materials.satin : model === "boot" ? materials.satin : materials.soft;
  const parts = [
    { geometry: main.toGeometry(), material: finish, parent: "root" },
    { geometry: sole.toGeometry(), material: materials.matte, parent: "root" },
    { geometry: detail.toGeometry(), material: model === "heel" ? materials.metal : materials.soft, parent: "root" }
  ];
  if (skin.vertexCount) parts.push({ geometry: skin.toGeometry(), material: materials.soft, parent: "root" });
  return parts;
}
