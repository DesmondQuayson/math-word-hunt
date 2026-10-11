// One rope puller: an animation state machine that turns match events into
// a body pose every frame. It only ever receives events the game engine has
// already decided (a pull happened, a team won); it never produces them.
//
// Character space: +Y up, +Z towards the centre knot and the opposing team,
// +X the puller's left. A team pulls towards its own -Z.

import { Quaternion, Vector3 } from "../vendor/three.js";
import { celebrationPhase, jumpProfile } from "./celebration.js";
import { BODY_SIDE, HAND_GAP, ROPE_Y } from "./constants.js";
import { Face } from "./expressions.js";
import { approach, bump, clamp, deg, easeOutCubic, lerp, makeNoise, makeRandom, smoothstep } from "./math.js";
import { Rig } from "./rig.js";

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const X_AXIS = new Vector3(1, 0, 0);
const ARM_POLE_REST = new Vector3(0, -0.35, -1); // elbows point back/down in the rest A-pose
const LEG_POLE_REST = new Vector3(0, 0, 1); // knees forward

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();
const tmpQ = new Quaternion();

const GRIP_OFFSET = 0.07; // wrist → palm centre, metres (open-hand contact: shoulders, knees)
// The closed fist: where the hole between the curled fingers and the palm sits,
// from the wrist, along the knuckles and out of the palm. The rope runs through it.
const FIST_FORWARD = 0.066;
const FIST_UP = 0.044;
const FIST_CURL = 0.6; // leaves a hole 31 mm in radius for the 22 mm rope (measured on the rig)
const ROPE_AXIS = new Vector3(0, 0, 1);
const STEP_DURATION = 0.26;
const STEP_HEIGHT = 0.09;
// Braced stance: both feet ahead of the hips so the body can hang back on the rope.
const FRONT_FOOT_Z = 0.2;
const BACK_FOOT_Z = -0.16;
// The rope runs past the waist: the front grip a little ahead of the hips, the
// back grip beside them, and never closer than a fist's width to each other.
const GRIP_FRONT_Z = 0.1;
const GRIP_BACK_Z = -0.05;
const GRIP_MIN_GAP = 0.115;
const ARM_FIT = 0.94; // fraction of the arm length a grip may sit from the shoulder
const LEG_FIT = 0.985;

/**
 * Keeps a foot where it was planted (in the moving team frame) and takes a
 * step when it drifts too far from where the stance wants it.
 */
class Foot {
  constructor(side, home) {
    this.side = side;
    this.home = home.clone(); // stance position, character space
    this.position = home.clone(); // where the foot actually is, character space
    this.lift = 0;
    this.stepping = null;
    this.yaw = 0;
  }

  /** Move the foot by `delta` in character space (the body moved under it). */
  drift(delta) {
    if (!this.stepping) this.position.add(delta);
    else this.stepping.from.add(delta);
  }

  distanceFromHome() {
    return tmpA.subVectors(this.home, this.position).length();
  }

  step(duration = STEP_DURATION, height = STEP_HEIGHT, target = null) {
    if (this.stepping) return false;
    this.stepping = { from: this.position.clone(), to: (target ?? this.home).clone(), t: 0, duration, height };
    return true;
  }

  update(dt) {
    if (!this.stepping) {
      this.lift = 0;
      return false;
    }
    const step = this.stepping;
    step.t += dt;
    const t = clamp(step.t / step.duration, 0, 1);
    const eased = easeOutCubic(t);
    this.position.lerpVectors(step.from, step.to, eased);
    this.lift = bump(t) * step.height;
    if (t >= 1) {
      this.position.copy(step.to);
      this.stepping = null;
      this.lift = 0;
      return true; // landed this frame
    }
    return false;
  }
}

/** Smoothed scalar with its own rate. */
class Value {
  constructor(initial, rate) {
    this.value = initial;
    this.target = initial;
    this.rate = rate;
  }

  update(dt) {
    this.value = approach(this.value, this.target, this.rate, dt);
    return this.value;
  }
}

export class Puller {
  /**
   * @param {object} options
   * @param {object} options.instance   { root, meshes } from instantiateCharacter
   * @param {"turquoise"|"pink"} options.team
   * @param {number} options.index     0 = front puller
   * @param {number} options.seed
   */
  constructor({ instance, team, index, seed }) {
    this.team = team;
    this.index = index;
    this.root = instance.root;
    this.meshes = instance.meshes;
    this.rig = new Rig(instance.root);
    this.random = makeRandom(seed);
    this.noise = makeNoise(seed * 7 + 1);
    this.face = new Face(instance.meshes, this.random);
    this.time = 0;
    this.state = "ready";
    this.stateTime = 0;
    // Fall and celebration choreography differ along the line: front, middle, back.
    this.variant = index % 3;
    // Natural variation between pullers.
    this.traits = {
      lean: 0.9 + this.random() * 0.2,
      stance: 0.9 + this.random() * 0.25,
      tempo: 0.9 + this.random() * 0.2,
      sway: 0.7 + this.random() * 0.6,
      // The far arm reaches across the body to the front grip; the near hand takes
      // the back grip beside the hip, where its forearm can cross the rope.
      frontHand: team === "turquoise" ? "Right" : "Left"
    };
    const ropeSide = team === "turquoise" ? 1 : -1; // rope lies on this side (+X = left) of the body
    this.ropeSide = ropeSide;
    this.ropeX = ropeSide * BODY_SIDE;
    this.height = this.rig.lengths.height;
    this.scale = this.height / 1.76;
    const rig = this.rig;
    const hipsRest = rig.restPosition("Hips");
    // Rest offsets from the hips, used to estimate where joints land for a given lean.
    this.shoulderRest = { Left: rig.restPosition("LeftArm").clone().sub(hipsRest), Right: rig.restPosition("RightArm").clone().sub(hipsRest) };
    this.hipJointRest = { Left: rig.restPosition("LeftUpLeg").clone().sub(hipsRest), Right: rig.restPosition("RightUpLeg").clone().sub(hipsRest) };
    this.headRest = rig.restPosition("Head").clone().sub(hipsRest);
    this.armReach = rig.lengths.upperArm + rig.lengths.foreArm;
    this.legReach = rig.lengths.thigh + rig.lengths.shin;
    const stance = 0.17 * this.traits.stance;
    this.feet = {
      Left: new Foot("Left", new Vector3(stance, 0, ropeSide > 0 ? FRONT_FOOT_Z : BACK_FOOT_Z)),
      Right: new Foot("Right", new Vector3(-stance, 0, ropeSide > 0 ? BACK_FOOT_Z : FRONT_FOOT_Z))
    };
    // Smoothed pose channels.
    this.lean = new Value(0.55, 4); // 0 upright … 1 maximal backward lean
    this.effort = new Value(0.3, 4); // arm tension / knee bend
    this.fatigue = 0; // 0 … 1, set by the team
    this.momentum = 0; // -1 losing … +1 winning, set by the team
    this.hipsOffset = new Vector3(); // transient heave / yank displacement
    this.hipsOffsetTarget = new Vector3();
    this.handShift = 0; // how much of the transient hip motion the hands have followed
    this.handShiftRate = 6;
    this.torsoPitchExtra = new Value(0, 8);
    this.release = new Value(0, 5); // 0 hands on rope … 1 hands free
    this.grip = new Value(FIST_CURL, 6);
    this.action = null; // { type, t, duration, ... }
    this.wipe = null; // { side, t, weight } a tired puller wiping their brow
    this.lookTarget = new Vector3(0, 1.3, 6);
    this.handTargets = { Left: new Vector3(), Right: new Vector3() };
    this.handPalm = { Left: new Vector3(0, -1, 0), Right: new Vector3(0, -1, 0) };
    this.handFingers = { Left: new Vector3(0, 0, 1), Right: new Vector3(0, 0, 1) };
    this.freeHands = { Left: new Vector3(), Right: new Vector3() };
    this.rootYOffset = 0;
    this.lastHands = { Left: new Vector3(), Right: new Vector3() };
    this.handOnRope = { Left: true, Right: true };
    this.reachMiss = { Left: 0, Right: 0 };
    this.helpTarget = null;
    this.celebration = null;
    this.fall = null;
    // Where the slot puts this body; the celebration walks away from it and reset() returns to it.
    this.homeX = this.root.position.x;
    this.homeZ = this.root.position.z;
    this.homeYaw = this.root.rotation.y;
    this.armMode = { Left: "", Right: "" };
    this.armFrom = { Left: new Vector3(), Right: new Vector3() };
    this.armBlend = { Left: 1, Right: 1 };
    this.hug = { Left: null, Right: null };
    this.rig.reset();
    this.face.set({ concentration: 0.6 });
  }

