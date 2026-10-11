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
  };
  hug: Record<"Left" | "Right", null | { teammate: PullerLike; target: unknown }>;
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

  it("puller: while pulling, both palms stay on the rope line and the body leans away from the centre", async () => {
    const { three, Puller } = await loadModules();
    const root = buildSkeleton(three);
    const puller = new Puller({ instance: { root, meshes: [] }, team: "turquoise", index: 0, seed: 3 });
    for (let step = 0; step < 90; step += 1) puller.update(1 / 60, {});
    for (const side of ["Left", "Right"]) {
      const grip = puller.lastHands[side];
      expect(Math.abs(grip.y - 0.93)).toBeLessThan(0.03);
      expect(Math.abs(Math.abs(grip.x) - 0.16)).toBeLessThan(0.02);
    }
    const hips = puller.rig.worldPosition(puller.rig.bone("Hips"), new three.Vector3());
    const head = puller.rig.worldPosition(puller.rig.bone("Head"), new three.Vector3());
    expect(hips.z).toBeLessThan(-0.1); // behind the rope slot
    expect(head.z).toBeLessThan(hips.z + 0.05); // leaning back, not forward
    expect(puller.state).toBe("ready");
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
      root.position.set(1.3 + index, 0, 0.16);
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
        root.position.set(-(1.3 + index), 0, 0.16);
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
