// One rope puller: an animation state machine that turns match events into
// a body pose every frame. It only ever receives events the game engine has
// already decided (a pull happened, a team won); it never produces them.
//
// Character space: +Y up, +Z towards the centre knot and the opposing team,
// +X the puller's left. A team pulls towards its own -Z.

import { Vector3 } from "../vendor/three.js";
import { BODY_SIDE, HAND_GAP, ROPE_Y } from "./constants.js";
import { Face } from "./expressions.js";
import { approach, bump, clamp, deg, easeOutCubic, lerp, makeNoise, makeRandom, smoothstep } from "./math.js";
import { Rig } from "./rig.js";

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const ARM_POLE_REST = new Vector3(0, -0.35, -1); // elbows point back/down in the rest A-pose
const LEG_POLE_REST = new Vector3(0, 0, 1); // knees forward

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();

const GRIP_OFFSET = 0.07; // wrist → palm centre, metres
const STEP_DURATION = 0.26;
const STEP_HEIGHT = 0.09;

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

  step(duration = STEP_DURATION, height = STEP_HEIGHT) {
    if (this.stepping) return false;
    this.stepping = { from: this.position.clone(), to: this.home.clone(), t: 0, duration, height };
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
      frontHand: this.random() < 0.5 ? "Left" : "Right"
    };
    const ropeSide = team === "turquoise" ? 1 : -1; // rope lies on this side (+X = left) of the body
    this.ropeSide = ropeSide;
    this.ropeX = ropeSide * BODY_SIDE;
    this.height = this.rig.lengths.height;
    this.scale = this.height / 1.76;
    const stance = 0.17 * this.traits.stance;
    this.feet = {
      Left: new Foot("Left", new Vector3(stance, 0, ropeSide > 0 ? 0.22 : -0.26)),
      Right: new Foot("Right", new Vector3(-stance, 0, ropeSide > 0 ? -0.26 : 0.22))
    };
    // Smoothed pose channels.
    this.lean = new Value(0.55, 4); // 0 upright … 1 maximal backward lean
    this.effort = new Value(0.3, 4); // arm tension / knee bend
    this.fatigue = 0; // 0 … 1, set by the team
    this.momentum = 0; // -1 losing … +1 winning, set by the team
    this.hipsOffset = new Vector3(); // transient heave / yank displacement
    this.hipsOffsetTarget = new Vector3();
    this.torsoPitchExtra = new Value(0, 8);
    this.release = new Value(0, 5); // 0 hands on rope … 1 hands free
    this.grip = new Value(0.92, 6);
    this.action = null; // { type, t, duration, ... }
    this.lookTarget = new Vector3(0, 1.3, 6);
    this.handTargets = { Left: new Vector3(), Right: new Vector3() };
    this.handPalm = { Left: new Vector3(0, -1, 0), Right: new Vector3(0, -1, 0) };
    this.handFingers = { Left: new Vector3(0, 0, 1), Right: new Vector3(0, 0, 1) };
    this.freeHands = { Left: new Vector3(), Right: new Vector3() };
    this.rootYOffset = 0;
    this.lastHands = { Left: new Vector3(), Right: new Vector3() };
    this.helpTarget = null;
    this.celebration = null;
    this.fall = null;
    this.rig.reset();
    this.face.set({ concentration: 0.6 });
  }

  // ---------------------------------------------------------------- events

  /** The team pulled the rope one step. `strength` 0…1 reflects momentum. */
  heave(strength = 0.7, fast = false) {
    if (this.state !== "ready" && this.state !== "pulling") return;
    this.state = "pulling";
    this.action = { type: "heave", t: 0, duration: fast ? 0.42 : 0.72, strength, delay: this.index * 0.045 };
    this.face.set({ determined: 0.8, strain: 0.3 + this.fatigue * 0.5 }, 9);
  }

  /** The other team pulled: this puller is dragged a step towards the centre. */
  yank(strength = 0.7, fast = false) {
    if (this.state !== "ready" && this.state !== "pulling") return;
    this.state = "pulling";
    this.action = { type: "yank", t: 0, duration: fast ? 0.5 : 0.85, strength, delay: 0.06 + this.index * 0.05 };
    const surprise = strength > 0.55 ? 0.6 : 0.3;
    this.face.set({ surprise, strain: 0.5 + this.fatigue * 0.4 }, 10);
  }

  /** The match is decided. */
  finish(won) {
    this.action = null;
    this.stateTime = 0;
    if (won) {
      this.state = "celebrate";
      this.celebration = { kind: ["arms", "jump", "pump"][this.variant], t: 0, highFive: null };
      this.face.set({ joy: 0.9, excited: 0.4 }, 6);
    } else {
      this.state = "falling";
      this.fall = { kind: ["kneel", "sit", "catch"][this.variant], t: 0 };
      this.face.set({ surprise: 0.7, wince: 0.3 }, 10);
    }
    this.release.target = 1;
    this.grip.target = 0;
  }

  /** Back to the start of a match. */
  resetMatch() {
    this.state = "ready";
    this.stateTime = 0;
    this.action = null;
    this.celebration = null;
    this.fall = null;
    this.release.value = 0;
    this.release.target = 0;
    this.grip.target = 0.85;
    this.lean.target = 0.55;
    this.effort.target = 0.3;
    this.hipsOffset.set(0, 0, 0);
    this.hipsOffsetTarget.set(0, 0, 0);
    this.fatigue = 0;
    this.momentum = 0;
    for (const foot of Object.values(this.feet)) {
      foot.position.copy(foot.home);
      foot.stepping = null;
    }
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
      this.lean.target = clamp((0.5 + losing * 0.3 + winning * 0.1 - fatigue * 0.12) * this.traits.lean, 0.2, 0.85);
      this.effort.target = clamp(0.3 + losing * 0.5 + winning * 0.25, 0, 1);
      if (!this.action && this.stateTime > 1.2) {
        this.face.set(fatigue > 0.55 ? { tired: 0.7, strain: losing * 0.4 } : losing > 0.4 ? { strain: 0.6 + fatigue * 0.3, determined: 0.3 } : { concentration: 0.6, determined: 0.3 + winning * 0.3 }, 3);
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
    if (this.action) {
      const action = this.action;
      action.t += dt;
      const local = clamp((action.t - action.delay) / action.duration, 0, 1);
      if (action.type === "heave") {
        // Wind up, drive the hips back and down, then recover as the feet re-plant.
        // A short wind-up (body eases towards the rope) then the drive back and down.
        const windUp = local < 0.18 ? Math.sin((local / 0.18) * Math.PI) : 0;
        const drive = bump(clamp((local - 0.12) / 0.88, 0, 1));
        this.hipsOffsetTarget.z = 0.05 * windUp - 0.26 * action.strength * drive * (1 - fatigue * 0.3);
        this.hipsOffsetTarget.y = -0.12 * action.strength * drive;
        torsoExtra = deg(4) * windUp - deg(17) * action.strength * drive;
        if (local > 0.4 && !action.stepped) {
          action.stepped = true;
          stepRequest = "back";
        }
      } else {
        // Jerked forward: the body lurches, feet slide, then a catch-step.
        const lurch = bump(clamp(local * 1.5, 0, 1));
        this.hipsOffsetTarget.z = 0.2 * action.strength * lurch;
        this.hipsOffsetTarget.y = -0.06 * lurch;
        torsoExtra = deg(26) * action.strength * lurch;
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
        this.posePulling(dt, lean, effort, fatigue, context);
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
        this.posePulling(dt, lean, effort, fatigue, context);
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
      if (foot.lift > 0.005 || pose.footLift[side] > 0.005) forward.y -= 0.6 * clamp((foot.lift + pose.footLift[side]) / STEP_HEIGHT, 0, 1);
      rig.orientFoot(side, forward.normalize(), UP);
    }
    // Arms.
    for (const side of ["Left", "Right"]) {
      const target = pose.hand[side];
      const pole = pose.armPole[side];
      rig.reach(`${side}Arm`, `${side}ForeArm`, `${side}Hand`, target, pole, ARM_POLE_REST, [rig.lengths.upperArm, rig.lengths.foreArm]);
      rig.orientHand(side, pose.handFingers[side], pose.handPalm[side]);
      rig.curl(side, pose.curl[side]);
    }
    rig.lookAt(pose.look, pose.lookWeight);
    rig.rotate("Head", "z", pose.headRoll);
    this.root.position.y = pose.rootY ?? 0;
    this.lastHands.Left.copy(pose.grip.Left.lengthSq() > 0 ? pose.grip.Left : pose.hand.Left);
    this.lastHands.Right.copy(pose.grip.Right.lengthSq() > 0 ? pose.grip.Right : pose.hand.Right);
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
      hand: { Left: new Vector3(), Right: new Vector3() },
      grip: { Left: new Vector3(), Right: new Vector3() },
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

  /** Where this puller's two hands sit on the rope, character space. */
  ropeHands(pose, release) {
    const frontSide = this.traits.frontHand;
    const backSide = frontSide === "Left" ? "Right" : "Left";
    const ropeY = ROPE_Y + this.noise(this.time * 0.6 + 3) * 0.004;
    const frontZ = HAND_GAP * 0.5;
    const backZ = -HAND_GAP * 0.5;
    // Where each palm closes around the rope (the rope is built through these).
    pose.grip[frontSide].set(this.ropeX, ropeY, frontZ);
    pose.grip[backSide].set(this.ropeX, ropeY, backZ);
    // Overhand grip: knuckles roll outwards over the rope and down, palms face
    // down and slightly back towards the body.
    for (const side of ["Left", "Right"]) {
      pose.handFingers[side].set(this.ropeSide * 0.75, -0.6, 0.12).normalize();
      pose.handPalm[side].set(-this.ropeSide * 0.35, -0.9, -0.2).normalize();
      pose.curl[side] = this.grip.value;
      pose.armPole[side].set(side === "Left" ? 0.7 : -0.7, -0.55, -0.45);
      // The IK target is the wrist: one palm-length back along the knuckle direction.
      pose.hand[side].copy(pose.grip[side]).addScaledVector(pose.handFingers[side], -GRIP_OFFSET);
    }
    if (release > 0) {
      // Hands drift off the rope towards a free pose.
      for (const side of ["Left", "Right"]) {
        pose.hand[side].lerp(this.freeHands[side], release);
        pose.grip[side].copy(pose.hand[side]);
      }
    }
    return { front: pose.grip[frontSide], back: pose.grip[backSide] };
  }

  posePulling(dt, lean, effort, fatigue, context) {
    const pose = this.basePose();
    const t = this.time;
    const breath = 0.5 + 0.5 * Math.sin(t * (1.6 + fatigue * 1.6) * this.traits.tempo);
    const sway = this.noise(t * 0.7) * 0.012 * this.traits.sway + this.noise(t * 2.3 + 9) * 0.004 * (1 + fatigue);
    const kneeBend = 0.08 + effort * 0.09 + lean * 0.07;
    // Hips sit behind the rope slot and lower as the lean grows.
    pose.hipsPosition.set(
      sway + this.hipsOffset.x,
      this.rig.hipsRestY - kneeBend - this.hipsOffset.y * -1 + Math.sin(t * 3.1) * 0.003 * (1 + fatigue) + this.hipsOffset.y,
      -0.16 - lean * 0.2 + this.hipsOffset.z
    );
    pose.hipsPitch = -deg(6) - lean * deg(10);
    pose.hipsYaw = this.ropeSide * deg(14);
    pose.hipsRoll = this.ropeSide * deg(2);
    const slump = fatigue * deg(12);
    pose.spinePitch = -deg(12) - lean * deg(22) + this.torsoPitchExtra.value + slump;
    pose.spineTwist = this.ropeSide * deg(10);
    pose.spineRoll = -this.ropeSide * deg(4) * lean;
    pose.chest = breath * deg(2.5) * (0.5 + fatigue);
    pose.shoulderForward.Left = deg(10) + effort * deg(8);
    pose.shoulderForward.Right = deg(10) + effort * deg(8);
    pose.shoulderUp.Left = deg(3) + fatigue * deg(4) + breath * deg(1.5);
    pose.shoulderUp.Right = deg(3) + fatigue * deg(4) + breath * deg(1.5);
    this.ropeHands(pose, this.release.value);
    pose.look.set(this.ropeX * 0.5, 1.15 - fatigue * 0.3, 5);
    pose.lookWeight = 0.65;
    pose.headRoll = this.noise(t * 0.4 + 20) * deg(3);
    this.applyPose(pose);
    void context;
  }

  poseCelebrate(dt, context) {
    const pose = this.basePose();
    const c = this.celebration;
    c.t += dt;
    const t = c.t;
    const settle = smoothstep(0, 0.45, t); // stand up out of the pulling stance
    const bounce = Math.max(0, Math.sin(t * 7.5 * this.traits.tempo));
    pose.hipsPosition.set(this.noise(t * 0.9) * 0.01, this.rig.hipsRestY - 0.06 * (1 - settle), -0.05 * (1 - settle));
    pose.hipsPitch = -deg(4) * (1 - settle);
    pose.spinePitch = -deg(14) * (1 - settle) - deg(6) * settle;
    pose.look.set(this.ropeSide * 0.2, 1.75, 4);
    pose.lookWeight = 0.9;
    const armsUp = (side, spread, height) => {
      pose.hand[side].set(side === "Left" ? spread : -spread, height, 0.12);
      pose.handFingers[side].set(side === "Left" ? 0.4 : -0.4, 1, 0.1).normalize();
      pose.handPalm[side].set(0, 0, 1);
      pose.armPole[side].set(side === "Left" ? 0.9 : -0.9, 0.1, -0.3);
      pose.curl[side] = 0.25;
    };
    let rootLift = 0;
    if (c.kind === "arms") {
      const wave = Math.sin(t * 5) * 0.08;
      armsUp("Left", 0.42 + wave, 1.72 + Math.abs(wave) * 0.5);
      armsUp("Right", 0.42 - wave, 1.72 + Math.abs(wave) * 0.5);
      pose.spineRoll = Math.sin(t * 2.5) * deg(5);
    } else if (c.kind === "jump") {
      const phase = (t * 1.6 * this.traits.tempo) % 1;
      const air = phase < 0.45 ? bump(phase / 0.45) : 0;
      rootLift = air * 0.22 * settle;
      armsUp("Left", 0.38, 1.7 + air * 0.08);
      armsUp("Right", 0.38, 1.7 + air * 0.08);
      pose.footLift.Left = air * 0.1;
      pose.footLift.Right = air * 0.1;
      pose.hipsPosition.y -= (1 - air) * 0.04 * settle;
    } else {
      // Fist pump with the rope-side arm, other hand on the hip.
      const pumpSide = this.ropeSide > 0 ? "Right" : "Left";
      const restSide = pumpSide === "Left" ? "Right" : "Left";
      const pump = 0.5 + 0.5 * Math.sin(t * 6 * this.traits.tempo);
      pose.hand[pumpSide].set(pumpSide === "Left" ? 0.28 : -0.28, 1.35 + pump * 0.45, 0.25 - pump * 0.1);
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
    }
    // High five with the neighbour when asked for one.
    if (c.highFive) {
      const hf = c.highFive;
      hf.t += dt;
      const phase = clamp(hf.t / 0.6, 0, 1);
      const side = hf.side;
      const reach = bump(phase);
      pose.hand[side].lerp(hf.point, reach);
      pose.handFingers[side].copy(hf.fingers);
      pose.handPalm[side].copy(hf.palm);
      pose.curl[side] = 0.1;
      pose.hipsYaw = hf.yaw * reach;
      pose.spineTwist = hf.yaw * 0.6 * reach;
      pose.look.lerp(hf.point, reach * 0.8);
      if (phase >= 1) c.highFive = null;
    }
    pose.rootY = rootLift;
    pose.chest = bounce * deg(2);
    this.applyPose(pose);
    void context;
  }

  /** Ask for a high five with a teammate at a character-space point. */
  highFive(side, point, yaw) {
    if (this.state !== "celebrate" || !this.celebration) return;
    const fingers = new Vector3(point.x, point.y + 0.4, point.z).sub(point).normalize();
    const palm = new Vector3(point.x, 0, point.z).normalize().multiplyScalar(1);
    this.celebration.highFive = { side, point: point.clone(), fingers, palm, yaw, t: 0 };
  }

  poseLosing(dt, context) {
    const pose = this.basePose();
    const f = this.fall;
    f.t += dt;
    const t = f.t;
    const hipsY = this.rig.hipsRestY;
    // Phase 1 (0–0.5 s): the rope goes slack and the body lurches forward.
    // Phase 2 (0.5–1.2 s): the fall / catch. Phase 3 (1.2–3.0 s): on the ground. Phase 4: rise and stand dejected.
    const lurch = smoothstep(0, 0.35, t) * (1 - smoothstep(0.55, 1.2, t));
    const drop = smoothstep(0.45, 1.15, t);
    const rise = smoothstep(3.0, 4.3, t);
    if (this.state === "falling" && t > 1.2) this.state = "down";
    if (this.state === "down" && t > 3.0) this.state = "rising";
    if (this.state === "rising" && t > 4.3) {
      this.state = "dejected";
      this.face.set({ disappointed: 0.8 }, 3);
    }
    if (this.state === "down" && t > 1.5 && !f.faced) {
      f.faced = true;
      this.face.set({ disappointed: 0.6, tired: 0.4 }, 3);
    }
    const kind = f.kind;
    const downAmount = drop * (1 - rise);
    let hipsTargetY = hipsY - 0.08;
    let hipsZ = 0.18 * lurch;
    let spinePitch = deg(28) * lurch;
    const handL = pose.hand.Left;
    const handR = pose.hand.Right;
    // Hands leave the rope and reach forward with the lurch.
    handL.set(0.28, 1.05 - lurch * 0.25, 0.45 + lurch * 0.2);
    handR.set(-0.28, 1.05 - lurch * 0.25, 0.45 + lurch * 0.2);
    for (const side of ["Left", "Right"]) {
      pose.handFingers[side].set(0, -0.3, 1).normalize();
      pose.handPalm[side].set(0, -1, 0.3).normalize();
      pose.curl[side] = 0.2;
      pose.armPole[side].set(side === "Left" ? 0.8 : -0.8, -0.5, -0.3);
    }
    if (kind === "kneel") {
      // Down onto hands and knees, head low; then push up.
      hipsTargetY = lerp(hipsY - 0.08, 0.5, downAmount);
      hipsZ += 0.12 * downAmount;
      spinePitch += deg(55) * downAmount;
      handL.set(0.26, lerp(0.9, 0.05, downAmount), lerp(0.4, 0.55, downAmount));
      handR.set(-0.26, lerp(0.9, 0.05, downAmount), lerp(0.4, 0.55, downAmount));
      pose.handFingers.Left.set(0.1, -0.2, 1).normalize();
      pose.handFingers.Right.set(-0.1, -0.2, 1).normalize();
      pose.handPalm.Left.set(0, -1, 0);
      pose.handPalm.Right.set(0, -1, 0);
      pose.armPole.Left.set(0.9, 0.2, -0.3);
      pose.armPole.Right.set(-0.9, 0.2, -0.3);
      // Knees down: feet slide back under the hips.
      for (const side of ["Left", "Right"]) {
        const foot = this.feet[side];
        const target = tmpA.set(side === "Left" ? 0.18 : -0.18, 0, -0.42);
        foot.position.lerp(target, 1 - Math.exp(-6 * dt * downAmount));
        if (downAmount > 0.6) pose.footLift[side] = 0.02 * downAmount; // toes trail
      }
      pose.look.set(0, 0.2, 2);
      pose.lookWeight = 0.6 * downAmount + 0.4;
    } else if (kind === "sit") {
      // Sits back on the ground, hands behind, then gets up.
      hipsTargetY = lerp(hipsY - 0.08, 0.14, downAmount);
      hipsZ += -0.2 * downAmount;
      spinePitch = deg(28) * lurch - deg(12) * downAmount;
      pose.hipsPitch = -deg(20) * downAmount;
      handL.set(lerp(0.28, 0.32, downAmount), lerp(0.9, 0.04, downAmount), lerp(0.4, -0.38, downAmount));
      handR.set(lerp(-0.28, -0.32, downAmount), lerp(0.9, 0.04, downAmount), lerp(0.4, -0.38, downAmount));
      pose.handFingers.Left.set(0.3, -0.3, -1).normalize();
      pose.handFingers.Right.set(-0.3, -0.3, -1).normalize();
      pose.handPalm.Left.set(0, -1, 0);
      pose.handPalm.Right.set(0, -1, 0);
      pose.armPole.Left.set(0.8, -0.3, -0.6);
      pose.armPole.Right.set(-0.8, -0.3, -0.6);
      for (const side of ["Left", "Right"]) {
        const foot = this.feet[side];
        const target = tmpA.set(side === "Left" ? 0.2 : -0.2, 0, 0.5);
        foot.position.lerp(target, 1 - Math.exp(-6 * dt * downAmount));
      }
      pose.look.set(0, 0.9, 3);
    } else {
      // Stumbles, catches with hands on the knees, stays on their feet.
      hipsTargetY = lerp(hipsY - 0.08, hipsY - 0.22, downAmount);
      hipsZ += 0.08 * downAmount;
      spinePitch += deg(48) * downAmount;
      handL.set(0.17, lerp(0.9, 0.62, downAmount), lerp(0.4, 0.2, downAmount));
      handR.set(-0.17, lerp(0.9, 0.62, downAmount), lerp(0.4, 0.2, downAmount));
      pose.handFingers.Left.set(0.1, -1, 0.3).normalize();
      pose.handFingers.Right.set(-0.1, -1, 0.3).normalize();
      pose.handPalm.Left.set(-0.3, -0.6, -0.7).normalize();
      pose.handPalm.Right.set(0.3, -0.6, -0.7).normalize();
      pose.armPole.Left.set(0.9, -0.2, -0.4);
      pose.armPole.Right.set(-0.9, -0.2, -0.4);
      for (const side of ["Left", "Right"]) {
        const foot = this.feet[side];
        const target = tmpA.set(side === "Left" ? 0.2 : -0.2, 0, 0.05);
        foot.position.lerp(target, 1 - Math.exp(-4 * dt * downAmount));
      }
      pose.look.set(0, 0.5, 2.5);
    }
    // Dejected stance after rising: upright-ish, shoulders slumped, head down.
    const dejected = rise;
    hipsTargetY = lerp(hipsTargetY, hipsY - 0.03, dejected);
    hipsZ = lerp(hipsZ, 0, dejected);
    spinePitch = lerp(spinePitch, deg(14) + Math.sin(t * 1.4) * deg(1.5), dejected);
    if (dejected > 0) {
      handL.lerp(tmpA.set(0.22, 0.95, 0.06), dejected);
      handR.lerp(tmpB.set(-0.22, 0.95, 0.06), dejected);
      pose.look.lerp(tmpC.set(0.2, 0.9, 3), dejected);
      for (const side of ["Left", "Right"]) {
        pose.handFingers[side].lerp(tmpA.set(0, -1, 0.2).normalize(), dejected).normalize();
        pose.handPalm[side].lerp(tmpB.set(side === "Left" ? -1 : 1, 0, 0), dejected).normalize();
        pose.armPole[side].lerp(tmpC.set(side === "Left" ? 0.9 : -0.9, -0.3, -0.4), dejected);
        const foot = this.feet[side];
        foot.position.lerp(tmpA.set(side === "Left" ? 0.16 : -0.16, 0, 0), 1 - Math.exp(-3 * dt * dejected));
      }
      pose.shoulderUp.Left = deg(6) * dejected;
      pose.shoulderUp.Right = deg(6) * dejected;
      pose.shoulderForward.Left = deg(8) * dejected;
      pose.shoulderForward.Right = deg(8) * dejected;
    }
    // A standing teammate offers a hand to a fallen neighbour.
    if (this.helpTarget && t > 2.4) {
      const reach = smoothstep(2.4, 3.2, t);
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
    pose.chest = Math.sin(t * 2.6) * deg(2.5);
    this.applyPose(pose);
    void context;
  }

  dispose() {
    this.rig = null;
  }
}
