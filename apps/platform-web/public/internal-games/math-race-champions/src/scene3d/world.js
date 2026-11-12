// The racing world: road, scenery, start and finish, the cars and the camera
// behind the player's car. Original MathNexa scenery, built from simple shapes.
//
// This file only DRAWS. It is told each car's distance and speed (worked out by
// engine/race.js from checked answers) and puts the car there; it has no way to
// move a car, and nothing it does reaches the server.

import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RoomEnvironment,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer
} from "../../../math-tug-of-war/src/vendor/three.js";
import { STEP_M } from "../engine/circuit.js";
import { hashSeed } from "../engine/random.js";
import { PAINTS, themeForStage } from "../palette.js";
import { buildCar } from "./cars.js";
import { createFrameWatch, tierBelow } from "./quality.js";

export const THEMES = Object.freeze({
  coast: { hill: 0x7fb7c9, skyTop: "#1f8fe6", skyLow: "#cfeeff", ground: 0x2f8a52, road: "#3b4350", prop: "palm", crown: 0x2fa85a, trunk: 0x8a5a36, light: 1.15 },
  forest: { hill: 0x4f8f6c, skyTop: "#3d9be9", skyLow: "#e4f5ff", ground: 0x2f8a4e, road: "#39414b", prop: "pine", crown: 0x1f6e3e, trunk: 0x6b4a2e, light: 1.05 },
  desert: { hill: 0xc9763f, skyTop: "#f2743a", skyLow: "#ffe1ad", ground: 0xdaa560, road: "#4a4038", prop: "cactus", crown: 0x4d9a52, trunk: 0x4d9a52, light: 1.1 },
  alpine: { hill: 0xb9cfe6, skyTop: "#5fb4f5", skyLow: "#ffffff", ground: 0xe9f1f8, road: "#454c57", prop: "pine", crown: 0x2c7a52, trunk: 0x5e4630, light: 1.2 },
  night: { hill: 0x0f2140, skyTop: "#050d1a", skyLow: "#1c2f63", ground: 0x0b1726, road: "#1c2430", prop: "tower", crown: 0x20cfe3, trunk: 0x16263b, light: 0.75 }
});

export { themeForStage };

const ROAD_HALF = 6.5;
const BEHIND_M = 45;
const SLOT_M = 12;
const UP = new Vector3(0, 1, 0);

function roadTexture(theme) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = theme.road;
  context.fillRect(0, 0, 256, 256);
  // Kerbs: two stripes per tile, so they alternate along the road.
  for (const [x, w] of [[0, 14], [242, 14]]) {
    context.fillStyle = "#f4f6f8";
    context.fillRect(x, 0, w, 128);
    context.fillStyle = "#ff4f9a";
    context.fillRect(x, 128, w, 128);
  }
  context.fillStyle = "#ffffff";
  context.fillRect(18, 0, 5, 256);
  context.fillRect(233, 0, 5, 256);
  // Lane dashes.
  for (const x of [89, 163]) context.fillRect(x, 20, 4, 100);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function skyTexture(theme) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, theme.skyTop);
  gradient.addColorStop(0.5, theme.skyLow);
  gradient.addColorStop(1, theme.skyLow);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 8, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function bannerTexture(text, checkered) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (checkered) {
    for (let x = 0; x < 32; x += 1) for (let y = 0; y < 6; y += 1) {
      context.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#071525";
      context.fillRect(x * 16, y * 16, 16, 16);
    }
    context.fillStyle = "#071525";
    context.fillRect(136, 16, 240, 64);
  } else {
    context.fillStyle = "#071525";
    context.fillRect(0, 0, 512, 96);
    context.fillStyle = "#20cfe3";
    context.fillRect(0, 0, 512, 10);
    context.fillStyle = "#ff4f9a";
    context.fillRect(0, 86, 512, 10);
  }
  context.fillStyle = "#ffffff";
  context.font = "900 52px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 50);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function gantry(text, checkered) {
  const group = new Group();
  const metal = new MeshLambertMaterial({ color: 0xd9e2ec });
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.5, 7, 0.5), metal);
    post.position.set(side * (ROAD_HALF + 1.2), 3.5, 0);
    group.add(post);
  }
  const beam = new Mesh(new BoxGeometry((ROAD_HALF + 1.2) * 2 + 0.5, 0.5, 0.6), metal);
  beam.position.y = 7;
  group.add(beam);
  const banner = new Mesh(new PlaneGeometry(ROAD_HALF * 2, 2.2), new MeshBasicMaterial({ map: bannerTexture(text, checkered), side: DoubleSide }));
  banner.position.set(0, 5.6, -0.05);
  banner.rotation.y = Math.PI;
  group.add(banner);
  return group;
}

