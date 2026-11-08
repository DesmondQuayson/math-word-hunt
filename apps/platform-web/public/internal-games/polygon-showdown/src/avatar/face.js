// Eyes, brows, lips, makeup and facial hair. Soft makeup (blush, eye shadow)
// is painted into the face texture; crisp makeup (liner, lipstick) is geometry
// so it stays sharp at any zoom and catches the light.

import { Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, clamp, color, lerp, seeded, smoothPath, smoothstep, vec } from "./geometry.js";
import { EYE, FACE_WINDOW, MOUTH_PITCH, MOUTH_YAW, NOSE_PITCH, eyeFrame, eyePoint, headPoint, lowerLidElevation, upperLidElevation } from "./head.js";

// --- canvas colour helpers (sRGB, 0..255) -------------------------------

function rgb(hex) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#808a99";
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, alpha = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
const hexOf = (c) => `#${c.map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0")).join("")}`;

/** Lips with no lipstick: a warmer, slightly deeper version of the skin. */
export function naturalLipColor(skinHex) {
  const skin = rgb(skinHex);
  return hexOf(mix(mix(skin, [168, 67, 63], 0.45), [40, 15, 15], 0.1));
}

function soft(ctx, x, y, rx, ry, c, alpha, rotation = 0, hold = 0.45) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, css(c, alpha));
  gradient.addColorStop(hold, css(c, alpha * 0.72));
  gradient.addColorStop(1, css(c, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- textures ------------------------------------------------------------

export function paintEyeTexture(canvas) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width;
  const c = s / 2;
  ctx.fillStyle = "#F7F3EC";
  ctx.fillRect(0, 0, s, s);
  const corners = ctx.createRadialGradient(c, c, s * 0.3, c, c, s * 0.62);
  corners.addColorStop(0, "rgba(120,95,105,0)");
  corners.addColorStop(1, "rgba(120,95,105,0.5)");
  ctx.fillStyle = corners;
  ctx.fillRect(0, 0, s, s);

  const iris = s * 0.365;
  const irisGradient = ctx.createRadialGradient(c, c + s * 0.05, s * 0.05, c, c, iris);
  irisGradient.addColorStop(0, "#8A5A34");
  irisGradient.addColorStop(0.5, "#5A3620");
  irisGradient.addColorStop(0.86, "#2E1A10");
  irisGradient.addColorStop(1, "#160C08");
  ctx.fillStyle = irisGradient;
  ctx.beginPath();
  ctx.arc(c, c, iris, 0, TAU);
  ctx.fill();

  // Fine fibres give the iris depth at bust zoom.
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i += 1) {
    const a = (i / 90) * TAU;
    ctx.strokeStyle = i % 2 ? "rgba(214,160,104,0.14)" : "rgba(40,20,10,0.2)";
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * s * 0.15, c + Math.sin(a) * s * 0.15);
    ctx.lineTo(c + Math.cos(a) * iris * 0.92, c + Math.sin(a) * iris * 0.92);
    ctx.stroke();
  }

  ctx.fillStyle = "#0A0607";
  ctx.beginPath();
  ctx.arc(c, c, s * 0.175, 0, TAU);
  ctx.fill();

  // Lid shadow across the top of the eye.
  const lid = ctx.createLinearGradient(0, 0, 0, s * 0.42);
  lid.addColorStop(0.34, "rgba(20,12,16,0.5)");
  lid.addColorStop(1, "rgba(20,12,16,0)");
  ctx.fillStyle = lid;
  ctx.fillRect(0, 0, s, s * 0.42);

  // Catch lights: a soft hexagon (the Polygon Showdown signature) and a dot.
  const hexX = c - s * 0.1;
  const hexY = c - s * 0.095;
  const hexR = s * 0.082;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const x = hexX + Math.cos(a) * hexR;
    const y = hexY + Math.sin(a) * hexR;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.arc(c + s * 0.105, c + s * 0.12, s * 0.03, 0, TAU);
  ctx.fill();
}

