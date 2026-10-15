// Procedural posing for a Mixamo-named humanoid skeleton. The rig exposes
// anatomical operations (lean the spine, bend a joint, reach a hand to a
// point, plant a foot, curl fingers) in the character's own space:
// +Y up, +Z forward (towards the opposing team), +X the character's left.
//
// Everything works from the captured rest pose, so the same code poses any
// character that shares the bone names.

import { Matrix4, Quaternion, Vector3 } from "../vendor/three.js";
import { clamp } from "./math.js";

// GLTFLoader sanitises node names ("mixamorig:Hips" arrives as "mixamorigHips")
// and makes duplicates unique across characters ("mixamorigHips_3").
const PREFIX = /^mixamorig:?/;
const SUFFIX = /_\d+$/;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

const tmpV1 = new Vector3();
const tmpV2 = new Vector3();
const tmpV3 = new Vector3();
const tmpV4 = new Vector3();
const tmpQ1 = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpM1 = new Matrix4();
const tmpM2 = new Matrix4();

const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
const TWIST_NEAR = 0.3; // radians searched either side of last frame's forearm twist
const TWIST_KEEP = 0.12; // how much worse (radians of wrist) the continuous twist may be and still win

function perpendicular(vector, axis, out) {
  // Component of `vector` perpendicular to unit `axis`, normalised; falls back to any perpendicular.
  out.copy(vector).addScaledVector(axis, -vector.dot(axis));
  if (out.lengthSq() < 1e-6) {
    out.copy(Math.abs(axis.y) < 0.9 ? Y : Z).addScaledVector(axis, -axis.dot(Math.abs(axis.y) < 0.9 ? Y : Z));
  }
  return out.normalize();
}

/** Rotation that maps the frame (forward0, up0) onto (forward1, up1). */
export function frameRotation(forward0, up0, forward1, up1, out) {
  const r0 = tmpV3.crossVectors(up0, forward0).normalize();
  tmpM1.makeBasis(r0, up0, forward0);
  const r1 = tmpV4.crossVectors(up1, forward1).normalize();
  tmpM2.makeBasis(r1, up1, forward1);
  tmpM1.transpose(); // orthonormal → inverse
  tmpM2.multiply(tmpM1);
  return out.setFromRotationMatrix(tmpM2);
}

export class Rig {
  constructor(root) {
    this.root = root;
    this.bones = new Map();
    this.order = [];
    root.traverse((object) => {
      if (object.isBone) {
        this.bones.set(object.name.replace(PREFIX, "").replace(SUFFIX, ""), object);
        this.order.push(object);
      }
    });
    if (!this.bones.has("Hips")) throw new Error("Rig has no Hips bone.");
    // Rest pose, local and in character space.
    this.rest = new Map();
    for (const bone of this.order) {
      const parent = bone.parent && bone.parent.isBone ? this.rest.get(bone.parent) : null;
      const entry = {
        lp: bone.position.clone(),
        lq: bone.quaternion.clone(),
        p: parent ? parent.p.clone().add(bone.position.clone().applyQuaternion(parent.q)) : bone.position.clone(),
        q: parent ? parent.q.clone().multiply(bone.quaternion) : bone.quaternion.clone(),
        axes: null
      };
      const inverse = entry.q.clone().invert();
      entry.axes = { x: X.clone().applyQuaternion(inverse), y: Y.clone().applyQuaternion(inverse), z: Z.clone().applyQuaternion(inverse) };
      this.rest.set(bone, entry);
    }
    const length = (a, b) => this.restPosition(a).distanceTo(this.restPosition(b));
    this.lengths = {
      upperArm: length("LeftArm", "LeftForeArm"),
      foreArm: length("LeftForeArm", "LeftHand"),
      thigh: length("LeftUpLeg", "LeftLeg"),
      shin: length("LeftLeg", "LeftFoot"),
      foot: length("LeftFoot", "LeftToeBase"),
      height: this.restPosition("Head").y + 0.12
    };
    this.hipsRestY = this.restPosition("Hips").y;
    this.footRestY = this.restPosition("LeftFoot").y;
    this.toeRestY = this.restPosition("LeftToeBase").y;
    this.prepareHands();
  }

  bone(name) {
    return this.bones.get(name);
  }

  restPosition(name) {
    return this.rest.get(this.bones.get(name)).p;
  }

  restDirection(from, to, out) {
    return out.subVectors(this.restPosition(to), this.restPosition(from)).normalize();
  }

