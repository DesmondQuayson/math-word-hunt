// The rope grip: a closed fist built around the rope from each character's own
// hand skin, in the hand bone's frame, so it holds wherever the hand goes. Each
// frame the hand is only turned so the fist's channel lies along the rope and
// moved so the channel's centre sits on the rope line (see Puller.gripArm).
//
// A fist is: where the rope runs through the hand (the channel: across the palm
// hollow, diagonally from the index finger's root to the heel of the little
// finger, as in a power grip) and the finger and thumb joint rotations that
// wrap the skin round a rope of that radius without passing through it. How
// much of the rope's circumference the closed hand then covers is the fist's
// coverage. optimizeFist() searches the channel's placement for the best
// coverage; scripts/math-tug-of-war-3d/solve-fists.mjs runs it for every
// character and stores the result in fist-data.js, which the game loads (and
// re-solves at runtime only if the models no longer match the stored hands).

import { Matrix4, Quaternion, Vector3 } from "../vendor/three.js";

const FINGERS = ["Index", "Middle", "Ring", "Pinky"];
const DIGITS = ["Thumb", ...FINGERS];
// Flexion limits (radians): knuckle, middle joint, end joint.
const FINGER_LIMITS = [1.65, 1.85, 1.4];
const THUMB_LIMITS = [0.8, 0.9, 1.25];
const OPEN = -0.1; // the search starts from a slightly opened finger
const COARSE = Math.PI / 24; // 7.5° search steps, refined
const FINE = Math.PI / 72; // 2.5°
const SECOND_MIN = -0.45; // the middle joint may straighten to hook over the rope
const FINGER_COUPLING = 0.75; // end joint / middle joint (coupled by tendons)
const THUMB_COUPLING = 1.1;
const CREASE = 0.007; // skin this close to its own joint creases instead of colliding
// How far skin may press past the contact surface (metres), knuckle segment to tip:
// the roots of the fingers are soft and hidden between palm and rope; the tips are not.
const TOLERANCE = [0.003, 0.0012, 0.0004];
const THUMB_TOLERANCE = [0.008, 0.0012, 0.0004]; // the thumb's root is the soft ball of the thumb
const SQUEEZE = -0.0008; // finger skin stops just outside the rope (its tube is faceted inside the true radius)
const HOLLOW = 0.015; // half-width of the palm hollow the rope settles into
const PALM_SQUEEZE = 0.004; // the palm hollow gives a little under the rope
const PAD_SQUEEZE = 0.012; // the thumb and little-finger pads either side give more, never further
const COVER_BAND = 0.004; // skin within this of the rope surface counts as touching it
const COVER_BINS = 24;
const FIST_HALF_WIDTH = 0.05;
// Default placement (runtime fallback) and the placements the optimiser tries.
export const DEFAULT_PLACEMENT = Object.freeze({ proximal: 0.02, sink: 0, tilt: 0.35 });
const FINGER_MIN_CURL = (100 * Math.PI) / 180; // knuckle + middle + end joint of a closed finger
const THUMB_MIN_CURL = (50 * Math.PI) / 180;
const SKELETON_PALM = 0.02; // palm thickness under the rope when there is no skin to measure
const SKELETON_FINGER = [1.0, 1.35, 1.0];
const SKELETON_THUMB = [0.3, 0.6, 0.7];
const PROXIMALS = [0.014, 0.018, 0.022, 0.026, 0.03, 0.034, 0.038];
const SINKS = [0, 0.003, 0.006];
const TILTS = [0, 0.1, 0.2, 0.3, 0.4];

const tmpV = new Vector3();
const tmpW = new Vector3();
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const ONE = new Vector3(1, 1, 1);

/** Distance from point `p` to the line through `origin` along unit `axis`. */
function lineDistance(p, origin, axis) {
  tmpW.subVectors(p, origin);
  return tmpW.addScaledVector(axis, -tmpW.dot(axis)).length();
}

/**
 * Everything about one hand that does not depend on where the rope goes: the
 * finger chains, the palm frame and (with a body mesh) the skin, each vertex
 * in its dominant bone's frame. Null if the rig has no usable hand.
 */
