// The 3D tug-of-war scene. It mirrors the SVG scene's interface (fit, set,
// pull, settled, celebrate, reset) and consumes the same authoritative rope
// position; it never decides who pulled or who won.

import {
  ACESFilmicToneMapping,
  Group,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  RoomEnvironment,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer
} from "../vendor/three.js";
import { Arena } from "./arena.js";
import { instantiateCharacter, disposeCharacter, loadCharacters } from "./assets.js";
import { BODY_SIDE, FIELD_UNITS_TO_METRES, STEP, TEAM, TEAMS, TEAM_CHARACTERS, PULLERS_PER_TEAM, otherTeam, slotX } from "./constants.js";
import { Confetti, ContactShadows, Dust } from "./effects.js";
import { approach, clamp, easeOutCubic, easeInOutSine } from "./math.js";
import { Puller } from "./puller.js";
import { TIER_SETTINGS, createFrameWatch, graphicsOverride, lowerTier } from "./quality.js";
import { Rope } from "./rope.js";

const DEFAULT_ASPECT = 1000 / 310;
const MIN_ASPECT = 740 / 420;
const VERTICAL_FOV = 27;
const PULL_MS = 680;
const PULL_FAST_MS = 360;
const CONTACT_UNDER_SHADOW_MAPS = 0.35;

const tmpV = new Vector3();

/** The SVG's pull profile: slow start, overshoot, settle. */
function pullProfile(t) {
  if (t <= 0.25) return 0.15 * easeInOutSine(t / 0.25);
  if (t <= 0.72) return 0.15 + (1.12 - 0.15) * easeInOutSine((t - 0.25) / 0.47);
  return 1.12 + (1 - 1.12) * easeOutCubic((t - 0.72) / 0.28);
}

/** Fetch the character document ahead of time (home screen). */
export function prefetchCharacters(version = "") {
  return loadCharacters(version).catch(() => null);
}