function hash01(value) {
  return (hashSeed(String(value)) % 100_000) / 100_000;
}

export function createWorld({ canvas, circuit, themeName, tier, seed = "world" }) {
  const theme = THEMES[themeName] ?? THEMES.coast;
  let quality = tier;
  const renderer = new WebGLRenderer({ canvas, antialias: tier.antialias, powerPreference: "high-performance", alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  const fogColour = new Color(theme.skyLow);
  scene.background = fogColour;
  scene.fog = new Fog(fogColour, quality.viewDistance * 0.45, quality.viewDistance * 0.98);
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  pmrem.dispose();

  scene.add(new HemisphereLight(0xffffff, theme.ground, 0.85 * theme.light));
  const sun = new DirectionalLight(0xffffff, 0.9 * theme.light);
  sun.position.set(30, 60, -20);
  scene.add(sun);

  const camera = new PerspectiveCamera(62, 1, 0.3, 900);

  const sky = new Mesh(new SphereGeometry(800, 16, 12), new MeshBasicMaterial({ map: skyTexture(theme), side: BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  const ground = new Mesh(new PlaneGeometry(2400, 2400), new MeshLambertMaterial({ color: theme.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  scene.add(ground);

  // A ring of far hills (towers at night) so the horizon is never an empty line.
  const HILLS = 40;
  const hills = new InstancedMesh(theme.prop === "tower" ? new BoxGeometry(1, 1, 1) : new ConeGeometry(1, 1, 5), new MeshBasicMaterial({ color: theme.hill, fog: false }), HILLS);
  hills.frustumCulled = false;
  {
    const hillMatrix = new Matrix4();
    const hillPlace = new Vector3();
    const hillScale = new Vector3();
    const upright = new Quaternion();
    for (let index = 0; index < HILLS; index += 1) {
      const angle = (index / HILLS) * Math.PI * 2;
      const radius = 520 + hash01(`${seed}:hill:r:${index}`) * 120;
      const tall = theme.prop === "tower" ? 60 + hash01(`${seed}:hill:h:${index}`) * 150 : 40 + hash01(`${seed}:hill:h:${index}`) * 90;
      const wide = theme.prop === "tower" ? 30 + hash01(`${seed}:hill:w:${index}`) * 50 : 110 + hash01(`${seed}:hill:w:${index}`) * 120;
      hillMatrix.compose(hillPlace.set(Math.sin(angle) * radius, tall / 2 - 4, Math.cos(angle) * radius), upright, hillScale.set(wide, tall, wide));
      hills.setMatrixAt(index, hillMatrix);
    }
    hills.instanceMatrix.needsUpdate = true;
  }
  scene.add(hills);

  // ----------------------------------------------------------------- road
  const segments = Math.ceil((tier.viewDistance + BEHIND_M) / STEP_M);
  const roadPositions = new Float32Array((segments + 1) * 2 * 3);
  const roadUvs = new Float32Array((segments + 1) * 2 * 2);
  const roadIndex = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    roadIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const roadGeometry = new BufferGeometry();
  roadGeometry.setAttribute("position", new Float32BufferAttribute(roadPositions, 3));
  roadGeometry.setAttribute("uv", new Float32BufferAttribute(roadUvs, 2));
  roadGeometry.setIndex(roadIndex);
  const roadMap = roadTexture(theme);
  const road = new Mesh(roadGeometry, new MeshLambertMaterial({ map: roadMap, side: DoubleSide }));
  road.frustumCulled = false;
  scene.add(road);
  let roadBase = Number.NaN;

  function layRoad(base) {
    roadBase = base;
    const position = roadGeometry.getAttribute("position");
    const uv = roadGeometry.getAttribute("uv");
    for (let i = 0; i <= segments; i += 1) {
      const distance = (base + i) * STEP_M;
      const point = circuit.at(distance);
      const nx = Math.cos(point.heading);
      const nz = -Math.sin(point.heading);
      position.setXYZ(i * 2, point.x - nx * ROAD_HALF, 0, point.z - nz * ROAD_HALF);
      position.setXYZ(i * 2 + 1, point.x + nx * ROAD_HALF, 0, point.z + nz * ROAD_HALF);
      // The texture is pinned to the road, so the dashes stream past with distance.
      uv.setXY(i * 2, 0, distance / 16);
      uv.setXY(i * 2 + 1, 1, distance / 16);
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
  }

  // -------------------------------------------------------------- scenery
  const slots = Math.ceil((tier.viewDistance + BEHIND_M) / SLOT_M);
  // Two props a side: one near the road, one further back, for depth.
  const perSlot = 4;
  const propCount = slots * perSlot;
  const trunkGeometry = theme.prop === "tower" ? new BoxGeometry(1, 1, 1) : new CylinderGeometry(0.22, 0.3, 1, 6);
  const crownGeometry = theme.prop === "palm" ? new SphereGeometry(1, 8, 6) : theme.prop === "tower" ? new BoxGeometry(1, 1, 1) : theme.prop === "cactus" ? new CylinderGeometry(0.5, 0.5, 1, 7) : new ConeGeometry(1, 1, 7);
  const trunks = new InstancedMesh(trunkGeometry, new MeshLambertMaterial({ color: theme.trunk }), propCount);
  const crowns = new InstancedMesh(crownGeometry, theme.prop === "tower" ? new MeshBasicMaterial({ color: 0xffffff }) : new MeshLambertMaterial({ color: 0xffffff }), propCount);
  const posts = new InstancedMesh(new BoxGeometry(0.25, 1.1, 0.25), new MeshLambertMaterial({ color: 0xf4f6f8 }), slots * 2);
  for (const mesh of [trunks, crowns, posts]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  let slotBase = Number.NaN;
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const place = new Vector3();
  const tint = new Color();

  function layScenery(base) {
    slotBase = base;
    for (let i = 0; i < slots; i += 1) {
      const slot = base + i;
      const distance = slot * SLOT_M;
      const inside = distance > -20 && distance < circuit.length + 60;
      const point = circuit.at(distance);
      const nx = Math.cos(point.heading);
      const nz = -Math.sin(point.heading);
      for (let side = 0; side < perSlot; side += 1) {
        const index = i * perSlot + side;
        const key = `${seed}:${slot}:${side}`;
        const shown = inside && hash01(`${key}:show`) < quality.props;
        const near = side < 2;
        const offset = (side % 2 === 0 ? -1 : 1) * (ROAD_HALF + (near ? 5 + hash01(`${key}:off`) * 12 : 22 + hash01(`${key}:off`) * 46));
        const size = 0.8 + hash01(`${key}:size`) * 0.9;
        const x = point.x + nx * offset;
        const z = point.z + nz * offset;
        if (!shown) {
          matrix.makeScale(0, 0, 0);
          trunks.setMatrixAt(index, matrix);
          crowns.setMatrixAt(index, matrix);
          continue;
        }
        if (theme.prop === "tower") {
          const height = 8 + hash01(`${key}:h`) * 26;
          const width = 4 + hash01(`${key}:w`) * 5;
          matrix.compose(place.set(x, height / 2, z), quaternion.identity(), scale.set(width, height, width));
          trunks.setMatrixAt(index, matrix);
          matrix.compose(place.set(x, height + 0.25, z), quaternion.identity(), scale.set(width * 1.02, 0.5, width * 1.02));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(hash01(`${key}:c`) < 0.5 ? PAINTS.turquoise : PAINTS.pink));
        } else if (theme.prop === "palm") {
          matrix.compose(place.set(x, 2.6 * size, z), quaternion.identity(), scale.set(1, 5.2 * size, 1));
          trunks.setMatrixAt(index, matrix);
          matrix.compose(place.set(x, 5.4 * size, z), quaternion.identity(), scale.set(2.4 * size, 0.9 * size, 2.4 * size));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(theme.crown).offsetHSL(0, 0, (hash01(`${key}:c`) - 0.5) * 0.12));
        } else if (theme.prop === "cactus") {
          matrix.makeScale(0, 0, 0);
          trunks.setMatrixAt(index, matrix);
          matrix.compose(place.set(x, 1.5 * size, z), quaternion.identity(), scale.set(0.9 * size, 3 * size, 0.9 * size));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(theme.crown).offsetHSL(0, 0, (hash01(`${key}:c`) - 0.5) * 0.12));
        } else {
          matrix.compose(place.set(x, 0.9 * size, z), quaternion.identity(), scale.set(1.2, 1.8 * size, 1.2));
          trunks.setMatrixAt(index, matrix);
          matrix.compose(place.set(x, 4.2 * size, z), quaternion.identity(), scale.set(2 * size, 5.6 * size, 2 * size));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(theme.crown).offsetHSL(0, 0, (hash01(`${key}:c`) - 0.5) * 0.12));
        }
      }
      // Marker posts hug the road and make speed easy to read.
      for (let side = 0; side < 2; side += 1) {
        const offset = (side === 0 ? -1 : 1) * (ROAD_HALF + 0.9);
        if (inside) matrix.compose(place.set(point.x + nx * offset, 0.55, point.z + nz * offset), quaternion.identity(), scale.set(1, 1, 1));
        else matrix.makeScale(0, 0, 0);
        posts.setMatrixAt(i * 2 + side, matrix);
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------- start and finish
  const startGate = gantry("START", false);
  const finishGate = gantry("FINISH", true);
  const startPoint = circuit.at(0);
  const finishPoint = circuit.at(circuit.length);
  startGate.position.set(startPoint.x, 0, startPoint.z);
  startGate.rotation.y = startPoint.heading;
  finishGate.position.set(finishPoint.x, 0, finishPoint.z);
  finishGate.rotation.y = finishPoint.heading;
  scene.add(startGate, finishGate);
  const finishLine = new Mesh(new PlaneGeometry(ROAD_HALF * 2, 3), new MeshBasicMaterial({ map: bannerTexture("", true) }));
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.rotation.z = -finishPoint.heading;
  finishLine.position.set(finishPoint.x, 0.03, finishPoint.z);
  scene.add(finishLine);

  // ------------------------------------------------------------- speed streaks
  const streaks = quality.streaks > 0 ? new InstancedMesh(new BoxGeometry(0.05, 0.05, 1), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), quality.streaks) : null;
  if (streaks) {
    streaks.frustumCulled = false;
    scene.add(streaks);
  }

  // -------------------------------------------------------------------- cars
  let player = null;
  let playerDistance = 0;
  let lastPlayerDistance = 0;
  let pitch = 0;
  let pitchTarget = 0;
  let bounceClock = 0;
  const rivalPool = [];
  const lanes = [3.4, -3.4, 1.7, -1.7, 4.6, -4.6, 0];

  function poseCar(handle, distance, lane, speed, dtSeconds, isPlayer) {
    const point = circuit.at(distance);
    const ahead = circuit.at(distance + 6);
    const nx = Math.cos(point.heading);
    const nz = -Math.sin(point.heading);
    handle.group.position.set(point.x + nx * lane, 0, point.z + nz * lane);
    handle.group.rotation.y = point.heading;
    const turning = ahead.heading - point.heading;
    handle.chassis.rotation.z = Math.max(-0.07, Math.min(0.07, -turning * speed * 0.012));
    if (isPlayer) {
      pitch += (pitchTarget - pitch) * Math.min(1, dtSeconds * 9);
      pitchTarget *= Math.max(0, 1 - dtSeconds * 4);
      bounceClock += dtSeconds * (4 + speed * 0.09);
      handle.chassis.rotation.x = pitch;
      handle.chassis.position.y = Math.sin(bounceClock) * 0.012 * Math.min(1, speed / 60);
    }
  }

  const frameWatch = createFrameWatch();
  let pixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatio);
  let width = 0;
  let height = 0;
  let lost = false;
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
  });

  function resize() {
    const box = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(box.width));
    const nextHeight = Math.max(1, Math.floor(box.height));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // A tall, narrow screen needs a wider lens to keep the road in view.
    camera.fov = camera.aspect < 1 ? 78 : 62;
    camera.updateProjectionMatrix();
  }

  const cameraPosition = new Vector3();
  const cameraTarget = new Vector3();

  return {
    get tier() {
      return quality.name;
    },
    get contextLost() {
      return lost;
    },
    resize,
    /** The player's car: a garage model key, or the online car with a colour. */
    setPlayer(modelKey, paint = null) {
      if (player) {
        scene.remove(player.group);
        player.dispose();
      }
      player = buildCar(modelKey, { paint, detail: quality.carDetail });
      scene.add(player.group);
    },
    /** A shove on the suspension: "boost" squats the car, "brake" dips its nose. */
    pulse(kind) {
      pitchTarget = kind === "boost" ? -0.05 : 0.045;
    },
    /**
     * Draw one frame.
     *   me      { distanceM, speed }
     *   rivals  [{ id, distanceM, speed, model, paint }] — any number; only the
     *           nearest few are drawn as cars, the rest live on the minimap.
     */
    render(me, rivals, frameMs) {
      if (lost || !player) return;
      resize();
      const dtSeconds = Math.min(0.1, frameMs / 1000);
      playerDistance = me.distanceM;
      const base = Math.floor((playerDistance - BEHIND_M) / STEP_M);
      if (base !== roadBase) layRoad(base);
      const slot = Math.floor((playerDistance - BEHIND_M) / SLOT_M);
      if (slot !== slotBase) layScenery(slot);

      player.roll(playerDistance - lastPlayerDistance);
      lastPlayerDistance = playerDistance;
      poseCar(player, playerDistance, 0, me.speed, dtSeconds, true);

      // The nearest rivals get a car each; assignments change as cars pass.
      const near = rivals
        .map(rival => ({ rival, gap: rival.distanceM - playerDistance }))
        .filter(item => item.gap > -BEHIND_M && item.gap < quality.viewDistance)
        .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
        .slice(0, quality.rivals);
      for (let index = 0; index < Math.max(near.length, rivalPool.length); index += 1) {
        const item = near[index];
        let slotCar = rivalPool[index];
        if (!item) {
          if (slotCar) slotCar.handle.group.visible = false;
          continue;
        }
        if (!slotCar || slotCar.model !== item.rival.model) {
          if (slotCar) {
            scene.remove(slotCar.handle.group);
            slotCar.handle.dispose();
          }
          slotCar = { model: item.rival.model, handle: buildCar(item.rival.model, { paint: item.rival.paint, detail: index < 2 ? quality.carDetail : "low" }), paint: item.rival.paint, id: null, last: item.rival.distanceM };
          rivalPool[index] = slotCar;
          scene.add(slotCar.handle.group);
        }
        if (slotCar.paint !== item.rival.paint) {
          slotCar.handle.setPaint(item.rival.paint);
          slotCar.paint = item.rival.paint;
        }
        if (slotCar.id !== item.rival.id) {
          slotCar.id = item.rival.id;
          slotCar.last = item.rival.distanceM;
        }
        slotCar.handle.group.visible = true;
        slotCar.handle.roll(item.rival.distanceM - slotCar.last);
        slotCar.last = item.rival.distanceM;
        poseCar(slotCar.handle, item.rival.distanceM, lanes[hashSeed(String(item.rival.id)) % lanes.length] || 3.4, item.rival.speed, dtSeconds, false);
      }

      // Camera: behind and above, looking down the road. Faster = wider and lower.
      const speedShare = Math.min(1, me.speed / 240);
      const back = circuit.at(playerDistance - (7.2 + speedShare * 1.6));
      const far = circuit.at(playerDistance + 14);
      cameraPosition.set(back.x, 2.9 - speedShare * 0.5, back.z);
      camera.position.lerp(cameraPosition, Math.min(1, dtSeconds * 10));
      cameraTarget.set(far.x, 0.9, far.z);
      camera.up.copy(UP);
      camera.lookAt(cameraTarget);
      const fov = (camera.aspect < 1 ? 78 : 62) + speedShare * 12;
      if (Math.abs(camera.fov - fov) > 0.2) {
        camera.fov += (fov - camera.fov) * Math.min(1, dtSeconds * 4);
        camera.updateProjectionMatrix();
      }
      sky.position.copy(camera.position);
      hills.position.set(camera.position.x, 0, camera.position.z);
      ground.position.x = Math.round(camera.position.x / 50) * 50;
      ground.position.z = Math.round(camera.position.z / 50) * 50;

      if (streaks) {
        const strength = Math.max(0, (me.speed - 90) / 150);
        streaks.material.opacity = Math.min(0.5, strength * 0.6);
        for (let index = 0; index < quality.streaks; index += 1) {
          const cycle = 60;
          const along = playerDistance + cycle - ((playerDistance + index * (cycle / quality.streaks) * 7) % cycle);
          const point = circuit.at(along);
          const side = index % 2 === 0 ? -1 : 1;
          const offset = side * (ROAD_HALF + 1.5 + hash01(`s${index}`) * 5);
          quaternion.setFromAxisAngle(UP, point.heading);
          matrix.compose(place.set(point.x + Math.cos(point.heading) * offset, 0.6 + hash01(`h${index}`) * 3.2, point.z - Math.sin(point.heading) * offset), quaternion, scale.set(1, 1, 2 + strength * 16));
          streaks.setMatrixAt(index, matrix);
        }
        streaks.instanceMatrix.needsUpdate = true;
      }

      renderer.render(scene, camera);

      // A struggling device gets a lighter picture, never a different race.
      if (frameWatch.sample(frameMs) && quality.name !== "low") {
        quality = tierBelow(quality);
        pixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatio);
        width = 0;
        scene.fog.near = Math.min(scene.fog.near, quality.viewDistance * 0.45);
        scene.fog.far = Math.min(scene.fog.far, quality.viewDistance * 0.98);
      }
    },
    dispose() {
      if (player) player.dispose();
      for (const slotCar of rivalPool) slotCar?.handle.dispose();
      scene.traverse(node => {
        node.geometry?.dispose?.();
        const material = node.material;
        if (material) {
          material.map?.dispose?.();
          material.dispose?.();
        }
      });
      environment.dispose();
      roadMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
  };
}