  // ---------------------------------------------------------------- events

  /** The team pulled the rope one step. `strength` 0…1 reflects momentum. */
  heave(strength = 0.7, fast = false) {
    if (this.state !== "ready" && this.state !== "pulling") return;
    this.state = "pulling";
    // Tired pullers heave more slowly.
    const slow = 1 + this.fatigue * 0.45;
    this.action = { type: "heave", t: 0, duration: (fast ? 0.42 : 0.72) * slow, strength, delay: this.index * 0.045 };
    this.handShiftRate = 5.5;
    this.face.set({ determined: 0.9, strain: 0.45 + this.fatigue * 0.5 }, 10);
  }

  /** The other team pulled: this puller is dragged a step towards the centre. */
  yank(strength = 0.7, fast = false) {
    if (this.state !== "ready" && this.state !== "pulling") return;
    this.state = "pulling";
    this.action = { type: "yank", t: 0, duration: fast ? 0.5 : 0.85, strength, delay: 0.06 + this.index * 0.05 };
    this.handShiftRate = 16;
    const surprise = strength > 0.55 ? 0.8 : 0.45;
    this.face.set({ surprise, strain: 0.6 + this.fatigue * 0.4 }, 12);
  }

  /** The match is decided. */
  finish(won) {
    this.action = null;
    this.wipe = null;
    this.stateTime = 0;
    if (won) {
      this.state = "celebrate";
      this.celebration = { kind: ["arms", "jump", "pump"][this.variant], t: 0 };
      this.face.set({ joy: 0.9, excited: 0.4 }, 6);
    } else {
      this.state = "falling";
      this.fall = { kind: ["kneel", "sit", "catch"][this.variant], t: 0, steps: 0 };
      this.face.set({ surprise: 0.7, wince: 0.3 }, 10);
    }
    this.release.target = 1;
    this.grip.target = 0;
  }

  /** Back to the start of a match. */
  resetMatch() {
    this.placeRoot(this.homeX, this.homeZ, this.homeYaw);
    this.hug = { Left: null, Right: null };
    this.state = "ready";
    this.stateTime = 0;
    this.action = null;
    this.wipe = null;
    this.celebration = null;
    this.fall = null;
    this.helpTarget = null;
    this.release.value = 0;
    this.release.target = 0;
    this.grip.target = FIST_CURL;
    this.lean.target = 0.55;
    this.effort.target = 0.3;
    this.hipsOffset.set(0, 0, 0);
    this.hipsOffsetTarget.set(0, 0, 0);
    this.handShift = 0;
    this.fatigue = 0;
    this.momentum = 0;
    for (const foot of Object.values(this.feet)) {
      foot.position.copy(foot.home);
      foot.stepping = null;
    }
    this.handOnRope.Left = true;
    this.handOnRope.Right = true;
    this.face.set({ concentration: 0.6 }, 5);
  }

  /** The team frame moved by `delta` (character space); feet stay on the ground unless they step. */
  carried(delta) {
    for (const foot of Object.values(this.feet)) foot.drift(delta);
  }

  // ---------------------------------------------------------------- update

  update(dt, context) {
    this.time += dt;
    this.stateTime += dt;
    const fatigue = this.fatigue;
    const momentum = this.momentum;

    // Continuous stance targets from the match situation.
    if (this.state === "ready" || this.state === "pulling") {
      const losing = clamp(-momentum, 0, 1);
      const winning = clamp(momentum, 0, 1);
      this.lean.target = clamp((0.6 + losing * 0.28 + winning * 0.12 - fatigue * 0.14) * this.traits.lean, 0.25, 0.9);
      this.effort.target = clamp(0.35 + losing * 0.5 + winning * 0.25, 0, 1);
      if (!this.action && this.stateTime > 1.2) {
        this.face.set(fatigue > 0.55 ? { tired: 0.7, strain: losing * 0.4 } : losing > 0.4 ? { strain: 0.6 + fatigue * 0.3, determined: 0.3 } : { concentration: 0.6, determined: 0.3 + winning * 0.3 }, 3);
      }
      // A tired puller occasionally wipes their brow with the back hand while nothing is happening.
      if (!this.action && !this.wipe && fatigue > 0.5 && this.stateTime > 2.4 && this.random() < dt / 9) {
        const backSide = this.traits.frontHand === "Left" ? "Right" : "Left";
        this.wipe = { side: backSide, t: 0, weight: 0 };
      }
    }
    const lean = this.lean.update(dt);
    const effort = this.effort.update(dt);
    this.release.update(dt);
    this.grip.update(dt);
    this.torsoPitchExtra.update(dt);

    // Discrete actions (heave / yank) write transient offsets.
    this.hipsOffsetTarget.set(0, 0, 0);
    let torsoExtra = 0;
    let stepRequest = null;
    let digFront = 0;
    if (this.action) {
      const action = this.action;
      action.t += dt;
      const local = clamp((action.t - action.delay) / action.duration, 0, 1);
      if (action.type === "heave") {
        // A short wind-up (body eases towards the rope, arms bend) then the
        // drive: hips back and down, torso laid back, front heel dug in.
        const windUp = local < 0.18 ? Math.sin((local / 0.18) * Math.PI) : 0;
        const drive = bump(clamp((local - 0.12) / 0.88, 0, 1));
        this.hipsOffsetTarget.z = 0.06 * windUp - 0.3 * action.strength * drive * (1 - fatigue * 0.25);
        this.hipsOffsetTarget.y = -0.13 * action.strength * drive;
        torsoExtra = deg(5) * windUp - deg(21) * action.strength * drive;
        digFront = drive;
        if (local > 0.42 && !action.stepped) {
          action.stepped = true;
          stepRequest = "back";
        }
      } else {
        // Jerked forward: the body lurches, feet slide, then a catch-step.
        const lurch = bump(clamp(local * 1.5, 0, 1));
        this.hipsOffsetTarget.z = 0.22 * action.strength * lurch;
        this.hipsOffsetTarget.y = -0.07 * lurch;
        torsoExtra = deg(28) * action.strength * lurch;
        if (local > 0.3 && !action.stepped) {
          action.stepped = true;
          stepRequest = "catch";
        }
      }
      if (action.t >= action.delay + action.duration) {
        this.action = null;
        this.state = "ready";
        this.stateTime = 0;
      }
    }
    this.torsoPitchExtra.target = torsoExtra;
    this.hipsOffset.lerp(this.hipsOffsetTarget, 1 - Math.exp(-14 * dt));
    // The hands trail the hips on a heave (arms straighten under load) and lead on a yank.
    const shiftTarget = this.hipsOffset.z * (this.action?.type === "yank" ? 1.25 : 1);
    this.handShift = approach(this.handShift, shiftTarget, this.handShiftRate, dt);

    // Brow wipe: out, across, back (cancelled quickly by any pull).
    if (this.wipe) {
      const wipe = this.wipe;
      const active = !this.action && (this.state === "ready" || this.state === "pulling");
      if (active) {
        wipe.t += dt;
        wipe.weight = approach(wipe.weight, wipe.t < 1.5 ? 1 : 0, 6, dt);
        if (wipe.t > 1.5 && wipe.weight < 0.02) this.wipe = null;
      } else {
        wipe.weight = approach(wipe.weight, 0, 12, dt);
        if (wipe.weight < 0.02) this.wipe = null;
      }
    }

    // Feet: step when the body has moved away from the stance.
    const feet = this.feet;
    for (const foot of Object.values(feet)) foot.update(dt);
    const front = this.ropeSide > 0 ? feet.Left : feet.Right;
    const back = this.ropeSide > 0 ? feet.Right : feet.Left;
    const anyStepping = Boolean(front.stepping || back.stepping);
    if (!anyStepping) {
      if (stepRequest === "back") {
        (back.distanceFromHome() >= front.distanceFromHome() ? back : front).step(STEP_DURATION / this.traits.tempo);
      } else if (stepRequest === "catch") {
        (front.distanceFromHome() >= back.distanceFromHome() ? front : back).step(0.2, 0.06);
      } else if (this.state === "ready" || this.state === "pulling" || this.state === "dejected" || this.state === "celebrate") {
        // Catch up with the body whenever a foot is left too far behind.
        const threshold = this.state === "celebrate" ? 0.12 : 0.24;
        if (back.distanceFromHome() > threshold) back.step();
        else if (front.distanceFromHome() > threshold) front.step();
      }
    }

    // Build the pose.
    switch (this.state) {
      case "ready":
      case "pulling":
        this.posePulling(dt, lean, effort, fatigue, digFront, context);
        break;
      case "celebrate":
        this.poseCelebrate(dt, context);
        break;
      case "falling":
      case "down":
      case "rising":
      case "dejected":
        this.poseLosing(dt, context);
        break;
      default:
        this.posePulling(dt, lean, effort, fatigue, digFront, context);
    }
    this.face.update(dt, this.time);
  }

