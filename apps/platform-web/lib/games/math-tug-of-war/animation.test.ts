// @vitest-environment node

/**
 * Math Tug of War 3D — animation layer tests.
 *
 * These run the real rig and puller code (the shipped modules, through the
 * vendored three.js) against a recorded skeleton of one shipped character.
 * They prove the animation layer is a pure consumer of game events: it never
 * decides a pull or a winner, and every state it can be driven into produces
 * finite, physically plausible poses (feet on the ground, elbows and knees
 * bending the right way, hands on the rope while pulling, no NaNs).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const RUNTIME = resolve(__dirname, "../../../public/internal-games/math-tug-of-war/src");
const FIXTURE = resolve(__dirname, "fixtures/puller-skeleton.json");

type BoneRecord = { name: string; parent: string | null; p: number[]; q: number[] };

/** The slice of a Puller these tests drive (the runtime module is plain JavaScript). */
type PullerLike = {
  state: string;
  variant: number;
  fatigue: number;
  momentum: number;
  heave(strength: number, fast: boolean): void;
  yank(strength: number, fast: boolean): void;
  finish(won: boolean): void;
  resetMatch(): void;
  update(dt: number, context: object): void;
  lastHands: Record<"Left" | "Right", { x: number; y: number; z: number }>;
  face: unknown;
  root: { position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }; rotation: { y: number }; localToWorld(v: unknown): unknown };
  rig: {
    order: Array<{ name: string; quaternion: { w: number } }>;
    footRestY: number;
    bone(name: string): unknown;
    worldPosition(bone: unknown, out: { x: number; y: number; z: number }): { x: number; y: number; z: number };
    handAxes(side: string, fingers: { x: number; y: number; z: number }, palm: { x: number; y: number; z: number }): boolean;
    localAngle(name: string): number;
  };
  hug: Record<"Left" | "Right", null | { teammate: PullerLike; target: unknown }>;
  handOnRope: Record<"Left" | "Right", boolean>;
  reachMiss: Record<"Left" | "Right", number>;
  index: number;
  boneWorld(name: string, out: { x: number; y: number; z: number }): { x: number; y: number; z: number };
  worldFromLocal(vector: unknown): { x: number; y: number; z: number };
  startTeamCelebration(plan: unknown, member: unknown): void;
  refreshHugArms(): void;
};

/** The slice of a team celebration plan these tests read. */
type PlanLike = {
  t: number;
  phase: string;
  jumps: number;
  period: number;
  centre: { z: number };
  members: Array<{ puller: PullerLike; isMiddle: boolean; finalKind: string; slot: { position: { x: number; z: number } }; line: { position: { x: number; z: number } } }>;
};

const runtimeModule = (file: string) => import(/* @vite-ignore */ pathToFileURL(resolve(RUNTIME, file)).href);

async function loadModules() {
  const three = await runtimeModule("vendor/three.js");
  const { Rig } = await runtimeModule("scene3d/rig.js");
  const { Puller } = await runtimeModule("scene3d/puller.js");
  const { EXPRESSIONS, FACE_UNITS } = await runtimeModule("scene3d/expressions.js");
  const { planCelebration, celebrationPhase } = await runtimeModule("scene3d/celebration.js");
  return { three, Rig, Puller, EXPRESSIONS, FACE_UNITS, planCelebration, celebrationPhase };
}

function buildSkeleton(three: Awaited<ReturnType<typeof loadModules>>["three"]) {
  const records = JSON.parse(readFileSync(FIXTURE, "utf8")) as BoneRecord[];
  const root = new three.Object3D();
  const byName = new Map<string, InstanceType<typeof three.Bone>>();
  for (const record of records) {
    const bone = new three.Bone();
    bone.name = record.name;
    bone.position.fromArray(record.p);
    bone.quaternion.fromArray(record.q);
    byName.set(record.name, bone);
  }
  for (const record of records) {
    (record.parent ? byName.get(record.parent)! : root).add(byName.get(record.name)!);
  }
  return root;
}

