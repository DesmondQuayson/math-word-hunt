// How much 3D a device is asked to draw. The race itself (answers, speed,
// distance, finish order) is identical at every tier; only the picture changes.

export const TIERS = Object.freeze({
  low: Object.freeze({ name: "low", pixelRatio: 1, viewDistance: 190, props: 0.45, rivals: 3, antialias: false, carDetail: "low", streaks: 0 }),
  medium: Object.freeze({ name: "medium", pixelRatio: 1.5, viewDistance: 300, props: 0.75, rivals: 6, antialias: true, carDetail: "high", streaks: 18 }),
  high: Object.freeze({ name: "high", pixelRatio: 2, viewDistance: 420, props: 1, rivals: 9, antialias: true, carDetail: "high", streaks: 28 })
});

/** True when this browser can draw the 3D race at all. */
export function canRender3D() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function detectTier(preference = "auto") {
  if (preference === "low") return TIERS.low;
  const memory = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : 4;
  const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 4;
  const saveData = navigator.connection?.saveData === true;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  if (saveData || memory <= 2 || cores <= 2) return TIERS.low;
  if (memory >= 8 && cores >= 8 && !small) return TIERS.high;
  return TIERS.medium;
}

export function tierBelow(tier) {
  return tier.name === "high" ? TIERS.medium : TIERS.low;
}

/**
 * Watches frame times and says when the device is struggling: more than
 * `slowMs` per frame on average over `window` frames.
 */
export function createFrameWatch({ slowMs = 30, window: size = 90 } = {}) {
  let total = 0;
  let frames = 0;
  return {
    /** Returns true once per window in which the average frame was too slow. */
    sample(frameMs) {
      // A hidden tab or a breakpoint is not a slow device.
      if (frameMs > 500) return false;
      total += frameMs;
      frames += 1;
      if (frames < size) return false;
      const slow = total / frames > slowMs;
      total = 0;
      frames = 0;
      return slow;
    }
  };
}