  // ---------------------------------------------------------------- poses

  /**
   * Shared skeleton assembly: hips, spine, head, legs, arms. `pose` holds
   * character-space targets. Every bone starts from rest each frame.
   */
  applyPose(pose) {
    const rig = this.rig;
    rig.reset();
    const hips = rig.bone("Hips");
    hips.position.set(pose.hipsPosition.x, pose.hipsPosition.y, pose.hipsPosition.z);
    rig.rotate("Hips", "x", pose.hipsPitch);
    rig.rotate("Hips", "y", pose.hipsYaw);
    rig.rotate("Hips", "z", pose.hipsRoll);
    // Spine: distribute the lean over three bones, more at the bottom.
    rig.rotate("Spine", "x", pose.spinePitch * 0.42);
    rig.rotate("Spine1", "x", pose.spinePitch * 0.33);
    rig.rotate("Spine2", "x", pose.spinePitch * 0.25);
    rig.rotate("Spine", "z", pose.spineRoll * 0.5);
    rig.rotate("Spine1", "z", pose.spineRoll * 0.5);
    rig.rotate("Spine", "y", pose.spineTwist * 0.5);
    rig.rotate("Spine1", "y", pose.spineTwist * 0.5);
    rig.rotate("Spine2", "x", pose.chest);
    rig.rotate("LeftShoulder", "y", pose.shoulderForward.Left);
    rig.rotate("RightShoulder", "y", -pose.shoulderForward.Right);
    rig.rotate("LeftShoulder", "z", -pose.shoulderUp.Left);
    rig.rotate("RightShoulder", "z", pose.shoulderUp.Right);
    // Legs.
    for (const side of ["Left", "Right"]) {
      const foot = this.feet[side];
      const target = tmpA.copy(foot.position);
      target.y = rig.footRestY + foot.lift + pose.footLift[side];
      const pole = tmpB.copy(FORWARD).applyAxisAngle(UP, foot.yaw).add(tmpC.set(side === "Left" ? 0.35 : -0.35, 0, 0));
      rig.reach(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, target, pole, LEG_POLE_REST, [rig.lengths.thigh, rig.lengths.shin]);
      const forward = tmpB.copy(FORWARD).applyAxisAngle(UP, foot.yaw);
      const lifted = foot.lift + pose.footLift[side];
      if (lifted > 0.005) forward.y -= 0.6 * clamp(lifted / STEP_HEIGHT, 0, 1);
      // A dug-in heel: toes up.
      if (pose.heelDig[side] > 0) forward.y += 0.45 * pose.heelDig[side];
      rig.orientFoot(side, forward.normalize(), UP);
    }
    // Arms.
    for (const side of ["Left", "Right"]) {
      const target = pose.hand[side];
      const pole = pose.armPole[side];
      this.reachMiss[side] = rig.reach(`${side}Arm`, `${side}ForeArm`, `${side}Hand`, target, pole, ARM_POLE_REST, [rig.lengths.upperArm, rig.lengths.foreArm]);
      if (pose.onRope[side] && pose.grip[side].lengthSq() > 0) {
        // A gripping hand: the knuckles continue the solved forearm (across the
        // rope, so the wrist stays straight), the palm faces up and a little
        // towards the body, and the wrist is placed so the fist's hole sits on
        // the rope. Two passes, since moving the wrist moves the elbow a little.
        for (let pass = 0; pass < 2; pass += 1) {
          const elbow = rig.worldPosition(rig.bone(`${side}ForeArm`), tmpD);
          const wrist = rig.worldPosition(rig.bone(`${side}Hand`), tmpC);
          const forearm = tmpC.sub(elbow);
          forearm.addScaledVector(ROPE_AXIS, -forearm.dot(ROPE_AXIS));
          if (forearm.lengthSq() > 0.004) pose.handFingers[side].copy(forearm).normalize();
          pose.handPalm[side].set(-this.ropeSide * 0.35, 1, 0);
          pose.handPalm[side].addScaledVector(pose.handFingers[side], -pose.handPalm[side].dot(pose.handFingers[side])).normalize();
          target.copy(pose.grip[side]).addScaledVector(pose.handFingers[side], -FIST_FORWARD).addScaledVector(pose.handPalm[side], -FIST_UP);
          this.reachMiss[side] = rig.reach(`${side}Arm`, `${side}ForeArm`, `${side}Hand`, target, pole, ARM_POLE_REST, [rig.lengths.upperArm, rig.lengths.foreArm]);
        }
      }
      rig.orientHand(side, pose.handFingers[side], pose.handPalm[side]);
      if (pose.onRope[side]) {
        const twist = rig.relaxWrist(side);
        // The wrist's range may have left the hand short of the asked orientation,
        // which moves the fist's hole: measure where the hole really is and
        // shift the wrist target by the difference until the rope runs through it.
        for (let pass = 0; pass < 2 && pose.grip[side].lengthSq() > 0; pass += 1) {
          if (!rig.handAxes(side, tmpB, tmpC)) break;
          const hole = rig.worldPosition(rig.bone(`${side}Hand`), tmpD).addScaledVector(tmpB, FIST_FORWARD).addScaledVector(tmpC, FIST_UP);
          const error = tmpA.subVectors(pose.grip[side], hole);
          if (error.lengthSq() < 4e-6) break;
          target.add(error);
          this.reachMiss[side] = rig.reach(`${side}Arm`, `${side}ForeArm`, `${side}Hand`, target, pole, ARM_POLE_REST, [rig.lengths.upperArm, rig.lengths.foreArm]);
          rig.orientHand(side, pose.handFingers[side], pose.handPalm[side]);
          rig.relaxWrist(side, { twist });
        }
      }
      rig.curl(side, pose.curl[side]);
    }
    rig.lookAt(pose.look, pose.lookWeight);
    rig.rotate("Head", "z", pose.headRoll);
    this.root.position.y = pose.rootY ?? 0;
    this.lastPose = pose;
    // Where the hands really are, from the posed bones: the fist hole while the
    // rope is held (the rope is built through these), the palm otherwise.
    for (const side of ["Left", "Right"]) {
      const wrist = rig.worldPosition(rig.bone(`${side}Hand`), tmpA);
      if (pose.onRope[side] && rig.handAxes(side, tmpB, tmpC)) {
        this.lastHands[side].copy(wrist).addScaledVector(tmpB, FIST_FORWARD).addScaledVector(tmpC, FIST_UP);
      } else {
        this.lastHands[side].copy(wrist).addScaledVector(tmpB.copy(pose.handFingers[side]).normalize(), GRIP_OFFSET);
      }
      this.handOnRope[side] = pose.onRope[side];
    }
  }

  basePose() {
    return {
      hipsPosition: new Vector3(0, this.rig.hipsRestY, 0),
      hipsPitch: 0,
      hipsYaw: 0,
      hipsRoll: 0,
      spinePitch: 0,
      spineRoll: 0,
      spineTwist: 0,
      chest: 0,
      shoulderForward: { Left: 0, Right: 0 },
      shoulderUp: { Left: 0, Right: 0 },
      footLift: { Left: 0, Right: 0 },
      heelDig: { Left: 0, Right: 0 },
      hand: { Left: new Vector3(), Right: new Vector3() },
      grip: { Left: new Vector3(), Right: new Vector3() },
      onRope: { Left: false, Right: false },
      handFingers: { Left: new Vector3(0, 0, 1), Right: new Vector3(0, 0, 1) },
      handPalm: { Left: new Vector3(0, -1, 0), Right: new Vector3(0, -1, 0) },
      armPole: { Left: new Vector3(0.6, -0.6, -0.5), Right: new Vector3(-0.6, -0.6, -0.5) },
      curl: { Left: 0.2, Right: 0.2 },
      look: new Vector3(0, 1.4, 6),
      lookWeight: 0.8,
      headRoll: 0,
      rootY: 0
    };
  }

