// Every shoe in the shop, from one last. The upper is a single smooth surface
// with a real opening for the ankle, so a shoe holds up as a product on its own
// as well as on a foot. The tier sets how much is built onto it: a starter
// sneaker is a plain upper on a sole; a legendary one has layered panels,
// a faceted midsole, metal and gems.

import { Matrix4, Quaternion, Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";
import { MeshBuilder, TAU, clamp, color, lerp, mixColor, shade, smoothPath, smoothstep, vec } from "./geometry.js";

const HEEL_Z = -0.105;
const TOE_Z = 0.265;
const WALL_COLUMNS = 10;
const UPPER_COLUMNS = WALL_COLUMNS * 2 + 2;
const UPPER_ROWS = 34;

const SPECS = Object.freeze({
  sneaker: { sole: 0.042, toe: 1, lift: 0.02 },
  flat: { sole: 0.018, toe: 0.86, lift: 0 },
  boot: { sole: 0.04, toe: 1, lift: 0.015 },
  hightop: { sole: 0.042, toe: 1, lift: 0.02 },
  platform: { sole: 0.115, toe: 1, lift: 0.085 },
  heel: { sole: 0.014, toe: 0.78, lift: 0.075 }
});

/** Height of the upper above the sole, heel to toe. */
const PROFILES = Object.freeze({
  sneaker: [[0, 0.128], [0.05, 0.142], [0.27, 0.112], [0.47, 0.132], [0.72, 0.084], [0.9, 0.066], [1, 0.05]],
  platform: [[0, 0.128], [0.05, 0.142], [0.27, 0.112], [0.47, 0.132], [0.72, 0.084], [0.9, 0.066], [1, 0.05]],
  hightop: [[0, 0.135], [0.05, 0.15], [0.27, 0.12], [0.47, 0.138], [0.72, 0.086], [0.9, 0.066], [1, 0.05]],
  hightopTall: [[0, 0.228], [0.05, 0.232], [0.27, 0.232], [0.5, 0.212], [0.72, 0.092], [0.9, 0.066], [1, 0.05]],
  boot: [[0, 0.135], [0.05, 0.15], [0.27, 0.125], [0.47, 0.14], [0.72, 0.09], [0.9, 0.07], [1, 0.05]],
  // Stops below the fullest part of the calf, which would otherwise come through the back.
  bootTall: [[0, 0.272], [0.05, 0.274], [0.27, 0.272], [0.52, 0.254], [0.74, 0.1], [0.9, 0.07], [1, 0.05]],
  flat: [[0, 0.076], [0.06, 0.07], [0.3, 0.04], [0.6, 0.05], [0.7, 0.06], [0.9, 0.05], [1, 0.04]],
  heel: [[0, 0.09], [0.06, 0.085], [0.3, 0.035], [0.6, 0.042], [0.72, 0.06], [0.9, 0.045], [1, 0.035]]
});

const DETAIL = Object.freeze({ starter: 0, basic: 0, mid: 1, premium: 2, rare: 3, luxury: 3, legendary: 4 });
const LACED = new Set(["sneaker", "hightop", "platform", "boot"]);

export function shoeLift(model) {
  return (SPECS[model] ?? SPECS.sneaker).lift;
}

function curve(points) {
  const last = points.length - 1;
  const slopes = points.map((_, k) => {
    const a = points[Math.max(k - 1, 0)];
    const b = points[Math.min(k + 1, last)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  return (x) => {
    const s = clamp(x, points[0][0], points[last][0]);
    let k = 0;
    while (k < last - 1 && s > points[k + 1][0]) k += 1;
    const h = points[k + 1][0] - points[k][0];
    const t = (s - points[k][0]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * points[k][1] + (t3 - 2 * t2 + t) * h * slopes[k] + (-2 * t3 + 3 * t2) * points[k + 1][1] + (t3 - t2) * h * slopes[k + 1];
  };
}

function footWidth(s, toe) {
  const heel = Math.sqrt(clamp(s / 0.14));
  const tip = Math.sqrt(clamp((1 - s) / 0.2));
  return lerp(0.064, 0.086 * toe + 0.004, smoothstep(0.1, 0.72, s)) * heel * tip;
}

/** The shape every part of a shoe is measured against. */
function makeLast(model, spec, shinsCovered) {
  const tall = !shinsCovered && (model === "hightop" || model === "boot");
  const profile = curve(PROFILES[tall ? `${model}Tall` : model]);
  const open = model === "flat" || model === "heel";
  const holeCentre = 0.28;
  const holeReach = tall ? (model === "boot" ? 0.262 : 0.232) : 0.216;
  const holeWidth = tall ? (model === "boot" ? 0.104 : 0.09) : 0.064;
  // A tall shaft stays wide towards the back, because the calf inside it does.
  const holeRoundness = tall ? 2.8 : 2;
  const throatEnd = model === "boot" && tall ? 0.74 : 0.72;
  const rise = (s) => (model === "heel" ? spec.lift * smoothstep(0.66, 0.2, s) * 1.25 : 0);
  const spring = (s) => (open ? 0 : 0.016 * smoothstep(0.74, 1, s) ** 2);
  const width = (s) => footWidth(s, spec.toe);
  const height = (s) => profile(s) * Math.sqrt(clamp((1 - s) / 0.09));
  const openingEnd = open ? 0.62 : throatEnd;
  const halfOpening = (s) => {
    if (open) return s < 0.03 || s > openingEnd ? 0 : width(s) * 0.74 * (1 - smoothstep(0.52, openingEnd, s)) * smoothstep(0.03, 0.09, s);
    const d = (s - holeCentre) / holeReach;
    const hole = Math.abs(d) < 1 ? holeWidth * (1 - Math.abs(d) ** holeRoundness) ** (1 / holeRoundness) : 0;
    const throat = s > 0.38 && s < throatEnd ? 0.02 * smoothstep(throatEnd, throatEnd - 0.06, s) : 0;
    return Math.max(hole, throat);
  };
  // The upper sits down into the sole, so no gap can open at the join.
  const baseY = (s) => spec.sole - 0.005 + rise(s) + spring(s);
  const zAt = (s) => lerp(HEEL_Z, TOE_Z, s);
  /** A point on one wall: u runs from the sole's edge to the top. */
  const wall = (cx, side, u, s, offset, out) => {
    const edge = width(s);
    const inner = halfOpening(s);
    const angle = u * Math.PI * 0.5;
    // A tall shaft stands out sooner, clear of the shin inside it.
    const out1 = Math.cos(angle) ** (tall ? 1.3 : 0.72);
    const up1 = Math.sin(angle) ** 0.88;
    const heelBulge = -0.01 * Math.sin(Math.PI * u) * (1 - s) ** 9;
    const toeRoll = offset * smoothstep(0.9, 1, s) * (1 - u * 0.4);
    return out.set(cx + side * (inner + (edge - inner) * out1 + offset * Math.cos(angle)), baseY(s) + height(s) * up1 + offset * Math.sin(angle), zAt(s) + heelBulge + toeRoll);
  };
  return { model, spec, tall, open, openingEnd, throatEnd, holeCentre, holeReach, rise, spring, width, height, halfOpening, baseY, zAt, wall };
}

/** Rows bunch up at the heel and toe, where the shape turns fastest. */
const rowAt = (v) => 0.5 - 0.5 * Math.cos(Math.PI * v);

function addUpper(builder, cx, last, tint, { trimToe = false, trimHeel = false } = {}) {
  builder.grid(
    UPPER_COLUMNS,
    UPPER_ROWS,
    (u, v, out, i) => {
      const s = rowAt(v);
      if (i <= WALL_COLUMNS) {
        last.wall(cx, -1, i / WALL_COLUMNS, s, 0, out);
      } else if (i >= WALL_COLUMNS + 2) {
        last.wall(cx, 1, (UPPER_COLUMNS - i) / WALL_COLUMNS, s, 0, out);
      } else {
        // A narrow strip along the top keeps the toe box seamless.
        out.set(cx, last.baseY(s) + last.height(s), last.zAt(s));
      }
    },
    {
      flip: true,
      poleStart: true,
      poleEnd: true,
      tint,
      keepFace: (i, j) => {
        const s = rowAt((j + 0.5) / UPPER_ROWS);
        // Under a toe cap there is nothing to see, and nothing to poke through.
        if (trimToe && s > 0.885) return false;
        // Nor under a heel counter, up to the height it reaches.
        if (trimHeel && s < 0.085 && (i < 7 || i >= UPPER_COLUMNS - 7)) return false;
        if (i !== WALL_COLUMNS && i !== WALL_COLUMNS + 1) return true;
        return last.halfOpening(s) <= 0;
      }
    }
  );
}

/** The inside of the shoe, seen through the opening. */
function addLining(builder, cx, last, tint) {
  const spanEnd = last.open ? last.openingEnd : last.holeCentre + last.holeReach + 0.02;
  for (const side of [1, -1]) {
    builder.grid(
      6,
      20,
      (u, v, out) => {
        const s = lerp(0.015, spanEnd, v);
        last.wall(cx, side, Math.min(1, u) * 0.998, s, 0, out);
        // Pull in towards the middle of the foot.
        out.x = lerp(out.x, cx, 0.09);
        out.z = lerp(out.z, last.zAt(last.holeCentre), 0.02);
      },
      { flip: side > 0, tint }
    );
  }
  // The insole.
  builder.grid(
    8,
    14,
    (u, v, out) => {
      const s = lerp(0.03, Math.min(0.9, spanEnd + 0.12), v);
      const w = last.width(s) * 0.86;
      out.set(cx + lerp(-w, w, u), last.baseY(s) + 0.006, last.zAt(s));
    },
    { flip: true, tint: shade(tint, 1.35) }
  );
}

/** A foot inside an open shoe. */
function addFoot(builder, cx, last, tint) {
  builder.grid(
    18,
    16,
    (u, v, out) => {
      const s = v;
      const a = TAU * u;
      const w = Math.max(0, last.width(s) - 0.008);
      const top = Math.max(0, 0.06 * Math.sqrt(clamp((1 - s) / 0.1)) * Math.sqrt(clamp(s / 0.05)) + (1 - smoothstep(0.1, 0.6, s)) * 0.05);
      const sinA = Math.sin(a);
      out.set(cx + Math.cos(a) * w, last.baseY(s) + 0.002 + (sinA >= 0 ? sinA ** 0.82 * top : sinA * 0.006), last.zAt(s));
    },
    { wrapU: true, poleStart: true, poleEnd: true, tint }
  );
}

function addSole(builder, cx, last, tint, options = {}) {
  const { spec } = last;
  const { flare = 0.0055, thickness = spec.sole, base = 0, bulge = 0.022 } = options;
  const section = [
    [0, 1],
    [0.985, 1],
    [1, 0.9],
    [1 + bulge, 0.5],
    [1, 0.12],
    [0.93, 0],
    [0, 0],
    [-0.93, 0],
    [-1, 0.12],
    [-1 - bulge, 0.5],
    [-1, 0.9],
    [-0.985, 1],
    [0, 1]
  ];
  const rows = 34;
  builder.grid(
    section.length - 1,
    rows,
    (u, v, out, i, j) => {
      const s = rowAt(j / rows);
      const edge = last.width(s) + flare * Math.min(1, s / 0.05, (1 - s) / 0.05);
      const [across, level] = section[i];
      const bottom = base + last.rise(s) * 0.98 + 0.002 + last.spring(s);
      out.set(cx + across * edge, bottom + thickness * level, lerp(HEEL_Z - flare, TOE_Z + flare, s));
    },
    { wrapU: true, poleStart: true, poleEnd: true, flip: true, tint }
  );
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
    { nu: 14, cx, cz: z, tint, poleStart: true, poleEnd: true }
  );
}

function addBootHeel(builder, cx, tint) {
  builder.grid(
    14,
    5,
    (u, v, out, i, j) => {
      const a = TAU * u;
      const y = lerp(0, 0.045, j / 5);
      out.set(cx + Math.cos(a) * 0.06, y, lerp(HEEL_Z, TOE_Z, 0.13) + Math.sin(a) * 0.052);
    },
    { wrapU: true, flip: true, tint }
  );
}

/** Follows the rim of the opening from the front of one side, round the heel, to the other. */
function addCollar(builder, cx, last, radius, tint) {
  const front = last.open ? last.openingEnd : last.holeCentre + last.holeReach - 0.002;
  const back = last.open ? 0.03 : last.holeCentre - last.holeReach;
  const points = [];
  const samples = 24;
  const rim = (side, s) => vec(cx + side * (last.halfOpening(s) + radius * 0.2), last.baseY(s) + last.height(s) + radius * 0.2, last.zAt(s));
  for (let i = 0; i <= samples; i += 1) points.push(rim(-1, lerp(front, back, i / samples)));
  for (let i = 1; i <= samples; i += 1) points.push(rim(1, lerp(back, front, i / samples)));
  builder.tube(points, radius, { radial: 6, capStart: "round", capEnd: "round", up: vec(0, 1, 0), tint });
}

/** The tongue, from under the laces to just above the collar. */
function addTongue(builder, cx, last, tint) {
  const start = last.throatEnd;
  const end = last.tall ? last.holeCentre + last.holeReach * 0.72 : 0.44;
  const rows = 12;
  const pointAt = (t, lift, out) => {
    const s = lerp(start, end, t);
    const halfWay = smoothstep(0.75, 1, t);
    out.set(0, last.baseY(s) + last.height(s) + lift + halfWay * (last.tall ? 0.04 : 0.05), last.zAt(s) - halfWay * 0.012);
    return out;
  };
  for (const [offset, flip] of [[0.001, true], [-0.008, false]]) {
    builder.grid(
      6,
      rows,
      (u, v, out, i, j) => {
        pointAt(j / rows, offset, out);
        const across = lerp(-1, 1, u);
        const taper = 1 - 0.18 * smoothstep(0.8, 1, v);
        // A tall shoe's tongue spreads to fill the front of its opening.
        const half = last.tall ? lerp(0.03, 0.06, smoothstep(0.3, 0.95, v)) : 0.03;
        out.x = cx + across * half * taper;
        out.y -= across * across * 0.012;
      },
      { flip, tint }
    );
  }
}

/** Evenly spaced stations along the slope of the throat. */
function throatStations(last, count) {
  const top = last.tall ? last.holeCentre + last.holeReach * 0.92 : 0.46;
  const bottom = last.throatEnd - 0.03;
  const samples = 48;
  const lengths = [0];
  let previous = null;
  for (let i = 0; i <= samples; i += 1) {
    const s = lerp(top, bottom, i / samples);
    const point = [last.zAt(s), last.height(s)];
    if (previous) lengths.push(lengths[lengths.length - 1] + Math.hypot(point[0] - previous[0], point[1] - previous[1]));
    previous = point;
  }
  const total = lengths[samples];
  const stations = [];
  for (let n = 0; n < count; n += 1) {
    const target = (n / (count - 1)) * total;
    let k = 0;
    while (k < samples && lengths[k + 1] < target) k += 1;
    stations.push(lerp(top, bottom, k / samples));
  }
  return stations;
}

function addLacing(builder, eyelets, cx, last, laceTint, eyeletTint, level) {
  const rows = last.tall ? (last.model === "boot" ? 8 : 7) : 5;
  const stations = throatStations(last, rows);
  const rim = (side, s, lift) => vec(cx + side * (Math.max(last.halfOpening(s), 0.018) + 0.012), last.baseY(s) + last.height(s) + lift, last.zAt(s));
  stations.forEach((s, n) => {
    const a = rim(-1, s, 0.001);
    const b = rim(1, s, 0.001);
    const middle = vec(cx, last.baseY(s) + last.height(s) + 0.008, last.zAt(s));
    builder.tube(smoothPath([a, middle, b], 4), 0.0066, { radial: 4, flatten: 0.55, up: vec(0, 1, 0), capStart: "flat", capEnd: "flat", tint: laceTint });
    if (n > 0) {
      const previous = stations[n - 1];
      for (const dir of [1, -1]) {
        const c = rim(-dir, s, -0.002);
        const d = rim(dir, previous, -0.002);
        builder.tube([c, d], 0.0052, { radial: 4, flatten: 0.55, up: vec(0, 1, 0), capStart: false, capEnd: false, tint: shade(laceTint, 0.9) });
      }
    }
    if (level >= 1) {
      for (const side of [1, -1]) {
        const p = rim(side, s, 0.0015);
        eyelets.ellipsoid(p.x, p.y, p.z, 0.0078, 0.0034, 0.0078, { nu: 8, nv: 4, tint: eyeletTint });
      }
    }
  });
}

/** One piece over the whole toe, so it has no seam down the middle. */
function addToeCap(builder, cx, last, tint, offset = 0.0024) {
  const columns = 22;
  const rows = 10;
  builder.grid(
    columns,
    rows,
    (u, v, out, i, j) => {
      const across = (i / columns) * 2 - 1;
      const wallU = 1 - Math.abs(across);
      const s = lerp(lerp(0.79, 0.86, wallU), 1, j / rows);
      last.wall(cx, across < 0 ? -1 : 1, wallU, s, offset, out);
    },
    { flip: true, poleEnd: true, tint }
  );
}

/** One piece round the back of the heel. */
function addHeelCounter(builder, cx, last, tint, offset = 0.0024) {
  const columns = 24;
  const rows = 8;
  builder.grid(
    columns,
    rows,
    (u, v, out, i, j) => {
      const along = (i / columns) * 2 - 1;
      const wallU = (j / rows) * 0.78;
      const reach = lerp(0.19, 0.11, wallU / 0.78);
      last.wall(cx, along < 0 ? -1 : 1, wallU, Math.abs(along) * reach, offset, out);
    },
    { flip: true, tint }
  );
}

/** A piece of leather stitched onto the upper. `region(a, b)` returns [u, s]. */
function addPanel(builder, cx, last, tint, region, { nu = 8, nv = 10, offset = 0.0017, sides = [1, -1] } = {}) {
  for (const side of sides) {
    builder.grid(
      nu,
      nv,
      (a, b, out) => {
        const [u, s] = region(a, b);
        last.wall(cx, side, u, s, offset, out);
      },
      { flip: side < 0, tint }
    );
  }
}

function addStitch(builder, cx, last, tint, pathAt, samples = 26, offset = 0.0034, sides = [1, -1]) {
  for (const side of sides) {
    for (let i = 0; i < samples; i += 2) {
      const a = pathAt(i / samples);
      const b = pathAt((i + 0.72) / samples);
      const pa = last.wall(cx, side, a[0], a[1], offset, new Vector3());
      const pb = last.wall(cx, side, b[0], b[1], offset, new Vector3());
      builder.tube([pa, pb], 0.0013, { radial: 3, capStart: false, capEnd: false, tint });
    }
  }
}

function addPentagonBadge(metal, gems, cx, last, side, tint, gemTint) {
  const s = 0.14;
  const center = last.wall(cx, side, 0.74, s, 0.003, new Vector3());
  const normal = new Vector3(side, 0.15, -0.5).normalize();
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
  const matrix = new Matrix4().compose(center, quaternion, new Vector3(1, 1, 1));
  metal.withMatrix(matrix, () => {
    metal.grid(
      5,
      2,
      (u, v, out, i, j) => {
        const a = TAU * u + Math.PI / 2;
        const r = j === 0 ? 0.028 : j === 1 ? 0.024 : 0.016;
        const z = j === 0 ? 0 : j === 1 ? 0.0052 : 0.0066;
        out.set(Math.cos(a) * r, Math.sin(a) * r, z);
      },
      { wrapU: true, flip: true, tint }
    );
  });
  if (gemTint) gems.withMatrix(matrix, () => gems.ellipsoid(0, 0, 0.0066, 0.012, 0.012, 0.0055, { nu: 10, nv: 6, tint: gemTint }));
}

/** A row of little triangles pressed into the side of the sole. */
function addFacets(builder, cx, last, tint, side) {
  const { spec } = last;
  const count = 8;
  for (let n = 0; n < count; n += 1) {
    const s0 = lerp(0.12, 0.8, n / count);
    const s1 = s0 + 0.052;
    const up = n % 2 === 0;
    const y0 = spec.sole * (up ? 0.3 : 0.76);
    const y1 = spec.sole * (up ? 0.76 : 0.3);
    const edge = (s) => last.width(s) + 0.0118;
    const corner = (s, y) => vec(cx + side * edge(s), y + last.spring(s) + 0.002, lerp(HEEL_Z, TOE_Z, s));
    const a = corner(s0, y0);
    const b = corner(s1, y0);
    const c = corner((s0 + s1) / 2, y1);
    builder.grid(
      1,
      1,
      (u, v, out) => {
        const low = a.clone().lerp(b, u);
        out.copy(low).lerp(c, v);
      },
      { flip: (side > 0) !== up, tint }
    );
  }
}

/** Both shoes. Shoes stand on the floor; a raised shoe lifts the figure on it. */
export function buildShoes(item, frame, materials, skinHex, shinsCovered = false) {
  const model = SPECS[item.model] ? item.model : "sneaker";
  const spec = SPECS[model];
  const level = DETAIL[item.tier] ?? 0;
  const base = color(item.color);
  const accent = item.accent ? color(item.accent) : mixColor(base, color("#000000"), 0.38);
  const white = color("#E9EDF2");
  const soleTint = model === "boot" ? color("#2A241E") : model === "flat" || model === "heel" ? shade(base, 0.6) : model === "platform" ? mixColor(base, color("#FFFFFF"), 0.55) : white;
  const lining = model === "boot" ? color("#3B2E22") : level >= 2 ? shade(accent, 0.45) : color("#2B2F3A");

  const upper = new MeshBuilder();
  const panels = new MeshBuilder();
  const rubber = new MeshBuilder();
  const inside = new MeshBuilder();
  const threads = new MeshBuilder();
  const metal = new MeshBuilder();
  const gems = new MeshBuilder();
  const foot = new MeshBuilder();

  for (const side of [1, -1]) {
    const ankle = frame.legs[side].point(1);
    const cx = ankle.x;
    const last = makeLast(model, spec, shinsCovered);
    const hasToeCap = !last.open && (level >= 1 || model === "sneaker");
    addUpper(upper, cx, last, base, { trimToe: hasToeCap, trimHeel: !last.open && level >= 1 });
    addLining(inside, cx, last, lining);

    if (last.open) {
      addFoot(foot, cx, last, color(skinHex));
      addCollar(panels, cx, last, 0.0042, level >= 2 ? accent : shade(base, 0.72));
      addSole(rubber, cx, last, model === "heel" ? shade(base, 0.55) : soleTint, { flare: model === "heel" ? 0.006 : 0.01, bulge: 0.01 });
      if (model === "heel") {
        addHeelPost(level >= 3 ? metal : rubber, cx, spec, accent);
        const sparkles = level >= 3 ? 14 : 7;
        for (let i = 0; i < sparkles; i += 1) {
          const s = lerp(0.68, 0.94, i / (sparkles - 1));
          const across = Math.sin(i * 2.4) * 0.6;
          const y = last.baseY(s) + last.height(s) * Math.cos(across * 1.2) + 0.002;
          gems.ellipsoid(cx + across * last.width(s), y, last.zAt(s), 0.0062, 0.0062, 0.0062, { nu: 6, nv: 4, tint: accent });
        }
      } else {
        // A small bow on the toe.
        const z = last.zAt(0.76);
        const y = last.baseY(0.76) + last.height(0.76) + 0.006;
        for (const dir of [1, -1]) panels.ellipsoid(cx + dir * 0.02, y, z, 0.021, 0.011, 0.008, { nu: 10, nv: 6, tint: shade(base, 0.78) });
        panels.ellipsoid(cx, y, z, 0.007, 0.009, 0.008, { nu: 8, nv: 5, tint: shade(base, 0.62) });
      }
      continue;
    }

    // Laced shoes: sole, tongue, collar, laces, then whatever the tier adds.
    // Midsole, standing on an outsole where the shoe has one. Layers are stacked,
    // never overlapped, so their edges stay clean.
    if (model === "platform") {
      addSole(rubber, cx, last, accent, { thickness: 0.02, flare: 0.0075, bulge: 0.012 });
      addSole(rubber, cx, last, soleTint, { base: 0.02, thickness: 0.036 });
      addSole(rubber, cx, last, accent, { base: 0.056, thickness: 0.008, flare: 0.0072, bulge: 0.008 });
      addSole(rubber, cx, last, soleTint, { base: 0.064, thickness: spec.sole - 0.064 });
    } else {
      const outsole = level >= 2 || model === "boot" ? 0.011 : 0;
      addSole(rubber, cx, last, soleTint, { base: outsole, thickness: spec.sole - outsole });
      if (outsole) addSole(rubber, cx, last, model === "boot" ? color("#16120E") : accent, { thickness: outsole, flare: 0.0075, bulge: 0.012 });
    }
    if (model === "boot") addBootHeel(rubber, cx, color("#16120E"));

    addTongue(inside, cx, last, level >= 1 ? mixColor(base, accent, 0.25) : shade(base, 0.9));
    addCollar(panels, cx, last, model === "boot" ? 0.0135 : 0.0118, level >= 1 ? accent : shade(base, 0.86));
    const laceTint = model === "boot" ? color("#D9C7A5") : item.accent && level >= 1 ? accent : color("#FFFFFF");
    addLacing(threads, metal, cx, last, laceTint, level >= 3 ? color("#E8EDF5") : color("#3B4254"), level);

    if (hasToeCap) addToeCap(panels, cx, last, model === "boot" ? shade(base, 0.8) : accent);
    if (level >= 1) {
      addHeelCounter(panels, cx, last, accent);
    }
    if (level >= 2) {
      // Lace stay, then a band across the quarter.
      const stayTop = last.tall ? last.holeCentre + last.holeReach * 0.9 : 0.47;
      addPanel(panels, cx, last, shade(base, 0.8), (a, b) => [lerp(0.7, 0.995, a), lerp(stayTop, last.throatEnd + 0.03, b)], { nu: 5, nv: 12 });
      addPanel(panels, cx, last, shade(accent, 0.9), (a, b) => {
        const u = a * 0.66;
        return [u, lerp(lerp(0.58, 0.42, a), lerp(0.66, 0.5, a), b)];
      }, { nu: 8, nv: 3 });
    }
    if (level >= 3) {
      const thread = mixColor(base, color("#FFFFFF"), 0.55);
      addStitch(threads, cx, last, thread, (t) => [t, lerp(0.79, 0.86, t) - 0.009]);
      addStitch(threads, cx, last, thread, (t) => [t * 0.78, lerp(0.19, 0.11, t) + 0.009]);
      addFacets(panels, cx, last, shade(accent, 0.75), 1);
      addFacets(panels, cx, last, shade(accent, 0.75), -1);
      addPentagonBadge(metal, gems, cx, last, side, accent, level >= 4 ? color("#FFFFFF") : null);
    }
    if (level >= 4) {
      // A gold guard round the toe and a plate at the heel of the legendary pair.
      addPanel(metal, cx, last, color("#F4CE5C"), (a, b) => [a * 0.16, lerp(0.74, 1, b)], { nu: 2, nv: 12, offset: 0.0034 });
      addPanel(metal, cx, last, color("#F4CE5C"), (a, b) => [lerp(0.14, 0.62, a), lerp(0.004, 0.05, b)], { nu: 5, nv: 3, offset: 0.0034 });
    }
  }

  const leather = model === "heel" || model === "platform" || model === "boot" || level >= 2 ? materials.satin : materials.soft;
  const parts = [
    { geometry: upper.toGeometry(), material: leather, parent: "root" },
    { geometry: rubber.toGeometry(), material: materials.soft, parent: "root" },
    { geometry: inside.toGeometry(), material: materials.matte, parent: "root" }
  ];
  if (panels.vertexCount) parts.push({ geometry: panels.toGeometry(), material: materials.satin, parent: "root" });
  if (threads.vertexCount) parts.push({ geometry: threads.toGeometry(), material: materials.soft, parent: "root" });
  if (metal.vertexCount) parts.push({ geometry: metal.toGeometry(), material: materials.metal, parent: "root" });
  if (gems.vertexCount) parts.push({ geometry: gems.toGeometry(), material: materials.gem, parent: "root" });
  if (foot.vertexCount) parts.push({ geometry: foot.toGeometry(), material: materials.soft, parent: "root", wornOnly: true });
  return parts;
}
