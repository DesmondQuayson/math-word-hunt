// The rope: a tube rebuilt every frame through the pullers' hands, with
// tension-dependent sag, a small live vibration, drooping tails on the
// ground beyond the last puller and a centre marker. When the match ends the
// rope is released and falls.

import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from "../vendor/three.js";
import { ROPE_RADIUS, ROPE_Y } from "./constants.js";
import { approach, clamp, makeNoise } from "./math.js";

const SEGMENTS = 220;
const RADIAL = 12;
const TAIL = 1.5;

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpN = new Vector3();
const tmpBi = new Vector3();

/**
 * A smooth curve through `points`: centripetal Catmull-Rom tangents (no
 * overshoot where a fist's closely spaced points meet a long span between
 * pullers), sampled evenly along its length into `centres` / `tangents`
 * (flat xyz arrays of count + 1 entries).
 */
function sampleCurve(points, count, centres, tangents, scratch) {
  const n = points.length;
  const knots = scratch.knots;
  const slopes = scratch.slopes;
  const chords = scratch.chords;
  knots.length = n;
  chords.length = n;
  knots[0] = 0;
  chords[0] = 0;
  for (let i = 1; i < n; i += 1) {
    const d = Math.max(1e-6, points[i].distanceTo(points[i - 1]));
    knots[i] = knots[i - 1] + Math.sqrt(d);
    chords[i] = chords[i - 1] + d;
  }
  while (slopes.length < n) slopes.push(new Vector3());
  for (let i = 0; i < n; i += 1) {
    const m = slopes[i];
    if (i === 0 || i === n - 1) {
      const a = points[i === 0 ? 0 : n - 2];
      const b = points[i === 0 ? 1 : n - 1];
      const h = i === 0 ? knots[1] - knots[0] : knots[n - 1] - knots[n - 2];
      m.subVectors(b, a).multiplyScalar(1 / h);
    } else {
      const h0 = knots[i] - knots[i - 1];
      const h1 = knots[i + 1] - knots[i];
      // Derivative of the Barry–Goldman (centripetal) curve at the knot.
      m.subVectors(points[i], points[i - 1]).multiplyScalar(1 / h0);
      m.addScaledVector(tmpC.subVectors(points[i + 1], points[i - 1]), -1 / (h0 + h1));
      m.addScaledVector(tmpC.subVectors(points[i + 1], points[i]), 1 / h1);
    }
  }
  const total = chords[n - 1];
  let span = 0;
  for (let k = 0; k <= count; k += 1) {
    const target = (k / count) * total;
    while (span < n - 2 && chords[span + 1] < target) span += 1;
    const length = chords[span + 1] - chords[span];
    const u = clamp(length > 0 ? (target - chords[span]) / length : 0, 0, 1);
    const h = knots[span + 1] - knots[span];
    const p0 = points[span];
    const p1 = points[span + 1];
    const m0 = slopes[span];
    const m1 = slopes[span + 1];
    const u2 = u * u;
    const u3 = u2 * u;
    const a = 2 * u3 - 3 * u2 + 1;
    const b = (u3 - 2 * u2 + u) * h;
    const c = -2 * u3 + 3 * u2;
    const d = (u3 - u2) * h;
    const da = 6 * u2 - 6 * u;
    const db = (3 * u2 - 4 * u + 1) * h;
    const dc = -6 * u2 + 6 * u;
    const dd = (3 * u2 - 2 * u) * h;
    const o = k * 3;
    centres[o] = a * p0.x + b * m0.x + c * p1.x + d * m1.x;
    centres[o + 1] = a * p0.y + b * m0.y + c * p1.y + d * m1.y;
    centres[o + 2] = a * p0.z + b * m0.z + c * p1.z + d * m1.z;
    tangents[o] = da * p0.x + db * m0.x + dc * p1.x + dd * m1.x;
    tangents[o + 1] = da * p0.y + db * m0.y + dc * p1.y + dd * m1.y;
    tangents[o + 2] = da * p0.z + db * m0.z + dc * p1.z + dd * m1.z;
  }
}