  /** Estimate where a joint carried by the torso lands for this pose (rest offset from the hips, pitched). */
  torsoPoint(pose, restOffset, out) {
    const pitch = pose.hipsPitch + pose.spinePitch * 0.9;
    tmpQ.setFromAxisAngle(X_AXIS, pitch);
    return out.copy(restOffset).applyQuaternion(tmpQ).add(pose.hipsPosition);
  }

  /** Pull the hips towards any foot the legs cannot reach (keeps feet planted, never floating). */
  fitLegs(pose) {
    const maxLeg = this.legReach * LEG_FIT;
    for (const side of ["Left", "Right"]) {
      const foot = this.feet[side];
      const joint = tmpC.copy(this.hipJointRest[side]).add(pose.hipsPosition);
      const dx = foot.position.x - joint.x;
      const dy = this.rig.footRestY + foot.lift + pose.footLift[side] - joint.y;
      const dz = foot.position.z - joint.z;
      if (dx * dx + dy * dy + dz * dz <= maxLeg * maxLeg) continue;
      const room = Math.sqrt(Math.max(0, maxLeg * maxLeg - dx * dx - dy * dy));
      // Move the hips along z towards the foot until the leg can reach.
      pose.hipsPosition.z = dz > 0 ? foot.position.z - room : foot.position.z + room;
    }
  }

  /** Keep a grip within the arm's reach of its shoulder by sliding it along the rope (z). */
  fitArm(pose, side) {
    const shoulder = this.torsoPoint(pose, this.shoulderRest[side], tmpC);
    const grip = pose.grip[side];
    const max = this.armReach * ARM_FIT;
    const dx = grip.x - shoulder.x;
    const dy = grip.y - shoulder.y;
    const dz = grip.z - shoulder.z;
    if (dx * dx + dy * dy + dz * dz <= max * max) return;
    const room = Math.sqrt(Math.max(0, max * max - dx * dx - dy * dy));
    grip.z = dz > 0 ? shoulder.z + room : shoulder.z - room;
  }

  /** Where this puller's two hands sit on the rope, character space. */
  ropeHands(pose, release) {
    const frontSide = this.traits.frontHand;
    const backSide = frontSide === "Left" ? "Right" : "Left";
    const ropeY = ROPE_Y + this.noise(this.time * 0.6 + 3) * 0.004;
    // Grips ride with the hips (the rope passes the waist) and trail or lead them on a pull.
    const base = pose.hipsPosition.z - this.hipsOffset.z + this.handShift;
    pose.grip[frontSide].set(this.ropeX, ropeY, base + GRIP_FRONT_Z);
    pose.grip[backSide].set(this.ropeX, ropeY, base + GRIP_BACK_Z);
    // Underhand grip, like holding a bar at hip height: the knuckles point
    // across the rope (the way the forearm comes in, so the wrist stays
    // straight), the palm faces up and a little towards the body, the fingers
    // curl up and over the rope and the thumb closes on top. The IK target is
    // the wrist, placed so the hole of the closed fist sits on the rope line.
    this.fitArm(pose, frontSide);
    this.fitArm(pose, backSide);
    // The fists must not overlap: the back hand moves back if the front one had to.
    if (pose.grip[frontSide].z - pose.grip[backSide].z < GRIP_MIN_GAP) {
      pose.grip[backSide].z = pose.grip[frontSide].z - GRIP_MIN_GAP;
      this.fitArm(pose, backSide);
    }
    for (const side of ["Left", "Right"]) {
      // First guess (applyPose refines it from the solved forearm): knuckles
      // across the rope towards the body, palm up.
      pose.handFingers[side].set(-this.ropeSide, -0.35, 0).normalize();
      pose.handPalm[side].set(-this.ropeSide * 0.35, 1, 0);
      pose.handPalm[side].addScaledVector(pose.handFingers[side], -pose.handPalm[side].dot(pose.handFingers[side])).normalize();
      pose.curl[side] = this.grip.value;
      // Elbows out, so each forearm crosses the rope instead of running along it:
      // the near arm flares wide (its shoulder is almost above the rope), the far
      // arm reaches across the body with its elbow out on the other side.
      const near = (side === "Left") === this.ropeSide > 0;
      if (near) pose.armPole[side].set(this.ropeSide * 1.0, -0.25, 0.1);
      else pose.armPole[side].set(-this.ropeSide * 0.85, -0.35, -0.3);
      pose.hand[side].copy(pose.grip[side]).addScaledVector(pose.handFingers[side], -FIST_FORWARD).addScaledVector(pose.handPalm[side], -FIST_UP);
      pose.onRope[side] = release < 0.5;
    }
    if (release > 0) {
      // Hands drift off the rope towards a free pose.
      for (const side of ["Left", "Right"]) {
        pose.hand[side].lerp(this.freeHands[side], release);
        pose.grip[side].copy(pose.hand[side]);
      }
    }
    // The brow wipe lifts the back hand off the rope and across the forehead.
    if (this.wipe && this.wipe.weight > 0.001) {
      const wipe = this.wipe;
      const side = wipe.side;
      const head = this.torsoPoint(pose, this.headRest, tmpD);
      const sweep = Math.sin(clamp((wipe.t - 0.35) / 0.9, 0, 1) * Math.PI) * 0.09;
      const brow = tmpC.set(head.x + (side === "Left" ? 0.07 : -0.07) - this.ropeSide * sweep, head.y + 0.08, head.z + 0.13);
      pose.hand[side].lerp(brow, wipe.weight);
      pose.handFingers[side].lerp(tmpD.set(side === "Left" ? -1 : 1, 0.2, 0).normalize(), wipe.weight).normalize();
      pose.handPalm[side].lerp(tmpD.set(0, -0.3, -1).normalize(), wipe.weight).normalize();
      pose.armPole[side].lerp(tmpD.set(side === "Left" ? 0.9 : -0.9, -0.5, 0.2), wipe.weight);
      pose.curl[side] = lerp(pose.curl[side], 0.25, wipe.weight);
      pose.onRope[side] = wipe.weight < 0.3 && pose.onRope[side];
      pose.look.y -= 0.25 * wipe.weight;
    }
    return { front: pose.grip[frontSide], back: pose.grip[backSide] };
  }

  posePulling(dt, lean, effort, fatigue, digFront, context) {
    const pose = this.basePose();
    const t = this.time;
    const breath = 0.5 + 0.5 * Math.sin(t * (1.6 + fatigue * 1.8) * this.traits.tempo);
    const sway = this.noise(t * 0.7) * 0.012 * this.traits.sway + this.noise(t * 2.3 + 9) * 0.004 * (1 + fatigue);
    // Lower, braced stance: the deeper the lean the lower the hips; tired legs sag further.
    const sink = 0.1 + effort * 0.08 + lean * 0.1 + fatigue * 0.05;
    pose.hipsPosition.set(
      sway + this.hipsOffset.x,
      this.rig.hipsRestY - sink + Math.sin(t * 3.1) * 0.003 * (1 + fatigue) + this.hipsOffset.y,
      -0.2 - lean * 0.2 + this.hipsOffset.z
    );
    pose.hipsPitch = -deg(8) - lean * deg(14);
    pose.hipsYaw = this.ropeSide * deg(14);
    pose.hipsRoll = this.ropeSide * deg(2);
    const slump = fatigue * deg(10);
    pose.spinePitch = -deg(10) - lean * deg(26) + this.torsoPitchExtra.value + slump;
    pose.spineTwist = this.ropeSide * deg(10);
    pose.spineRoll = -this.ropeSide * deg(4) * lean;
    pose.chest = breath * deg(2.5) * (0.6 + fatigue * 1.2);
    pose.shoulderForward.Left = deg(10) + effort * deg(8);
    pose.shoulderForward.Right = deg(10) + effort * deg(8);
    pose.shoulderUp.Left = deg(3) + fatigue * deg(5) + breath * deg(1.5);
    pose.shoulderUp.Right = deg(3) + fatigue * deg(5) + breath * deg(1.5);
    this.fitLegs(pose);
    this.ropeHands(pose, this.release.value);
    const frontFoot = this.ropeSide > 0 ? "Left" : "Right";
    pose.heelDig[frontFoot] = clamp(digFront * 0.9 + lean * 0.25, 0, 1);
    pose.look.set(this.ropeX * 0.5, 1.15 - fatigue * 0.35, 5);
    pose.lookWeight = 0.65;
    pose.headRoll = this.noise(t * 0.4 + 20) * deg(3) + fatigue * deg(4) * this.ropeSide;
    this.applyPose(pose);
    void context;
    void dt;
  }

