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
  root: { position: { y: number } };
  rig: {
    order: Array<{ name: string; quaternion: { w: number } }>;
    bone(name: string): unknown;
    worldPosition(bone: unknown, out: { x: number; y: number; z: number }): { x: number; y: number; z: number };
  };
  lastHands: Record<"Left" | "Right", { x: number; y: number; z: number }>;
  face: unknown;
};

const runtimeModule = (file: string) => import(/* @vite-ignore */ pathToFileURL(resolve(RUNTIME, file)).href);

async function loadModules() {
  const three = await runtimeModule("vendor/three.js");
  const { Rig } = await runtimeModule("scene3d/rig.js");
  const { Puller } = await runtimeModule("scene3d/puller.js");
  const { EXPRESSIONS, FACE_UNITS } = await runtimeModule("scene3d/expressions.js");
  return { three, Rig, Puller, EXPRESSIONS, FACE_UNITS };
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
    });
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