export function prepareHand(rig, body, side) {
  const handBone = rig.bone(`${side}Hand`);
  if (!handBone || !rig.hands?.[side]) return null;
  const chains = [];
  for (const finger of DIGITS) {
    const chain = [];
    for (let joint = 1; joint <= 3; joint += 1) {
      const bone = rig.bone(`${side}Hand${finger}${joint}`);
      if (!bone) break;
      const entry = rig.rest.get(bone);
      chain.push({ name: `${finger}${joint}`, bone, lp: entry.lp, lq: entry.lq, delta: new Quaternion(), verts: [], probe: [] });
    }
    if (chain.length !== 3) return null;
    chains.push({ finger, chain });
  }
  const byBone = new Map();
  for (const { chain } of chains) for (const link of chain) byBone.set(link.bone, link);
  const palm = [];
  const skinned = Boolean(body?.isSkinnedMesh && body.skeleton);
  const position = skinned ? body.geometry.attributes.position : { count: 0 };
  const skinIndex = skinned ? body.geometry.attributes.skinIndex : null;
  const skinWeight = skinned ? body.geometry.attributes.skinWeight : null;
  const bones = skinned ? body.skeleton.bones : [];
  const inverses = skinned ? body.skeleton.boneInverses : [];
  for (let v = 0; v < position.count; v += 1) {
    let best = -1;
    let weight = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = skinWeight.getComponent(v, k);
      if (w > weight) {
        weight = w;
        best = skinIndex.getComponent(v, k);
      }
    }
    const bone = bones[best];
    if (bone !== handBone && !byBone.has(bone)) continue;
    const local = new Vector3().fromBufferAttribute(position, v).applyMatrix4(inverses[best]);
    if (bone === handBone) palm.push(local);
    else byBone.get(bone).verts.push(local);
  }
  for (const { chain } of chains) for (const link of chain) link.probe = link.verts.filter((_, k) => k % 3 === 0);
  const hand = { side, chains, palm, skinned, matrices: new Map() };
  for (const { chain } of chains) posechain(hand, chain);
  // Palm frame (hand space; the wrist is the origin), from the metacarpal plane
  // through the wrist and the index and little-finger knuckles. The normal points
  // the way the fingers curl.
  const index1 = jointPosition(hand, chains[1].chain[0].bone, new Vector3());
  const middle1 = jointPosition(hand, chains[2].chain[0].bone, new Vector3());
  const pinky1 = jointPosition(hand, chains[4].chain[0].bone, new Vector3());
  const normal = new Vector3().crossVectors(index1, pinky1).normalize();
  const curl = rig.hands[side].palm.clone().applyQuaternion(rig.rest.get(handBone).q.clone().invert());
  if (normal.dot(curl) < 0) normal.negate();
  const fingers = middle1.clone().addScaledVector(normal, -middle1.dot(normal)).normalize();
  const knuckleLine = new Vector3().subVectors(pinky1, index1);
  knuckleLine.addScaledVector(normal, -knuckleLine.dot(normal)).normalize();
  const knuckles = new Vector3();
  for (let finger = 1; finger < 5; finger += 1) knuckles.add(jointPosition(hand, chains[finger].chain[0].bone, tmpV));
  knuckles.multiplyScalar(0.25);
  // The fingers flex about the rig's curl axes (bone frames).
  const curlAxes = chains.map(({ finger }) => rig.hands[side].chains[DIGITS.indexOf(finger)]?.map((link) => link.axisLocal.clone().normalize()) ?? null);
  Object.assign(hand, { normal, fingers, knuckleLine, knuckles, curlAxes, fingerprint: [index1, middle1, pinky1].flatMap((p) => p.toArray().map((x) => Math.round(x * 1e4) / 1e4)) });
  return hand;
}

function posechain(hand, chain) {
  let parent = null;
  for (const link of chain) {
    const m = hand.matrices.get(link.bone) ?? new Matrix4();
    m.compose(link.lp, tmpQ.copy(link.lq).multiply(link.delta), ONE);
    if (parent) m.premultiply(parent);
    hand.matrices.set(link.bone, m);
    parent = m;
  }
}

function jointPosition(hand, bone, out) {
  return out.setFromMatrixPosition(hand.matrices.get(bone));
}