function project(yaw, pitch, size) {
  const p = headPoint(yaw, pitch);
  return { x: (p.x / FACE_WINDOW.width + 0.5) * size, y: (0.5 - (p.y - FACE_WINDOW.centerY) / FACE_WINDOW.height) * size };
}

function projectPoint(p, size) {
  return { x: (p.x / FACE_WINDOW.width + 0.5) * size, y: (0.5 - (p.y - FACE_WINDOW.centerY) / FACE_WINDOW.height) * size };
}

/** Skin, soft modelling and soft makeup, in a frontal projection of the face. */
export function paintFace(canvas, { skin, blush = null, shadow = null, glitter = false }) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width;
  const unit = s / FACE_WINDOW.width;
  const skinRgb = rgb(skin);
  const deep = mix(skinRgb, [38, 16, 14], 0.62);
  const warm = mix(skinRgb, [226, 88, 72], 0.5);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = css(skinRgb);
  ctx.fillRect(0, 0, s, s);

  for (const side of [1, -1]) {
    const cheek = project(side * 0.62, -0.4, s);
    soft(ctx, cheek.x, cheek.y, unit * 0.13, unit * 0.09, warm, 0.2);
    const eye = projectPoint(eyeFrame(side).center, s);
    soft(ctx, eye.x, eye.y + unit * 0.004, unit * 0.15, unit * 0.13, deep, 0.05);
    soft(ctx, eye.x, eye.y + unit * 0.1, unit * 0.105, unit * 0.05, mix(skinRgb, [255, 238, 222], 0.3), 0.5);
    // Lid crease, a hair above the top lid.
    const frame = eyeFrame(side);
    ctx.lineCap = "round";
    ctx.strokeStyle = css(deep, 0.16);
    ctx.lineWidth = unit * 0.008;
    ctx.beginPath();
    for (let i = 0; i <= 16; i += 1) {
      const alpha = lerp(-EYE.corner * 0.92, EYE.corner * 0.98, i / 16);
      const outer = alpha * side;
      const point = projectPoint(eyePoint(frame, outer * side, upperLidElevation(alpha, 1) + 0.2 + 0.12 * Math.sin((i / 16) * Math.PI), EYE.radius * 1.06), s);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
    const nostril = project(side * 0.058, NOSE_PITCH - 0.075, s);
    soft(ctx, nostril.x, nostril.y, unit * 0.014, unit * 0.0095, deep, 0.75, side * 0.3, 0.6);
    const corner = project(side * MOUTH_YAW * 1.06, MOUTH_PITCH + 0.075, s);
    soft(ctx, corner.x, corner.y, unit * 0.016, unit * 0.02, deep, 0.32);
  }
  const noseShade = project(0, NOSE_PITCH - 0.1, s);
  soft(ctx, noseShade.x, noseShade.y, unit * 0.06, unit * 0.022, deep, 0.24);
  const underLip = project(0, MOUTH_PITCH - 0.2, s);
  soft(ctx, underLip.x, underLip.y, unit * 0.075, unit * 0.022, deep, 0.28);

  if (shadow) {
    const tint = rgb(shadow);
    const rand = seeded(5);
    for (const side of [1, -1]) {
      const eye = projectPoint(eyeFrame(side).center, s);
      soft(ctx, eye.x + side * unit * 0.008, eye.y - unit * 0.052, unit * 0.135, unit * 0.082, tint, 0.92, side * -0.08, 0.6);
      soft(ctx, eye.x + side * unit * 0.078, eye.y - unit * 0.052, unit * 0.07, unit * 0.05, tint, 0.62, side * -0.4, 0.5);
      soft(ctx, eye.x, eye.y - unit * 0.03, unit * 0.11, unit * 0.05, tint, 0.9, 0, 0.7);
      if (glitter) {
        for (let i = 0; i < 90; i += 1) {
          const a = rand() * TAU;
          const d = Math.sqrt(rand());
          const px = eye.x + side * unit * 0.01 + Math.cos(a) * d * unit * 0.13;
          const py = eye.y - unit * 0.05 + Math.sin(a) * d * unit * 0.07;
          const r = 0.8 + rand() * 1.9;
          ctx.fillStyle = `rgba(255,255,255,${0.55 + rand() * 0.45})`;
          ctx.beginPath();
          ctx.moveTo(px, py - r * 2.1);
          ctx.lineTo(px + r * 0.5, py - r * 0.5);
          ctx.lineTo(px + r * 2.1, py);
          ctx.lineTo(px + r * 0.5, py + r * 0.5);
          ctx.lineTo(px, py + r * 2.1);
          ctx.lineTo(px - r * 0.5, py + r * 0.5);
          ctx.lineTo(px - r * 2.1, py);
          ctx.lineTo(px - r * 0.5, py - r * 0.5);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  if (blush) {
    const tint = rgb(blush);
    for (const side of [1, -1]) {
      const cheek = project(side * 0.64, -0.36, s);
      soft(ctx, cheek.x, cheek.y, unit * 0.17, unit * 0.115, tint, 0.62, side * -0.22, 0.22);
    }
  }
}

// --- geometry ------------------------------------------------------------

const mouthLine = (s) => MOUTH_PITCH + 0.105 * s * s - 0.01 * (1 - s * s);

export function buildLipsGeometry() {
  const builder = new MeshBuilder();
  // Upper lip, with a soft cupid's bow.
  builder.grid(20, 4, (u, v, out) => {
    const s = lerp(-1, 1, u);
    const w = Math.pow(1 - s * s, 0.55);
    const bow = 1 - 0.3 * Math.exp(-((s / 0.13) ** 2)) + 0.12 * Math.exp(-(((Math.abs(s) - 0.3) / 0.18) ** 2));
    const height = 0.092 * w * bow;
    const lift = -0.003 + 0.02 * Math.sin(Math.PI * Math.pow(v, 0.72)) * Math.pow(w, 0.6);
    headPoint(s * MOUTH_YAW, mouthLine(s) + height * v, lift, out);
  });
  // Lower lip: fuller.
  builder.grid(
    20,
    4,
    (u, v, out) => {
      const s = lerp(-1, 1, u);
      const w = Math.pow(1 - s * s, 0.72);
      const height = 0.128 * w;
      const lift = -0.003 + 0.028 * Math.sin(Math.PI * Math.pow(v, 0.72)) * Math.pow(w, 0.6);
      headPoint(s * MOUTH_YAW, mouthLine(s) - height * v, lift, out);
    },
    { flip: true }
  );
  return builder.toGeometry();
}

export function buildBrowsGeometry() {
  const builder = new MeshBuilder();
  for (const side of [1, -1]) {
    builder.grid(
      14,
      3,
      (u, v, out) => {
        const s = u;
        const yaw = side * lerp(0.17, 0.7, s);
        const pitch = 0.205 + 0.088 * Math.sin(Math.PI * Math.pow(s, 0.72)) - 0.04 * s;
        const end = Math.sqrt(1 - Math.pow(1 - Math.min(1, s / 0.1), 2));
        const half = lerp(0.056, 0.016, Math.pow(s, 1.2)) * end;
        const across = v * 2 - 1;
        const lift = -0.004 + 0.019 * (1 - across * across) * (1 - 0.3 * s) * end;
        headPoint(yaw, pitch + across * half, lift, out);
      },
      { flip: side < 0 }
    );
  }
  return builder.toGeometry();
}

/** Lash lines, mouth line and any eyeliner, in one vertex-coloured mesh. */
export function buildFaceDetailGeometry(liner, skinHex) {
  const builder = new MeshBuilder();
  const lash = color("#1B1210");
  const lowerTint = color(hexOf(mix(rgb(skinHex), [30, 14, 12], 0.5)));
  const mouthTint = color(hexOf(mix(rgb(skinHex), [52, 18, 20], 0.72)));
  const linerTint = liner ? color(liner.color) : lash;
  const winged = liner?.model === "winged";
  const lined = Boolean(liner);

  for (const side of [1, -1]) {
    const frame = eyeFrame(side);
    const samples = 16;
    const upper = [];
    for (let i = 0; i <= samples; i += 1) {
      const alpha = lerp(-EYE.corner, EYE.corner, i / samples);
      upper.push(eyePoint(frame, alpha, upperLidElevation(alpha, side) + 0.035, EYE.radius * 1.062));
    }
    const lashWidth = lined ? 0.0098 : 0.0072;
    builder.tube(
      upper,
      (t) => lashWidth * Math.pow(Math.sin(Math.PI * clamp(t, 0.02, 0.98)), 0.5) * (1 + 0.25 * (side > 0 ? t : 1 - t)),
      { radial: 4, flatten: lined ? 1.9 : 1.5, up: frame.forward, tint: linerTint }
    );
    const lower = [];
    for (let i = 0; i <= samples; i += 1) {
      const alpha = lerp(-EYE.corner * 0.92, EYE.corner * 0.92, i / samples);
      lower.push(eyePoint(frame, alpha, lowerLidElevation(alpha, side) - 0.02, EYE.radius * 1.05));
    }
    builder.tube(lower, (t) => (lined ? 0.0036 : 0.0028) * Math.pow(Math.sin(Math.PI * clamp(t, 0.02, 0.98)), 0.6), {
      radial: 3,
      up: frame.forward,
      tint: lined ? linerTint : lowerTint
    });

    // Liner flicks out past the outer corner; a wing rises to a fine point.
    if (lined) {
      const cornerAlpha = side * EYE.corner * 0.86;
      const start = eyePoint(frame, cornerAlpha, upperLidElevation(cornerAlpha, side) + 0.03, EYE.radius * 1.06);
      const startDir = start.clone().normalize();
      const startYaw = Math.atan2(startDir.x, startDir.z);
      const startPitch = Math.asin(startDir.y);
      const reach = winged ? 0.3 : 0.12;
      const rise = winged ? 0.15 : 0.03;
      const steps = 10;
      const wing = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        wing.push(headPoint(startYaw + side * reach * t, startPitch + rise * Math.pow(t, 1.25), lerp(0.016, 0.0045, smoothstep(0, 0.6, t))));
      }
      const base = winged ? 0.019 : 0.0115;
      builder.tube(wing, (t) => base * Math.pow(1 - t, 0.72), {
        radial: 5,
        flatten: 0.42,
        up: new Vector3(side * 0.4, 0.9, 0.2).normalize(),
        capEnd: false,
        tint: linerTint
      });
    }
  }

  const mouth = [];
  for (let i = 0; i <= 18; i += 1) {
    const s = lerp(-1.02, 1.02, i / 18);
    mouth.push(headPoint(s * MOUTH_YAW, mouthLine(s), 0.0035));
  }
  builder.tube(mouth, (t) => 0.0048 * Math.pow(Math.sin(Math.PI * clamp(t, 0.015, 0.985)), 0.4), { radial: 4, up: new Vector3(0, 0, 1), tint: mouthTint });
  return builder.toGeometry();
}

// --- facial hair ---------------------------------------------------------------

const FULL_FACE = 64;

/**
 * Shaped hair lying on the head. `depth(yaw, pitch)` is its height over the
 * skin; below zero it dives under, which gives a crisp edge at any zoom.
 */
function addFacialShell(builder, depth, options = {}) {
  const { yawRange = 1.85, pitch0 = -1.5, pitch1 = 0.08, nu = FULL_FACE, nv = 40, comb = 30, combDepth = 0.0042 } = options;
  const liftAt = (u, v) => {
    const yaw = lerp(-yawRange, yawRange, u);
    const pitch = lerp(pitch0, pitch1, v);
    const d = depth(yaw, pitch);
    return { yaw, pitch, d };
  };
  const inside = new Uint8Array((nu + 1) * (nv + 1));
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) inside[j * (nu + 1) + i] = liftAt(i / nu, j / nv).d > -0.012 ? 1 : 0;
  }
  builder.grid(
    nu,
    nv,
    (u, v, out) => {
      const { yaw, pitch, d } = liftAt(u, v);
      const comb2 = d > 0 ? Math.sin(yaw * comb) * combDepth * Math.min(1, d * 40) : 0;
      headPoint(yaw, pitch, d + comb2, out);
    },
    {
      colorAt: (u, v, c) => {
        const { yaw, d } = liftAt(u, v);
        c.setScalar(d > 0 ? 0.92 - (0.5 - 0.5 * Math.sin(yaw * comb)) * 0.26 : 0.7);
      },
      keepFace: (i, j) => {
        const a = j * (nu + 1) + i;
        const b = a + nu + 1;
        return inside[a] || inside[a + 1] || inside[b] || inside[b + 1];
      }
    }
  );
}

const mouthGap = (yaw, pitch, rx = 0.44, ry = 0.2) => ((yaw / rx) ** 2 + ((pitch - MOUTH_PITCH) / ry) ** 2 - 1) * 0.14;

function jawTop(yaw) {
  // Upper edge of a beard: sideburn at the ear, a clean curve under the cheek.
  const y = Math.abs(yaw);
  return lerp(-0.56, -0.4, smoothstep(0.42, 1.1, y)) + 0.42 * smoothstep(1.1, 1.5, y);
}

function addMustacheBand(builder, thickness = 0.026) {
  builder.grid(
    20,
    5,
    (u, v, out) => {
      const s = lerp(-1, 1, u);
      const w = Math.pow(1 - s * s, 0.42);
      const low = MOUTH_PITCH + 0.15 + 0.1 * s * s - 0.18 * s * s * s * s;
      const height = 0.13 * w;
      const across = v * 2 - 1;
      const lift = -0.008 + thickness * (1 - across * across) * Math.pow(w, 0.55);
      headPoint(s * 0.4, low + height * v - 0.0, lift + Math.sin(s * 34) * 0.0018, out);
    },
    { colorAt: (u, v, c) => c.setScalar(0.86 + 0.14 * Math.sin(u * 60)) }
  );
}

function addCurledMustache(builder, radiusScale = 1) {
  for (const side of [1, -1]) {
    const points = [];
    const samples = 24;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      let yaw;
      let pitch;
      if (t < 0.62) {
        const x = t / 0.62;
        yaw = lerp(0.02, 0.46, x);
        pitch = MOUTH_PITCH + 0.16 - 0.035 * Math.sin(x * Math.PI) + 0.03 * x * x;
      } else {
        const x = (t - 0.62) / 0.38;
        const a = -1.57 + x * 4.8;
        const r = lerp(0.11, 0.04, x);
        yaw = 0.47 + Math.cos(a) * r * 0.9 + 0.0;
        pitch = MOUTH_PITCH + 0.303 + Math.sin(a) * r * 1.05;
      }
      points.push(headPoint(side * yaw, pitch, 0.013 + 0.008 * (1 - t)));
    }
    builder.tube(points, (t) => radiusScale * lerp(0.03, 0.0065, Math.pow(t, 0.72)), {
      radial: 5,
      flatten: 0.85,
      up: new Vector3(0, 0, 1),
      capStart: "round",
      capEnd: "round",
      colorAt: (t, c) => c.setScalar(lerp(0.82, 1, t))
    });
  }
}

