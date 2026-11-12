// The garage turntable: the very model that races, lit and turning. Turns by
// itself, follows a mouse or a finger, zooms with the wheel or a pinch, and
// snaps to front, side and rear views.

import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
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
const AUTO_SPEED = 0.45; // radians per second
const IDLE_BEFORE_AUTO_MS = 2500;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.6;

export function createShowroom(canvas, { reducedMotion = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(new Color(0x071525), 0);
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  pmrem.dispose();
  scene.add(new HemisphereLight(0xffffff, 0x1a2a40, 1.0));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 5);
  scene.add(key);
  const rim = new DirectionalLight(0x20cfe3, 1.2);
  rim.position.set(-6, 3, -5);
  scene.add(rim);

  const disc = new Mesh(new CylinderGeometry(3.3, 3.5, 0.16, 48), new MeshStandardMaterial({ color: 0x12304d, metalness: 0.6, roughness: 0.35 }));
  disc.position.y = -0.08;
  scene.add(disc);
  const ring = new Mesh(new CircleGeometry(3.32, 48), new MeshStandardMaterial({ color: 0x20cfe3, metalness: 0.2, roughness: 0.6 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  ring.scale.setScalar(1.0);
  scene.add(ring);
  const floor = new Mesh(new CircleGeometry(3.22, 48), new MeshStandardMaterial({ color: 0x0c2238, metalness: 0.7, roughness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.004;
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
    const reach = (camera.aspect < 1 ? 9.6 / camera.aspect ** 0.75 : 8.2) / zoom;
    camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * reach, 0.62 + Math.sin(elevation) * reach, Math.cos(azimuth) * Math.cos(elevation) * reach);
    camera.lookAt(target);
    renderer.render(scene, camera);
    canvas.dataset.azimuth = azimuth.toFixed(3);
    canvas.dataset.zoom = zoom.toFixed(3);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);
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
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
  };
}
