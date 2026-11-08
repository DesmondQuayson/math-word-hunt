// Small procedural mesh kit for the avatar. The vendored three.js is a trimmed
// build (no LatheGeometry, TubeGeometry or BufferGeometryUtils), and building
// straight into one set of arrays lets a whole garment become a single draw
// call. Colours are vertex colours, so one material serves every garment.

import { BufferAttribute, BufferGeometry, Color, Matrix4, Vector2, Vector3 } from "../../../math-tug-of-war/src/vendor/three.js";

export const TAU = Math.PI * 2;

export function clamp(value, low = 0, high = 1) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Deterministic random numbers: the same hairstyle every time it is built. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A linear-space colour from "#RRGGBB". Bad input gives a neutral grey. */
export function color(hex, fallback = "#808a99") {
  const value = typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
  return new Color(value);
}

export function shade(base, factor) {
  return base.clone().multiplyScalar(factor);
}

export function mixColor(a, b, t) {
  return a.clone().lerp(b, t);
}

/** Catmull-Rom through the given points; returns samples + 1 Vector3s. */
export function smoothPath(points, samples) {
  const count = points.length;
  const result = [];
  if (count === 0) return result;
  if (count === 1) return [points[0].clone()];
  for (let s = 0; s <= samples; s += 1) {
    const f = (s / samples) * (count - 1);
    const i = Math.min(Math.floor(f), count - 2);
    const t = f - i;
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, count - 1)];
    const t2 = t * t;
    const t3 = t2 * t;
    result.push(
      new Vector3(
        0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (p2.z - p0.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (3 * p1.z - p0.z - 3 * p2.z + p3.z) * t3)
      )
    );
  }
  return result;
}

export function vec(x, y, z) {
  return new Vector3(x, y, z);
}