export function createScene3D({ tier = "medium", version = "", onFallback = () => {}, watchdog = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "tug-scene-3d";
  canvas.setAttribute("aria-hidden", "true");

  let settings = TIER_SETTINGS[tier] ?? TIER_SETTINGS.medium;
  let currentTier = tier;
  let renderer = null;
  let disposed = false;
  let hidden = false;
  let ready = false;
  let frameHandle = 0;
  let contextLost = 0;
  let width = 2;
  let height = 1;
  let halfWidth = 6;
  let panFactor = 0.3;
  let lastFrameAt = 0;
  let debugHook = null;
  const scene = new Scene();
  const camera = new PerspectiveCamera(VERTICAL_FOV, DEFAULT_ASPECT, 0.5, 90);
  const tug = new Group();
  scene.add(tug);
  let arena = null;
  let rope = null;
  let confetti = null;
  let dust = null;
  let contactShadows = null;
  let environment = null;
  const pullers = { turquoise: [], pink: [] };
  const instances = [];

  // Match state as seen by the animation (mirrors, never decides).
  let position = 0;
  let tugX = 0;
  let moving = null; // { from, to, start, duration, team }
  let queue = Promise.resolve();
  let pending = 0;
  let winner = null;
  let matchTime = 0;
  const pulls = { turquoise: 0, pink: 0 };
  const momentum = { turquoise: 0, pink: 0 };
  let celebrationTime = 0;
  let highFived = false;
  let helpOffered = false;
  const stats = { frames: 0, frameMs: 0, worstMs: 0, downgrades: [] };

  const watch = createFrameWatch({
    onDowngrade: (average) => {
      const next = lowerTier(currentTier);
      stats.downgrades.push({ from: currentTier, to: next, averageMs: Math.round(average) });
      applyTier(next);
    }
  });

  function applyTier(next) {
    currentTier = next;
    canvas.dataset.tier = next;
    if (next === "classic") {
      stop();
      onFallback("performance");
      return;
    }
    settings = TIER_SETTINGS[next];
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    renderer.shadowMap.enabled = settings.shadowMap > 0;
    arena?.setShadows(settings.shadowMap);
    contactShadows?.setOpacity(settings.shadowMap === 0 ? 1 : CONTACT_UNDER_SHADOW_MAPS);
    resize(width, height);
  }

  function createRenderer() {
    renderer = new WebGLRenderer({ canvas, antialias: settings.antialias, alpha: false, powerPreference: "high-performance", stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = settings.shadowMap > 0;
    renderer.shadowMap.type = PCFShadowMap;
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.();
    pmrem.dispose();
    scene.environment = environment;
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost += 1;
    stop();
    if (contextLost >= 2) onFallback("context-lost");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (disposed || contextLost >= 2) return;
    start();
  });

  function buildWorld() {
    arena = new Arena({ crowdCount: settings.crowd, shadows: settings.shadowMap > 0 });
    scene.add(arena.group);
    scene.fog = arena.fog;
    rope = new Rope();
    scene.add(rope.group);
    confetti = new Confetti(settings.confetti);
    scene.add(confetti.mesh);
    dust = new Dust();
    scene.add(dust.group);
    // Grounding blobs under the feet: the whole shadow on the low tier, a faint
    // contact darkening under the shadow-mapped tiers.
    contactShadows = new ContactShadows(PULLERS_PER_TEAM * 2, settings.shadowMap === 0 ? 1 : CONTACT_UNDER_SHADOW_MAPS);
    tug.add(contactShadows.group);
    for (const team of TEAMS) {
      for (let index = 0; index < PULLERS_PER_TEAM; index += 1) {
        const name = TEAM_CHARACTERS[team][index];
        const instance = instantiateCharacter(name, { teamColor: TEAM[team].color });
        instances.push(instance);
        const root = instance.root;
        root.position.set(slotX(team, index), 0, BODY_SIDE);
        root.rotation.y = TEAM[team].dir === -1 ? Math.PI / 2 : -Math.PI / 2;
        tug.add(root);
        const puller = new Puller({ instance, team, index, seed: 100 + index * 17 + (team === "pink" ? 50 : 0) });
        pullers[team].push(puller);
      }
    }
  }

  function frame(availableWidth, availableHeight) {
    let aspect = availableHeight > 0 ? availableWidth / availableHeight : DEFAULT_ASPECT;
    aspect = Math.max(MIN_ASPECT, Math.min(DEFAULT_ASPECT, aspect));
    let units = 1000;
    let unitsTall = 1000 / aspect;
    if (unitsTall > 420) {
      unitsTall = 420;
      units = 420 * aspect;
    }
    halfWidth = (units / 2) * FIELD_UNITS_TO_METRES;
    panFactor = units < 990 ? 0.65 : 0.3;
    placeCamera();
  }

  function placeCamera() {
    // Review tooling may park the camera on a face; follow that head instead.
    if (debugHook?.closeup) {
      const closeup = debugHook.closeup;
      const puller = pullers[closeup.team]?.[closeup.index];
      if (!puller) return;
      const head = puller.rig.worldPosition(puller.rig.bone("Head"), tmpV);
      head.y += 0.06;
      puller.root.localToWorld(head);
      const towardsCentre = closeup.team === "turquoise" ? 1 : -1;
      // A three-quarter view from the front (the puller faces the centre), close enough to read the face.
      const distance = closeup.distance ?? 1;
      camera.position.set(head.x + towardsCentre * 0.8 * distance, head.y + 0.1, head.z + 0.6 * distance);
      camera.lookAt(head.x, head.y, head.z);
      return;
    }
    const aspect = camera.aspect || DEFAULT_ASPECT;
    const tanHalf = Math.tan((VERTICAL_FOV * Math.PI) / 360);
    const distance = halfWidth / (tanHalf * aspect);
    const panX = tugX * panFactor;
    camera.position.set(panX, 1.05 + distance * 0.17, distance);
    camera.lookAt(panX, 1.0, 0);
    arena?.follow(tugX);
  }

  function resize(nextWidth, nextHeight) {
    width = Math.max(2, Math.round(nextWidth));
    height = Math.max(1, Math.round(nextHeight));
    if (!renderer) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    placeCamera();
  }

  // ----------------------------------------------------------------- loop

  function start() {
    if (disposed || hidden || frameHandle || !ready) return;
    lastFrameAt = 0;
    frameHandle = requestAnimationFrame(tick);
  }

  function stop() {
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  }

  let skip = false;
  function tick() {
    frameHandle = 0;
    if (disposed || hidden) return;
    frameHandle = requestAnimationFrame(tick);
    if (settings.poseHz < 60) {
      skip = !skip;
      if (skip) return;
    }
    const now = performance.now();
    const elapsed = lastFrameAt ? (now - lastFrameAt) / 1000 : 1 / 60;
    lastFrameAt = now;
    // Bounded so a stalled tab never jumps, but wide enough that a slow frame
    // rate (throttled or headless browsers) still runs the match in real time.
    const dt = Math.min(0.1, elapsed);
    update(dt, now);
    renderer.render(scene, camera);
    stats.frames += 1;
    const spent = performance.now() - now;
    stats.frameMs = approach(stats.frameMs, spent, 2, dt);
    stats.worstMs = Math.max(stats.worstMs, spent);
    if (watchdog) watch.frame(now, dt);
  }

  const handPoints = [];
  const handBuffer = [];
  for (let index = 0; index < PULLERS_PER_TEAM * 4; index += 1) handBuffer.push(new Vector3());

  function update(dt, now) {
    matchTime += dt;
    // Tug movement (authoritative position already applied; this is only motion).
    if (moving) {
      const t = clamp((now - moving.start) / moving.duration, 0, 1);
      const x = moving.from + (moving.to - moving.from) * pullProfile(t);
      const delta = x - tugX;
      tugX = x;
      for (const team of TEAMS) {
        for (const puller of pullers[team]) puller.carried(tmpV.set(0, 0, TEAM[team].dir * delta));
      }
      if (t >= 1) moving = null;
    }
    tug.position.x = tugX;
    if (!debugHook?.closeup) placeCamera();

    // Momentum decays towards the standing situation (who is on the losing side).
    for (const team of TEAMS) {
      const losingGround = clamp((TEAM[team].dir * -1 * position) / 7, -1, 1); // +1 when the rope is far on the other side
      const standing = -losingGround * 0.5;
      momentum[team] = approach(momentum[team], standing, 0.6, dt);
    }
    const totalPulls = pulls.turquoise + pulls.pink;
    const baseFatigue = clamp(0.42 * (1 - Math.exp(-matchTime / 55)) + 0.025 * totalPulls, 0, 0.95);
    const context = { winner, time: matchTime };
    let tension = winner ? 0 : 0.42 + 0.15 * Math.max(0, momentum.turquoise, momentum.pink);
    if (moving) tension = 0.95;
    let excitement = 0;
    for (const team of TEAMS) {
      const list = pullers[team];
      const losing = clamp(-momentum[team], 0, 1);
      excitement = Math.max(excitement, Math.abs(momentum[team]));
      for (const puller of list) {
        puller.momentum = momentum[team];
        puller.fatigue = clamp(baseFatigue + losing * 0.12, 0, 1);
        puller.update(dt, context);
      }
    }
    // Hands → rope.
    handPoints.length = 0;
    let slot = 0;
    tug.updateMatrixWorld(true);
    for (const team of TEAMS) {
      for (const puller of pullers[team]) {
        for (const side of ["Left", "Right"]) {
          const point = handBuffer[slot++];
          point.copy(puller.lastHands[side]);
          puller.root.localToWorld(point);
          if (puller.handOnRope[side]) handPoints.push(point);
        }
      }
    }
    handPoints.sort((a, b) => a.x - b.x);
    rope.update(dt, handPoints, tugX, tension);

    // Contact shadows sit between the feet (under the body when down).
    {
      let index = 0;
      for (const team of TEAMS) {
        for (const puller of pullers[team]) {
          const down = puller.state === "down" || puller.state === "falling" || puller.state === "rising";
          const anchor = down ? puller.rig.worldPosition(puller.rig.bone("Hips"), tmpV) : tmpV.copy(puller.feet.Left.position).add(puller.feet.Right.position).multiplyScalar(0.5);
          anchor.y = 0;
          puller.root.localToWorld(anchor);
          contactShadows.place(index++, anchor.x - tugX, anchor.z, puller.state === "down" ? 1.6 : 1);
        }
      }
    }
    confetti.update(dt, matchTime);
    dust.update(dt);
    arena.update(dt, { animateCrowd: currentTier !== "low", excitement });
    // The camera follows a parked close-up after the pose is final.
    if (debugHook?.closeup) placeCamera();

    if (winner) {
      celebrationTime += dt;
      if (!highFived && celebrationTime > 1.3) {
        highFived = true;
        const [a, b] = pullers[winner];
        if (a && b) {
          const point = new Vector3();
          const aHand = a.root.localToWorld(new Vector3(0, 1.55, 0));
          const bHand = b.root.localToWorld(new Vector3(0, 1.55, 0));
          point.lerpVectors(aHand, bHand, 0.5);
          point.y = 1.62;
          const aLocal = a.root.worldToLocal(point.clone());
          const bLocal = b.root.worldToLocal(point.clone());
          a.highFive(aLocal.x >= 0 ? "Left" : "Right", aLocal, aLocal.z < 0 ? Math.PI * 0.45 * Math.sign(aLocal.x || 1) : 0);
          b.highFive(bLocal.x >= 0 ? "Left" : "Right", bLocal, bLocal.z < 0 ? Math.PI * 0.45 * Math.sign(bLocal.x || 1) : 0);
        }
      }
      if (!helpOffered && celebrationTime > 2.5) {
        helpOffered = true;
        const losers = pullers[otherTeam(winner)];
        const helper = losers.find((puller) => puller.fall?.kind === "catch");
        const fallen = losers.find((puller) => puller !== helper && puller.fall && puller.fall.kind !== "catch");
        if (helper && fallen) {
          const shoulder = fallen.root.localToWorld(new Vector3(0, 1.0, 0.1));
          helper.helpTarget = helper.root.worldToLocal(shoulder);
        }
      }
    }
  }

  // ---------------------------------------------------------------- events

  function runPull(team, nextPosition, fast) {
    const from = tugX;
    position = nextPosition;
    pulls[team] += 1;
    momentum[team] = clamp(momentum[team] + 0.45, -1, 1);
    const loser = otherTeam(team);
    momentum[loser] = clamp(momentum[loser] - 0.45, -1, 1);
    const strength = clamp(0.55 + momentum[team] * 0.35, 0.4, 1);
    moving = { from, to: nextPosition * STEP, start: performance.now(), duration: fast ? PULL_FAST_MS : PULL_MS, team };
    for (const puller of pullers[team]) puller.heave(strength, fast);
    for (const puller of pullers[loser]) puller.yank(strength, fast);
    rope.twang(strength);
    if (settings.dust) {
      const front = pullers[loser][0];
      if (front) {
        const foot = front.root.localToWorld(new Vector3(0, 0, 0.2));
        dust.puff(foot, strength);
      }
    }
    return new Promise((resolve) => {
      const duration = fast ? PULL_FAST_MS : PULL_MS;
      setTimeout(resolve, duration);
    });
  }

  function celebrate(team) {
    if (winner) return;
    winner = team;
    celebrationTime = 0;
    highFived = false;
    helpOffered = false;
    for (const puller of pullers[team]) puller.finish(true);
    for (const puller of pullers[otherTeam(team)]) puller.finish(false);
    rope.release();
    arena.celebrate(team);
    confetti.burst(tugX + TEAM[team].dir * 1.2, 4);
  }

  function reset() {
    moving = null;
    queue = Promise.resolve();
    pending = 0;
    position = 0;
    tugX = 0;
    winner = null;
    matchTime = 0;
    celebrationTime = 0;
    pulls.turquoise = 0;
    pulls.pink = 0;
    momentum.turquoise = 0;
    momentum.pink = 0;
    for (const team of TEAMS) for (const puller of pullers[team]) puller.resetMatch();
    rope?.reset();
    confetti?.stop();
    arena?.reset();
    watch.reset();
    placeCamera();
  }

  function set(value) {
    position = clamp(value, -7, 7);
    moving = null;
    tugX = position * STEP;
    placeCamera();
  }

  // ---------------------------------------------------------------- init

  const readyPromise = (async () => {
    try {
      await loadCharacters(version);
      if (disposed) return false;
      createRenderer();
      buildWorld();
      resize(width, height);
      ready = true;
      canvas.dataset.tier = currentTier;
      // Review/test override only: expose internals for inspection tooling.
      if (graphicsOverride()) {
        debugHook = { renderer, scene, camera, arena, rope, pullers, tug, closeup: false };
        window.__MATHNEXA_TUG_3D_DEBUG__ = debugHook;
      }
      // First frame synchronously so the crossfade never shows an empty canvas.
      update(1 / 60, performance.now());
      renderer.render(scene, camera);
      start();
      return true;
    } catch (error) {
      // Diagnostics only: the SVG scene carries on, this just explains why.
      console.warn("Math Tug of War: 3D scene unavailable, showing the classic scene.", error);
      if (!disposed) onFallback(error?.message ?? "load");
      return false;
    }
  })();

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    for (const team of TEAMS) {
      for (const puller of pullers[team]) puller.dispose();
      pullers[team].length = 0;
    }
    for (const instance of instances) disposeCharacter(instance);
    instances.length = 0;
    rope?.dispose();
    confetti?.dispose();
    dust?.dispose();
    contactShadows?.dispose();
    arena?.dispose();
    environment?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss?.();
    renderer = null;
    canvas.remove();
  }

  return Object.freeze({
    element: canvas,
    ready: readyPromise,
    get tier() {
      return currentTier;
    },
    get position() {
      return position;
    },
    fit: frame,
    resize,
    set,
    pull(team, nextPosition) {
      pending += 1;
      const fast = pending > 1;
      queue = queue.then(() => (disposed ? undefined : runPull(team, nextPosition, fast))).finally(() => {
        pending -= 1;
      });
      return queue;
    },
    settled() {
      return queue;
    },
    celebrate,
    reset,
    setHidden(value) {
      hidden = Boolean(value);
      if (hidden) stop();
      else start();
    },
    dispose,
    /** Diagnostics for tests and the review pack; never used by gameplay. */
    snapshot() {
      return {
        tier: currentTier,
        ready,
        position,
        tugX,
        winner,
        frames: stats.frames,
        frameMs: Number(stats.frameMs.toFixed(2)),
        worstMs: Number(stats.worstMs.toFixed(1)),
        downgrades: stats.downgrades.slice(),
        shadows: Boolean(renderer?.shadowMap.enabled && arena?.sun.castShadow && arena?.sun.shadow.map),
        pixelRatio: renderer?.getPixelRatio() ?? 0,
        drawCalls: renderer?.info.render.calls ?? 0,
        triangles: renderer?.info.render.triangles ?? 0,
        states: Object.fromEntries(TEAMS.map((team) => [team, pullers[team].map((puller) => puller.state)])),
        // Largest distance any hand missed its target this frame (metres): hands really hold the rope.
        reachMiss: Number(Math.max(0, ...TEAMS.flatMap((team) => pullers[team].flatMap((puller) => [puller.reachMiss.Left, puller.reachMiss.Right]))).toFixed(3)),
        fatigue: Object.fromEntries(TEAMS.map((team) => [team, Number((pullers[team][0]?.fatigue ?? 0).toFixed(2))])),
        momentum: { turquoise: Number(momentum.turquoise.toFixed(2)), pink: Number(momentum.pink.toFixed(2)) }
      };
    }
  });
}
