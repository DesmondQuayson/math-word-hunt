// The shop's 3D avatar preview. Renders on demand only: a frame is drawn when
// something changed or while the gentle sway is running, never otherwise.

import { CanvasTexture, CircleGeometry, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, PMREMGenerator, PerspectiveCamera, RoomEnvironment, SRGBColorSpace, Scene, WebGLRenderer } from "../../../math-tug-of-war/src/vendor/three.js";
import { createAvatarFigure } from "./model.js";

const MAX_PIXEL_RATIO = 1.75;
const CAMERA_FOV = 24;
const SWAY_AMPLITUDE = 0.26;
const SWAY_SPEED = 0.62; // radians of phase per second: about a 10 s cycle
const SWAY_FRAME_MS = 30; // a slow sway does not need 60 fps on a Chromebook
const DRAG_SPEED = 0.011;

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
  return Object.freeze({ available: false, setAvatar() {}, resize() {}, dispose() {} });
}

function contactShadowTexture() {
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

export function createAvatarStage(host, options = {}) {
  if (!host || typeof document === "undefined" || typeof window === "undefined" || !supportsWebGL()) return unavailableStage();

  const settings = options ?? {};
  const interactive = settings.interactive !== false;
  const autoRotate = settings.autoRotate !== false;
  const framing = settings.framing === "bust" ? "bust" : "full";

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
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;

    scene = new Scene();
    camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.5, 40);

    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(room, 0.05);
    environment = environmentTarget.texture;
    room.dispose?.();
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = 0.34;

    const ambient = new HemisphereLight(0xf0f4ff, 0x6a6878, 0.66);
    const key = new DirectionalLight(0xfff0e0, 1.32);
    key.position.set(1.7, 3.1, 5.6);
    const fill = new DirectionalLight(0xc4e0ff, 0.42);
    fill.position.set(-4.4, 1.6, 3);
    const rimCool = new DirectionalLight(0x20cfe3, 0.62);
    rimCool.position.set(-3.4, 2.6, -4.2);
    const rimWarm = new DirectionalLight(0xff4f9a, 0.36);
    rimWarm.position.set(3.8, 2.2, -3.6);
    scene.add(ambient, key, fill, rimCool, rimWarm);

    figure = createAvatarFigure(environment);
    scene.add(figure.group);

    const shadowTexture = contactShadowTexture();
    shadowDisc = new Mesh(new CircleGeometry(1, 40), new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false }));
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

  let baseYaw = autoRotate ? 0 : -0.3;
  let swayPhase = 0;
  let swayGain = 1;
  let lastTick = 0;

  let dragging = false;
  let dragPointer = null;
  let dragX = 0;

  const motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reducedMotion = Boolean(motionQuery?.matches);

  const canAnimate = () => !disposed && !contextLost && !document.hidden && onScreen;
  const swaying = () => autoRotate && !reducedMotion && !dragging;

  function currentYaw() {
    return autoRotate && !reducedMotion ? baseYaw + Math.sin(swayPhase) * SWAY_AMPLITUDE * swayGain : baseYaw;
  }

  function schedule() {
    if (frame || !canAnimate()) return;
    frame = window.requestAnimationFrame(tick);
  }

  function invalidate() {
    dirty = true;
    schedule();
  }

  function draw() {
    figure.group.rotation.y = currentYaw();
    renderer.render(scene, camera);
    dirty = false;
  }

  function tick(now) {
    frame = 0;
    if (!canAnimate()) return;
    const sway = swaying();
    let due = dirty;
    if (sway) {
      const dt = lastTick ? Math.min((now - lastTick) / 1000, 0.1) : 0;
      lastTick = now;
      swayPhase += dt * SWAY_SPEED;
      swayGain = Math.min(1, swayGain + dt * 0.8);
      if (now - lastDraw >= SWAY_FRAME_MS) due = true;
    } else {
      lastTick = 0;
    }
    if (due) {
      lastDraw = now;
      draw();
    }
    if (sway) schedule();
  }

  function frameCamera() {
    const extents = figure.extents();
    const aspect = width && height ? width / height : 1;
    const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
    let targetY;
    let fitHeight;
    let fitWidth;
    if (framing === "bust") {
      const headroom = Math.max(0, extents.top + 0.06 - 2.55);
      targetY = 1.84 + headroom * 0.5;
      fitHeight = 1.42 + headroom;
      fitWidth = Math.max(1.5, Math.min(extents.headWidth + 0.16, 2.0));
    } else {
      const top = Math.max(extents.top, 2.6) + 0.08;
      const bottom = -0.1;
      targetY = (top + bottom) / 2;
      fitHeight = top - bottom;
      fitWidth = Math.max(1.72, extents.width + 0.2);
    }
    const distance = Math.max(fitHeight / (2 * tanHalf), fitWidth / (2 * tanHalf * aspect));
    camera.aspect = aspect;
    camera.position.set(0, targetY + distance * 0.035, distance);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
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
    } else if (dirty || swaying()) {
      schedule();
    }
  }

  function onMotionChange() {
    reducedMotion = Boolean(motionQuery?.matches);
    if (reducedMotion) {
      baseYaw = baseYaw + Math.sin(swayPhase) * SWAY_AMPLITUDE * swayGain;
      swayPhase = 0;
    }
    invalidate();
  }

  function onPointerDown(event) {
    if (dragging || (event.pointerType === "mouse" && event.button !== 0)) return;
    baseYaw = currentYaw();
    swayPhase = 0;
    swayGain = 0;
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
    baseYaw += (event.clientX - dragX) * DRAG_SPEED;
    dragX = event.clientX;
    invalidate();
  }

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragPointer) return;
    dragging = false;
    dragPointer = null;
    canvas.style.cursor = "grab";
    lastTick = 0;
    invalidate();
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
          if (onScreen && (dirty || swaying())) schedule();
        })
      : null;
  visibilityObserver?.observe(host);

  resize();
  frameCamera();
  invalidate();

  return Object.freeze({
    available: true,
    setAvatar(avatar) {
      if (disposed) return;
      if (figure.apply(avatar)) {
        frameCamera();
        invalidate();
      }
    },
    resize() {
      resize();
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
      shadowDisc.material.map?.dispose();
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
