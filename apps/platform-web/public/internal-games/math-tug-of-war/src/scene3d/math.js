// Small animation maths: easing, smoothing, deterministic noise. No game
// state lives here.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
/** 0 → 1 → 0 bump over [0, 1]. */
export const bump = (t) => {
  const x = clamp(t, 0, 1);
  return Math.sin(Math.PI * x);
};
export const deg = (degrees) => (degrees * Math.PI) / 180;

/** Frame-rate independent exponential approach. `rate` ≈ how many times per second the gap halves. */
export function approach(current, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}

/** Critically damped spring step. State is {value, velocity}. */
export function spring(state, target, stiffness, dt) {
  const omega = Math.sqrt(stiffness);
  const x = state.value - target;
  const v = state.velocity;
  const e = Math.exp(-omega * dt);
  const a = x + (v + omega * x) * dt;
  state.value = target + a * e;
  state.velocity = (v - (v + omega * x) * omega * dt) * e;
  return state.value;
}

/** Deterministic pseudo-random in [0, 1) from a seed (mulberry32). */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise: continuous, in [-1, 1], period-free. */
export function makeNoise(seed) {
  const random = makeRandom(seed);
  const values = new Float32Array(256);
  for (let index = 0; index < values.length; index += 1) values[index] = random() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = values[i & 255];
    const b = values[(i + 1) & 255];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}
