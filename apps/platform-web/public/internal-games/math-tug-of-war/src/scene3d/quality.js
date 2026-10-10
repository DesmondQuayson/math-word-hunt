// Device capability → rendering tier. The 3D scene is an enhancement over
// the SVG scene; "classic" means the SVG scene is shown on its own.
//
//   classic  no WebGL2, software rendering, reduced motion, data saver or the
//            player's choice
//   low      phones and small tablets with few cores: no shadow maps (soft
//            contact blobs instead), pixel ratio 1, half-rate posing
//   medium   the default: 1024 shadow map, pixel ratio ≤ 1.5
//   high     desktop-class: 2048 shadow map, pixel ratio ≤ 2, full crowd

export const TIERS = Object.freeze(["classic", "low", "medium", "high"]);

export const TIER_SETTINGS = Object.freeze({
  low: Object.freeze({ pixelRatio: 1, shadowMap: 0, crowd: 90, confetti: 110, poseHz: 30, dust: false, antialias: false }),
  medium: Object.freeze({ pixelRatio: 1.5, shadowMap: 1024, crowd: 160, confetti: 180, poseHz: 60, dust: true, antialias: true }),
  high: Object.freeze({ pixelRatio: 2, shadowMap: 2048, crowd: 240, confetti: 260, poseHz: 60, dust: true, antialias: true })
});

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * A test/review override: ?graphics=classic|low|medium|high|3d, or the same
 * value in window.__MATHNEXA_GRAPHICS__ (set by test fixtures before the
 * game loads). Never read from storage: players use the toolbar toggle.
 */
export function graphicsOverride() {
  try {
    const injected = window.__MATHNEXA_GRAPHICS__;
    const value = typeof injected === "string" && injected ? injected : new URLSearchParams(window.location.search).get("graphics");
    if (!value) return null;
    if (value === "3d") return "3d";
    return TIERS.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/** Probe WebGL2 once and remember what we learned (renderer string, caveat). */
let probe = null;
export function probeWebGL() {
  if (probe) return probe;
  probe = { webgl2: false, renderer: "", software: false, caveat: false };
  try {
    const canvas = document.createElement("canvas");
    let gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true, powerPreference: "high-performance" });
    if (!gl) {
      gl = canvas.getContext("webgl2");
      probe.caveat = Boolean(gl);
    }
    if (!gl) return probe;
    probe.webgl2 = true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "") : String(gl.getParameter(gl.RENDERER) ?? "");
    probe.renderer = renderer;
    probe.software = /swiftshader|llvmpipe|softpipe|software|mesa offscreen|microsoft basic render/i.test(renderer);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  } catch {
    /* no WebGL */
  }
  return probe;
}

function isMobileDevice() {
  const ua = navigator.userAgent ?? "";
  const touch = (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (touch && Math.min(screen.width, screen.height) < 900);
}

/**
 * Decide the starting tier. `preference` is the saved player choice
 * ("auto" or "classic").
 */
export function detectTier(preference = "auto") {
  const override = graphicsOverride();
  if (override && override !== "3d") return override;
  if (preference === "classic") return "classic";
  if (prefersReducedMotion()) return "classic";
  const webgl = probeWebGL();
  if (!webgl.webgl2) return "classic";
  if (override === "3d") return "medium";
  if (webgl.software || webgl.caveat) return "classic";
  try {
    if (navigator.connection?.saveData) return "classic";
  } catch {
    /* ignore */
  }
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4;
  const mobile = isMobileDevice();
  if (mobile) {
    if (cores <= 4 || memory <= 3) return "low";
    return "medium";
  }
  if (cores >= 8 && memory >= 8 && Math.max(screen.width, screen.height) >= 1200) return "high";
  if (cores <= 2 || memory <= 2) return "low";
  return "medium";
}

/** One step down the ladder (high → medium → low → classic). */
export function lowerTier(tier) {
  const index = TIERS.indexOf(tier);
  return index <= 0 ? "classic" : TIERS[index - 1];
}

/**
 * Frame-time watchdog: average the last few seconds and ask for a lower tier
 * when the device cannot keep up. Never upgrades (no oscillation).
 */
export function createFrameWatch({ onDowngrade, budgetMs = 30, windowMs = 2600, graceMs = 4000 }) {
  let start = 0;
  let sum = 0;
  let count = 0;
  let worst = 0;
  let lastDowngrade = 0;
  return {
    frame(now, dt) {
      if (!start) start = now;
      if (now - start < graceMs) return;
      if (dt > 0.25) return; // tab switch or breakpoint: not the device's fault
      sum += dt * 1000;
      count += 1;
      worst = Math.max(worst, dt * 1000);
      if (now - lastDowngrade < windowMs || count < 30) return;
      const average = sum / count;
      if (average > budgetMs) {
        lastDowngrade = now;
        sum = 0;
        count = 0;
        worst = 0;
        onDowngrade(average);
      } else if (count > 240) {
        sum = 0;
        count = 0;
        worst = 0;
      }
    },
    reset() {
      start = 0;
      sum = 0;
      count = 0;
      worst = 0;
    }
  };
}
