// The scene the game talks to. It keeps the SVG scene as the accessible,
// always-available layer (role="img", title, data-position, win classes)
// and, when the device allows it, lays the 3D scene over it. Both receive
// the same authoritative events; neither decides anything.

import { h } from "./dom.js";
import { createScene as createSvgScene } from "./scene.js";
import { detectTier, graphicsOverride, probeWebGL, prefersReducedMotion } from "./scene3d/quality.js";

let modulePromise = null;
function loadModule() {
  // A literal, relative, same-origin module: the 3D code (and the vendored
  // three.js) is only fetched by devices that will use it.
  modulePromise ??= import("./scene3d/scene3d.js");
  return modulePromise;
}

/** True when this device could show the 3D scene at all (used for the toggle). */
export function canRender3D() {
  const override = graphicsOverride();
  if (override === "classic") return false;
  if (override) return true;
  if (prefersReducedMotion()) return false;
  const webgl = probeWebGL();
  return webgl.webgl2 && !webgl.software && !webgl.caveat;
}

/** Warm the cache from the home screen so a match never waits for models. */
export function prefetchScene3D(preference, version) {
  if (detectTier(preference) === "classic") return;
  const schedule = typeof requestIdleCallback === "function" ? requestIdleCallback : (callback) => setTimeout(callback, 400);
  schedule(() => {
    loadModule()
      .then((module) => module.prefetchCharacters?.(version))
      .catch(() => undefined);
  });
}

export function createScene({ graphics = "auto", version = "" } = {}) {
  const svg = createSvgScene();
  const stage = h("div", { class: "scene-stage", "data-renderer": "svg" }, svg.element);
  let three = null;
  let tier = detectTier(graphics);
  let preference = graphics;
  let observer = null;
  let disposed = false;
  let lastFit = { width: 1000, height: 310 };
  let fallbackReason = null;

  function showSvg(reason) {
    if (three) {
      const old = three;
      three = null;
      old.dispose();
    }
    stage.dataset.renderer = "svg";
    delete stage.dataset.tier;
    if (reason) fallbackReason = reason;
    stage.dataset.fallback = fallbackReason ?? "";
    svg.setMotion(true);
    observer?.disconnect();
    observer = null;
  }

  function attach(scene) {
    stage.append(scene.element);
    const fit = () => {
      const box = stage.getBoundingClientRect();
      scene.resize(box.width, box.height);
    };
    observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(stage);
    fit();
    scene.fit(lastFit.width, lastFit.height);
    scene.set(svg.position);
  }

  function start3D() {
    if (disposed || tier === "classic" || three) return;
    const activeTier = tier;
    loadModule()
      .then((module) => {
        if (disposed || three || tier === "classic") return;
        const scene = module.createScene3D({
          tier: activeTier,
          version,
          // A review/test override pins the tier: no automatic downgrades.
          watchdog: graphicsOverride() === null,
          onFallback: (reason) => {
            if (three === scene) showSvg(reason);
          }
        });
        three = scene;
        attach(scene);
        return scene.ready.then((ok) => {
          if (!ok || three !== scene || disposed) return;
          stage.dataset.renderer = "3d";
          stage.dataset.tier = scene.tier;
          // The SVG keeps its semantics and data attributes; its motion is not needed under the canvas.
          svg.setMotion(false);
        });
      })
      .catch((error) => {
        showSvg(error?.message ?? "load");
      });
  }

  start3D();

  const api = Object.freeze({
    element: stage,
    describe: svg.describe,
    fit(availableWidth, availableHeight) {
      lastFit = { width: availableWidth, height: availableHeight };
      svg.fit(availableWidth, availableHeight);
      three?.fit(availableWidth, availableHeight);
    },
    get position() {
      return svg.position;
    },
    set(value) {
      svg.set(value);
      three?.set(value);
    },
    pull(pullingTeam, nextPosition) {
      const a = svg.pull(pullingTeam, nextPosition);
      const b = three?.pull(pullingTeam, nextPosition);
      return b ? Promise.all([a, b]).then(() => undefined) : a;
    },
    settled() {
      const b = three?.settled();
      return b ? Promise.all([svg.settled(), b]).then(() => undefined) : svg.settled();
    },
    celebrate(winner) {
      svg.celebrate(winner);
      three?.celebrate(winner);
    },
    reset() {
      svg.reset();
      three?.reset();
    },
    setHidden(hidden) {
      three?.setHidden(hidden);
    },
    /** The player's choice: "auto" (3D when possible) or "classic". */
    setGraphics(mode) {
      preference = mode;
      tier = detectTier(mode);
      if (tier === "classic") {
        fallbackReason = null;
        showSvg(mode === "classic" ? "choice" : "device");
      } else if (!three) {
        fallbackReason = null;
        start3D();
      }
    },
    get renderer() {
      return stage.dataset.renderer;
    },
    get tier() {
      return three?.tier ?? "classic";
    },
    snapshot() {
      return { renderer: stage.dataset.renderer, tier: three?.tier ?? "classic", preference, fallback: fallbackReason, three: three?.snapshot() ?? null };
    },
    dispose() {
      disposed = true;
      observer?.disconnect();
      observer = null;
      if (three) {
        const old = three;
        three = null;
        old.dispose();
      }
      if (window.__MATHNEXA_TUG_SCENE__ === api) delete window.__MATHNEXA_TUG_SCENE__;
    }
  });
  // Read-only diagnostics for tests and the review pack.
  window.__MATHNEXA_TUG_SCENE__ = api;
  return api;
}
