// The road itself. Pure: no DOM, no 3D library.
//
// A race track is one line from START to FINISH whose direction changes
// smoothly along its length. The 3D world and the road minimap are both drawn
// from this same line: the minimap is the road seen from above, to scale. A
// racer's place on either is found from one number, the distance travelled,
// so the car on the road and its marker on the map cannot disagree.

import { createRandom } from "./random.js";

/** Metres between stored points of the centre line. */
export const STEP_M = 5;

/**
 * Build a track `lengthKm` long. `seed` picks its shape (each stage and the
 * online circuit have their own); the same seed always gives the same road.
 */
export function buildCircuit(lengthKm, seed) {
  if (!(lengthKm > 0)) throw new RangeError("A track needs a length.");
  const length = lengthKm * 1000;
  const random = createRandom(`circuit:${seed}`);
  // A few slow sweeps and some shorter bends. Amplitudes are kept modest so the
  // road never doubles back across itself on the map.
  const waves = [
    { amplitude: 0.75 + random.next() * 0.35, cycles: 1 + random.next() * 0.6, phase: random.next() * Math.PI * 2 },
    { amplitude: 0.4 + random.next() * 0.25, cycles: 2.6 + random.next() * 1.2, phase: random.next() * Math.PI * 2 },
    { amplitude: 0.18 + random.next() * 0.12, cycles: 6 + random.next() * 3, phase: random.next() * Math.PI * 2 }
  ];
  const hills = [
    { amplitude: 5 + random.next() * 4, cycles: 2 + random.next() * 2, phase: random.next() * Math.PI * 2 },
    { amplitude: 1.5 + random.next() * 1.5, cycles: 9 + random.next() * 5, phase: random.next() * Math.PI * 2 }
  ];
  const headingAt = distance => {
    const share = distance / length;
    // Straight off the line and straight onto the finish.
    const ease = Math.min(1, share * 12, (1 - share) * 12);
    let heading = 0;
    for (const wave of waves) heading += wave.amplitude * Math.sin(share * wave.cycles * Math.PI * 2 + wave.phase);
    return heading * Math.max(0, ease);
  };
  const heightAt = distance => {
    const share = distance / length;
    const ease = Math.min(1, share * 10, (1 - share) * 10);
    let height = 0;
    for (const hill of hills) height += hill.amplitude * Math.sin(share * hill.cycles * Math.PI * 2 + hill.phase);
    return height * Math.max(0, ease);
  };

  const count = Math.ceil(length / STEP_M) + 1;
  const xs = new Float32Array(count);
  const zs = new Float32Array(count);
  const ys = new Float32Array(count);
  const headings = new Float32Array(count);
  let x = 0;
  let z = 0;
  for (let index = 0; index < count; index += 1) {
    const distance = Math.min(length, index * STEP_M);
    const heading = headingAt(distance);
    xs[index] = x;
    zs[index] = z;
    ys[index] = heightAt(distance);
    headings[index] = heading;
    x += Math.sin(heading) * STEP_M;
    z += Math.cos(heading) * STEP_M;
  }

  /** Position, height and heading of the centre line `distance` metres from the start. */
  function at(distance) {
    // Before START and beyond FINISH the road simply runs on straight, so a
    // camera behind the grid, or a car rolling past the flag, has somewhere to be.
    if (distance < 0 || distance > length) {
      const end = distance < 0 ? 0 : count - 1;
      const over = distance < 0 ? distance : distance - length;
      return { x: xs[end] + Math.sin(headings[end]) * over, y: ys[end], z: zs[end] + Math.cos(headings[end]) * over, heading: headings[end] };
    }
    const clamped = distance;
    const scaled = clamped / STEP_M;
    const index = Math.min(count - 2, Math.floor(scaled));
    const share = scaled - index;
    return {
      x: xs[index] + (xs[index + 1] - xs[index]) * share,
      y: ys[index] + (ys[index + 1] - ys[index]) * share,
      z: zs[index] + (zs[index + 1] - zs[index]) * share,
      heading: headings[index] + (headings[index + 1] - headings[index]) * share
    };
  }

  // The map: the same line, from above, fitted to a unit box with a margin.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < count; index += 1) {
    minX = Math.min(minX, xs[index]);
    maxX = Math.max(maxX, xs[index]);
    minZ = Math.min(minZ, zs[index]);
    maxZ = Math.max(maxZ, zs[index]);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  /**
   * Where `progress` (0 at START, 1 at FINISH) falls on a map `width` × `height`
   * with `margin` kept clear. North (the direction of travel off the line) is up.
   */
  function mapPoint(progress, width, height, margin = 0) {
    const point = at(Math.min(Math.max(progress, 0), 1) * length);
    const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanZ);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanZ * scale) / 2;
    return { x: offsetX + (point.x - minX) * scale, y: height - (offsetY + (point.z - minZ) * scale) };
  }

  /** SVG path of the whole road on such a map. */
  function mapPath(width, height, margin = 0, samples = 160) {
    const parts = [];
    for (let index = 0; index <= samples; index += 1) {
      const point = mapPoint(index / samples, width, height, margin);
      parts.push(`${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
    }
    return parts.join(" ");
  }

  return Object.freeze({ length, lengthKm, count, at, mapPoint, mapPath, aspect: spanX / spanZ });
}

/** The fixed seed of each Computer Race stage's road, and of the online circuit. */
export function stageCircuitSeed(stage) {
  return `stage-${stage}`;
}

export const ONLINE_CIRCUIT_SEED = "online-circuit";