  reset() {
    for (const bone of this.order) {
      const entry = this.rest.get(bone);
      bone.position.copy(entry.lp);
      bone.quaternion.copy(entry.lq);
    }
  }

  /** Current character-space rotation of a bone (composes locals up the chain). */
  worldQuaternion(bone, out) {
    out.copy(bone.quaternion);
    let parent = bone.parent;
    while (parent && parent.isBone) {
      out.premultiply(parent.quaternion);
      parent = parent.parent;
    }
    return out;
  }

  /** Current character-space position of a bone. */
  worldPosition(bone, out) {
    out.copy(bone.position);
    let parent = bone.parent;
    while (parent && parent.isBone) {
      out.applyQuaternion(parent.quaternion).add(parent.position);
      parent = parent.parent;
    }
    return out;
  }

  setWorldQuaternion(bone, worldQ) {
    const parent = bone.parent;
    if (parent && parent.isBone) {
      this.worldQuaternion(parent, tmpQ2).invert();
      bone.quaternion.copy(tmpQ2).multiply(worldQ);
    } else {
      bone.quaternion.copy(worldQ);
    }
  }

  /** Rotate a bone about one of its rest-space anatomical axes (x: pitch, y: twist, z: roll). */
  rotate(name, axis, angle) {
    if (!angle) return;
    const bone = this.bones.get(name);
    if (!bone) return;
    const axes = this.rest.get(bone).axes;
    bone.quaternion.multiply(tmpQ1.setFromAxisAngle(axes[axis], angle));
  }

  /**
   * Point a bone so that its rest direction towards `childName` maps onto
   * `direction` (character space), with its rest `poleRest` mapping onto
   * `pole` to fix the twist.
   */
  aim(name, childName, direction, pole, poleRest) {
    const bone = this.bones.get(name);
    const child = this.bones.get(childName);
    if (!bone || !child) return;
    const forward0 = tmpV1.subVectors(this.rest.get(child).p, this.rest.get(bone).p).normalize();
    const up0 = perpendicular(poleRest, forward0, new Vector3());
    const forward1 = tmpV2.copy(direction).normalize();
    const up1 = perpendicular(pole, forward1, new Vector3());
    frameRotation(forward0, up0, forward1, up1, tmpQ1);
    tmpQ1.multiply(this.rest.get(bone).q);
    this.setWorldQuaternion(bone, tmpQ1);
  }

  /**
   * Two-bone IK. Places the end joint at `target` (character space) with the
   * middle joint bent towards `pole`. Returns how far the end missed (0 = exact).
   */
  reach(upperName, lowerName, endName, target, pole, poleRest, lengths) {
    const upper = this.bones.get(upperName);
    const lower = this.bones.get(lowerName);
    if (!upper || !lower) return 0;
    const [l1, l2] = lengths;
    // Fresh vectors: aim() below reuses the shared temporaries.
    const a = this.worldPosition(upper, new Vector3());
    const toTarget = new Vector3().subVectors(target, a);
    let distance = toTarget.length();
    const maxReach = (l1 + l2) * 0.995;
    const missed = Math.max(0, distance - maxReach);
    distance = clamp(distance, Math.abs(l1 - l2) + 0.01, maxReach);
    const u = toTarget.normalize();
    const poleDir = perpendicular(pole, u, new Vector3());
    const cosUpper = clamp((l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance), -1, 1);
    const sinUpper = Math.sqrt(1 - cosUpper * cosUpper);
    const elbow = new Vector3().copy(a).addScaledVector(u, l1 * cosUpper).addScaledVector(poleDir, l1 * sinUpper);
    const end = new Vector3().copy(a).addScaledVector(u, distance);
    const upperDirection = new Vector3().subVectors(elbow, a).normalize();
    this.aim(upperName, lowerName, upperDirection, poleDir, poleRest);
    const lowerDirection = new Vector3().subVectors(end, elbow).normalize();
    this.aim(lowerName, endName, lowerDirection, poleDir, poleRest);
    return missed;
  }

