// The garage turntable: the very model that races, lit and turning. Turns by
// itself, follows a mouse or a finger, zooms with the wheel or a pinch, and
// snaps to front, side and rear views.

import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  PerspectiveCamera,
  RoomEnvironment,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer
} from "../../../math-tug-of-war/src/vendor/three.js";
import { buildCar } from "./cars.js";

export const VIEWS = Object.freeze({ front: 0, side: Math.PI / 2, rear: Math.PI });
// three.js AdditiveBlending (the shared vendored build does not export the name).
const ADDITIVE = 2;
const AUTO_SPEED = 0.45; // radians per second
const IDLE_BEFORE_AUTO_MS = 2500;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.6;

function painted(size, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext("2d"), size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The turntable top: brushed dark metal, fine rings, and tick marks round the rim. */
function stageTexture() {
  return painted(1024, (context, size) => {
    const middle = size / 2;
    const gradient = context.createRadialGradient(middle, middle, size * 0.05, middle, middle, middle);
    gradient.addColorStop(0, "#1d466b");
    gradient.addColorStop(0.55, "#12304d");
    gradient.addColorStop(1, "#0a1c30");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.lineWidth = 2;
    for (let ring = 1; ring <= 9; ring += 1) {
      context.strokeStyle = ring % 3 === 0 ? "rgba(32,207,227,0.34)" : "rgba(255,255,255,0.06)";
      context.beginPath();
      context.arc(middle, middle, (middle * ring) / 9.6, 0, Math.PI * 2);
      context.stroke();
    }
    context.strokeStyle = "rgba(255,255,255,0.3)";
    for (let tick = 0; tick < 72; tick += 1) {
      const angle = (tick / 72) * Math.PI * 2;
      const from = middle * (tick % 6 === 0 ? 0.9 : 0.945);
      context.lineWidth = tick % 6 === 0 ? 5 : 2;
      context.beginPath();
      context.moveTo(middle + Math.cos(angle) * from, middle + Math.sin(angle) * from);
      context.lineTo(middle + Math.cos(angle) * middle * 0.975, middle + Math.sin(angle) * middle * 0.975);
      context.stroke();
    }
  });
}

/** Light spilling from the rim onto the studio floor. */
function haloTexture() {
  return painted(256, (context, size) => {
    const middle = size / 2;
    const gradient = context.createRadialGradient(middle, middle, middle * 0.42, middle, middle, middle);
    gradient.addColorStop(0, "rgba(32,207,227,0)");
    gradient.addColorStop(0.3, "rgba(32,207,227,0.55)");
    gradient.addColorStop(0.62, "rgba(255,79,154,0.16)");
    gradient.addColorStop(1, "rgba(32,207,227,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
}

export function createShowroom(canvas, { reducedMotion = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(new Color(0x071525), 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  pmrem.dispose();
  // Studio lighting: a soft sky, a key light that throws the car's shadow on the
  // turntable, and a turquoise and a pink light behind for the edges.
  scene.add(new HemisphereLight(0xffffff, 0x1a2a40, 0.9));
  const key = new DirectionalLight(0xffffff, 2.6);
  key.position.set(3.5, 8, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0006;
  key.shadow.radius = 3;
  scene.add(key);
  const rim = new DirectionalLight(0x20cfe3, 1.5);
  rim.position.set(-6, 3, -5);
  scene.add(rim);
  const kick = new DirectionalLight(0xff4f9a, 0.9);
  kick.position.set(6, 2.5, -4.5);
  scene.add(kick);

  const stageMap = stageTexture();
  const haloMap = haloTexture();
  const halo = new Mesh(new PlaneGeometry(11.5, 11.5), new MeshBasicMaterial({ map: haloMap, transparent: true, depthWrite: false, blending: ADDITIVE, toneMapped: false }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.2;
  scene.add(halo);
  const disc = new Mesh(new CylinderGeometry(3.06, 3.3, 0.2, 64), new MeshStandardMaterial({ color: 0x0c2036, metalness: 0.7, roughness: 0.32 }));
  disc.position.y = -0.1;
  scene.add(disc);
  // A lit rim, then the stage top inside it.
  const ring = new Mesh(new CircleGeometry(3.04, 64), new MeshBasicMaterial({ color: 0x4fe6f5, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);
  const floor = new Mesh(new CircleGeometry(2.93, 64), new MeshLambertMaterial({ map: stageMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.012;
  floor.receiveShadow = true;
  scene.add(floor);

  const camera = new PerspectiveCamera(36, 1, 0.2, 60);
  const target = new Vector3(0, 0.62, 0);
  let car = null;
  let modelKey = null;
  // azimuth 0 looks at the nose; the car itself never turns, the camera does.
  let azimuth = 0.7;
  let azimuthGoal = null;
  let elevation = 0.3;
  let zoom = 1;
  let lastInput = -Infinity;
  let frame = 0;
  let last = performance.now();
  let width = 0;
  let height = 0;
  let disposed = false;
  const pointers = new Map();
  let pinchStart = null;

  function resize() {
    const box = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(box.width));
    const nextHeight = Math.max(1, Math.floor(box.height));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(now) {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    resize();
    if (azimuthGoal !== null) {
      // Shortest way round to the asked-for view.
      let difference = ((azimuthGoal - azimuth + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (difference < -Math.PI) difference += Math.PI * 2;
      if (Math.abs(difference) < 0.004 || reducedMotion) {
        azimuth = azimuthGoal;
        azimuthGoal = null;
      } else {
        azimuth += difference * Math.min(1, seconds * 6);
      }
    } else if (!reducedMotion && pointers.size === 0 && now - lastInput > IDLE_BEFORE_AUTO_MS) {
      azimuth += AUTO_SPEED * seconds;
    }
    // Fit the whole car at zoom 1 whatever the shape of the canvas.
    const reach = (camera.aspect < 1 ? 7.4 / camera.aspect ** 0.75 : 6.7) / zoom;
    camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * reach, 0.62 + Math.sin(elevation) * reach, Math.cos(azimuth) * Math.cos(elevation) * reach);
    camera.lookAt(target);
    renderer.render(scene, camera);
    canvas.dataset.azimuth = azimuth.toFixed(3);
    canvas.dataset.zoom = zoom.toFixed(3);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      /* Capture is a convenience (it keeps a drag alive outside the canvas). */
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastInput = performance.now();
    azimuthGoal = null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }

  function onPointerMove(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);
    lastInput = performance.now();
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStart.zoom * (distance / Math.max(1, pinchStart.distance))));
      return;
    }
    // Dragging right turns the car to the right: a full width is a full turn.
    azimuth -= ((next.x - previous.x) / Math.max(1, width)) * Math.PI * 2;
    elevation = Math.min(1.05, Math.max(0.05, elevation + ((next.y - previous.y) / Math.max(1, height)) * 1.4));
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    lastInput = performance.now();
  }

  function onWheel(event) {
    event.preventDefault();
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
    lastInput = performance.now();
  }

  function onKey(event) {
    const step = { ArrowLeft: [0.25, 0], ArrowRight: [-0.25, 0], ArrowUp: [0, 0.08], ArrowDown: [0, -0.08] }[event.key];
    if (step) {
      event.preventDefault();
      azimuthGoal = null;
      azimuth += step[0];
      elevation = Math.min(1.05, Math.max(0.05, elevation + step[1]));
    } else if (event.key === "+" || event.key === "=") {
      zoom = Math.min(MAX_ZOOM, zoom * 1.1);
    } else if (event.key === "-") {
      zoom = Math.max(MIN_ZOOM, zoom / 1.1);
    } else {
      return;
    }
    lastInput = performance.now();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKey);
  frame = requestAnimationFrame(render);

  return {
    get model() {
      return modelKey;
    },
    /** Show a car: the same builder, at the same detail, as the race. */
    setCar(key, paint = null) {
      if (car) {
        scene.remove(car.group);
        car.dispose();
      }
      modelKey = key;
      car = buildCar(key, { paint, detail: "high" });
      scene.add(car.group);
      canvas.dataset.model = key;
    },
    setView(name) {
      if (!(name in VIEWS)) return;
      azimuthGoal = VIEWS[name];
      lastInput = performance.now() + 4000;
    },
    zoomBy(factor) {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
      lastInput = performance.now();
    },
    spin() {
      azimuthGoal = null;
      lastInput = -Infinity;
    },
    /** Hold one camera pose (art review and tests). */
    look(nextAzimuth, nextElevation = elevation, nextZoom = zoom) {
      azimuth = nextAzimuth;
      azimuthGoal = null;
      elevation = Math.min(1.05, Math.max(0.05, nextElevation));
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      lastInput = performance.now() + 60_000;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
      car?.dispose();
      scene.traverse(node => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
      stageMap.dispose();
      haloMap.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
  };
}