/**
 * Lay the rope through the hand at `placement` and close every digit round it.
 * Returns the fist (channel and joint rotations) with its coverage.
 */
export function closeFist(hand, radius, placement = DEFAULT_PLACEMENT) {
  const { chains, palm, normal, fingers, knuckleLine, knuckles } = hand;
  const axis = knuckleLine.clone().multiplyScalar(Math.cos(placement.tilt)).addScaledVector(fingers, -Math.sin(placement.tilt)).normalize();
  const base = knuckles.clone().addScaledVector(fingers, -placement.proximal);
  // Lift the channel out of the palm hollow until the rope rests on the skin
  // (then optionally sink it into the palm's pads a little).
  const hollow = palm.filter((p) => Math.abs(tmpV.subVectors(p, base).dot(axis)) < HOLLOW);
  const centre = new Vector3();
  let lift = 0;
  for (; lift < 0.12; lift += 0.0005) {
    centre.copy(base).addScaledVector(normal, lift);
    let nearest = Infinity;
    for (const p of hollow) nearest = Math.min(nearest, lineDistance(p, centre, axis));
    let pads = Infinity;
    for (const p of palm) pads = Math.min(pads, lineDistance(p, centre, axis));
    if (nearest >= radius - PALM_SQUEEZE && pads >= radius - PAD_SQUEEZE) break;
  }
  lift -= placement.sink;
  centre.copy(base).addScaledVector(normal, lift);

  const contact = radius - SQUEEZE;
  const world = new Vector3();
  const origin = new Vector3();
  const closest = new Vector3();
  const centroid = new Vector3();
  // How far a segment's skin presses into the rope (> 0) or clears it (< 0).
  // Skin right at a joint is left out: it creases rather than collides.
  const depth = (link) => {
    const m = hand.matrices.get(link.bone);
    jointPosition(hand, link.bone, origin);
    let nearest = Infinity;
    for (const p of link.probe) {
      world.copy(p).applyMatrix4(m);
      if (world.distanceToSquared(origin) < CREASE * CREASE) continue;
      nearest = Math.min(nearest, lineDistance(world, centre, axis));
    }
    return contact - nearest;
  };
  const angles = {};
  let closed = true; // every digit found a closure that wraps the rope
  const order = [1, 2, 3, 4, 0];
  for (const digit of order) {
    const { finger, chain } = chains[digit];
    const thumb = finger === "Thumb";
    const limits = thumb ? THUMB_LIMITS : FINGER_LIMITS;
    const tolerance = thumb ? THUMB_TOLERANCE : TOLERANCE;
    for (const link of chain) link.delta.identity();
    posechain(hand, chain);
    // Joint axes (bone frames): the fingers flex about their curl axes; the thumb
    // (closed last, over the fingers) turns each segment straight towards the rope.
    const axes = chain.map((link, joint) => {
      if (!thumb) return hand.curlAxes[digit]?.[joint] ?? null;
      const m = hand.matrices.get(link.bone);
      jointPosition(hand, link.bone, origin);
      centroid.set(0, 0, 0);
      for (const p of link.verts) centroid.add(world.copy(p).applyMatrix4(m));
      centroid.multiplyScalar(1 / Math.max(1, link.verts.length));
      closest.subVectors(centroid, centre);
      closest.copy(centre).addScaledVector(axis, closest.dot(axis)).sub(origin);
      const turn = new Vector3().crossVectors(centroid.sub(origin), closest);
      if (turn.lengthSq() < 1e-12) return null;
      tmpQ.setFromRotationMatrix(tmpM.extractRotation(m)).invert();
      return turn.normalize().applyQuaternion(tmpQ);
    });
    const coupling = thumb ? THUMB_COUPLING : FINGER_COUPLING;
    const setPose = (first, second) => {
      const values = [first, second, second * coupling];
      chain.forEach((link, joint) => (axes[joint] ? link.delta.setFromAxisAngle(axes[joint], Math.min(values[joint], limits[joint])) : link.delta.identity()));
      posechain(hand, chain);
    };
    const fits = (first, second) => {
      setPose(first, second);
      return chain.every((link, joint) => !link.probe.length || depth(link) <= tolerance[joint]);
    };
    // The most the middle (and end) joint can close for a given knuckle angle.
    const tightest = (first) => {
      let low = null;
      for (let second = SECOND_MIN; second <= limits[1] + 1e-9; second += COARSE) {
        if (fits(first, second)) low = second;
        else if (low !== null) break;
      }
      if (low === null) return null;
      let high = Math.min(limits[1], low + COARSE);
      if (high <= low) return low;
      for (let k = 0; k < 4; k += 1) {
        const mid = (low + high) / 2;
        if (fits(first, mid)) low = mid;
        else high = mid;
      }
      return low;
    };
    let best = { score: -Infinity, first: 0, second: 0 };
    const tryFirst = (first) => {
      setPose(first, SECOND_MIN);
      if (chain[0].probe.length && depth(chain[0]) > tolerance[0]) return false; // the knuckle turned the finger into the rope
      const second = tightest(first);
      if (second !== null) {
        const score = first + second * (1 + coupling);
        if (score > best.score + 1e-9) best = { score, first, second };
      }
      return true;
    };
    const start = thumb ? -0.4 : OPEN;
    for (let first = start; first <= limits[0] + 1e-9; first += COARSE) if (!tryFirst(first) && first > 0) break;
    const around = best.first;
    for (let first = around - COARSE + FINE; first < around + COARSE - 1e-9; first += FINE) if (first >= start && first <= limits[0]) tryFirst(first);
    setPose(best.first, best.second);
    angles[finger] = [best.first, best.second, best.second * coupling].map((a, joint) => Math.round(Math.min(a, limits[joint]) * 573) / 10);
    // A finger that could not close round the rope (or barely curls) would be an open hand pretending to grip.
    // (The thumb's root may swing away to clear the rope: its closure is its two curling joints.)
    const curled = (thumb ? 0 : Math.min(best.first, limits[0])) + Math.min(best.second, limits[1]) + Math.min(best.second * coupling, limits[2]);
    if (best.score === -Infinity || curled < (thumb ? THUMB_MIN_CURL : FINGER_MIN_CURL)) closed = false;
  }

  // Coverage: how much of the rope's circumference (inside the fist's width) has skin on it.
  const reference = normal.clone().addScaledVector(axis, -normal.dot(axis)).normalize();
  const sideways = new Vector3().crossVectors(axis, reference);
  const bins = new Uint8Array(COVER_BINS);
  const touch = (p) => {
    tmpV.subVectors(p, centre);
    const along = tmpV.dot(axis);
    if (Math.abs(along) > FIST_HALF_WIDTH) return;
    tmpV.addScaledVector(axis, -along);
    if (tmpV.length() > radius + COVER_BAND) return;
    const angle = Math.atan2(tmpV.dot(sideways), tmpV.dot(reference));
    bins[Math.min(COVER_BINS - 1, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * COVER_BINS))] = 1;
  };
  for (const p of palm) touch(p);
  for (const { chain } of chains) {
    for (const link of chain) {
      const m = hand.matrices.get(link.bone);
      for (const p of link.verts) touch(world.copy(p).applyMatrix4(m));
    }
  }
  const coverage = bins.reduce((sum, bin) => sum + bin, 0) / COVER_BINS;
  return makeFist(hand, axis, centre, chains.flatMap(({ chain }) => chain.map((link) => ({ name: link.name, bone: link.bone, lq: link.lq, delta: link.delta.clone() }))), { coverage, closed, lift, placement, angles });
}