  /** Straight arm from the shoulder along `direction` (character space), slightly short of full reach. */
  armStraight(pose, side, direction, reach = 0.96) {
    const shoulder = this.torsoPoint(pose, this.shoulderRest[side], tmpC);
    pose.hand[side].copy(shoulder).addScaledVector(tmpD.copy(direction).normalize(), this.armReach * reach);
  }

  poseCelebrate(dt, context) {
    if (this.celebration?.kind === "team") {
      this.poseTeamCelebrate(dt);
      void context;
      return;
    }
    const pose = this.basePose();
    const c = this.celebration;
    c.t += dt;
    const t = c.t;
    const settle = smoothstep(0, 0.45, t); // stand up out of the pulling stance
    const tempo = this.traits.tempo;
    const bounce = Math.max(0, Math.sin(t * 7.5 * tempo));
    pose.hipsPosition.set(this.noise(t * 0.9) * 0.01, this.rig.hipsRestY - 0.06 * (1 - settle), -0.05 * (1 - settle));
    pose.hipsPitch = -deg(4) * (1 - settle);
    pose.spinePitch = -deg(14) * (1 - settle) - deg(8) * settle;
    pose.look.set(this.ropeSide * 0.2, 1.9, 4);
    pose.lookWeight = 0.9;
    const armsUp = (side, spread, forward = 0.12) => {
      this.armStraight(pose, side, tmpA.set(side === "Left" ? spread : -spread, 1, forward));
      pose.handFingers[side].set(side === "Left" ? 0.4 : -0.4, 1, 0.1).normalize();
      pose.handPalm[side].set(0, 0, 1);
      pose.armPole[side].set(side === "Left" ? 0.9 : -0.9, 0.1, -0.3);
      pose.curl[side] = 0.25;
    };
    const fistsUp = (phase) => {
      // Both fists pumping at chest / head height.
      for (const side of ["Left", "Right"]) {
        const shoulder = this.torsoPoint(pose, this.shoulderRest[side], tmpC);
        pose.hand[side].set(shoulder.x + (side === "Left" ? 0.08 : -0.08), shoulder.y + 0.05 + phase * 0.3, shoulder.z + 0.3 - phase * 0.1);
        pose.handFingers[side].set(0, 1, 0.2).normalize();
        pose.handPalm[side].set(0, 0, -1);
        pose.armPole[side].set(side === "Left" ? 0.9 : -0.9, -0.4, -0.3);
        pose.curl[side] = 0.95;
      }
    };
    let rootLift = 0;
    if (c.kind === "arms") {
      // Arms straight up in a V, rocking side to side; then both fists pumping; repeat.
      const cycle = (t * tempo) % 4.4;
      if (cycle < 2.6) {
        const wave = Math.sin(t * 5) * 0.08;
        armsUp("Left", 0.45 + wave);
        armsUp("Right", 0.45 - wave);
        pose.spineRoll = Math.sin(t * 2.5) * deg(6);
      } else {
        const pump = 0.5 + 0.5 * Math.sin(t * 7 * tempo);
        fistsUp(pump);
        pose.spinePitch -= deg(6) * pump;
      }
      // Knees give a little with every beat; weight shifts from foot to foot.
      pose.hipsPosition.y -= 0.06 * (1 - bounce) * settle;
      pose.hipsRoll = Math.sin(t * 3.75 * tempo) * deg(3);
    } else if (c.kind === "jump") {
      const phase = (t * 1.6 * tempo) % 1;
      const air = phase < 0.45 ? bump(phase / 0.45) : 0;
      const crouch = phase > 0.75 ? bump((phase - 0.75) / 0.25) : 0;
      rootLift = air * 0.24 * settle;
      armsUp("Left", 0.35 + air * 0.1, 0.08);
      armsUp("Right", 0.35 + air * 0.1, 0.08);
      pose.footLift.Left = air * 0.1;
      pose.footLift.Right = air * 0.1;
      pose.hipsPosition.y -= (crouch * 0.07 + (1 - air) * 0.03) * settle;
      pose.spinePitch += deg(6) * crouch;
    } else {
      // Fist pump with the rope-side arm, other hand on the hip, hopping on the spot.
      const pumpSide = this.ropeSide > 0 ? "Right" : "Left";
      const restSide = pumpSide === "Left" ? "Right" : "Left";
      const pump = 0.5 + 0.5 * Math.sin(t * 6 * tempo);
      const shoulder = this.torsoPoint(pose, this.shoulderRest[pumpSide], tmpC);
      pose.hand[pumpSide].set(shoulder.x + (pumpSide === "Left" ? 0.12 : -0.12), shoulder.y + 0.05 + pump * 0.42, shoulder.z + 0.28 - pump * 0.12);
      pose.handFingers[pumpSide].set(0, 1, 0.2).normalize();
      pose.handPalm[pumpSide].set(pumpSide === "Left" ? -1 : 1, 0, 0);
      pose.armPole[pumpSide].set(pumpSide === "Left" ? 0.8 : -0.8, -0.2, -0.4);
      pose.curl[pumpSide] = 0.95;
      pose.hand[restSide].set(restSide === "Left" ? 0.2 : -0.2, 1.0, 0.02);
      pose.handFingers[restSide].set(restSide === "Left" ? -0.3 : 0.3, -0.4, 0.8).normalize();
      pose.handPalm[restSide].set(restSide === "Left" ? -1 : 1, -0.2, 0);
      pose.armPole[restSide].set(restSide === "Left" ? 0.9 : -0.9, -0.3, -0.5);
      pose.curl[restSide] = 0.3;
      pose.spineTwist = (pumpSide === "Left" ? 1 : -1) * pump * deg(8);
      const hop = Math.max(0, Math.sin(t * 6 * tempo));
      rootLift = hop * 0.05 * settle;
      pose.hipsPosition.y -= (1 - hop) * 0.03 * settle;
    }
    pose.rootY = rootLift;
    pose.chest = bounce * deg(2);
    this.fitLegs(pose);
    this.applyPose(pose);
    void context;
  }

  // ---------------------------------------------------------------- team celebration

  /** Join the winning team's shared celebration plan (after finish(true)). */
  startTeamCelebration(plan, member) {
    if (this.state !== "celebrate") return;
    this.celebration = { kind: "team", plan, member, t: 0, lastJumpIndex: -1, lookTimer: 0, lookWho: 0, cheer: 0, cheerTimer: 0 };
    this.armMode = { Left: "", Right: "" };
    this.armFrom = { Left: new Vector3(), Right: new Vector3() };
    this.armBlend = { Left: 1, Right: 1 };
    this.hug = { Left: null, Right: null };
    this.root.updateMatrixWorld(true);
  }

  /**
   * Move the character (tug-group space) while every planted foot keeps its
   * place on the ground; the step controller then walks the feet after the
   * body. `yaw` maps local +Z onto (sin yaw, 0, cos yaw).
   */
  placeRoot(x, z, yaw) {
    const root = this.root;
    const oldX = root.position.x;
    const oldZ = root.position.z;
    const oldYaw = root.rotation.y;
    if (oldX === x && oldZ === z && oldYaw === yaw) return;
    const keep = (vector) => {
      // local → world (old) → local (new), on the ground plane
      vector.applyAxisAngle(UP, oldYaw);
      vector.x += oldX - x;
      vector.z += oldZ - z;
      vector.applyAxisAngle(UP, -yaw);
    };
    for (const foot of Object.values(this.feet)) {
      keep(foot.position);
      if (foot.stepping) keep(foot.stepping.from);
    }
    root.position.x = x;
    root.position.z = z;
    root.rotation.y = yaw;
    root.updateMatrixWorld(true);
  }

  /**
   * Character space → world, from the root's live position and rotation (the
   * cached world matrix lags a frame behind a jumping root).
   */
  worldFromLocal(vector) {
    vector.applyQuaternion(this.root.quaternion).add(this.root.position);
    return this.root.parent ? this.root.parent.localToWorld(vector) : vector;
  }

  /** World → character space, the inverse of worldFromLocal. */
  localFromWorld(vector) {
    if (this.root.parent) this.root.parent.worldToLocal(vector);
    return vector.sub(this.root.position).applyQuaternion(tmpQ.copy(this.root.quaternion).invert());
  }

  /** Tug-group space (where root.position and the plan live) → character space. */
  tugToLocal(vector) {
    return vector.sub(this.root.position).applyAxisAngle(UP, -this.root.rotation.y);
  }

  /** World position of a posed bone. */
  boneWorld(name, out) {
    this.rig.worldPosition(this.rig.bone(name), out);
    return this.worldFromLocal(out);
  }