  prepareHands() {
    this.hands = {};
    for (const side of ["Left", "Right"]) {
      const hand = this.bones.get(`${side}Hand`);
      const middle = this.bones.get(`${side}HandMiddle1`);
      const thumb = this.bones.get(`${side}HandThumb1`);
      if (!hand || !middle) continue;
      const fingerDirection = new Vector3().subVectors(this.rest.get(middle).p, this.rest.get(hand).p).normalize();
      let palm;
      if (thumb) {
        const thumbDirection = new Vector3().subVectors(this.rest.get(thumb).p, this.rest.get(hand).p).normalize();
        palm = side === "Left" ? new Vector3().crossVectors(fingerDirection, thumbDirection) : new Vector3().crossVectors(thumbDirection, fingerDirection);
        perpendicular(palm, fingerDirection, palm);
      } else {
        palm = new Vector3(0, -1, 0);
      }
      // Curl axes: rotating a finger bone about this (rest, character space)
      // axis moves its tip towards the palm.
      const chains = [];
      for (const finger of FINGERS) {
        const chain = [];
        for (let joint = 1; joint <= 3; joint += 1) {
          const bone = this.bones.get(`${side}Hand${finger}${joint}`);
          if (!bone) break;
          const next = this.bones.get(`${side}Hand${finger}${joint + 1}`);
          const direction = next
            ? new Vector3().subVectors(this.rest.get(next).p, this.rest.get(bone).p).normalize()
            : fingerDirection.clone();
          // Every finger, thumb included, curls towards the palm.
          const axisWorld = new Vector3().crossVectors(direction, palm).normalize();
          if (axisWorld.lengthSq() < 1e-6) axisWorld.copy(X);
          const axisLocal = axisWorld.clone().applyQuaternion(this.rest.get(bone).q.clone().invert());
          chain.push({ bone, axisLocal, amount: finger === "Thumb" ? [0.45, 0.7, 0.5][joint - 1] : [1.25, 1.55, 1.0][joint - 1] });
        }
        if (chain.length) chains.push(chain);
      }
      this.hands[side] = { hand, fingerDirection, palm, chains };
    }
  }

  /** Orient a hand: `fingers` is where the knuckles point, `palm` where the palm faces (character space). */
  orientHand(side, fingers, palm) {
    const info = this.hands[side];
    if (!info) return;
    const hand = info.hand;
    const forward1 = tmpV1.copy(fingers).normalize();
    const up1 = perpendicular(palm, forward1, tmpV2);
    const up0 = perpendicular(info.palm, info.fingerDirection, new Vector3());
    frameRotation(info.fingerDirection, up0, forward1, up1, tmpQ1);
    tmpQ1.multiply(this.rest.get(hand).q);
    this.setWorldQuaternion(hand, tmpQ1);
  }

  /** The posed hand's knuckle and palm directions (character space). */
  handAxes(side, fingersOut, palmOut) {
    const info = this.hands[side];
    if (!info) return false;
    const q = this.worldQuaternion(info.hand, tmpQ1).multiply(tmpQ2.copy(this.rest.get(info.hand).q).invert());
    fingersOut.copy(info.fingerDirection).applyQuaternion(q);
    palmOut.copy(info.palm).applyQuaternion(q);
    return true;
  }

  /** Angle (radians) a bone is rotated away from its rest pose, relative to its parent. */
  localAngle(name) {
    const bone = this.bones.get(name);
    if (!bone) return 0;
    const delta = tmpQ1.copy(this.rest.get(bone).lq).invert().multiply(bone.quaternion);
    return 2 * Math.acos(clamp(Math.abs(delta.w), -1, 1));
  }

