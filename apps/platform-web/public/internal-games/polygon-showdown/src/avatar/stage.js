// The 3D preview for the avatar and for products. Renders on demand: a frame is
// drawn when something changed or while the slow spin is running, never
// otherwise. One WebGL context serves both the avatar and the product, so
// opening a product costs nothing extra.

import { CanvasTexture, CircleGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, PMREMGenerator, PerspectiveCamera, RoomEnvironment, SRGBColorSpace, Scene, Vector3, WebGLRenderer } from "../../../math-tug-of-war/src/vendor/three.js";
import { createAvatarFigure } from "./model.js";
import { productView } from "./product.js";

const MAX_PIXEL_RATIO = 1.75;
const CAMERA_FOV = 24;
const TAU = Math.PI * 2;
/** One full turn. Slow enough to read every side, without making anyone dizzy. */
export const SPIN_PERIOD_S = 10;
/** A person who has just turned the avatar gets this long before it moves again. */
export const SPIN_RESUME_MS = 3_000;
const SPIN_EASE_S = 0.7;
const SPIN_FRAME_MS = 30; // a slow turn does not need 60 fps on a Chromebook
const DRAG_SPEED = 0.011;
const TWEEN_MS = 420;
/** What one press of a rotate button turns. */
export const ROTATE_STEP = Math.PI / 4;

function supportsWebGL() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function unavailableStage() {
  return Object.freeze({
    available: false,
    setAvatar() {},
    showAvatar() {},
    showProduct() {},
    setFraming() {},
    rotateBy() {},
    resize() {},
    capture: () => null,
    measure: () => null,
    debug: () => null,
    dispose() {}
  });
}

function glowShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const glow = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  glow.addColorStop(0, "rgba(32,207,227,0.16)");
  glow.addColorStop(0.62, "rgba(32,207,227,0.07)");
  glow.addColorStop(1, "rgba(32,207,227,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);
  const shadow = ctx.createRadialGradient(128, 128, 0, 128, 128, 92);
  shadow.addColorStop(0, "rgba(2,6,14,0.82)");
  shadow.addColorStop(0.55, "rgba(2,6,14,0.5)");
  shadow.addColorStop(1, "rgba(2,6,14,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function studioShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const shadow = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  shadow.addColorStop(0, "rgba(16,22,34,0.34)");
  shadow.addColorStop(0.55, "rgba(16,22,34,0.16)");
  shadow.addColorStop(1, "rgba(16,22,34,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export function createAvatarStage(host, options = {}) {
  if (!host || typeof document === "undefined" || typeof window === "undefined" || !supportsWebGL()) return unavailableStage();

  const settings = options ?? {};
  const interactive = settings.interactive !== false;
  const autoRotate = settings.autoRotate !== false;
  const pixelRatio = settings.pixelRatio ?? Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, stencil: false });
  } catch {
    return unavailableStage();
  }

  let figure;
  let scene;
  let camera;
  let environment = null;
  let environmentTarget = null;
  let shadowDisc;
  let pivot;
  let lights;
  let glowTexture;
  let studioTexture;
  try {
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;

    scene = new Scene();
    camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 60);

    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(room, 0.05);
    environment = environmentTarget.texture;
    room.dispose?.();
    pmrem.dispose();
    scene.environment = environment;

    lights = {
      ambient: new HemisphereLight(0xffffff, 0x6a6878, 0.66),
      key: new DirectionalLight(0xffffff, 1.32),
      fill: new DirectionalLight(0xffffff, 0.42),
      rimA: new DirectionalLight(0xffffff, 0.62),
      rimB: new DirectionalLight(0xffffff, 0.36)
    };
    lights.key.position.set(1.7, 3.1, 5.6);
    lights.fill.position.set(-4.4, 1.6, 3);
    lights.rimA.position.set(-3.4, 2.6, -4.2);
    lights.rimB.position.set(3.8, 2.2, -3.6);
    scene.add(lights.ambient, lights.key, lights.fill, lights.rimA, lights.rimB);

    pivot = new Group();
    figure = createAvatarFigure(environment);
    pivot.add(figure.group);
    scene.add(pivot);

    glowTexture = glowShadowTexture();
    studioTexture = studioShadowTexture();
    shadowDisc = new Mesh(new CircleGeometry(1, 40), new MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, toneMapped: false }));
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.scale.setScalar(1.05);
    shadowDisc.position.y = 0.002;
    shadowDisc.renderOrder = -1;
    scene.add(shadowDisc);
  } catch {
    try {
      renderer.dispose();
      renderer.forceContextLoss();
    } catch {
      /* already gone */
    }
    return unavailableStage();
  }

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.outline = "none";
  canvas.setAttribute("aria-hidden", "true");
  if (interactive) {
    canvas.style.touchAction = "pan-y";
    canvas.style.cursor = "grab";
  }
  host.appendChild(canvas);

  let disposed = false;
  let dirty = true;
  let frame = 0;
  let contextLost = false;
  let onScreen = true;
  let width = 0;
  let height = 0;
  let lastDraw = 0;
  let frames = 0;

  let mode = "avatar";
  let framing = settings.framing === "bust" ? "upper" : "full";
  let productFit = null;

  let yaw = autoRotate ? 0 : -0.3;
  let spinRate = 0;
  let holdUntil = 0;
  let lastTick = 0;
  let yawTween = null;
  let cameraNow = null;
  let cameraTween = null;

  let dragging = false;
  let dragPointer = null;
  let dragX = 0;

  const motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reducedMotion = Boolean(motionQuery?.matches);

  const canAnimate = () => !disposed && !contextLost && !document.hidden && onScreen;
  const spinning = (now) => autoRotate && !reducedMotion && !dragging && !yawTween && now >= holdUntil;
  const moving = (now) => spinning(now) || Boolean(yawTween) || Boolean(cameraTween) || (autoRotate && !reducedMotion && now < holdUntil && !dragging);

  function setLighting(kind) {
    const studio = kind === "studio";
    scene.environmentIntensity = studio ? 0.42 : 0.34;
    lights.ambient.color.set(studio ? 0xffffff : 0xf0f4ff);
    lights.ambient.intensity = studio ? 0.5 : 0.66;
    lights.key.color.set(studio ? 0xfff8f0 : 0xfff0e0);
    lights.key.intensity = studio ? 1.55 : 1.32;
    lights.fill.color.set(studio ? 0xeaf1ff : 0xc4e0ff);
    lights.fill.intensity = studio ? 0.42 : 0.42;
    lights.rimA.color.set(studio ? 0xffffff : 0x20cfe3);
    lights.rimA.intensity = studio ? 0.6 : 0.62;
    lights.rimB.color.set(studio ? 0xffffff : 0xff4f9a);
    lights.rimB.intensity = studio ? 0.34 : 0.36;
    shadowDisc.material.map = studio ? studioTexture : glowTexture;
    shadowDisc.material.needsUpdate = true;
  }

  function schedule() {
    if (frame || !canAnimate()) return;
    frame = window.requestAnimationFrame(tick);
  }

  function invalidate() {
    dirty = true;
    schedule();
  }

  function applyCamera(goal) {
    cameraNow = goal;
    camera.aspect = width && height ? width / height : 1;
    camera.position.set(0, goal.y + goal.distance * Math.sin(goal.pitch), goal.distance * Math.cos(goal.pitch));
    camera.lookAt(new Vector3(0, goal.y, 0));
    camera.updateProjectionMatrix();
  }

  function draw() {
    pivot.rotation.y = yaw;
    renderer.render(scene, camera);
    frames += 1;
    dirty = false;
  }

  function tick(now) {
    frame = 0;
    if (!canAnimate()) return;
    const dt = lastTick ? Math.min((now - lastTick) / 1000, 0.1) : 0;
    lastTick = now;
    let due = dirty;
    if (yawTween) {
      const progress = reducedMotion ? 1 : Math.min(1, (now - yawTween.start) / TWEEN_MS);
      yaw = yawTween.from + (yawTween.to - yawTween.from) * easeInOut(progress);
      if (progress >= 1) yawTween = null;
      due = true;
    } else if (spinning(now)) {
      spinRate = Math.min(1, spinRate + dt / SPIN_EASE_S);
      yaw += (dt * TAU * spinRate) / SPIN_PERIOD_S;
      if (now - lastDraw >= SPIN_FRAME_MS) due = true;
    } else {
      spinRate = 0;
    }
    if (cameraTween) {
      const progress = reducedMotion ? 1 : Math.min(1, (now - cameraTween.start) / TWEEN_MS);
      const t = easeInOut(progress);
      const { from, to } = cameraTween;
      applyCamera({ y: from.y + (to.y - from.y) * t, distance: from.distance + (to.distance - from.distance) * t, pitch: from.pitch + (to.pitch - from.pitch) * t });
      if (progress >= 1) cameraTween = null;
      due = true;
    }
    if (due) {
      lastDraw = now;
      draw();
    }
    if (moving(now)) schedule();
  }

  function fitDistance(fitHeight, fitWidth) {
    const aspect = width && height ? width / height : 1;
    const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
    return Math.max(fitHeight / (2 * tanHalf), fitWidth / (2 * tanHalf * aspect));
  }

  function avatarGoal() {
    const extents = figure.extents();
    const full = () => {
      const top = Math.max(extents.top, 2.6) + 0.08;
      const bottom = -0.1;
      return { top, bottom, wide: Math.max(1.72, extents.width + 0.2) };
    };
    const band = {
      full,
      upper: () => ({ top: Math.max(extents.top, 2.3) + 0.08, bottom: 0.7, wide: Math.max(1.5, extents.width + 0.1) }),
      face: () => ({ top: Math.max(extents.top, 2.3) + 0.08, bottom: 1.42, wide: Math.max(1.05, extents.headWidth + 0.24) }),
      legs: () => ({ top: 1.08, bottom: -0.06, wide: 1.2 }),
      feet: () => ({ top: 0.52, bottom: -0.05, wide: 1.0 })
    }[framing] ?? full;
    const { top, bottom, wide } = band();
    return { y: (top + bottom) / 2, distance: fitDistance(top - bottom, wide), pitch: 0.035 };
  }

  function productGoal() {
    const { radius, halfHeight, centerY, pitch, fill } = productFit;
    return { y: centerY, distance: fitDistance((halfHeight * 2) / fill, (radius * 2) / fill) + radius, pitch };
  }

  function frameCamera({ smooth = false } = {}) {
    const goal = mode === "product" ? productGoal() : avatarGoal();
    if (smooth && cameraNow && canAnimate() && !reducedMotion) {
      cameraTween = { from: cameraNow, to: goal, start: performance.now() };
      schedule();
    } else {
      cameraTween = null;
      applyCamera(goal);
    }
  }

  function resize() {
    if (disposed) return;
    const nextWidth = Math.round(host.clientWidth);
    const nextHeight = Math.round(host.clientHeight);
    if (nextWidth <= 0 || nextHeight <= 0) return;
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    frameCamera();
    // Resizing clears the drawing buffer, so repaint now instead of flashing.
    if (canAnimate()) draw();
    else dirty = true;
  }

  function onVisibility() {
    if (document.hidden) {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastTick = 0;
    } else if (dirty || moving(performance.now())) {
      schedule();
    }
  }

  function onMotionChange() {
    reducedMotion = Boolean(motionQuery?.matches);
    invalidate();
  }

  function holdSpin() {
    holdUntil = performance.now() + SPIN_RESUME_MS;
    spinRate = 0;
  }

  function onPointerDown(event) {
    if (dragging || (event.pointerType === "mouse" && event.button !== 0)) return;
    yawTween = null;
    dragging = true;
    dragPointer = event.pointerId;
    dragX = event.clientX;
    canvas.style.cursor = "grabbing";
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer may already be gone */
    }
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== dragPointer) return;
    yaw += (event.clientX - dragX) * DRAG_SPEED;
    dragX = event.clientX;
    invalidate();
  }

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragPointer) return;
    dragging = false;
    dragPointer = null;
    canvas.style.cursor = "grab";
    holdSpin();
    lastTick = 0;
    invalidate();
    schedule();
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function onContextRestored() {
    contextLost = false;
    invalidate();
  }

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery?.addEventListener?.("change", onMotionChange);
  if (interactive) {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);
  }

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  resizeObserver?.observe(host);

  const visibilityObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((entry) => entry.isIntersecting);
          if (onScreen && (dirty || moving(performance.now()))) schedule();
        })
      : null;
  visibilityObserver?.observe(host);

  setLighting("showcase");
  resize();
  frameCamera();
  invalidate();

  /** Works out how far the display form runs, from the garment on it. */
  function resolveForm(view) {
    if (!view.form) return null;
    const { kind, tint, neck, below, waist } = view.form;
    if (kind === "wrist") return { kind, tint };
    const garment = figure.boundsOf([view.frameOn[0]]);
    if (waist) return { kind, tint, neck: false, from: 0.74, to: garment.max.y + 0.012 };
    return { kind, tint, neck, from: below !== undefined ? figure.hemOf(view.frameOn[0]) - below : view.form.from, to: 1.45 };
  }

  /** Builds an isolated product centred on the rotation axis. Same figure as the avatar. */
  function mountProduct(item) {
    const view = productView(item);
    figure.group.position.set(0, 0, 0);
    figure.apply(view.avatar);
    figure.showOnly(view.show);
    figure.setForm(resolveForm(view));
    const box = figure.boundsOf(view.frameOn);
    const centerX = (box.min.x + box.max.x) / 2;
    const centerZ = (box.min.z + box.max.z) / 2;
    figure.group.position.set(-centerX, 0, -centerZ);
    const reach = Math.hypot((box.max.x - box.min.x) / 2, (box.max.z - box.min.z) / 2);
    productFit = { radius: reach, halfHeight: (box.max.y - box.min.y) / 2, centerY: (box.min.y + box.max.y) / 2, pitch: view.pitch, fill: view.fill, floor: box.min.y };
    setLighting("studio");
    shadowDisc.visible = view.shadow > 0;
    shadowDisc.material.opacity = view.shadow;
    shadowDisc.position.y = box.min.y - 0.012;
    shadowDisc.scale.setScalar(Math.max(reach * 1.18, 0.22));
    return view;
  }

  function mountAvatar() {
    figure.setForm(null);
    figure.group.position.set(0, 0, 0);
    setLighting("showcase");
    shadowDisc.visible = true;
    shadowDisc.material.opacity = 1;
    shadowDisc.position.y = 0.002;
    shadowDisc.scale.setScalar(1.05);
  }

  return Object.freeze({
    available: true,
    /** Update what the avatar wears. */
    setAvatar(avatar) {
      if (disposed) return;
      if (mode !== "avatar") return;
      if (figure.apply(avatar)) {
        figure.showOnly(null);
        frameCamera({ smooth: true });
        invalidate();
      }
    },
    /** The player's avatar, with this framing. */
    showAvatar(avatar, nextFraming = framing) {
      if (disposed) return;
      mode = "avatar";
      framing = nextFraming;
      mountAvatar();
      figure.apply(avatar);
      figure.showOnly(null);
      frameCamera({ smooth: true });
      invalidate();
    },
    /** One product on its own, turning slowly. */
    showProduct(item) {
      if (disposed) return;
      mode = "product";
      const view = mountProduct(item);
      yaw = view.yaw;
      frameCamera({ smooth: false });
      invalidate();
    },
    setFraming(nextFraming) {
      if (disposed || nextFraming === framing) return;
      framing = nextFraming;
      if (mode === "avatar") frameCamera({ smooth: true });
    },
    /** A step of turning, from a button. */
    rotateBy(amount) {
      if (disposed) return;
      holdSpin();
      if (reducedMotion || !canAnimate()) {
        yaw += amount;
        invalidate();
        return;
      }
      const from = yawTween ? yawTween.to : yaw;
      yawTween = { from: yaw, to: from + amount, start: performance.now() };
      schedule();
    },
    resize() {
      resize();
    },
    /** One still of a product at its catalog angle, as a PNG data URL. */
    capture(item, minimumDistance = 0) {
      if (disposed) return null;
      const view = mountProduct(item);
      mode = "product";
      yaw = view.yaw;
      pivot.rotation.y = yaw;
      const points = figure.pointsOf(view.frameOn);
      const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
      const cosPitch = Math.cos(view.pitch);
      const sinPitch = Math.sin(view.pitch);
      const centerY = productFit.centerY;
      const camera3 = points.map((p) => {
        // Into the camera's axes: x right, y up, z towards the lens.
        const y = p.y - centerY;
        return [p.x, y * cosPitch - p.z * sinPitch, y * sinPitch + p.z * cosPitch];
      });
      const fit = (distance) => {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const [x, y, z] of camera3) {
          const scale = 1 / ((distance - z) * tanHalf);
          minX = Math.min(minX, x * scale);
          maxX = Math.max(maxX, x * scale);
          minY = Math.min(minY, y * scale);
          maxY = Math.max(maxY, y * scale);
        }
        return { minX, maxX, minY, maxY, size: Math.max(maxX - minX, maxY - minY) / 2 };
      };
      let distance = 2;
      for (let step = 0; step < 24; step += 1) {
        const { size } = fit(distance);
        distance *= size / view.fill;
      }
      distance = Math.max(distance, minimumDistance);
      const bounds = fit(distance);
      const shiftX = (bounds.minX + bounds.maxX) / 2;
      const shiftY = (bounds.minY + bounds.maxY) / 2;
      applyCamera({ y: centerY, distance, pitch: view.pitch });
      camera.setViewOffset(width, height, (shiftX * width) / 2, (-shiftY * height) / 2, width, height);
      camera.updateProjectionMatrix();
      draw();
      const url = canvas.toDataURL("image/png");
      camera.clearViewOffset();
      return url;
    },
    /** How far back the camera sits to fit this item, for sizing a category. */
    measure(item) {
      if (disposed) return null;
      const view = mountProduct(item);
      pivot.rotation.y = view.yaw;
      const points = figure.pointsOf(view.frameOn);
      const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
      const c = Math.cos(view.pitch);
      const sn = Math.sin(view.pitch);
      const centerY = productFit.centerY;
      let distance = 2;
      for (let step = 0; step < 24; step += 1) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of points) {
          const y = p.y - centerY;
          const scale = 1 / ((distance - (y * sn + p.z * c)) * tanHalf);
          const sy = (y * c - p.z * sn) * scale;
          minX = Math.min(minX, p.x * scale);
          maxX = Math.max(maxX, p.x * scale);
          minY = Math.min(minY, sy);
          maxY = Math.max(maxY, sy);
        }
        distance *= Math.max(maxX - minX, maxY - minY) / 2 / view.fill;
      }
      return { id: item.id, slot: item.slot, distance };
    },
    debug() {
      return {
        mode,
        framing,
        yaw,
        spinning: spinning(performance.now()),
        frames,
        dragging,
        reducedMotion,
        camera: cameraNow ? { ...cameraNow } : null
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery?.removeEventListener?.("change", onMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (interactive) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", endDrag);
        canvas.removeEventListener("pointercancel", endDrag);
        canvas.removeEventListener("lostpointercapture", endDrag);
      }
      figure.dispose();
      shadowDisc.geometry.dispose();
      glowTexture.dispose();
      studioTexture.dispose();
      shadowDisc.material.dispose();
      scene.environment = null;
      environmentTarget?.dispose();
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* already gone */
      }
      canvas.remove();
    }
  });
}