  /** Smooth the hand target across mode changes (the IK would otherwise snap). */
  armTarget(pose, side, mode, target, dt) {
    if (this.armMode[side] !== mode) {
      this.armMode[side] = mode;
      this.armFrom[side].copy(this.lastHands[side]);
      this.armBlend[side] = 0;
    }
    this.armBlend[side] = Math.min(1, this.armBlend[side] + dt / 0.38);
    pose.hand[side].lerpVectors(this.armFrom[side], target, smoothstep(0, 1, this.armBlend[side]));
  }

  /**
   * Put this hand over a teammate's nearest shoulder: the palm rests on top of
   * the shoulder, fingers pointing over it, elbow up (an arm around the
   * shoulders). Returns the world contact point.
   */
  hugArm(pose, side, teammate, dt, expectedLift = null) {
    const myShoulder = this.boneWorld(side === "Left" ? "LeftArm" : "RightArm", tmpD);
    const left = teammate.boneWorld("LeftArm", new Vector3());
    const right = teammate.boneWorld("RightArm", new Vector3());
    // A teammate posed after me this frame still shows last frame's jump height: use the shared clock's.
    if (expectedLift !== null) {
      const correction = expectedLift - teammate.root.position.y;
      left.y += correction;
      right.y += correction;
    }
    const near = left.distanceTo(myShoulder) <= right.distanceTo(myShoulder) ? left : right;
    const far = near === left ? right : left;
    const across = tmpC.subVectors(far, near).setY(0).normalize();
    // Contact point: on top of the near shoulder, a hand's width over towards the far side.
    const contactWorld = near.clone().addScaledVector(across, 0.03);
    contactWorld.y += 0.075;
    const local = this.localFromWorld(contactWorld.clone());
    pose.handFingers[side].copy(this.localFromWorld(contactWorld.clone().add(across)).sub(local)).setY(-0.15).normalize();
    // The IK target is the wrist: one palm-length back along the fingers, so the palm rests on the shoulder.
    const wrist = local.clone().addScaledVector(pose.handFingers[side], -GRIP_OFFSET);
    this.armTarget(pose, side, `hug:${teammate.index}`, wrist, dt);
    pose.handPalm[side].set(0, -1, 0);
    pose.armPole[side].set(side === "Left" ? 0.3 : -0.3, 1, 0.35);
    pose.curl[side] = 0.3;
    this.hug[side] = { teammate, target: contactWorld };
    return contactWorld;
  }

  /** A free arm: straight up (V), fist pumping, waving, or resting on the hip. */
  freeArm(pose, side, kind, t, dt, lift = 1) {
    const sign = side === "Left" ? 1 : -1;
    if (kind === "up") {
      const shoulder = this.torsoPoint(pose, this.shoulderRest[side], tmpC);
      const target = tmpD.copy(shoulder).addScaledVector(tmpA.set(sign * 0.45, 1, 0.1).normalize(), this.armReach * 0.96);
      this.armTarget(pose, side, "up", target, dt);
      pose.handFingers[side].set(sign * 0.4, 1, 0.1).normalize();
      pose.handPalm[side].set(0, 0, 1);
      pose.armPole[side].set(sign * 0.9, 0.1, -0.3);
      pose.curl[side] = 0.25 - 0.1 * lift;
    } else if (kind === "pump") {
      const shoulder = this.torsoPoint(pose, this.shoulderRest[side], tmpC);
      const pump = 0.5 + 0.5 * Math.sin(t * 6 * this.traits.tempo);
      const target = tmpD.set(shoulder.x + sign * 0.14, shoulder.y + 0.05 + pump * 0.42, shoulder.z + 0.28 - pump * 0.12);
      this.armTarget(pose, side, "pump", target, dt);
      pose.handFingers[side].set(0, 1, 0.2).normalize();
      pose.handPalm[side].set(-sign, 0, 0);
      pose.armPole[side].set(sign * 0.8, -0.2, -0.4);
      pose.curl[side] = 0.95;
    } else if (kind === "wave") {
      const shoulder = this.torsoPoint(pose, this.shoulderRest[side], tmpC);
      const wave = Math.sin(t * 5.5) * 0.12;
      const target = tmpD.copy(shoulder).addScaledVector(tmpA.set(sign * (0.55 + wave), 1, 0.15).normalize(), this.armReach * 0.95);
      this.armTarget(pose, side, "wave", target, dt);
      pose.handFingers[side].set(sign * 0.5 + wave, 1, 0.1).normalize();
      pose.handPalm[side].set(0, 0, 1);
      pose.armPole[side].set(sign * 0.9, 0.2, -0.2);
      pose.curl[side] = 0.15;
    } else {
      // Open, welcoming arm at shoulder height (the walk into the huddle).
      const target = tmpD.set(sign * 0.52, 1.22, 0.22);
      this.armTarget(pose, side, "open", target, dt);
      pose.handFingers[side].set(sign * 0.8, 0.1, 0.6).normalize();
      pose.handPalm[side].set(-sign * 0.4, -0.2, 0.9).normalize();
      pose.armPole[side].set(sign * 0.7, -0.6, -0.4);
      pose.curl[side] = 0.2;
    }
  }

  /**
   * Second pass, after every winner has been posed this frame: re-solve the hug
   * arms against the teammates' current shoulders, so contact never lags a
   * frame behind, however long the frame was.
   */
  refreshHugArms() {
    const pose = this.lastPose;
    if (!pose || this.celebration?.kind !== "team") return;
    const rig = this.rig;
    for (const side of ["Left", "Right"]) {
      const hug = this.hug[side];
      if (!hug) continue;
      this.hugArm(pose, side, hug.teammate, 0);
      this.reachMiss[side] = rig.reach(`${side}Arm`, `${side}ForeArm`, `${side}Hand`, pose.hand[side], pose.armPole[side], ARM_POLE_REST, [rig.lengths.upperArm, rig.lengths.foreArm]);
      rig.orientHand(side, pose.handFingers[side], pose.handPalm[side]);
      rig.curl(side, pose.curl[side]);
      const wrist = rig.worldPosition(rig.bone(`${side}Hand`), tmpA);
      this.lastHands[side].copy(wrist).addScaledVector(tmpB.copy(pose.handFingers[side]).normalize(), GRIP_OFFSET);
    }
  }

  /** Walk the root towards a slot at a natural pace; returns the remaining distance. */
  walkTowards(target, yawTarget, dt, speed = 1.0) {
    const root = this.root;
    const dx = target.x - root.position.x;
    const dz = target.z - root.position.z;
    const distance = Math.hypot(dx, dz);
    let nx = root.position.x;
    let nz = root.position.z;
    if (distance > 0.002) {
      const pace = speed * clamp(distance / 0.3, 0.35, 1); // ease out into the slot
      const stepLength = Math.min(distance, pace * dt);
      nx += (dx / distance) * stepLength;
      nz += (dz / distance) * stepLength;
    }
    let delta = yawTarget - root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const yaw = root.rotation.y + delta * (1 - Math.exp(-6 * dt));
    this.placeRoot(nx, nz, yaw);
    return distance;
  }