export class Rope {
  constructor({ seed = 11 } = {}) {
    this.group = new Group();
    this.noise = makeNoise(seed);
    this.tension = 0.35;
    this.tensionTarget = 0.35;
    this.vibration = 0;
    this.released = false;
    this.fallT = 0;
    this.time = 0;
    this.controls = [];
    this.centres = new Float32Array((SEGMENTS + 1) * 3);
    this.tangents = new Float32Array((SEGMENTS + 1) * 3);
    this.scratch = { knots: [], slopes: [], chords: [] };
    this.sampled = false;
    // The last hand points seen: once every hand lets go, the released rope
    // keeps falling from where it was held.
    this.anchors = [];
    this.geometry = new BufferGeometry();
    const vertexCount = (SEGMENTS + 1) * (RADIAL + 1);
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];
    for (let i = 0; i <= SEGMENTS; i += 1) {
      for (let j = 0; j <= RADIAL; j += 1) {
        const v = i * (RADIAL + 1) + j;
        uvs[v * 2] = (i / SEGMENTS) * 120;
        uvs[v * 2 + 1] = j / RADIAL;
        if (i < SEGMENTS && j < RADIAL) {
          const a = v;
          const b = v + RADIAL + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1); // outward-facing (front faces outside the tube)
        }
      }
    }
    const positionAttribute = new BufferAttribute(this.positions, 3);
    positionAttribute.setUsage(DynamicDrawUsage);
    const normalAttribute = new BufferAttribute(this.normals, 3);
    normalAttribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("position", positionAttribute);
    this.geometry.setAttribute("normal", normalAttribute);
    this.geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    this.material = new MeshStandardMaterial({ color: new Color(0xc9a46a), roughness: 0.92, metalness: 0 });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    // Centre marker: a knotted ribbon.
    const knot = new Mesh(new SphereGeometry(ROPE_RADIUS * 2.1, 14, 10), new MeshStandardMaterial({ color: 0xf3a712, roughness: 0.6 }));
    const tail = new Mesh(new CylinderGeometry(0.004, 0.012, 0.16, 6), new MeshStandardMaterial({ color: 0xf3a712, roughness: 0.6 }));
    tail.position.y = -0.1;
    tail.rotation.z = 0.05;
    this.marker = new Group();
    this.marker.add(knot, tail);
    knot.castShadow = true;
    this.group.add(this.marker);
    this.markerPosition = new Vector3(0, ROPE_Y, 0);
    this.lastTension = 0;
  }

  /** Sudden tension (a pull) makes the rope snap taut and hum. */
  twang(strength = 1) {
    this.vibration = Math.min(1, this.vibration + 0.6 * strength);
    this.tension = Math.min(1, this.tension + 0.5 * strength);
  }

  release() {
    this.released = true;
    this.fallT = 0;
  }

  reset() {
    this.released = false;
    this.fallT = 0;
    this.tension = 0.35;
    this.vibration = 0;
    this.anchors.length = 0;
  }

  /**
   * @param {number} dt
   * @param {Vector3[]} hands  world-space hand points, ordered from the far
   *                           Turquoise end to the far Pink end
   * @param {number} centreX   world x of the knot
   * @param {number} tensionTarget 0 slack … 1 taut
   */
  update(dt, hands, centreX, tensionTarget) {
    this.time += dt;
    this.tension = approach(this.tension, this.released ? 0 : tensionTarget, 4, dt);
    this.vibration = approach(this.vibration, 0, 3.5, dt);
    if (this.released) this.fallT = Math.min(1, this.fallT + dt / 0.75);
    const fall = this.released ? 1 - Math.pow(1 - this.fallT, 2.2) : 0;
    const ground = ROPE_RADIUS + 0.004;

    const points = this.controls;
    points.length = 0;
    if (hands.length) {
      while (this.anchors.length < hands.length) this.anchors.push(new Vector3());
      this.anchors.length = hands.length;
      for (let index = 0; index < hands.length; index += 1) this.anchors[index].copy(hands[index]);
    } else if (!this.released || !this.anchors.length) {
      return;
    } else {
      hands = this.anchors;
    }
    const first = hands[0];
    const last = hands[hands.length - 1];
    // Drooping tails beyond the end pullers.
    points.push(new Vector3(first.x - TAIL * 1.15, ground, first.z + 0.25));
    points.push(new Vector3(first.x - TAIL * 0.7, ground + 0.015, first.z + 0.12));
    points.push(new Vector3(first.x - TAIL * 0.3, first.y * 0.55, first.z + 0.02));
    for (let index = 0; index < hands.length; index += 1) {
      const hand = hands[index];
      points.push(new Vector3(hand.x, hand.y, hand.z));
      const next = hands[index + 1];
      if (next) {
        // Sag between two grips depends on the slack and the gap.
        const gap = Math.abs(next.x - hand.x);
        const slack = (1 - this.tension) * 0.07 * gap;
        const mid = new Vector3((hand.x + next.x) / 2, (hand.y + next.y) / 2 - slack, (hand.z + next.z) / 2);
        const crossesCentre = (hand.x - centreX) * (next.x - centreX) < 0;
        if (crossesCentre) {
          const t = (centreX - hand.x) / (next.x - hand.x);
          const centre = new Vector3().lerpVectors(hand, next, t);
          centre.y -= slack * 0.9;
          points.push(centre);
          this.markerPosition.copy(centre);
        } else {
          points.push(mid);
        }
      }
    }
    points.push(new Vector3(last.x + TAIL * 0.3, last.y * 0.55, last.z + 0.02));
    points.push(new Vector3(last.x + TAIL * 0.7, ground + 0.015, last.z + 0.12));
    points.push(new Vector3(last.x + TAIL * 1.15, ground, last.z + 0.25));

    // Released: every point falls to the ground with a little scatter.
    if (fall > 0) {
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const drop = ground + this.noise(index * 1.7 + 4) * 0.006;
        point.y = point.y + (drop - point.y) * fall;
        point.z += this.noise(index * 2.1 + 50) * 0.12 * fall;
      }
    }

    // Vibration: a standing wave along the taut rope.
    const vibration = this.vibration * (1 - fall);
    const buzz = Math.sin(this.time * 46) * 0.006 * vibration;
    const wobble = Math.sin(this.time * 9) * 0.012 * vibration;

    const positions = this.positions;
    const normals = this.normals;
    const centres = this.centres;
    const tangents = this.tangents;
    sampleCurve(points, SEGMENTS, centres, tangents, this.scratch);
    this.sampled = true;
    let prevTangent = null;
    let normal = tmpN.set(0, 1, 0);
    // The rope only hums between the hands: inside a fist it stays where the fist holds it.
    const held = this.released ? [] : hands;
    let nearest = 0;
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const t = i / SEGMENTS;
      tmpA.fromArray(centres, i * 3);
      while (nearest < held.length - 1 && Math.abs(held[nearest + 1].x - tmpA.x) <= Math.abs(held[nearest].x - tmpA.x)) nearest += 1;
      const free = held.length ? clamp((Math.abs(held[nearest].x - tmpA.x) - 0.06) / 0.14, 0, 1) : 1;
      const tangent = tmpB.fromArray(tangents, i * 3);
      if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
      tangent.normalize();
      if (!prevTangent) {
        normal = tmpN.set(0, 1, 0).addScaledVector(tangent, -tangent.y).normalize();
      } else {
        // Parallel transport the normal along the curve.
        const axis = tmpBi.crossVectors(prevTangent, tangent);
        const length = axis.length();
        if (length > 1e-6) {
          axis.multiplyScalar(1 / length);
          const angle = Math.acos(clamp(prevTangent.dot(tangent), -1, 1));
          normal.applyAxisAngle(axis, angle);
        }
      }
      prevTangent = prevTangent ? prevTangent.copy(tangent) : tangent.clone();
      const binormal = tmpBi.crossVectors(tangent, normal).normalize();
      const sine = Math.sin(t * Math.PI);
      const centreY = tmpA.y + (buzz * sine * Math.sin(t * 31) + wobble * sine) * free;
      const radius = ROPE_RADIUS;
      for (let j = 0; j <= RADIAL; j += 1) {
        const angle = (j / RADIAL) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const v = (i * (RADIAL + 1) + j) * 3;
        normals[v] = nx * normal.x + ny * binormal.x;
        normals[v + 1] = nx * normal.y + ny * binormal.y;
        normals[v + 2] = nx * normal.z + ny * binormal.z;
        positions[v] = tmpA.x + normals[v] * radius;
        positions[v + 1] = centreY + normals[v + 1] * radius;
        positions[v + 2] = tmpA.z + normals[v + 2] * radius;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.marker.position.copy(this.markerPosition);
    this.marker.position.y += wobble * 0.5;
    this.marker.rotation.z = Math.sin(this.time * 3) * 0.08 * (1 - fall) + 1.2 * fall;
  }

  /** Distance from a world point to the rope tube's axis (metres; 0 = on the centreline). */
  distanceToAxis(point) {
    if (!this.sampled) return Infinity;
    let best = Infinity;
    const a = tmpA;
    const b = tmpB;
    for (let index = 0; index < SEGMENTS; index += 1) {
      a.fromArray(this.centres, index * 3);
      b.fromArray(this.centres, index * 3 + 3);
      const segment = tmpC.subVectors(b, a);
      const length = segment.lengthSq();
      const t = length > 0 ? clamp(tmpN.subVectors(point, a).dot(segment) / length, 0, 1) : 0;
      const distance = tmpN.copy(a).addScaledVector(segment, t).distanceTo(point);
      if (distance < best) best = distance;
    }
    return best;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.marker.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
  }
}