function makeFist(hand, axis, centre, links, metrics) {
  return {
    side: hand.side,
    axis, // the channel through the fist, hand frame, index → little finger
    centre, // the rope's centre in the fist, hand frame
    // Hand frame: from the channel's centre back to the wrist, across the channel.
    wristDirection: centre.clone().negate().addScaledVector(axis, centre.dot(axis)).normalize(),
    links: links.map((link) => ({ name: link.name, bone: link.bone, delta: link.delta, grip: link.lq.clone().multiply(link.delta) })),
    metrics
  };
}

/** The runtime fallback: the default placement, closed round the rope (needs the skin). */
export function solveFist(rig, body, side, radius) {
  const hand = prepareHand(rig, body, side);
  return hand?.skinned ? closeFist(hand, radius) : null;
}

/**
 * The last resort, from the skeleton alone (no skin to solve against): the
 * default channel and a firm power-grip curl. Only used when neither a stored
 * nor a solved fist is available.
 */
export function skeletonFist(rig, side, radius) {
  const hand = prepareHand(rig, null, side);
  if (!hand) return null;
  const { normal, fingers, knuckleLine, knuckles } = hand;
  const placement = DEFAULT_PLACEMENT;
  const axis = knuckleLine.clone().multiplyScalar(Math.cos(placement.tilt)).addScaledVector(fingers, -Math.sin(placement.tilt)).normalize();
  const centre = knuckles.clone().addScaledVector(fingers, -placement.proximal).addScaledVector(normal, SKELETON_PALM + radius);
  const links = [];
  hand.chains.forEach(({ finger, chain }, digit) => {
    const angles = finger === "Thumb" ? SKELETON_THUMB : SKELETON_FINGER;
    chain.forEach((link, joint) => {
      const curl = hand.curlAxes[digit]?.[joint];
      links.push({ name: link.name, bone: link.bone, lq: link.lq, delta: curl ? new Quaternion().setFromAxisAngle(curl, angles[joint]) : new Quaternion() });
    });
  });
  return makeFist(hand, axis, centre, links, { coverage: null, skeleton: true });
}

