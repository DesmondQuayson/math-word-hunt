// Facial expressions as blends of ARKit-style face units (morph targets baked
// into the character models). Expressions never decide anything; they follow
// the animation state a puller is in.

import { approach, clamp } from "./math.js";

/** Named expressions → face unit weights. Kept natural, never cartoon-wide. */
export const EXPRESSIONS = Object.freeze({
  neutral: {},
  determined: { browDownLeft: 0.75, browDownRight: 0.75, eyeSquintLeft: 0.4, eyeSquintRight: 0.4, mouthPressLeft: 0.6, mouthPressRight: 0.6, noseSneerLeft: 0.12, noseSneerRight: 0.12 },
  concentration: { browDownLeft: 0.35, browDownRight: 0.35, eyeSquintLeft: 0.2, eyeSquintRight: 0.2, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  strain: { browDownLeft: 0.7, browDownRight: 0.7, browInnerUp: 0.5, eyeSquintLeft: 0.7, eyeSquintRight: 0.7, cheekSquintLeft: 0.5, cheekSquintRight: 0.5, jawOpen: 0.32, mouthStretchLeft: 0.7, mouthStretchRight: 0.7, mouthFrownLeft: 0.25, mouthFrownRight: 0.25 },
  tired: { browInnerUp: 0.35, eyeBlinkLeft: 0.28, eyeBlinkRight: 0.28, jawOpen: 0.16, mouthFrownLeft: 0.12, mouthFrownRight: 0.12, mouthShrugLower: 0.2 },
  surprise: { eyeWideLeft: 1, eyeWideRight: 1, browInnerUp: 0.85, browOuterUpLeft: 0.75, browOuterUpRight: 0.75, jawOpen: 0.5 },
  joy: { mouthSmileLeft: 1, mouthSmileRight: 1, cheekSquintLeft: 0.6, cheekSquintRight: 0.6, eyeSquintLeft: 0.3, eyeSquintRight: 0.3, browInnerUp: 0.2, browOuterUpLeft: 0.4, browOuterUpRight: 0.4, jawOpen: 0.3, mouthDimpleLeft: 0.5, mouthDimpleRight: 0.5 },
  excited: { jawOpen: 0.55, mouthSmileLeft: 0.6, mouthSmileRight: 0.6, eyeWideLeft: 0.45, eyeWideRight: 0.45, browOuterUpLeft: 0.5, browOuterUpRight: 0.5, browInnerUp: 0.3 },
  disappointed: { mouthFrownLeft: 0.85, mouthFrownRight: 0.85, browInnerUp: 0.75, eyeBlinkLeft: 0.25, eyeBlinkRight: 0.25, mouthShrugLower: 0.4, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  wince: { eyeBlinkLeft: 0.7, eyeBlinkRight: 0.7, browDownLeft: 0.4, browDownRight: 0.4, noseSneerLeft: 0.3, noseSneerRight: 0.3, mouthStretchLeft: 0.3, mouthStretchRight: 0.3, jawOpen: 0.12 }
});

export const FACE_UNITS = Object.freeze([...new Set(Object.values(EXPRESSIONS).flatMap((weights) => Object.keys(weights)))]);

/**
 * Per-character face controller: holds target weights (a blend of named
 * expressions), smooths towards them and layers blinks on top.
 */
export class Face {
  constructor(meshes, random) {
    this.targets = [];
    for (const mesh of meshes) {
      const dictionary = mesh.morphTargetDictionary;
      if (!dictionary || !mesh.morphTargetInfluences) continue;
      const map = {};
      for (const unit of FACE_UNITS) {
        if (unit in dictionary) map[unit] = dictionary[unit];
      }
      if (Object.keys(map).length) this.targets.push({ mesh, map });
    }
    this.current = Object.fromEntries(FACE_UNITS.map((unit) => [unit, 0]));
    this.goal = Object.fromEntries(FACE_UNITS.map((unit) => [unit, 0]));
    this.random = random;
    this.nextBlink = 1.5 + random() * 3;
    this.blink = 0;
    this.blinkPhase = 0;
    this.rate = 7;
  }

  /** Set the goal as a weighted mix, e.g. { determined: 0.7, strain: 0.3 }. */
  set(mix, rate = 7) {
    for (const unit of FACE_UNITS) this.goal[unit] = 0;
    for (const [name, amount] of Object.entries(mix)) {
      const weights = EXPRESSIONS[name];
      if (!weights || amount <= 0) continue;
      for (const [unit, value] of Object.entries(weights)) {
        this.goal[unit] = clamp(this.goal[unit] + value * amount, 0, 1);
      }
    }
    this.rate = rate;
  }

  update(dt, time) {
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blink <= 0) {
      this.blink = 0.16;
      this.blinkPhase = 0;
      this.nextBlink = 2 + this.random() * 4;
    }
    let blinkWeight = 0;
    if (this.blink > 0) {
      this.blinkPhase += dt;
      blinkWeight = Math.sin(Math.PI * clamp(this.blinkPhase / 0.16, 0, 1));
      if (this.blinkPhase >= 0.16) this.blink = 0;
    }
    for (const unit of FACE_UNITS) {
      this.current[unit] = approach(this.current[unit], this.goal[unit], this.rate, dt);
    }
    const left = clamp(this.current.eyeBlinkLeft + blinkWeight, 0, 1);
    const right = clamp(this.current.eyeBlinkRight + blinkWeight, 0, 1);
    for (const { mesh, map } of this.targets) {
      const influences = mesh.morphTargetInfluences;
      for (const unit in map) {
        let value = this.current[unit];
        if (unit === "eyeBlinkLeft") value = left;
        else if (unit === "eyeBlinkRight") value = right;
        influences[map[unit]] = value;
      }
    }
    void time;
  }
}