function addBeardLock(builder, x, z, length, width, tipX) {
  const top = headPoint(Math.asin(clamp(x / 0.36, -1, 1)), -1.1, 0.04);
  const tip = top.y - length;
  const points = [top, vec(lerp(x, tipX, 0.25), lerp(top.y, tip, 0.33), z + 0.03), vec(lerp(x, tipX, 0.62), lerp(top.y, tip, 0.68), z + 0.02), vec(tipX, tip, z)];
  builder.tube(smoothPath(points, 10), (t) => width * Math.pow(1 - t * t * t, 0.8) * lerp(0.9, 1, smoothstep(0, 0.2, t)), {
    radial: 5,
    flatten: 2.1,
    up: new Vector3(0, 0, 1),
    capStart: false,
    capEnd: false,
    colorAt: (t, col) => col.setScalar(lerp(0.72, 1, smoothstep(0, 0.6, t)))
  });
}

export function buildFacialHairGeometry(model) {
  const builder = new MeshBuilder();
  switch (model) {
    case "mustache":
      addMustacheBand(builder);
      break;
    case "curledmustache":
      addCurledMustache(builder);
      break;
    case "shortbeard":
      addFacialShell(builder, (yaw, pitch) => Math.min((jawTop(yaw) - pitch) * 0.1, mouthGap(yaw, pitch) + 0.006, 0.016) - 0.0005);
      addMustacheBand(builder, 0.016);
      break;
    case "goatee":
      addFacialShell(
        builder,
        (yaw, pitch) => {
          const chin = ((yaw / 0.36) ** 2 + ((pitch + 1.02) / 0.3) ** 2 - 1) * -0.1;
          return Math.min(chin, mouthGap(yaw, pitch, 0.32, 0.16) + 0.012, 0.034);
        },
        { yawRange: 0.7, pitch0: -1.45, pitch1: -0.6, nu: 36, nv: 24, comb: 44, combDepth: 0.004 }
      );
      break;
    case "sculptedgoatee":
      addFacialShell(
        builder,
        (yaw, pitch) => {
          const y = Math.abs(yaw);
          const point = lerp(-1.4, -0.86, Math.pow(y / 0.36, 0.7));
          const shape = Math.min((pitch - point) * 0.14, (0.36 - y) * 0.2);
          const gap = mouthGap(yaw, pitch, 0.36, 0.16) + 0.008;
          const lift = 0.024 + 0.05 * smoothstep(-1.05, -1.38, pitch);
          return Math.min(shape, gap, lift);
        },
        { yawRange: 0.62, pitch0: -1.52, pitch1: -0.56, nu: 36, nv: 26, comb: 46, combDepth: 0.003 }
      );
      addMustacheBand(builder, 0.022);
      break;
    case "fullbeard":
    case "royalbeard": {
      const royal = model === "royalbeard";
      addFacialShell(
        builder,
        (yaw, pitch) => {
          const volume = royal ? 0.078 : 0.064;
          const chin = smoothstep(-0.7, -1.3, pitch);
          return Math.min((jawTop(yaw) - pitch) * 0.2, mouthGap(yaw, pitch, 0.42, 0.19) + 0.012, 0.03 + chin * volume);
        },
        { comb: 30, combDepth: 0.008 }
      );
      if (royal) {
        const count = 11;
        for (let i = 0; i < count; i += 1) {
          const f = i / (count - 1);
          const x = lerp(-0.3, 0.3, f);
          const middle = 1 - Math.abs(f * 2 - 1);
          addBeardLock(builder, x, lerp(0.29, 0.345, middle), lerp(0.17, 0.46, Math.pow(middle, 0.8)), lerp(0.024, 0.03, middle), x * 0.2);
        }
        addCurledMustache(builder, 1.05);
      } else {
        addMustacheBand(builder, 0.03);
      }
      break;
    }
    default:
      break;
  }
  return builder.toGeometry();
}