  poseTeamCelebrate(dt) {
    const c = this.celebration;
    const plan = c.plan;
    const member = c.member;
    const t = plan.t + member.offset;
    const phase = celebrationPhase(plan, plan.t);
    const pose = this.basePose();
    const hipsY = this.rig.hipsRestY;
    const toLocal = (world) => this.localFromWorld(world.clone());
    this.hug.Left = null;
    this.hug.Right = null;

    // ---- where the body is: release / turn on the spot, walk into the huddle, re-form the line.
    const tugSpace = (vector) => vector; // slots are already in the tug group's space, as root.position is
    let moving = 0;
    if (phase === "turn") {
      this.walkTowards(tugSpace(this.root.position), member.slot.yaw, dt);
    } else if (phase === "approach" || phase === "hug" || phase === "jump") {
      moving = this.walkTowards(member.slot.position, member.slot.yaw, dt, phase === "approach" ? 1.2 : 0.6);
    } else if (phase === "break" || phase === "pose") {
      moving = this.walkTowards(member.line.position, member.line.yaw, dt, 0.8);
    }

    // ---- the shared jump.
    const jump = phase === "jump" ? jumpProfile(plan, t) : { lift: 0, crouch: 0, air: 0, phase: 0 };
    const jumpIndex = phase === "jump" ? Math.floor((t - plan.times.jump) / plan.period) : -1;
    if (jumpIndex !== c.lastJumpIndex) {
      c.lastJumpIndex = jumpIndex;
      if (jumpIndex >= 0) this.face.set(jumpIndex % 2 ? { joy: 0.9, excited: 0.45 } : { excited: 0.75, joy: 0.6 }, 12);
    }

    // ---- stance and torso.
    const settle = smoothstep(0, 0.45, plan.t);
    const walking = moving > 0.04 ? 1 : 0;
    const stride = this.feet.Left.lift + this.feet.Right.lift;
    const bob = walking ? -0.012 * (stride / STEP_HEIGHT) : 0;
    const bounce = phase === "pose" ? 0.5 + 0.5 * Math.sin(t * 4.2 * this.traits.tempo) : 0;
    pose.hipsPosition.set(this.noise(t * 0.9) * 0.008, hipsY - 0.06 * (1 - settle) - jump.crouch + bob - 0.015 * bounce, -0.05 * (1 - settle) + (phase === "hug" || phase === "jump" ? 0.03 : 0));
    pose.hipsPitch = -deg(4) * (1 - settle) + deg(6) * jump.crouch * 7;
    pose.spinePitch = -deg(14) * (1 - settle) + deg(4) * walking + (phase === "hug" || phase === "jump" ? deg(9) : deg(2)) + deg(30) * jump.crouch - deg(6) * jump.air;
    // The cheer hop and the jump lift the whole body; apply them to the root now so every
    // world ↔ local conversion below (hug targets, looks) sees this frame's height.
    const cheerPhase = phase === "pose" ? (t - plan.times.pose) % plan.cheerEvery : 0;
    const cheering = phase === "pose" && cheerPhase < 0.9;
    const hop = cheering ? Math.sin((cheerPhase / 0.9) * Math.PI) : 0;
    pose.rootY = jump.lift + 0.05 * hop;
    this.root.position.y = pose.rootY;
    if (jump.air > 0) {
      pose.footLift.Left = 0.06 * jump.air;
      pose.footLift.Right = 0.06 * jump.air;
    }

    // ---- arms.
    const neighbourSide = (teammate) => (teammate ? (this.tugToLocal(teammate.puller.root.position.clone()).x >= 0 ? "Left" : "Right") : null);
    const hugging = phase === "hug" || phase === "jump" || phase === "pose";
    const done = { Left: false, Right: false };
    if (hugging) {
      for (const teammate of [member.left, member.right]) {
        if (!teammate) continue;
        const side = neighbourSide(teammate);
        if (!side || done[side]) continue;
        // In the line the outer members hold the middle one; the middle holds both.
        if (phase === "pose" && !member.isMiddle && !teammate.isMiddle) continue;
        const stale = teammate.puller.celebrationFrame !== plan.t;
        const lift = stale ? (phase === "jump" ? jumpProfile(plan, plan.t + teammate.offset).lift : 0) : null;
        this.hugArm(pose, side, teammate.puller, dt, lift);
        done[side] = true;
      }
    }
    for (const side of ["Left", "Right"]) {
      if (done[side]) continue;
      if (phase === "release") {
        this.freeArm(pose, side, "up", t, dt, settle);
      } else if (phase === "turn" || phase === "approach") {
        this.freeArm(pose, side, "open", t, dt);
      } else if (phase === "hug") {
        this.freeArm(pose, side, "up", t, dt);
      } else if (phase === "jump") {
        this.freeArm(pose, side, jump.air > 0.5 ? "up" : "pump", t, dt);
      } else if (phase === "break") {
        this.freeArm(pose, side, "open", t, dt);
      } else {
        this.freeArm(pose, side, cheering ? "up" : member.finalKind === "shoulders" ? "wave" : member.finalKind, t, dt);
      }
    }
    if (cheering) {
      pose.hipsPosition.y -= 0.03 * (1 - hop);
      if (!c.cheered) {
        c.cheered = true;
        this.face.set({ excited: 0.7, joy: 0.7 }, 10);
      }
    } else if (c.cheered) {
      c.cheered = false;
      this.face.set({ joy: 0.85 }, 4);
    }

    // ---- head: teammates during the huddle, the crowd and the camera afterwards.
    c.lookTimer += dt;
    if (c.lookTimer > member.lookEvery) {
      c.lookTimer = 0;
      c.lookWho = 1 - c.lookWho;
    }
    const teammates = [member.left, member.right].filter(Boolean);
    const watched = teammates.length ? teammates[c.lookWho % teammates.length] : null;
    if (phase === "release") {
      pose.look.set(0, 1.9, 4);
      pose.lookWeight = 0.9;
    } else if (phase === "turn" || phase === "approach") {
      pose.look.copy(this.tugToLocal(plan.centre.clone())).setY(1.5);
      pose.lookWeight = 0.8;
    } else if (phase === "hug" || phase === "jump") {
      if (watched) {
        pose.look.copy(toLocal(watched.puller.boneWorld("Head", tmpA)));
        pose.headRoll = (this.tugToLocal(watched.puller.root.position.clone()).x >= 0 ? 1 : -1) * deg(7);
      }
      pose.lookWeight = 0.9;
    } else {
      pose.look.set(this.noise(t * 0.3) * 0.6, 1.55, 5);
      pose.lookWeight = 0.85;
    }
    pose.chest = Math.sin(t * 4) * deg(2) + jump.air * deg(3);
    pose.spineRoll = phase === "pose" ? Math.sin(t * 2.1 + member.index) * deg(2.5) : 0;
    this.fitLegs(pose);
    this.applyPose(pose);
    this.celebrationFrame = plan.t;
  }

