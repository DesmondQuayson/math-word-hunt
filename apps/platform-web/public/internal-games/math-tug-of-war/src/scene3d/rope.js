// The rope: a tube rebuilt every frame through the pullers' hands, with
// tension-dependent sag, a small live vibration, drooping tails on the
// ground beyond the last puller and a centre marker. When the match ends the
// rope is released and falls.

import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from "../vendor/three.js";
import { ROPE_RADIUS, ROPE_Y } from "./constants.js";
import { approach, clamp, makeNoise } from "./math.js";

const SEGMENTS = 110;
const RADIAL = 8;
const TAIL = 1.5;

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpN = new Vector3();
const tmpBi = new Vector3();

/** Catmull-Rom through `points` (Vector3[]), evaluated at t ∈ [0, 1]. */
function catmull(points, t, out) {
  const count = points.length - 1;
  const scaled = clamp(t, 0, 1) * count;
  let index = Math.floor(scaled);
  if (index >= count) index = count - 1;
  const local = scaled - index;
  const p0 = points[Math.max(0, index - 1)];
  const p1 = points[index];
  const p2 = points[Math.min(count, index + 1)];
  const p3 = points[Math.min(count, index + 2)];
  const t2 = local * local;
  const t3 = t2 * local;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * local + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * local + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * local + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return out;
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
    this.geometry = new BufferGeometry();
    const vertexCount = (SEGMENTS + 1) * (RADIAL + 1);
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];
    for (let i = 0; i <= SEGMENTS; i += 1) {
      for (let j = 0; j <= RADIAL; j += 1) {
        const v = i * (RADIAL + 1) + j;
        uvs[v * 2] = (i / SEGMENTS) * 60;
        uvs[v * 2 + 1] = j / RADIAL;
        if (i < SEGMENTS && j < RADIAL) {
          const a = v;
          const b = v + RADIAL + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
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
    if (!hands.length) return;
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
    let prevTangent = null;
    let normal = tmpN.set(0, 1, 0);
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const t = i / SEGMENTS;
      catmull(points, t, tmpA);
      catmull(points, Math.min(1, t + 0.002), tmpB);
      catmull(points, Math.max(0, t - 0.002), tmpC);
      const tangent = tmpB.sub(tmpC).normalize();
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
      const centreY = tmpA.y + buzz * sine * Math.sin(t * 31) + wobble * sine;
      const radius = ROPE_RADIUS * (1 + 0.04 * Math.sin(t * 160)); // twisted-strand look
      for (let j = 0; j <= RADIAL; j += 1) {
        const angle = (j / RADIAL) * Math.PI * 2 + t * 90; // strand twist
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