const SCRATCH_POSITION = new Vector3();
const SCRATCH_COLOR = new Color();
const SCRATCH_UV = new Vector2();
const WHITE = new Color(1, 1, 1);

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.uvs = [];
    this.indices = [];
    this.matrix = null;
    this.mirrored = false;
    this.hasAlpha = false;
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  /** Run `draw` with every position transformed by `matrix`. */
  withMatrix(matrix, draw) {
    const previous = this.matrix;
    const previousMirrored = this.mirrored;
    this.matrix = previous ? previous.clone().multiply(matrix) : matrix;
    this.mirrored = this.matrix.determinant() < 0;
    draw();
    this.matrix = previous;
    this.mirrored = previousMirrored;
  }

  /** Draw once on the +x side and once mirrored onto the -x side. */
  mirrorX(draw) {
    draw(1);
    this.withMatrix(new Matrix4().makeScale(-1, 1, 1), () => draw(-1));
  }

  /**
   * A (nu x nv) parametric surface. `at(u, v, out, i, j)` writes a position.
   * With u running "right" and v running "up" as seen from outside, normals
   * face the viewer; pass flip when the parameterisation runs the other way.
   * Normals are computed from the surface (after any matrix), so anything
   * that displaces positions gets correct shading for free.
   */
  grid(nu, nv, at, options = {}) {
    const { wrapU = false, wrapV = false, poleStart = false, poleEnd = false, flip = false, tint = null, colorAt = null, alphaAt = null, uvAt = null, keepFace = null } = options;
    const cols = nu + 1;
    const rows = nv + 1;
    const count = cols * rows;
    const base = this.vertexCount;
    const local = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const matrix = this.matrix;
    const p = SCRATCH_POSITION;
    const uvOut = SCRATCH_UV;
    const c = SCRATCH_COLOR;
    let k = 0;
    if (alphaAt) this.hasAlpha = true;
    for (let j = 0; j < rows; j += 1) {
      const v = j / nv;
      for (let i = 0; i < cols; i += 1) {
        const u = i / nu;
        at(u, v, p, i, j);
        if (matrix) p.applyMatrix4(matrix);
        if (uvAt) uvAt(u, v, uvOut, p);
        else uvOut.set(u, v);
        local[k] = p.x;
        local[k + 1] = p.y;
        local[k + 2] = p.z;
        k += 3;
        this.positions.push(p.x, p.y, p.z);
        this.uvs.push(uvOut.x, uvOut.y);
        if (colorAt) colorAt(u, v, c);
        else c.copy(tint ?? WHITE);
        this.colors.push(c.r, c.g, c.b, alphaAt ? alphaAt(u, v) : 1);
      }
    }
    const reverse = flip !== this.mirrored;
    const indices = this.indices;
    const addFace = (a, b, d) => {
      const ax = local[a * 3];
      const ay = local[a * 3 + 1];
      const az = local[a * 3 + 2];
      const bx = local[b * 3] - ax;
      const by = local[b * 3 + 1] - ay;
      const bz = local[b * 3 + 2] - az;
      const dx = local[d * 3] - ax;
      const dy = local[d * 3 + 1] - ay;
      const dz = local[d * 3 + 2] - az;
      let nx = by * dz - bz * dy;
      let ny = bz * dx - bx * dz;
      let nz = bx * dy - by * dx;
      if (nx * nx + ny * ny + nz * nz < 1e-18) return;
      if (reverse) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
        indices.push(base + a, base + d, base + b);
      } else {
        indices.push(base + a, base + b, base + d);
      }
      for (const index of [a, b, d]) {
        normal[index * 3] += nx;
        normal[index * 3 + 1] += ny;
        normal[index * 3 + 2] += nz;
      }
    };
    for (let j = 0; j < nv; j += 1) {
      for (let i = 0; i < nu; i += 1) {
        if (keepFace && !keepFace(i, j)) continue;
        const a = j * cols + i;
        const b = a + 1;
        const c2 = a + cols;
        const d = c2 + 1;
        addFace(a, b, d);
        addFace(a, d, c2);
      }
    }
    const merge = (first, second) => {
      for (let n = 0; n < 3; n += 1) {
        const sum = normal[first * 3 + n] + normal[second * 3 + n];
        normal[first * 3 + n] = sum;
        normal[second * 3 + n] = sum;
      }
    };
    if (wrapU) for (let j = 0; j < rows; j += 1) merge(j * cols, j * cols + nu);
    if (wrapV) for (let i = 0; i < cols; i += 1) merge(i, nv * cols + i);
    const flatten = (row) => {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let i = 0; i < cols; i += 1) {
        sx += normal[(row * cols + i) * 3];
        sy += normal[(row * cols + i) * 3 + 1];
        sz += normal[(row * cols + i) * 3 + 2];
      }
      for (let i = 0; i < cols; i += 1) {
        normal[(row * cols + i) * 3] = sx;
        normal[(row * cols + i) * 3 + 1] = sy;
        normal[(row * cols + i) * 3 + 2] = sz;
      }
    };
    if (poleStart) flatten(0);
    if (poleEnd) flatten(nv);
    for (let n = 0; n < count; n += 1) {
      const nx = normal[n * 3];
      const ny = normal[n * 3 + 1];
      const nz = normal[n * 3 + 2];
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (length > 1e-12) this.normals.push(nx / length, ny / length, nz / length);
      else this.normals.push(0, 1, 0);
    }
  }

  /** Ellipsoid. `rotation` is an optional Quaternion. */
  ellipsoid(cx, cy, cz, rx, ry, rz, options = {}) {
    const { nu = 14, nv = 10, rotation = null, ...rest } = options;
    this.grid(
      nu,
      nv,
      (u, v, out) => {
        const a = TAU * u;
        const phi = Math.PI * v - Math.PI / 2;
        const cp = Math.cos(phi);
        out.set(Math.sin(a) * cp * rx, Math.sin(phi) * ry, Math.cos(a) * cp * rz);
        if (rotation) out.applyQuaternion(rotation);
        out.x += cx;
        out.y += cy;
        out.z += cz;
      },
      { wrapU: true, poleStart: true, poleEnd: true, ...rest }
    );
  }

  /** Surface of revolution round the y axis; profile runs bottom to top. */
  lathe(profile, options = {}) {
    const { nu = 24, cx = 0, cz = 0, angular = null, ...rest } = options;
    const nv = profile.length - 1;
    this.grid(
      nu,
      nv,
      (u, v, out, i, j) => {
        const a = TAU * u;
        const point = profile[j];
        const r = angular ? point[0] * angular(a, v) : point[0];
        out.set(cx + Math.sin(a) * r, point[1], cz + Math.cos(a) * r);
      },
      { wrapU: true, ...rest }
    );
  }

  /**
   * Tube along a path of Vector3s. `radius` is a number or (t, angle) => r.
   * `flatten` squashes the cross-section along the binormal; `up` picks the
   * cross-section orientation at the start. Caps are "round", "flat" or false.
   */
  tube(path, radius, options = {}) {
    const { radial = 8, capStart = "flat", capEnd = "flat", flatten = 1, up = null, normalAt = null, capDepth = 1, colorAt: colorAlong = null, tint = null, uvAt = null } = options;
    const n = path.length;
    if (n < 2) return;
    const radiusAt = typeof radius === "function" ? radius : () => radius;
    const tangents = [];
    for (let i = 0; i < n; i += 1) {
      const next = path[Math.min(i + 1, n - 1)];
      const previous = path[Math.max(i - 1, 0)];
      const tangent = next.clone().sub(previous);
      if (tangent.lengthSq() < 1e-12) tangent.set(0, 1, 0);
      tangents.push(tangent.normalize());
    }
    const normals = [];
    const binormals = [];
    let normal = up ? up.clone() : Math.abs(tangents[0].y) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
    for (let i = 0; i < n; i += 1) {
      if (normalAt) normal = normalAt(i / (n - 1)).clone();
      const projected = normal.clone().addScaledVector(tangents[i], -normal.dot(tangents[i]));
      if (projected.lengthSq() > 1e-10) normal = projected.normalize();
      normals.push(normal.clone());
      binormals.push(new Vector3().crossVectors(tangents[i], normal).normalize());
    }
    const rows = [];
    const addCap = (kind, index, direction, atStart) => {
      const scales = kind === "round" ? [0, 0.38, 0.71, 0.92] : [0];
      const offsets = kind === "round" ? [1, 0.92, 0.71, 0.38] : [0];
      const order = atStart ? scales.map((_, k) => k) : scales.map((_, k) => scales.length - 1 - k);
      for (const k of order) rows.push({ index, scale: scales[k], offset: offsets[k] * direction * capDepth });
    };
    if (capStart) addCap(capStart, 0, -1, true);
    for (let i = 0; i < n; i += 1) rows.push({ index: i, scale: 1, offset: 0 });
    if (capEnd) addCap(capEnd, n - 1, 1, false);
    const nv = rows.length - 1;
    this.grid(
      radial,
      nv,
      (u, v, out, i, j) => {
        const row = rows[j];
        const angle = TAU * u;
        const t = row.index / (n - 1);
        const r = radiusAt(t, angle) * row.scale;
        const baseRadius = row.offset === 0 ? 0 : radiusAt(t, 0);
        out.copy(path[row.index]);
        out.addScaledVector(normals[row.index], Math.cos(angle) * r);
        out.addScaledVector(binormals[row.index], Math.sin(angle) * r * flatten);
        if (row.offset !== 0) out.addScaledVector(tangents[row.index], row.offset * baseRadius);
      },
      {
        wrapU: true,
        poleStart: Boolean(capStart),
        poleEnd: Boolean(capEnd),
        tint,
        uvAt,
        colorAt: colorAlong
          ? (u, v, c) => {
              colorAlong(rows[Math.round(v * nv)].index / (n - 1), c);
            }
          : null
      }
    );
  }

  /** Vertices/normals of another finished builder, appended. */
  append(other) {
    const offset = this.vertexCount;
    for (const value of other.positions) this.positions.push(value);
    for (const value of other.normals) this.normals.push(value);
    for (const value of other.colors) this.colors.push(value);
    for (const value of other.uvs) this.uvs.push(value);
    for (const value of other.indices) this.indices.push(value + offset);
    this.hasAlpha = this.hasAlpha || other.hasAlpha;
  }

  toGeometry() {
    const geometry = new BufferGeometry();
    const vertices = this.vertexCount;
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(this.uvs), 2));
    if (this.hasAlpha) {
      geometry.setAttribute("color", new BufferAttribute(new Float32Array(this.colors), 4));
    } else {
      const rgb = new Float32Array(vertices * 3);
      for (let i = 0; i < vertices; i += 1) {
        rgb[i * 3] = this.colors[i * 4];
        rgb[i * 3 + 1] = this.colors[i * 4 + 1];
        rgb[i * 3 + 2] = this.colors[i * 4 + 2];
      }
      geometry.setAttribute("color", new BufferAttribute(rgb, 3));
    }
    const IndexArray = vertices > 65535 ? Uint32Array : Uint16Array;
    geometry.setIndex(new BufferAttribute(new IndexArray(this.indices), 1));
    return geometry;
  }
}