  poseLosing(dt, context) {
    const pose = this.basePose();
    const f = this.fall;
    f.t += dt;
    const t = f.t;
    const hipsY = this.rig.hipsRestY;
    // Phase 1 (0–0.7 s): the rope goes slack; the body lurches forward and
    // stumbles two quick steps. Phase 2 (0.6–1.25 s): the fall / catch.
    // Phase 3 (1.25–3.2 s): on the ground. Phase 4 (3.2–4.5 s): rise; then stand dejected.
    const lurch = smoothstep(0, 0.28, t) * (1 - smoothstep(0.7, 1.3, t));
    const drop = smoothstep(0.6, 1.25, t);
    const rise = smoothstep(3.2, 4.5, t);
    if (this.state === "falling" && t > 1.25) this.state = "down";
    if (this.state === "down" && t > 3.2) this.state = "rising";
    if (this.state === "rising" && t > 4.5) {
      this.state = "dejected";
      this.face.set({ disappointed: 0.8 }, 3);
    }
    if (this.state === "down" && t > 1.6 && !f.faced) {
      f.faced = true;
      this.face.set({ disappointed: 0.6, tired: 0.4 }, 3);
    }
    // Stumble: the feet chase the lurching body with two quick, high steps.
    const front = this.ropeSide > 0 ? this.feet.Left : this.feet.Right;
    const back = this.ropeSide > 0 ? this.feet.Right : this.feet.Left;
    if (f.steps === 0 && t > 0.06) {
      f.steps = 1;
      front.step(0.19, 0.1, tmpA.set(front.position.x * 0.8, 0, front.position.z + 0.42));
    } else if (f.steps === 1 && t > 0.28) {
      f.steps = 2;
      back.step(0.19, 0.09, tmpA.set(back.position.x * 0.8, 0, back.position.z + 0.5));
    }
    const kind = f.kind;
    const downAmount = drop * (1 - rise);
    let hipsTargetY = hipsY - 0.1 - 0.06 * lurch;
    let hipsZ = 0.4 * smoothstep(0, 0.55, t) * (1 - drop * 0.4);
    let spinePitch = deg(44) * lurch;
    const handL = pose.hand.Left;
    const handR = pose.hand.Right;
    // Hands leave the rope and windmill forward with the lurch.
    const flail = Math.sin(t * 15) * 0.1 * lurch;
    handL.set(0.36 + flail, 1.05 - lurch * 0.3 + flail, hipsZ + 0.35 + lurch * 0.25);
    handR.set(-0.36 - flail, 1.05 - lurch * 0.3 - flail, hipsZ + 0.35 + lurch * 0.25);
    for (const side of ["Left", "Right"]) {
      pose.handFingers[side].set(0, -0.3, 1).normalize();
      pose.handPalm[side].set(0, -1, 0.3).normalize();
      pose.curl[side] = 0.2;
      pose.armPole[side].set(side === "Left" ? 0.8 : -0.8, -0.5, -0.3);
    }
    if (kind === "kneel") {
      // Down onto hands and knees, head low; then push up.
      hipsTargetY = lerp(hipsTargetY, 0.5, downAmount);
      hipsZ += 0.12 * downAmount;
      spinePitch += deg(55) * downAmount;
      handL.lerp(tmpA.set(0.26, 0.05, hipsZ + 0.5), downAmount);
      handR.lerp(tmpB.set(-0.26, 0.05, hipsZ + 0.5), downAmount);
      pose.handFingers.Left.set(0.1, -0.2, 1).normalize();
      pose.handFingers.Right.set(-0.1, -0.2, 1).normalize();
      pose.handPalm.Left.set(0, -1, 0);
      pose.handPalm.Right.set(0, -1, 0);
      pose.armPole.Left.set(0.9, 0.2, -0.3);
      pose.armPole.Right.set(-0.9, 0.2, -0.3);
      // Knees down: feet slide back under the hips.
      if (downAmount > 0) {
        for (const side of ["Left", "Right"]) {
          const foot = this.feet[side];
          if (foot.stepping) continue;
          const target = tmpA.set(side === "Left" ? 0.18 : -0.18, 0, hipsZ - 0.42);
          foot.position.lerp(target, 1 - Math.exp(-6 * dt * downAmount));
          if (downAmount > 0.6) pose.footLift[side] = 0.02 * downAmount; // toes trail
        }
      }
      pose.look.set(0, 0.2, 2);
      pose.lookWeight = 0.6 * downAmount + 0.4;
    } else if (kind === "sit") {
      // Sits back on the ground, hands behind, then gets up.
      hipsTargetY = lerp(hipsTargetY, 0.14, downAmount);
      hipsZ += -0.2 * downAmount;
      spinePitch = deg(32) * lurch - deg(12) * downAmount;
      pose.hipsPitch = -deg(20) * downAmount;
      handL.lerp(tmpA.set(0.32, 0.04, hipsZ - 0.3), downAmount);
      handR.lerp(tmpB.set(-0.32, 0.04, hipsZ - 0.3), downAmount);
      pose.handFingers.Left.set(0.3, -0.3, -1).normalize();
      pose.handFingers.Right.set(-0.3, -0.3, -1).normalize();
      pose.handPalm.Left.set(0, -1, 0);
      pose.handPalm.Right.set(0, -1, 0);
      pose.armPole.Left.set(0.8, -0.3, -0.6);
      pose.armPole.Right.set(-0.8, -0.3, -0.6);
      if (downAmount > 0) {
        for (const side of ["Left", "Right"]) {
          const foot = this.feet[side];
          if (foot.stepping) continue;
          const target = tmpA.set(side === "Left" ? 0.2 : -0.2, 0, hipsZ + 0.55);
          foot.position.lerp(target, 1 - Math.exp(-6 * dt * downAmount));
        }
      }
      pose.look.set(0, 0.9, 3);
    } else {
      // Stumbles, catches with hands on the knees, stays on their feet.
      hipsTargetY = lerp(hipsTargetY, hipsY - 0.24, downAmount);
      hipsZ += 0.08 * downAmount;
      spinePitch += deg(50) * downAmount;
      handL.lerp(tmpA.set(0.17, 0.6, hipsZ + 0.3), downAmount);
      handR.lerp(tmpB.set(-0.17, 0.6, hipsZ + 0.3), downAmount);
      pose.handFingers.Left.set(0.1, -1, 0.3).normalize();
      pose.handFingers.Right.set(-0.1, -1, 0.3).normalize();
      pose.handPalm.Left.set(-0.3, -0.6, -0.7).normalize();
      pose.handPalm.Right.set(0.3, -0.6, -0.7).normalize();
      pose.armPole.Left.set(0.9, -0.2, -0.4);
      pose.armPole.Right.set(-0.9, -0.2, -0.4);
      if (downAmount > 0) {
        for (const side of ["Left", "Right"]) {
          const foot = this.feet[side];
          if (foot.stepping) continue;
          const target = tmpA.set(side === "Left" ? 0.2 : -0.2, 0, hipsZ + 0.1);
          foot.position.lerp(target, 1 - Math.exp(-4 * dt * downAmount));
        }
      }
      pose.look.set(0, 0.5, 2.5);
    }
    // Dejected stance after rising: shoulders slumped, head down; one puller
    // keeps their hands on the hips, one lets the arms hang, one stays bent
    // over with hands on the knees.
    const dejected = rise;
    const keepBent = kind === "catch" ? 0.55 : 0;
    hipsTargetY = lerp(hipsTargetY, hipsY - 0.03 - 0.12 * keepBent, dejected);
    hipsZ = lerp(hipsZ, 0, dejected);
    spinePitch = lerp(spinePitch, deg(16) + deg(30) * keepBent + Math.sin(t * 1.4) * deg(1.5), dejected);
    if (dejected > 0) {
      if (kind === "kneel") {
        // Hands on the hips.
        handL.lerp(tmpA.set(0.2, hipsY + 0.02, -0.06), dejected);
        handR.lerp(tmpB.set(-0.2, hipsY + 0.02, -0.06), dejected);
        for (const side of ["Left", "Right"]) {
          pose.handFingers[side].lerp(tmpA.set(side === "Left" ? -0.6 : 0.6, -0.5, -0.6).normalize(), dejected).normalize();
          pose.handPalm[side].lerp(tmpB.set(side === "Left" ? -0.8 : 0.8, -0.2, 0.5).normalize(), dejected).normalize();
          pose.armPole[side].lerp(tmpC.set(side === "Left" ? 0.9 : -0.9, 0.1, -0.5), dejected);
          pose.curl[side] = lerp(pose.curl[side], 0.35, dejected);
        }
      } else if (kind === "sit") {
        // Arms hanging, a slow shake of the head.
        handL.lerp(tmpA.set(0.22, 0.86, 0.06), dejected);
        handR.lerp(tmpB.set(-0.22, 0.86, 0.06), dejected);
        for (const side of ["Left", "Right"]) {
          pose.handFingers[side].lerp(tmpA.set(0, -1, 0.2).normalize(), dejected).normalize();
          pose.handPalm[side].lerp(tmpB.set(side === "Left" ? -1 : 1, 0, 0), dejected).normalize();
          pose.armPole[side].lerp(tmpC.set(side === "Left" ? 0.9 : -0.9, -0.3, -0.4), dejected);
        }
        pose.headRoll = Math.sin(t * 2.2) * deg(5) * dejected;
      } else {
        // Hands stay on the knees, breathing hard.
        handL.lerp(tmpA.set(0.17, 0.62, 0.22), dejected);
        handR.lerp(tmpB.set(-0.17, 0.62, 0.22), dejected);
      }
      pose.look.lerp(tmpC.set(0.2, 0.7 - keepBent * 0.3, 3), dejected);
      for (const side of ["Left", "Right"]) {
        const foot = this.feet[side];
        if (foot.stepping) continue;
        foot.position.lerp(tmpA.set(side === "Left" ? 0.16 : -0.16, 0, 0.04), 1 - Math.exp(-3 * dt * dejected));
      }
      pose.shoulderUp.Left = deg(6) * dejected;
      pose.shoulderUp.Right = deg(6) * dejected;
      pose.shoulderForward.Left = deg(8) * dejected;
      pose.shoulderForward.Right = deg(8) * dejected;
    }
    // A standing teammate offers a hand to a fallen neighbour, until they are up.
    if (this.helpTarget && t > 2.4 && t < 4.8) {
      const reach = smoothstep(2.4, 3.2, t) * (1 - smoothstep(4.1, 4.8, t));
      const side = this.helpTarget.x > 0 ? "Left" : "Right";
      pose.hand[side].lerp(this.helpTarget, reach * 0.9);
      pose.handFingers[side].copy(tmpA.subVectors(this.helpTarget, pose.hand[side]).normalize());
      pose.handPalm[side].set(0, 1, 0);
      pose.curl[side] = 0.15;
      pose.look.lerp(this.helpTarget, reach * 0.7);
      pose.hipsYaw = (side === "Left" ? 1 : -1) * deg(18) * reach;
    }
    pose.hipsPosition.set(this.noise(t * 0.8) * 0.006, hipsTargetY, hipsZ);
    pose.spinePitch = spinePitch;
    pose.chest = Math.sin(t * (2.6 + keepBent * 2)) * deg(2.5 + keepBent * 2);
    if (this.state === "dejected" || (this.state === "rising" && rise > 0.5)) this.fitLegs(pose);
    this.applyPose(pose);
    void context;
  }

  dispose() {
    this.rig = null;
  }
}