  /**
   * Keep the wrist anatomical after orientHand(): as much as possible of the
   * rotation the hand needs is taken by the forearm turning about its own axis
   * (pronation / supination), then by the upper arm, and what is left at the
   * wrist (flexion / deviation) is limited to `maxWrist`. Skinned wrists tear
   * when they are rotated much further than a real one can go.
   */
  relaxWrist(side, { maxForearmTwist = 1.45, maxUpperTwist = 0, maxWrist = 1.0, twist = null, near = null } = {}) {
    const hand = this.bones.get(`${side}Hand`);
    const fore = this.bones.get(`${side}ForeArm`);
    const upper = this.bones.get(`${side}Arm`);
    if (!hand || !fore || !upper) return 0;
    const wanted = this.worldQuaternion(hand, new Quaternion());
    const restLocal = this.rest.get(hand).lq;
    const restInverse = tmpQ2.copy(restLocal).invert().clone();
    // Everything above the forearm is fixed during the search: cache it once.
    const aboveFore = upper.parent && upper.parent.isBone ? this.worldQuaternion(upper.parent, new Quaternion()) : new Quaternion();
    const upperWorld = aboveFore.clone().multiply(upper.quaternion);
    const foreAxis = tmpV1.copy(this.rest.get(hand).lp).normalize().clone();
    const spin = new Quaternion();
    const foreWorld = new Quaternion();
    const local = new Quaternion();
    // The wrist rotation (away from rest) the hand would need, given a forearm twist of `angle`.
    const wristAngleAt = (angle) => {
      spin.setFromAxisAngle(foreAxis, angle);
      foreWorld.copy(upperWorld).multiply(fore.quaternion).multiply(spin);
      local.copy(foreWorld).invert().multiply(wanted);
      local.premultiply(restInverse);
      return 2 * Math.acos(clamp(Math.abs(local.w), -1, 1));
    };
    let chosenTwist = twist;
    if (twist === null) {
      // Coarse sweep of the forearm's range, then a fine sweep around the best angle.
      let best = wristAngleAt(0);
      chosenTwist = 0;
      for (let step = -8; step <= 8; step += 1) {
        const angle = (step / 8) * maxForearmTwist;
        const value = wristAngleAt(angle);
        if (value < best - 1e-4) {
          best = value;
          chosenTwist = angle;
        }
      }
      // Continuity: last frame's twist, searched around, wins unless the sweep found
      // something clearly better (a forearm never flips between distant twists).
      if (near !== null) {
        let local = wristAngleAt(near);
        let localTwist = near;
        for (let step = -4; step <= 4; step += 1) {
          const angle = clamp(near + (step / 4) * TWIST_NEAR, -maxForearmTwist, maxForearmTwist);
          const value = wristAngleAt(angle);
          if (value < local - 1e-4) {
            local = value;
            localTwist = angle;
          }
        }
        if (local <= best + TWIST_KEEP) {
          best = local;
          chosenTwist = localTwist;
        }
      }
      const coarse = maxForearmTwist / 8;
      for (let step = -4; step <= 4; step += 1) {
        const angle = clamp(chosenTwist + (step / 4) * coarse, -maxForearmTwist, maxForearmTwist);
        const value = wristAngleAt(angle);
        if (value < best - 1e-4) {
          best = value;
          chosenTwist = angle;
        }
      }
      void maxUpperTwist; // the upper arm is left alone: turning it swings the forearm off its target
    }
    fore.quaternion.multiply(spin.setFromAxisAngle(foreAxis, chosenTwist));
    // The wrist takes the remainder, within its range.
    foreWorld.copy(upperWorld).multiply(fore.quaternion);
    local.copy(foreWorld).invert().multiply(wanted);
    const delta = new Quaternion().copy(restInverse).multiply(local);
    const angle = 2 * Math.acos(clamp(Math.abs(delta.w), -1, 1));
    if (angle > maxWrist) delta.slerp(spin.identity(), 1 - maxWrist / angle);
    hand.quaternion.copy(restLocal).multiply(delta);
    return chosenTwist;
  }

  /** Curl fingers: 0 = open hand, 1 = tight grip. */
  curl(side, amount) {
    const info = this.hands[side];
    if (!info) return;
    for (const chain of info.chains) {
      for (const { bone, axisLocal, amount: scale } of chain) {
        bone.quaternion.copy(this.rest.get(bone).lq).multiply(tmpQ1.setFromAxisAngle(axisLocal, amount * scale));
      }
    }
  }

  /** Point a foot along `forward`, flat against `up` (character space). */
  orientFoot(side, forward, up) {
    this.aim(`${side}Foot`, `${side}ToeBase`, forward, up, Y);
  }

  /** Turn the head towards a character-space point, with limits. */
  lookAt(point, weight = 1) {
    const head = this.bones.get("Head");
    const neck = this.bones.get("Neck");
    if (!head || !neck) return;
    const position = this.worldPosition(head, tmpV1);
    const direction = tmpV2.subVectors(point, position).normalize();
    // Yaw/pitch relative to the torso's current forward.
    const spine = this.bones.get("Spine2") ?? neck;
    const torsoQ = this.worldQuaternion(spine, tmpQ1);
    const local = direction.applyQuaternion(tmpQ2.copy(torsoQ).invert());
    const yaw = clamp(Math.atan2(local.x, local.z), -1.1, 1.1) * weight;
    const pitch = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.7, 0.8) * weight;
    this.rotate("Neck", "y", yaw * 0.35);
    this.rotate("Neck", "x", -pitch * 0.35);
    this.rotate("Head", "y", yaw * 0.65);
    this.rotate("Head", "x", -pitch * 0.65);
  }
}