/** Search the channel's placement for the fist that covers most of the rope. */
export function optimizeFist(rig, body, side, radius) {
  const hand = prepareHand(rig, body, side);
  if (!hand) return null;
  let best = null;
  for (const tilt of TILTS) {
    for (const proximal of PROXIMALS) {
      for (const sink of SINKS) {
        const fist = closeFist(hand, radius, { proximal, sink, tilt });
        // Coverage first; between equals, the rope resting on the palm rather than sunk into it.
        // Only fists with every digit closed; then coverage first and, between equals, the rope resting on the palm rather than sunk into it.
        const score = (fist.metrics.closed ? 10 : 0) + fist.metrics.coverage - sink * 2;
        if (!best || score > best.score + 1e-9) best = { score, fist };
      }
    }
  }
  return { fist: best.fist, fingerprint: hand.fingerprint };
}

const matches = (hand, data) => hand.fingerprint.length === data.fingerprint.length && hand.fingerprint.every((value, index) => Math.abs(value - data.fingerprint[index]) <= 0.0005);

/**
 * The stored fist (fist-data.js) for this hand: the character's own entry if
 * its hand still matches, else any entry solved for an identical hand. Null if
 * no stored fist fits (the models changed): the caller solves one instead.
 */
export function storedFist(rig, side, table, name = "") {
  const hand = prepareHand(rig, null, side);
  if (!hand) return null;
  const own = table[name]?.[side];
  const data = own && matches(hand, own) ? own : Object.values(table).map((entry) => entry[side]).find((entry) => entry && matches(hand, entry));
  if (!data) return null;
  const links = [];
  for (const { chain } of hand.chains) {
    for (const link of chain) {
      const delta = data.deltas[link.name];
      if (!delta) return null;
      links.push({ name: link.name, bone: link.bone, lq: link.lq, delta: new Quaternion().fromArray(delta) });
    }
  }
  return makeFist(hand, new Vector3().fromArray(data.axis), new Vector3().fromArray(data.centre), links, { coverage: data.coverage, stored: true });
}

/** The serialisable form of a fist, for fist-data.js. */
export function fistToData(fist, fingerprint) {
  const round = (x) => Math.round(x * 1e6) / 1e6;
  return {
    fingerprint,
    centre: fist.centre.toArray().map(round),
    axis: fist.axis.toArray().map(round),
    coverage: round(fist.metrics.coverage),
    deltas: Object.fromEntries(fist.links.map((link) => [link.name, link.delta.toArray().map(round)]))
  };
}

const blendQ = new Quaternion();

/** Pose the fingers: `amount` 0 leaves the current (open) curl, 1 is the closed fist. */
export function applyFist(fist, amount) {
  if (!fist || amount <= 0) return;
  for (const link of fist.links) {
    if (amount >= 1) link.bone.quaternion.copy(link.grip);
    else link.bone.quaternion.slerp(blendQ.copy(link.grip), amount);
  }
}