function finite(vector: { x: number; y: number; z: number }) {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

describe("Math Tug of War 3D animation layer", () => {
  it("rig: two-bone IK places hands and feet exactly, with elbows back and knees forward", async () => {
    const { three, Rig } = await loadModules();
    const rig = new Rig(buildSkeleton(three));
    expect(rig.order.length).toBe(52);
    expect(rig.lengths.upperArm).toBeGreaterThan(0.2);
    expect(rig.lengths.thigh).toBeGreaterThan(0.35);
    const target = new three.Vector3(0.16, 0.95, 0.12);
    const missed = rig.reach("LeftArm", "LeftForeArm", "LeftHand", target, new three.Vector3(0.7, -0.55, -0.45), new three.Vector3(0, -0.35, -1), [rig.lengths.upperArm, rig.lengths.foreArm]);
    expect(missed).toBe(0);
    const hand = rig.worldPosition(rig.bone("LeftHand"), new three.Vector3());
    expect(hand.distanceTo(target)).toBeLessThan(0.002);
    const shoulder = rig.worldPosition(rig.bone("LeftArm"), new three.Vector3());
    const elbow = rig.worldPosition(rig.bone("LeftForeArm"), new three.Vector3());
    const chord = new three.Vector3().lerpVectors(shoulder, hand, 0.5);
    // The elbow sits behind the shoulder–hand chord (pulls bend elbows back, never forward through the chest).
    expect(elbow.z).toBeLessThan(chord.z);
    rig.reset();
    rig.bone("Hips").position.y -= 0.12;
    const foot = new three.Vector3(0.15, rig.footRestY, 0.22);
    rig.reach("LeftUpLeg", "LeftLeg", "LeftFoot", foot, new three.Vector3(0.35, 0, 1), new three.Vector3(0, 0, 1), [rig.lengths.thigh, rig.lengths.shin]);
    const ankle = rig.worldPosition(rig.bone("LeftFoot"), new three.Vector3());
    const knee = rig.worldPosition(rig.bone("LeftLeg"), new three.Vector3());
    const hip = rig.worldPosition(rig.bone("LeftUpLeg"), new three.Vector3());
    expect(ankle.distanceTo(foot)).toBeLessThan(0.002);
    expect(knee.z).toBeGreaterThan(new three.Vector3().lerpVectors(hip, ankle, 0.5).z); // knees bend forward
  });

  it("rig: curling the fingers brings the fingertips towards the wrist, never away", async () => {
    const { three, Rig } = await loadModules();
    const rig = new Rig(buildSkeleton(three));
    const wrist = rig.worldPosition(rig.bone("LeftHand"), new three.Vector3());
    const tipOpen = rig.worldPosition(rig.bone("LeftHandMiddle3"), new three.Vector3());
    rig.curl("Left", 1);
    const tipClosed = rig.worldPosition(rig.bone("LeftHandMiddle3"), new three.Vector3());
    expect(tipClosed.distanceTo(wrist)).toBeLessThan(tipOpen.distanceTo(wrist) * 0.85);
    // A curl is a rotation about the joint: no fingertip ever travels more than a finger length.
    expect(tipClosed.distanceTo(tipOpen)).toBeLessThan(0.12);
  });

  const SCENARIOS: Array<{ name: string; drive: (puller: PullerLike, step: number) => void }> = [
    { name: "ready stance", drive: () => undefined },
    { name: "heave (own team pulled)", drive: (puller) => puller.heave(0.8, false) },
    { name: "yank (other team pulled)", drive: (puller) => puller.yank(0.8, false) },
    { name: "fast repeated pulls", drive: (puller, step) => (step % 20 === 0 ? puller.heave(0.6, true) : undefined) },
    { name: "fatigued pulling", drive: (puller) => { puller.fatigue = 0.9; puller.momentum = -0.8; } },
    { name: "winning celebration", drive: (puller, step) => (step === 1 ? puller.finish(true) : undefined) },
    { name: "losing: fall and recovery", drive: (puller, step) => (step === 1 ? puller.finish(false) : undefined) }
  ];

  for (const scenario of SCENARIOS) {
    it(`puller: ${scenario.name} keeps every joint finite and the body grounded for 6 seconds`, async () => {
      const { three, Puller } = await loadModules();
      for (const variant of [0, 1, 2]) {
        const root = buildSkeleton(three);
        const puller: PullerLike = new Puller({ instance: { root, meshes: [] }, team: variant % 2 ? "pink" : "turquoise", index: variant, seed: 7 + variant });
        puller.variant = variant;
        const check = new three.Vector3();
        let lowestFoot = Infinity;
        let highestHips = -Infinity;
        for (let step = 0; step < 360; step += 1) {
          scenario.drive(puller, step);
          puller.update(1 / 60, {});
          for (const bone of puller.rig.order) {
            puller.rig.worldPosition(bone, check);
            expect(finite(check), `${scenario.name}: ${bone.name} at step ${step}`).toBe(true);
            expect(Number.isFinite(bone.quaternion.w)).toBe(true);
          }
          for (const side of ["Left", "Right"]) {
            puller.rig.worldPosition(puller.rig.bone(`${side}Foot`), check);
            lowestFoot = Math.min(lowestFoot, check.y + puller.root.position.y);
          }
          puller.rig.worldPosition(puller.rig.bone("Hips"), check);
          highestHips = Math.max(highestHips, check.y + puller.root.position.y);
          expect(check.y + puller.root.position.y, `${scenario.name}: hips at step ${step}`).toBeGreaterThan(0.05);
        }
        // Feet never sink into the ground; hips never fly away.
        expect(lowestFoot).toBeGreaterThan(-0.03);
        expect(highestHips).toBeLessThan(1.4);
      }
    }, 60_000); // three 6-second simulations with per-bone checks: slow under a full-suite load
  }

  it("grip: stored fists exist for all six characters and both hands, each wrapping the rope (coverage, closed fingers, unit rotations)", async () => {
    const { FIST_DATA } = await runtimeModule("scene3d/fist-data.js");
    const { CHARACTER_NAMES } = await runtimeModule("scene3d/constants.js");
    const three = await runtimeModule("vendor/three.js");
    expect(Object.keys(FIST_DATA).sort()).toEqual([...CHARACTER_NAMES].sort());
    const angle = (q: number[]) => 2 * Math.acos(Math.min(1, Math.abs(q[3])));
    for (const name of CHARACTER_NAMES) {
      for (const side of ["Left", "Right"]) {
        const fist = FIST_DATA[name][side];
        // The closed hand covers at least 70 % of the rope's circumference inside the fist.
        expect(fist.coverage, `${name} ${side} coverage`).toBeGreaterThanOrEqual(0.7);
        expect(Object.keys(fist.deltas)).toHaveLength(15);
        for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
          // Every finger is curled round the rope (knuckle + middle + end joint ≥ 100°), never left straight.
          let total = 0;
          for (const joint of [1, 2, 3]) {
            const q = new three.Quaternion().fromArray(fist.deltas[`${finger}${joint}`]);
            expect(Math.abs(q.length() - 1), `${name} ${side} ${finger}${joint} unit rotation`).toBeLessThan(1e-4);
            total += angle(fist.deltas[`${finger}${joint}`]);
          }
          expect(total, `${name} ${side} ${finger} curled`).toBeGreaterThan((100 * Math.PI) / 180);
        }
        // The thumb closes too.
        const thumb = [1, 2, 3].reduce((sum, joint) => sum + angle(fist.deltas[`Thumb${joint}`]), 0);
        expect(thumb, `${name} ${side} thumb closed`).toBeGreaterThan((45 * Math.PI) / 180);
      }
    }
  });

  it("grip: every fist closes round the rope while pulling — the rope runs through the fist along its channel, the fingers and thumb surround it, the wrist stays in range — both teams, every slot, through heaves, yanks and fatigue", async () => {
    const { three, Puller } = await loadModules();
    const { BODY_SIDE, ROPE_Y } = await runtimeModule("scene3d/constants.js");
    type V3 = InstanceType<typeof three.Vector3>;
    for (const team of ["turquoise", "pink"] as const) {
      for (const index of [0, 1, 2]) {
        const root = buildSkeleton(three);
        const puller = new Puller({ instance: { root, meshes: [] }, team, index, seed: 5 + index }) as PullerLike & {
          fist: Record<"Left" | "Right", { metrics: { stored?: boolean } }>;
          ropeAxis: Record<"Left" | "Right", V3>;
        };
        const rig = puller.rig;
        // The unit fixture is puller-a's skeleton: it gets puller-a's stored fists.
        expect(puller.fist.Left.metrics.stored).toBe(true);
        expect(puller.fist.Right.metrics.stored).toBe(true);
        const drive = (step: number) => {
          if (step === 120) puller.heave(0.9, false);
          if (step === 220) puller.yank(0.9, false);
          if (step === 300) { puller.fatigue = 0.9; puller.momentum = -0.8; }
          if (step === 330) puller.heave(0.6, true);
        };
        const world = (name: string) => rig.worldPosition(rig.bone(name), new three.Vector3()) as V3;
        const channels: number[] = [];
        for (let step = 0; step < 400; step += 1) {
          drive(step);
          puller.update(1 / 60, {});
          if (step < 60 || step % 5 !== 0) continue;
          for (const side of ["Left", "Right"] as const) {
            const where = `${team} ${index} ${side} at step ${step}`;
            expect(puller.handOnRope[side], `${where}: on the rope`).toBe(true);
            expect(puller.reachMiss[side], `${where}: reach`).toBeLessThan(0.005);
            // The rope's line: on the camera side of the body, at rope height.
            const centre = new three.Vector3().copy(puller.lastHands[side] as never) as V3;
            expect(Math.abs(Math.abs(centre.x) - BODY_SIDE), `${where}: fist on the rope line`).toBeLessThan(0.01);
            expect(Math.abs(centre.y - ROPE_Y), `${where}: fist at rope height`).toBeLessThan(0.02);
            // The fist's channel lies along the rope (the rope runs through the hand, not across it).
            // At the peak of a drive a straight near arm holds the rope diagonally across the palm, as a
            // real one does: judged over the run below, never beyond 50° here.
            const axis = puller.ropeAxis[side];
            const channel = Math.acos(Math.min(1, Math.abs(axis.z)));
            channels.push(channel);
            expect(channel, `${where}: channel along the rope`).toBeLessThan((50 * Math.PI) / 180);
            expect(rig.localAngle(`${side}Hand`), `${where}: wrist in range`).toBeLessThan(1.16);
            // The digits surround the rope: knuckle, fingertips and thumb tip all sit close round the
            // channel, spread round it so no gap wider than 150° is left (a hand merely resting on or
            // beside the rope leaves more than half of it open).
            const angles: number[] = [];
            const reference = new three.Vector3(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
            const across = new three.Vector3().crossVectors(axis, reference);
            for (const bone of [`${side}HandMiddle1`, `${side}HandIndex3`, `${side}HandMiddle3`, `${side}HandRing3`, `${side}HandThumb3`, `${side}Hand`]) {
              const offset = world(bone).sub(centre);
              offset.addScaledVector(axis, -offset.dot(axis));
              if (bone !== `${side}Hand`) expect(offset.length(), `${where}: ${bone} close round the rope`).toBeLessThan(0.06);
              angles.push(Math.atan2(offset.dot(across), offset.dot(reference)));
            }
            angles.sort((a, b) => a - b);
            let widest = 2 * Math.PI - (angles[angles.length - 1] - angles[0]);
            for (let k = 1; k < angles.length; k += 1) widest = Math.max(widest, angles[k] - angles[k - 1]);
            expect(widest, `${where}: digits surround the rope`).toBeLessThan((150 * Math.PI) / 180);
          }
        }
        // Over the whole run the channel stays on the rope: typically within 5°, and within 20° nine times in ten.
        channels.sort((a, b) => a - b);
        expect(channels[Math.floor(channels.length * 0.5)], `${team} ${index}: median channel angle`).toBeLessThan((5 * Math.PI) / 180);
        expect(channels[Math.floor(channels.length * 0.9)], `${team} ${index}: 90th percentile channel angle`).toBeLessThan((20 * Math.PI) / 180);
        // Release: the fists open and the hands leave the rope smoothly once the match is decided.
        // A snap is a sudden change in how far a hand moves from one frame to the next (the stumble
        // itself flings the arms forward fast, but smoothly).
        const before = { Left: world("LeftHand"), Right: world("RightHand") };
        const moved = { Left: 0, Right: 0 };
        puller.finish(false);
        let snap = 0;
        let speed = 0;
        for (let step = 0; step < 40; step += 1) {
          puller.update(1 / 60, {});
          for (const side of ["Left", "Right"] as const) {
            const now = world(`${side}Hand`);
            const distance = now.distanceTo(before[side]);
            snap = Math.max(snap, Math.abs(distance - moved[side]));
            speed = Math.max(speed, distance);
            moved[side] = distance;
            before[side] = now;
          }
          expect(puller.handOnRope.Left).toBe(false);
          expect(puller.handOnRope.Right).toBe(false);
        }
        expect(snap, `${team} ${index}: no hand snaps off the rope`).toBeLessThan(0.04);
        expect(speed, `${team} ${index}: hands leave the rope at a human speed`).toBeLessThan(0.13);
      }
    }
  });

  it("grip: a brow wipe lets go of the rope and takes hold again without the hand snapping", async () => {
    const { three, Puller } = await loadModules();
    const root = buildSkeleton(three);
    const puller = new Puller({ instance: { root, meshes: [] }, team: "pink", index: 1, seed: 9 }) as PullerLike & { wipe: unknown; traits: { frontHand: string } };
    for (let step = 0; step < 90; step += 1) puller.update(1 / 60, {});
    const side = (puller.traits.frontHand === "Left" ? "Right" : "Left") as "Left" | "Right";
    puller.wipe = { side, t: 0, weight: 0 };
    const wrist = () => puller.rig.worldPosition(puller.rig.bone(`${side}Hand`), new three.Vector3()) as InstanceType<typeof three.Vector3>;
    let previous = wrist();
    let moved = 0;
    let snap = 0;
    let left = false;
    for (let step = 0; step < 240; step += 1) {
      puller.update(1 / 60, {});
      if (!puller.handOnRope[side]) left = true;
      const now = wrist();
      const distance = now.distanceTo(previous);
      snap = Math.max(snap, Math.abs(distance - moved));
      moved = distance;
      previous = now;
    }
    expect(left, "the wiping hand left the rope").toBe(true);
    expect(puller.handOnRope[side], "and took hold of it again").toBe(true);
    expect(snap, "without snapping").toBeLessThan(0.04);
  });

  it("puller: while pulling, both fists stay on the rope line on the camera side and the body leans away from the centre", async () => {
    const { three, Puller } = await loadModules();
    const { BODY_SIDE, ROPE_Y } = await runtimeModule("scene3d/constants.js");
    for (const team of ["turquoise", "pink"]) {
      const root = buildSkeleton(three);
      const puller = new Puller({ instance: { root, meshes: [] }, team, index: 0, seed: 3 });
      for (let step = 0; step < 90; step += 1) puller.update(1 / 60, {});
      for (const side of ["Left", "Right"]) {
        const grip = puller.lastHands[side];
        expect(Math.abs(grip.y - ROPE_Y)).toBeLessThan(0.03);
        // Turquoise faces +X world, so its camera side is its right (−X); Pink's is its left.
        expect(grip.x * (team === "turquoise" ? -1 : 1)).toBeGreaterThan(BODY_SIDE - 0.02);
      }
      const hips = puller.rig.worldPosition(puller.rig.bone("Hips"), new three.Vector3());
      const head = puller.rig.worldPosition(puller.rig.bone("Head"), new three.Vector3());
      expect(hips.z).toBeLessThan(-0.1); // behind the rope slot
      expect(head.z).toBeLessThan(hips.z + 0.05); // leaning back, not forward
      expect(puller.state).toBe("ready");
    }
  });

  it("puller: the state machine only moves on events and settles back to ready", async () => {
    const { three, Puller } = await loadModules();
    const root = buildSkeleton(three);
    const puller = new Puller({ instance: { root, meshes: [] }, team: "pink", index: 1, seed: 11 });
    puller.heave(0.7, false);
    expect(puller.state).toBe("pulling");
    for (let step = 0; step < 120; step += 1) puller.update(1 / 60, {});
    expect(puller.state).toBe("ready");
    puller.finish(false);
    expect(puller.state).toBe("falling");
    for (let step = 0; step < 80; step += 1) puller.update(1 / 60, {});
    expect(puller.state).toBe("down");
    for (let step = 0; step < 200; step += 1) puller.update(1 / 60, {});
    expect(puller.state).toBe("dejected");
    // A finished puller ignores further pull events: no animation after the game ended.
    puller.heave(1, false);
    expect(puller.state).toBe("dejected");
    puller.resetMatch();
    expect(puller.state).toBe("ready");
  });

  it("team celebration: the winners walk into a huddle, hold each other's shoulders, jump together, land and line up, with no body overlap", async () => {
    const { three, Puller, planCelebration, celebrationPhase } = await loadModules();
    const tug = new three.Group();
    const pullers: PullerLike[] = [];
    for (let index = 0; index < 3; index += 1) {
      const root = buildSkeleton(three);
      root.position.set(1.3 + index, 0, -0.22); // the scene's slots: behind the rope line (BODY_SIDE)
      root.rotation.y = -Math.PI / 2; // Pink faces the centre (−x)
      tug.add(root);
      const puller: PullerLike = new Puller({ instance: { root, meshes: [] }, team: "pink", index, seed: 21 + index });
      pullers.push(puller);
    }
    tug.updateMatrixWorld(true);
    for (const puller of pullers) puller.finish(true);
    const plan = planCelebration({ team: "pink", pullers, seed: 42 }) as PlanLike;
    for (const member of plan.members) member.puller.startTeamCelebration(plan, member);
    const check = new three.Vector3();
    const palm = new three.Vector3();
    const samples: Array<{ t: number; phase: string; contact: number; clearance: number; separation: number; rootY: number[]; feet: number; slot: number }> = [];
    for (let step = 0; step < 14 * 60; step += 1) {
      plan.t = (step + 1) / 60;
      plan.phase = celebrationPhase(plan);
      for (const puller of pullers) puller.update(1 / 60, {});
      for (const puller of pullers) puller.refreshHugArms(); // as the scene does once everyone is posed
      // Finite everywhere, every frame.
      for (const puller of pullers) {
        for (const bone of puller.rig.order) {
          puller.rig.worldPosition(bone, check);
          expect(finite(check), `${plan.phase}: ${bone.name} at ${plan.t.toFixed(2)} s`).toBe(true);
        }
      }
      if (step % 6 !== 5) continue;
      let contact = 0;
      let clearance = 9;
      for (const puller of pullers) {
        for (const side of ["Left", "Right"] as const) {
          const hug = puller.hug[side];
          if (!hug) continue;
          puller.worldFromLocal(palm.copy(puller.lastHands[side] as never));
          contact = Math.max(contact, palm.distanceTo(hug.target as never));
          const spine = hug.teammate.boneWorld("Spine1", new three.Vector3());
          clearance = Math.min(clearance, Math.hypot(palm.x - spine.x, palm.z - spine.z));
        }
      }
      const hips = pullers.map((puller) => puller.boneWorld("Hips", new three.Vector3()));
      let separation = 9;
      for (let a = 0; a < 3; a += 1) for (let b = a + 1; b < 3; b += 1) separation = Math.min(separation, Math.hypot(hips[a].x - hips[b].x, hips[a].z - hips[b].z));
      const feet = Math.max(...pullers.map((puller) => Math.max(puller.boneWorld("LeftFoot", new three.Vector3()).y, puller.boneWorld("RightFoot", new three.Vector3()).y) - puller.rig.footRestY));
      const target = (member: { slot: { position: { x: number; z: number } }; line: { position: { x: number; z: number } } }) => (plan.phase === "break" || plan.phase === "pose" ? member.line.position : member.slot.position);
      const slot = Math.max(...plan.members.map((member) => Math.hypot(member.puller.root.position.x - target(member).x, member.puller.root.position.z - target(member).z)));
      samples.push({ t: plan.t, phase: plan.phase, contact, clearance, separation, rootY: pullers.map((puller) => puller.root.position.y), feet, slot });
    }
    const during = (phase: string) => samples.filter((sample) => sample.phase === phase);
    // Approach: the distance to the huddle slot shrinks to nothing.
    const approach = during("approach");
    expect(approach[0].slot).toBeGreaterThan(0.4);
    expect(approach[approach.length - 1].slot).toBeLessThan(0.05);
    // Hug and jumps: three arms over shoulders, palms on the shoulder (≤ 4 cm), hands outside the torso, bodies close but never overlapping.
    for (const sample of [...during("hug").filter((sample) => sample.t >= 2.9), ...during("jump")]) {
      expect(sample.contact, `contact at ${sample.t.toFixed(2)} s`).toBeLessThan(0.04);
      expect(sample.clearance, `clearance at ${sample.t.toFixed(2)} s`).toBeGreaterThan(0.1);
      expect(sample.separation, `separation at ${sample.t.toFixed(2)} s`).toBeGreaterThan(0.3);
      expect(sample.separation).toBeLessThan(0.9);
    }
    // Jumps: all three leave the ground together (at least 15 cm), never more than 12 cm apart in height, and land back on the ground.
    const jumps = during("jump");
    const airborne = jumps.filter((sample) => Math.min(...sample.rootY) > 0.15);
    expect(airborne.length).toBeGreaterThanOrEqual(plan.jumps);
    for (const sample of jumps) expect(Math.max(...sample.rootY) - Math.min(...sample.rootY), `jump spread at ${sample.t.toFixed(2)} s`).toBeLessThan(0.12);
    expect(Math.max(...airborne.map((sample) => sample.feet))).toBeGreaterThan(0.2); // feet really leave the grass
    const landed = jumps[jumps.length - 1]; // the last jump's landing: knees bent, feet on the grass
    expect(Math.max(...landed.rootY)).toBe(0);
    expect(landed.feet).toBeLessThan(0.03);
    for (const sample of during("break")) expect(Math.max(...sample.rootY)).toBe(0);
    // Team pose: lined up arm in arm, facing the camera, still in contact.
    const pose = during("pose").slice(7);
    expect(pose.length).toBeGreaterThan(5);
    for (const sample of pose) {
      expect(sample.contact, `pose contact at ${sample.t.toFixed(2)} s`).toBeLessThan(0.04);
      expect(sample.separation).toBeGreaterThan(0.4);
      expect(sample.slot).toBeLessThan(0.05);
    }
    for (const puller of pullers) expect(Math.abs(puller.root.rotation.y)).toBeLessThan(0.05); // facing the camera
    // Reset returns everyone to their slots.
    for (const puller of pullers) puller.resetMatch();
    for (const [index, puller] of pullers.entries()) {
      expect(Math.abs(puller.root.position.x - (1.3 + index))).toBeLessThan(1e-6);
      expect(Math.abs(puller.root.rotation.y + Math.PI / 2)).toBeLessThan(1e-6);
    }
  }, 60_000);

  it("team celebration: a different seed gives a different choreography (jumps, timing, formation), never an identical one", async () => {
    const { three, Puller, planCelebration } = await loadModules();
    const make = (seed: number): PlanLike => {
      const pullers: PullerLike[] = [];
      for (let index = 0; index < 3; index += 1) {
        const root = buildSkeleton(three);
        root.position.set(-(1.3 + index), 0, -0.22);
        root.rotation.y = Math.PI / 2;
        pullers.push(new Puller({ instance: { root, meshes: [] }, team: "turquoise", index, seed: 3 + index }));
      }
      return planCelebration({ team: "turquoise", pullers, seed }) as PlanLike;
    };
    const plans = [make(1), make(2), make(3), make(4)];
    const signatures = plans.map((plan) => [plan.jumps, plan.period.toFixed(3), plan.centre.z.toFixed(3), plan.members.map((member) => member.finalKind).join("/")].join("|"));
    expect(new Set(signatures).size).toBeGreaterThan(1);
    for (const plan of plans) {
      expect(plan.jumps).toBeGreaterThanOrEqual(3);
      expect(plan.jumps).toBeLessThanOrEqual(5);
      expect(plan.members.filter((member) => member.isMiddle)).toHaveLength(1);
      expect(plan.members[0].slot.position.x).toBeLessThan(plan.members[2].slot.position.x);
    }
  });

  it("expressions: every named expression only uses face units the models carry, within [0, 1]", async () => {
    const { EXPRESSIONS, FACE_UNITS } = await loadModules();
    const document = JSON.parse(readFileSync(resolve(RUNTIME, "../models/characters.gltf"), "utf8")) as { meshes: Array<{ name: string; extras?: { targetNames?: string[] } }> };
    const body = document.meshes.find((mesh) => /base|body/.test(mesh.name) && !/teeth|eye|lash|brow/.test(mesh.name));
    const available = new Set(body?.extras?.targetNames ?? []);
    for (const unit of FACE_UNITS) expect(available.has(unit), unit).toBe(true);
    for (const [name, weights] of Object.entries(EXPRESSIONS)) {
      for (const [unit, value] of Object.entries(weights as Record<string, number>)) {
        expect(value, `${name}.${unit}`).toBeGreaterThanOrEqual(0);
        expect(value, `${name}.${unit}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
