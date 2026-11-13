// The racing world: road, guard rails, scenery, sky, start and finish, the cars
// and the camera behind the player's car. Original MathNexa scenery, built from
// simple shapes and textures painted in code: nothing is downloaded.
//
// This file only DRAWS. It is told each car's distance and speed (worked out by
// engine/race.js from checked answers) and puts the car there; it has no way to
// move a car, and nothing it does reaches the server.

import {
  ACESFilmicToneMapping,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
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
  Object3D,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RoomEnvironment,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer
} from "../../../math-tug-of-war/src/vendor/three.js";
import { STEP_M } from "../engine/circuit.js";
import { hashSeed } from "../engine/random.js";
import { PAINTS, themeForStage } from "../palette.js";
import { buildCar } from "./cars.js";
import { createFrameWatch, tierBelow } from "./quality.js";

/**
 * Five sceneries. `prop` is the tall roadside thing, `low` the small one by the
 * rails; colours are for the far hills, the ground, its mottling, and the sun.
 */
export const THEMES = Object.freeze({
  coast: { skyTop: "#1479d6", skyLow: "#bfe7ff", ground: "#2f8a4f", groundDark: "#226f3e", road: "#3a414c", hill: 0x5fa3b8, hillFar: 0x9cc9dc, prop: "palm", crown: 0x2fa85a, crown2: 0x57c26e, trunk: 0x8a5a36, low: 0x3fae62, sun: "#fff3c4", light: 1.1, night: false },
  forest: { skyTop: "#2f8fe0", skyLow: "#dff3ff", ground: "#27733f", groundDark: "#1c5a30", road: "#383f48", hill: 0x3f7f5c, hillFar: 0x86b79b, prop: "pine", crown: 0x1c6a3b, crown2: 0x2a8a4e, trunk: 0x6b4a2e, low: 0x2b7a45, sun: "#fff6d6", light: 1.0, night: false },
  desert: { skyTop: "#e8672f", skyLow: "#ffd9a0", ground: "#d49a55", groundDark: "#bd8443", road: "#4a4038", hill: 0xb8643a, hillFar: 0xe2a86c, prop: "cactus", crown: 0x4d9a52, crown2: 0x9a7a52, trunk: 0x4d9a52, low: 0xa9794b, sun: "#fff0b0", light: 1.1, night: false },
  alpine: { skyTop: "#4aa6f0", skyLow: "#f4fbff", ground: "#e3ecf4", groundDark: "#cfdbe7", road: "#454c57", hill: 0x8fb0cf, hillFar: 0xdbe8f4, prop: "pine", crown: 0x2a7350, crown2: 0xf2f7fb, trunk: 0x5e4630, low: 0xc3d2e0, sun: "#ffffff", light: 1.15, night: false },
  night: { skyTop: "#040a16", skyLow: "#1a2c5e", ground: "#0c1828", groundDark: "#0a1422", road: "#1c2430", hill: 0x0d1c38, hillFar: 0x142a52, prop: "tower", crown: 0x20cfe3, crown2: 0xff4f9a, trunk: 0xffffff, low: 0x20cfe3, sun: "#dfe9ff", light: 0.7, night: true }
});

export { themeForStage };

const ROAD_HALF = 6.5;
const RAIL_OFFSET = ROAD_HALF + 1.0;
const BEHIND_M = 45;
const SLOT_M = 12;
const SIGN_EVERY_M = 320;
const UP = new Vector3(0, 1, 0);
/** three.js AdditiveBlending (the vendored build does not export the name). */
const ADDITIVE = 2;

function hash01(value) {
  return (hashSeed(String(value)) % 100_000) / 100_000;
}

function canvasTexture(width, height, paint, { repeat = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d"), width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  return texture;
}

/** A cheap repeatable speckle: the same picture every time, from a seed. */
function speckle(context, width, height, count, seed, colours, size = 2) {
  for (let index = 0; index < count; index += 1) {
    context.fillStyle = colours[Math.floor(hash01(`${seed}:c:${index}`) * colours.length)];
    context.fillRect(Math.floor(hash01(`${seed}:x:${index}`) * width), Math.floor(hash01(`${seed}:y:${index}`) * height), size, size);
  }
}

/** The lanes the cars drive in (race/traffic.js), metres from the centre line: the road is painted to match. */
const LANE_CENTRES = [-5.2, -2.6, 0, 2.6, 5.2];
/** One tile of road surface is this long, metres. */
const ROAD_TILE_M = 32;

function roadTexture(theme) {
  const texture = canvasTexture(512, 1024, (context, width, height) => {
    const across = metres => ((metres + ROAD_HALF) / (ROAD_HALF * 2)) * width;
    const along = metres => (metres / ROAD_TILE_M) * height;
    context.fillStyle = theme.road;
    context.fillRect(0, 0, width, height);
    // Asphalt is never one colour: broad lighter and darker areas, then the grain of the stone in it.
    for (let index = 0; index < 22; index += 1) {
      const x = hash01(`tar:x:${index}`) * width;
      const y = hash01(`tar:y:${index}`) * height;
      const r = 50 + hash01(`tar:r:${index}`) * 110;
      const gradient = context.createRadialGradient(x, y, 4, x, y, r);
      gradient.addColorStop(0, index % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.09)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      for (const dy of [-height, 0, height]) context.fillRect(x - r, y + dy - r, r * 2, r * 2);
    }
    speckle(context, width, height, 7000, "asphalt", ["rgba(255,255,255,0.055)", "rgba(0,0,0,0.13)", "rgba(255,255,255,0.03)", "rgba(0,0,0,0.07)"]);
    // Where the wheels run the surface is polished darker: two bands a lane, deepest in the middle lanes.
    for (const lane of LANE_CENTRES) {
      context.fillStyle = `rgba(0,0,0,${Math.abs(lane) > 4 ? 0.035 : 0.06})`;
      for (const side of [-0.78, 0.78]) context.fillRect(across(lane + side) - 9, 0, 18, height);
    }
    // A few sealed cracks, one squared-off repair and some oil: a road that has been used.
    context.lineWidth = 1;
    context.strokeStyle = "rgba(0,0,0,0.13)";
    for (let crack = 0; crack < 4; crack += 1) {
      let x = across(-5.4 + hash01(`crack:x:${crack}`) * 10.8);
      let y = hash01(`crack:y:${crack}`) * height;
      context.beginPath();
      context.moveTo(x, y);
      for (let step = 0; step < 5; step += 1) {
        x += (hash01(`crack:${crack}:dx:${step}`) - 0.5) * 16;
        y += 8 + hash01(`crack:${crack}:dy:${step}`) * 16;
        context.lineTo(x, y);
      }
      context.stroke();
    }
    context.fillStyle = "rgba(0,0,0,0.05)";
    context.fillRect(across(0.4), along(19), across(2.3) - across(0.4), along(24.5) - along(19));
    context.strokeStyle = "rgba(0,0,0,0.1)";
    context.strokeRect(across(0.4), along(19), across(2.3) - across(0.4), along(24.5) - along(19));
    for (let stain = 0; stain < 6; stain += 1) {
      const x = across(LANE_CENTRES[stain % LANE_CENTRES.length] + (hash01(`oil:x:${stain}`) - 0.5) * 0.5);
      const y = hash01(`oil:y:${stain}`) * height;
      const r = 8 + hash01(`oil:r:${stain}`) * 14;
      const gradient = context.createRadialGradient(x, y, 1, x, y, r);
      gradient.addColorStop(0, "rgba(0,0,0,0.2)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(x - r, y - r * 2.4, r * 2, r * 4.8);
    }
    // Kerbs: 2 m blocks, alternating, outside a solid edge line.
    const kerb = across(-6.14);
    for (let block = 0; block < ROAD_TILE_M / 2; block += 1) {
      context.fillStyle = block % 2 === 0 ? "#eef1f4" : theme.night ? "#20cfe3" : "#ff4f9a";
      context.fillRect(0, along(block * 2), kerb, along(2) + 1);
      context.fillRect(width - kerb, along(block * 2), kerb, along(2) + 1);
    }
    context.fillStyle = "rgba(255,255,255,0.92)";
    for (const edge of [-6.0, 6.0]) context.fillRect(across(edge) - 2.5, 0, 5, height);
    // Lane lines between the five lanes: 4.5 m dashes, two to a tile, a little worn.
    for (const line of [-3.9, -1.3, 1.3, 3.9]) {
      for (const from of [1.5, 17.5]) context.fillRect(across(line) - 2.5, along(from), 5, along(4.5));
    }
    speckle(context, width, height, 900, "paint-wear", ["rgba(40,44,52,0.35)"], 2);
  }, { repeat: true });
  texture.anisotropy = 8;
  return texture;
}

/** A soft pool of light on the road ahead of a car, for the night circuit. */
function beamTexture() {
  return canvasTexture(64, 128, (context, width, height) => {
    const gradient = context.createRadialGradient(width / 2, height * 0.86, 2, width / 2, height * 0.5, height * 0.62);
    gradient.addColorStop(0, "rgba(255,244,214,0.85)");
    gradient.addColorStop(0.45, "rgba(255,240,205,0.3)");
    gradient.addColorStop(1, "rgba(255,240,205,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

function groundTexture(theme) {
  return canvasTexture(256, 256, (context, width, height) => {
    context.fillStyle = theme.ground;
    context.fillRect(0, 0, width, height);
    // Soft patches, then a fine grain: enough to see the ground move, never a pattern.
    for (let index = 0; index < 60; index += 1) {
      const x = hash01(`patch:x:${index}`) * width;
      const y = hash01(`patch:y:${index}`) * height;
      const r = 14 + hash01(`patch:r:${index}`) * 26;
      const gradient = context.createRadialGradient(x, y, 1, x, y, r);
      gradient.addColorStop(0, theme.groundDark);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.globalAlpha = 0.34;
      context.fillStyle = gradient;
      for (const dx of [-width, 0, width]) for (const dy of [-height, 0, height]) context.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
    context.globalAlpha = 1;
    speckle(context, width, height, 1400, "ground-fine", ["rgba(0,0,0,0.06)", "rgba(255,255,255,0.04)"], 2);
  }, { repeat: true });
}

function skyTexture(theme, seed) {
  return canvasTexture(512, 512, (context, width, height) => {
    // Deep overhead, paler towards the horizon, and a band of haze where the sky meets the land.
    const haze = `#${new Color(theme.skyLow).lerp(new Color(0xffffff), theme.night ? 0.06 : 0.38).getHexString()}`;
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, theme.skyTop);
    gradient.addColorStop(0.4, theme.skyLow);
    gradient.addColorStop(0.5, haze);
    gradient.addColorStop(1, haze);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    if (theme.night) {
      for (let index = 0; index < 260; index += 1) {
        const size = hash01(`${seed}:star:s:${index}`) < 0.12 ? 2 : 1;
        context.fillStyle = `rgba(255,255,255,${(0.35 + hash01(`${seed}:star:a:${index}`) * 0.6).toFixed(2)})`;
        context.fillRect(Math.floor(hash01(`${seed}:star:x:${index}`) * width), Math.floor(hash01(`${seed}:star:y:${index}`) * height * 0.46), size, size);
      }
    }
  });
}

function glowTexture(colour, hard) {
  return canvasTexture(128, 128, (context) => {
    const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(hard, colour);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
}

function cloudTexture() {
  return canvasTexture(256, 128, (context) => {
    for (const [x, y, r] of [[70, 78, 46], [118, 60, 54], [170, 74, 48], [208, 86, 32], [44, 92, 28]]) {
      const gradient = context.createRadialGradient(x, y, r * 0.2, x, y, r);
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 128);
    }
  });
}

function windowTexture() {
  return canvasTexture(64, 128, (context, width, height) => {
    context.fillStyle = "#101c30";
    context.fillRect(0, 0, width, height);
    for (let row = 0; row < 16; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        const lit = hash01(`win:${row}:${column}`);
        if (lit < 0.42) continue;
        context.fillStyle = lit > 0.9 ? "#ff8fc0" : lit > 0.72 ? "#7ee9f5" : "#ffe9a8";
        context.fillRect(4 + column * 10, 4 + row * 8, 6, 4);
      }
    }
  }, { repeat: true });
}

function crowdTexture() {
  return canvasTexture(256, 64, (context, width, height) => {
    context.fillStyle = "#0c2238";
    context.fillRect(0, 0, width, height);
    const shirts = ["#20cfe3", "#ff4f9a", "#ffd24a", "#f4f8fc", "#35d07f", "#ff8a2a"];
    for (let row = 0; row < 5; row += 1) {
      for (let seat = 0; seat < 42; seat += 1) {
        context.fillStyle = shirts[Math.floor(hash01(`crowd:${row}:${seat}`) * shirts.length)];
        context.fillRect(3 + seat * 6, 6 + row * 11, 4, 6);
        context.fillStyle = "#f0c9a4";
        context.fillRect(4 + seat * 6, 3 + row * 11, 2, 3);
      }
    }
  });
}

function bannerTexture(text, checkered) {
  return canvasTexture(512, 96, (context) => {
    if (checkered) {
      for (let x = 0; x < 32; x += 1) for (let y = 0; y < 6; y += 1) {
        context.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#071525";
        context.fillRect(x * 16, y * 16, 16, 16);
      }
      if (text) {
        context.fillStyle = "#071525";
        context.fillRect(136, 16, 240, 64);
      }
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
  });
}

function boardTexture(lines, colour) {
  return canvasTexture(512, 192, (context) => {
    context.fillStyle = "#071525";
    context.fillRect(0, 0, 512, 192);
    context.fillStyle = colour;
    context.fillRect(0, 0, 512, 14);
    context.fillRect(0, 178, 512, 14);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.font = `900 ${lines.length > 1 ? 56 : 76}px system-ui, sans-serif`;
    lines.forEach((line, index) => context.fillText(line, 256, lines.length > 1 ? 66 + index * 66 : 98));
  });
}

function gantry(text, checkered) {
  const group = new Group();
  const metal = new MeshLambertMaterial({ color: 0xd9e2ec });
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.5, 7.4, 0.5), metal);
    post.position.set(side * (ROAD_HALF + 1.6), 3.7, 0);
    post.castShadow = true;
    group.add(post);
  }
  const beam = new Mesh(new BoxGeometry((ROAD_HALF + 1.6) * 2 + 0.5, 0.6, 0.7), metal);
  beam.position.y = 7.4;
  group.add(beam);
  const banner = new Mesh(new PlaneGeometry(ROAD_HALF * 2 + 1.6, 2.4), new MeshBasicMaterial({ map: bannerTexture(text, checkered), side: DoubleSide }));
  banner.position.set(0, 5.8, -0.05);
  banner.rotation.y = Math.PI;
  group.add(banner);
  // A grandstand each side, so the start and the finish feel like an event.
  const crowd = new MeshBasicMaterial({ map: crowdTexture(), side: DoubleSide });
  const concrete = new MeshLambertMaterial({ color: 0x53606e });
  for (const side of [-1, 1]) {
    const stand = new Mesh(new BoxGeometry(3.4, 3.2, 26), concrete);
    stand.position.set(side * (ROAD_HALF + 7.5), 1.6, 6);
    group.add(stand);
    const people = new Mesh(new PlaneGeometry(26, 3), crowd);
    people.position.set(side * (ROAD_HALF + 5.75), 2.2, 6);
    people.rotation.y = (-side * Math.PI) / 2;
    group.add(people);
    const canopy = new Mesh(new BoxGeometry(4.6, 0.25, 27), new MeshLambertMaterial({ color: side < 0 ? PAINTS.turquoise : PAINTS.pink }));
    canopy.position.set(side * (ROAD_HALF + 7.2), 4.6, 6);
    group.add(canopy);
  }
  return group;
}

/** `calm` (reduced motion): no camera vibration at speed. */
export function createWorld({ canvas, circuit, themeName, tier, seed = "world", calm = false }) {
  const theme = THEMES[themeName] ?? THEMES.coast;
  let quality = tier;
  const renderer = new WebGLRenderer({ canvas, antialias: tier.antialias, powerPreference: "high-performance", alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme.night ? 1.25 : 1.05;
  const shadows = (tier.shadows ?? 0) > 0;
  renderer.shadowMap.enabled = shadows;

  const scene = new Scene();
  const fogColour = new Color(theme.skyLow).lerp(new Color(theme.hill), 0.38);
  scene.background = fogColour;
  scene.fog = new Fog(fogColour, quality.viewDistance * 0.5, quality.viewDistance * 1.0);
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  pmrem.dispose();

  scene.add(new HemisphereLight(new Color(0xffffff).lerp(new Color(theme.skyLow), 0.28), new Color(theme.ground), 1.0 * theme.light));
  const sun = new DirectionalLight(new Color(theme.sun), 1.5 * theme.light);
  const sunTarget = new Object3D();
  scene.add(sun, sunTarget);
  sun.target = sunTarget;
  // The light comes from where the sun (or the moon) is drawn in the sky, so shadows fall away from it.
  const sunOffset = new Vector3(20.3, 31.1, 23.6);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(tier.shadows, tier.shadows);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 110;
    sun.shadow.bias = -0.0008;
  }

  const camera = new PerspectiveCamera(62, 1, 0.3, 1400);

  // ------------------------------------------------------------ sky and far
  const farGroup = new Group(); // follows the camera, so it is always "far away"
  scene.add(farGroup);
  const sky = new Mesh(new SphereGeometry(1100, 20, 14), new MeshBasicMaterial({ map: skyTexture(theme, seed), side: BackSide, fog: false, depthWrite: false, toneMapped: false }));
  farGroup.add(sky);
  const sunDisc = new Sprite(new SpriteMaterial({ map: glowTexture(theme.sun, theme.night ? 0.32 : 0.12), fog: false, depthWrite: false, toneMapped: false, transparent: true }));
  sunDisc.position.set(480, theme.night ? 330 : 250, 560);
  sunDisc.scale.setScalar(theme.night ? 70 : 260);
  farGroup.add(sunDisc);

  // Two rings of far hills (towers at night) so the horizon is never an empty line.
  const hillShape = theme.prop === "tower" ? new BoxGeometry(1, 1, 1) : new ConeGeometry(1, 1, 6);
  for (const [ring, radiusFrom, colour, count, scaleUp] of [["far", 760, theme.hillFar, 26, 1.7], ["near", 520, theme.hill, 34, 1]]) {
    const hills = new InstancedMesh(hillShape, new MeshBasicMaterial({ color: colour, fog: false, toneMapped: false }), count);
    hills.frustumCulled = false;
    const hillMatrix = new Matrix4();
    const upright = new Quaternion();
    for (let index = 0; index < count; index += 1) {
      const angle = ((index + hash01(`${seed}:${ring}:a:${index}`) * 0.6) / count) * Math.PI * 2;
      const radius = radiusFrom + hash01(`${seed}:${ring}:r:${index}`) * 120;
      const tall = (theme.prop === "tower" ? 70 + hash01(`${seed}:${ring}:h:${index}`) * 170 : 45 + hash01(`${seed}:${ring}:h:${index}`) * 95) * scaleUp;
      const wide = (theme.prop === "tower" ? 34 + hash01(`${seed}:${ring}:w:${index}`) * 60 : 130 + hash01(`${seed}:${ring}:w:${index}`) * 150) * scaleUp;
      hillMatrix.compose(new Vector3(Math.sin(angle) * radius, tall / 2 - 6, Math.cos(angle) * radius), upright, new Vector3(wide, tall, wide));
      hills.setMatrixAt(index, hillMatrix);
    }
    hills.instanceMatrix.needsUpdate = true;
    farGroup.add(hills);
  }

  if (!theme.night && (tier.clouds ?? 0) > 0) {
    const cloudMap = cloudTexture();
    for (let index = 0; index < tier.clouds; index += 1) {
      const cloud = new Sprite(new SpriteMaterial({ map: cloudMap, fog: false, depthWrite: false, transparent: true, opacity: 0.85, toneMapped: false }));
      const angle = hash01(`${seed}:cloud:a:${index}`) * Math.PI * 2;
      const radius = 420 + hash01(`${seed}:cloud:r:${index}`) * 420;
      cloud.position.set(Math.sin(angle) * radius, 150 + hash01(`${seed}:cloud:h:${index}`) * 170, Math.cos(angle) * radius);
      const size = 150 + hash01(`${seed}:cloud:s:${index}`) * 170;
      cloud.scale.set(size, size * 0.42, 1);
      farGroup.add(cloud);
    }
  }

  const groundMap = groundTexture(theme);
  groundMap.repeat.set(200, 200);
  const ground = new Mesh(new PlaneGeometry(3000, 3000), new MeshLambertMaterial({ map: groundMap }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  scene.add(ground);

  // ------------------------------------------------------------------ road
  const segments = Math.ceil((tier.viewDistance + BEHIND_M) / STEP_M);
  const strip = (withUv, lit = withUv) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array((segments + 1) * 2 * 3), 3));
    if (withUv) {
      geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array((segments + 1) * 2 * 2), 2));
      geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array((segments + 1) * 2 * 3).fill(1), 3));
    }
    if (lit) {
      // Flat: every normal points straight up, so it is lit like the ground.
      const normals = new Float32Array((segments + 1) * 2 * 3);
      for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
      geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    }
    const index = [];
    for (let i = 0; i < segments; i += 1) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // faces up
    }
    geometry.setIndex(index);
    return geometry;
  };
  const roadGeometry = strip(true);
  const roadMap = roadTexture(theme);
  const road = new Mesh(roadGeometry, new MeshLambertMaterial({ map: roadMap, side: DoubleSide, vertexColors: true }));
  road.frustumCulled = false;
  road.receiveShadow = shadows;
  scene.add(road);
  // A verge of packed earth and gravel between the kerb and the land: a road is not cut into grass with a knife.
  const vergeColour = theme.night ? new Color(theme.ground).lerp(new Color(0x2b3646), 0.6) : new Color(theme.ground).lerp(new Color(themeName === "alpine" ? 0xaab4bf : 0x8b7b66), 0.55);
  const vergeMaterial = new MeshLambertMaterial({ color: vergeColour, side: DoubleSide });
  const verges = [-1, 1].map(side => {
    const mesh = new Mesh(strip(false, true), vergeMaterial);
    mesh.frustumCulled = false;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    return { side, mesh };
  });
  // A guard rail down each side: the best cue for speed there is.
  const railMaterial = new MeshBasicMaterial({ color: theme.night ? 0x35507a : themeName === "alpine" ? 0x8fa3b8 : 0xdfe6ee, side: DoubleSide });
  const rails = [-1, 1].map(side => {
    const mesh = new Mesh(strip(false), railMaterial);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { side, mesh };
  });
  let roadBase = Number.NaN;

  function layRoad(base) {
    roadBase = base;
    const position = roadGeometry.getAttribute("position");
    const uv = roadGeometry.getAttribute("uv");
    const railPositions = rails.map(rail => rail.mesh.geometry.getAttribute("position"));
    const vergePositions = verges.map(verge => verge.mesh.geometry.getAttribute("position"));
    const colour = roadGeometry.getAttribute("color");
    for (let i = 0; i <= segments; i += 1) {
      const distance = (base + i) * STEP_M;
      const point = circuit.at(distance);
      const nx = Math.cos(point.heading);
      const nz = -Math.sin(point.heading);
      position.setXYZ(i * 2, point.x - nx * ROAD_HALF, 0, point.z - nz * ROAD_HALF);
      position.setXYZ(i * 2 + 1, point.x + nx * ROAD_HALF, 0, point.z + nz * ROAD_HALF);
      // The texture is pinned to the road, so the dashes stream past with distance.
      uv.setXY(i * 2, 0, distance / ROAD_TILE_M);
      uv.setXY(i * 2 + 1, 1, distance / ROAD_TILE_M);
      // Older and newer stretches of surface: the tone drifts slowly along the road, so no two tiles look alike.
      const age = 0.93 + 0.1 * (0.5 + 0.5 * Math.sin(distance * 0.043 + 1.3) * Math.sin(distance * 0.0171));
      const left = age * (1 + 0.025 * Math.sin(distance * 0.093));
      const right = age * (1 + 0.025 * Math.sin(distance * 0.071 + 2.1));
      colour.setXYZ(i * 2, left, left, left);
      colour.setXYZ(i * 2 + 1, right, right, right);
      verges.forEach((verge, index) => {
        vergePositions[index].setXYZ(i * 2, point.x + nx * ROAD_HALF * verge.side, -0.012, point.z + nz * ROAD_HALF * verge.side);
        vergePositions[index].setXYZ(i * 2 + 1, point.x + nx * (ROAD_HALF + 2.8) * verge.side, -0.052, point.z + nz * (ROAD_HALF + 2.8) * verge.side);
      });
      rails.forEach((rail, index) => {
        const x = point.x + nx * RAIL_OFFSET * rail.side;
        const z = point.z + nz * RAIL_OFFSET * rail.side;
        railPositions[index].setXYZ(i * 2, x, 0.42, z);
        railPositions[index].setXYZ(i * 2 + 1, x, 0.78, z);
      });
    }
    position.needsUpdate = true;
    uv.needsUpdate = true;
    colour.needsUpdate = true;
    for (const attribute of vergePositions) attribute.needsUpdate = true;
    for (const attribute of railPositions) attribute.needsUpdate = true;
  }

  // --------------------------------------------------------------- scenery
  const slots = Math.ceil((tier.viewDistance + BEHIND_M) / SLOT_M);
  // Two tall props a side (one near the road, one further back) and one low one.
  const perSlot = 4;
  const propCount = slots * perSlot;
  const tower = theme.prop === "tower";
  const trunkGeometry = tower ? new BoxGeometry(1, 1, 1) : new CylinderGeometry(0.22, 0.32, 1, 7);
  const crownGeometry = theme.prop === "palm" ? new SphereGeometry(1, 9, 6) : tower ? new BoxGeometry(1, 1, 1) : theme.prop === "cactus" ? new CapsuleGeometry(0.5, 1, 4, 10) : new ConeGeometry(1, 1, 8);
  // Palm fronds, or a cactus's elbows and second arm: a few more pieces per prop.
  const perProp = theme.prop === "palm" ? 6 : theme.prop === "cactus" ? 3 : 0;
  const lit = () => (tower ? new MeshBasicMaterial({ color: 0xffffff }) : new MeshLambertMaterial({ color: 0xffffff }));
  const windows = tower ? windowTexture() : null;
  // Several storeys and bays per face, so the lit windows are window-sized.
  windows?.repeat.set(2, 3);
  const trunks = new InstancedMesh(trunkGeometry, tower ? new MeshBasicMaterial({ map: windows }) : new MeshLambertMaterial({ color: theme.trunk }), propCount);
  const crowns = new InstancedMesh(crownGeometry, lit(), propCount);
  const crowns2 = new InstancedMesh(crownGeometry, lit(), propCount);
  const extras = perProp > 0 ? new InstancedMesh(crownGeometry, lit(), propCount * perProp) : null;
  const lows = new InstancedMesh(tower ? new BoxGeometry(1, 1, 1) : new SphereGeometry(1, 7, 5), lit(), slots * 2);
  const posts = new InstancedMesh(new BoxGeometry(0.16, 0.9, 0.16), new MeshLambertMaterial({ color: theme.night ? 0x3b5173 : themeName === "alpine" ? 0x5f7288 : 0xaab6c2 }), slots * 2);
  const sceneryMeshes = [trunks, crowns, crowns2, lows, posts, ...(extras ? [extras] : [])];
  for (const mesh of sceneryMeshes) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  let slotBase = Number.NaN;
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const place = new Vector3();
  const tint = new Color();
  const hide = () => matrix.makeScale(0, 0, 0);
  const yaw = new Quaternion();
  const tilt = new Quaternion();
  const FORWARD = new Vector3(0, 0, 1);

  function layScenery(base) {
    slotBase = base;
    for (let i = 0; i < slots; i += 1) {
      const slot = base + i;
      const distance = slot * SLOT_M;
      // Nothing grows where the grandstands are.
      const inside = distance > 40 && distance < circuit.length - 40;
      const point = circuit.at(distance);
      const nx = Math.cos(point.heading);
      const nz = -Math.sin(point.heading);
      for (let side = 0; side < perSlot; side += 1) {
        const index = i * perSlot + side;
        const key = `${seed}:${slot}:${side}`;
        const near = side < 2;
        const shown = inside && hash01(`${key}:show`) < quality.props * (near ? 0.7 : 1);
        const offset = (side % 2 === 0 ? -1 : 1) * (ROAD_HALF + (near ? 5.5 + hash01(`${key}:off`) * 11 : 22 + hash01(`${key}:off`) * 50));
        const size = 0.8 + hash01(`${key}:size`) * 0.9;
        const x = point.x + nx * offset;
        const z = point.z + nz * offset;
        const shade = (hash01(`${key}:c`) - 0.5) * 0.14;
        if (!shown) {
          hide();
          trunks.setMatrixAt(index, matrix);
          crowns.setMatrixAt(index, matrix);
          crowns2.setMatrixAt(index, matrix);
          for (let extra = 0; extra < perProp; extra += 1) extras.setMatrixAt(index * perProp + extra, matrix);
          continue;
        }
        const turn = hash01(`${key}:turn`) * Math.PI * 2;
        quaternion.setFromAxisAngle(UP, turn);
        if (tower) {
          const tall = 10 + hash01(`${key}:h`) * 34;
          const wide = 5 + hash01(`${key}:w`) * 6;
          quaternion.identity();
          matrix.compose(place.set(x, tall / 2, z), quaternion, scale.set(wide, tall, wide));
          trunks.setMatrixAt(index, matrix);
          matrix.compose(place.set(x, tall + 0.3, z), quaternion, scale.set(wide * 1.03, 0.6, wide * 1.03));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(hash01(`${key}:n`) < 0.5 ? theme.crown : theme.crown2));
          matrix.compose(place.set(x, tall + 2.4, z), quaternion, scale.set(0.3, 4.2, 0.3)); // mast
          crowns2.setMatrixAt(index, matrix);
          crowns2.setColorAt(index, tint.setHex(0xffffff));
        } else if (theme.prop === "palm") {
          const top = 5.4 * size;
          matrix.compose(place.set(x, top / 2, z), quaternion, scale.set(1, top, 1));
          trunks.setMatrixAt(index, matrix);
          // A heart of young leaves, coconuts under it, and six fronds that droop outward.
          matrix.compose(place.set(x, top + 0.2 * size, z), quaternion, scale.set(0.5 * size, 0.6 * size, 0.5 * size));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(theme.crown2).offsetHSL(0, 0, shade));
          matrix.compose(place.set(x, top - 0.25 * size, z), quaternion, scale.set(0.36 * size, 0.3 * size, 0.36 * size));
          crowns2.setMatrixAt(index, matrix);
          crowns2.setColorAt(index, tint.setHex(theme.trunk).offsetHSL(0, 0, -0.08));
          for (let frond = 0; frond < perProp; frond += 1) {
            const around = turn + (frond / perProp) * Math.PI * 2 + (hash01(`${key}:f:${frond}`) - 0.5) * 0.5;
            const droop = (frond % 2 === 0 ? 0.3 : 0.62) + hash01(`${key}:d:${frond}`) * 0.16;
            const reach = (1.25 + hash01(`${key}:l:${frond}`) * 0.35) * size;
            yaw.setFromAxisAngle(UP, around);
            tilt.setFromAxisAngle(FORWARD, -droop);
            yaw.multiply(tilt);
            const flat = Math.cos(droop) * reach;
            matrix.compose(place.set(x + Math.cos(around) * flat, top + 0.15 * size - Math.sin(droop) * reach, z - Math.sin(around) * flat), yaw, scale.set(reach, 0.09 * size, 0.38 * size));
            extras.setMatrixAt(index * perProp + frond, matrix);
            extras.setColorAt(index * perProp + frond, tint.setHex(frond % 2 === 0 ? theme.crown2 : theme.crown).offsetHSL(0, 0, shade));
          }
        } else if (theme.prop === "cactus") {
          hide();
          trunks.setMatrixAt(index, matrix);
          // A saguaro: a round-topped column and up to two arms, each an elbow and an upright.
          const girth = 0.8 * size;
          const tall = (2.9 + hash01(`${key}:h`) * 1.2) * size;
          matrix.compose(place.set(x, tall / 2 - 0.1, z), quaternion, scale.set(girth, tall / 2, girth));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(theme.crown).offsetHSL(0, 0, shade));
          const arms = [hash01(`${key}:arm`) < 0.78, hash01(`${key}:arm2`) < 0.45];
          const thick = girth * 0.62;
          for (let arm = 0; arm < 2; arm += 1) {
            const around = turn + arm * Math.PI + (hash01(`${key}:aa:${arm}`) - 0.5) * 0.6;
            const at = tall * (0.36 + hash01(`${key}:ah:${arm}`) * 0.18);
            const out = girth * 0.5 + thick * 0.75;
            const rise = tall * (0.26 + hash01(`${key}:ar:${arm}`) * 0.14);
            // Elbow: a capsule on its side, reaching out from the column.
            if (arms[arm]) {
              yaw.setFromAxisAngle(UP, around);
              tilt.setFromAxisAngle(FORWARD, Math.PI / 2);
              yaw.multiply(tilt);
              matrix.compose(place.set(x + Math.cos(around) * out * 0.5, at, z - Math.sin(around) * out * 0.5), yaw, scale.set(thick, out * 0.5, thick));
            } else hide();
            extras.setMatrixAt(index * perProp + arm, matrix);
            extras.setColorAt(index * perProp + arm, tint.setHex(theme.crown).offsetHSL(0, 0, shade));
            // Upright.
            if (arms[arm]) matrix.compose(place.set(x + Math.cos(around) * out, at + rise / 2, z - Math.sin(around) * out), quaternion, scale.set(thick, rise / 2 + thick * 0.25, thick));
            else hide();
            const upright = arm === 0 ? crowns2 : extras;
            const uprightIndex = arm === 0 ? index : index * perProp + 2;
            upright.setMatrixAt(uprightIndex, matrix);
            upright.setColorAt(uprightIndex, tint.setHex(theme.crown).offsetHSL(0, 0, shade));
          }
        } else {
          // A pine: trunk and two stacked cones (snow on top in the mountains).
          matrix.compose(place.set(x, 0.9 * size, z), quaternion, scale.set(1.2, 1.8 * size, 1.2));
          trunks.setMatrixAt(index, matrix);
          matrix.compose(place.set(x, 3.5 * size, z), quaternion, scale.set(2.3 * size, 4.4 * size, 2.3 * size));
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tint.setHex(theme.crown).offsetHSL(0, 0, shade));
          matrix.compose(place.set(x, 5.9 * size, z), quaternion, scale.set(1.5 * size, 3.4 * size, 1.5 * size));
          crowns2.setMatrixAt(index, matrix);
          crowns2.setColorAt(index, tint.setHex(theme.crown2).offsetHSL(0, 0, theme.crown2 === 0xf2f7fb ? 0 : shade));
        }
      }
      // Rail posts, and something low just beyond the rail (bushes, rocks, or light bollards at night).
      quaternion.identity();
      for (let side = 0; side < 2; side += 1) {
        const sign = side === 0 ? -1 : 1;
        const key = `${seed}:${slot}:low:${side}`;
        const beyond = distance > -20 && distance < circuit.length + 60;
        if (beyond) matrix.compose(place.set(point.x + nx * RAIL_OFFSET * sign, 0.45, point.z + nz * RAIL_OFFSET * sign), quaternion, scale.set(1, 1, 1));
        else hide();
        posts.setMatrixAt(i * 2 + side, matrix);
        if (inside && (tower ? slot % 2 === 0 : hash01(`${key}:show`) < 0.55 * quality.props)) {
          const offset = sign * (RAIL_OFFSET + (tower ? 0.9 : 1.6 + hash01(`${key}:off`) * 2.6));
          const size = 0.6 + hash01(`${key}:size`) * 0.8;
          if (tower) matrix.compose(place.set(point.x + nx * offset, 0.55, point.z + nz * offset), quaternion, scale.set(0.22, 1.1, 0.22));
          else matrix.compose(place.set(point.x + nx * offset, 0.35 * size, point.z + nz * offset), quaternion, scale.set(1.2 * size, 0.75 * size, 1.1 * size));
          lows.setMatrixAt(i * 2 + side, matrix);
          lows.setColorAt(i * 2 + side, tower ? tint.setHex(side === 0 ? theme.crown : theme.crown2) : tint.setHex(theme.low).offsetHSL(0, 0, (hash01(`${key}:c`) - 0.5) * 0.14));
        } else {
          hide();
          lows.setMatrixAt(i * 2 + side, matrix);
        }
      }
    }
    for (const mesh of sceneryMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------- roadside boards
  const boardMaps = [boardTexture(["MATHNEXA"], "#20cfe3"), boardTexture(["SOLVE.", "ACCELERATE. WIN."], "#ff4f9a"), boardTexture(["MATH RACE", "CHAMPIONS"], "#ffd24a")];
  const boardMetal = new MeshLambertMaterial({ color: 0x8b98a6 });
  const boards = [0, 1, 2].map(() => {
    const group = new Group();
    const panel = new Mesh(new PlaneGeometry(9, 3.4), new MeshBasicMaterial({ map: boardMaps[0], side: DoubleSide }));
    panel.position.y = 5.2;
    group.add(panel);
    for (const x of [-3.4, 3.4]) {
      const leg = new Mesh(new BoxGeometry(0.3, 5.2, 0.3), boardMetal);
      leg.position.set(x, 2.6, 0.1);
      group.add(leg);
    }
    group.visible = false;
    scene.add(group);
    return { group, panel, index: -1 };
  });

  function layBoards(distance) {
    const firstIndex = Math.max(1, Math.ceil((distance - BEHIND_M) / SIGN_EVERY_M));
    boards.forEach((board, order) => {
      const index = firstIndex + order;
      const at = index * SIGN_EVERY_M;
      if (at > circuit.length - 80) {
        board.group.visible = false;
        board.index = -1;
        return;
      }
      if (board.index === index) return;
      board.index = index;
      const point = circuit.at(at);
      const side = index % 2 === 0 ? -1 : 1;
      const offset = side * (ROAD_HALF + 9);
      board.group.position.set(point.x + Math.cos(point.heading) * offset, 0, point.z - Math.sin(point.heading) * offset);
      // Angled a little towards the oncoming cars.
      board.group.rotation.y = point.heading + Math.PI + side * 0.35;
      board.panel.material.map = boardMaps[index % boardMaps.length];
      board.group.visible = true;
    });
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
  const checker = bannerTexture("", true);
  for (const point of [startPoint, finishPoint]) {
    const line = new Mesh(new PlaneGeometry(ROAD_HALF * 2 - 1.2, 2.4), new MeshBasicMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -2 }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -point.heading;
    line.position.set(point.x, 0.03, point.z);
    scene.add(line);
  }

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
  let lean = 0;
  const rivalPool = [];
  const beamMap = theme.night ? beamTexture() : null;
  const beamMaterial = beamMap ? new MeshBasicMaterial({ map: beamMap, transparent: true, opacity: 0.5, depthWrite: false, blending: ADDITIVE, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 }) : null;

  /** A car as it is built for this circuit: lamps on after dark, with their light on the road. */
  function carFor(modelKey, options) {
    const handle = buildCar(modelKey, options);
    handle.lamps(theme.night);
    if (beamMaterial) {
      const beam = new Mesh(new PlaneGeometry(handle.width * 2.3, 13), beamMaterial);
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(0, 0.035, handle.length / 2 + 5.6);
      handle.group.add(beam);
    }
    return handle;
  }

  /** How one car's body is sitting on its springs. `phase` keeps two cars from bobbing in step. */
  const dynamics = (phase = 0) => ({ v: null, push: 0, pitch: 0, pitchV: 0, roll: 0, vx: 0, sway: 0, clock: phase, lit: 0 });
  const playerDynamics = dynamics();

  /**
   * The body moves on its springs the way the car is being driven. A car's speed changes in steps (an answer
   * lands), so the step is let out over a third of a second: the tail squats under power and the nose dips
   * under braking, then settles. Turning and changing lane lean it outward. The front wheels point where it is
   * going, and the brake lamps light when it slows hard or stands.
   */
  function animateCar(handle, state, speed, lateralSpeed, turning, steer, dtSeconds) {
    const v = speed / 3.6;
    if (state.v === null) state.v = v;
    state.push += v - state.v;
    state.v = v;
    let felt = 0;
    const parts = Math.max(1, Math.ceil(dtSeconds / 0.03));
    const dt = dtSeconds / parts;
    for (let part = 0; part < parts && dt > 0; part += 1) {
      const out = state.push * Math.min(1, dt * 5);
      state.push -= out;
      felt = out / dt;
      const want = Math.max(-0.05, Math.min(0.065, -felt * 0.0042));
      state.pitchV += ((want - state.pitch) * 110 - state.pitchV * 13) * dt;
      state.pitch += state.pitchV * dt;
    }
    const across = dtSeconds > 0 ? (lateralSpeed - state.vx) / dtSeconds : 0;
    state.vx = lateralSpeed;
    state.sway += (Math.max(-12, Math.min(12, across)) - state.sway) * Math.min(1, dtSeconds * 8);
    const roll = Math.max(-0.08, Math.min(0.08, -turning * speed * 0.012 - state.sway * 0.006 - steer * Math.min(1, v / 20) * 0.12));
    state.roll += (roll - state.roll) * Math.min(1, dtSeconds * 7);
    state.clock += dtSeconds * (4 + speed * 0.09);
    handle.chassis.rotation.x = state.pitch;
    handle.chassis.rotation.z = state.roll;
    handle.chassis.position.y = Math.sin(state.clock) * 0.012 * Math.min(1, speed / 60) - Math.abs(state.pitch) * 0.2;
    handle.steer(Math.max(-0.42, Math.min(0.42, steer * 1.9 + turning * 3.2)));
    state.lit = felt < -5 || v < 0.3 ? 0.25 : Math.max(0, state.lit - dtSeconds);
    handle.brake(state.lit > 0);
  }
  // How far the view has opened for a car coming up behind, and towards which side (both eased).
  let cameraPull = 0;
  let cameraPan = 0;

  /** `steer` turns the car's nose towards the side it is moving to (a lane change), radians. */
  function poseCar(handle, state, distance, lane, speed, dtSeconds, isPlayer, steer = 0, lateralSpeed = 0) {
    const point = circuit.at(distance);
    const ahead = circuit.at(distance + 6);
    const nx = Math.cos(point.heading);
    const nz = -Math.sin(point.heading);
    handle.group.position.set(point.x + nx * lane, 0, point.z + nz * lane);
    handle.group.rotation.y = point.heading + steer;
    const turning = ahead.heading - point.heading;
    animateCar(handle, state, speed, lateralSpeed, turning, steer, dtSeconds);
    if (isPlayer) lean += (Math.max(-0.05, Math.min(0.05, turning * speed * 0.006)) - lean) * Math.min(1, dtSeconds * 3);
    return point;
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
  // Where the camera is actually looking: it follows the target a moment behind, as a camera car would.
  const cameraLook = new Vector3();
  let cameraLooking = false;
  let cameraClock = 0;
  const tilted = new Vector3();
  const probe = new Vector3();
  // What the last frame showed: read by the browser tests and the frame-rate checks.
  const shown = { cars: 0, onScreen: 0 };

  return {
    get tier() {
      return quality.name;
    },
    get contextLost() {
      return lost;
    },
    /** How many rivals this picture draws as cars. */
    get rivalLimit() {
      return quality.rivals;
    },
    /** The last frame: rival cars drawn, and how many of them were inside the picture. */
    get shown() {
      return shown;
    },
    resize,
    /** The player's car: a garage model key, or the online car with a colour. */
    setPlayer(modelKey, paint = null) {
      if (player) {
        scene.remove(player.group);
        player.dispose();
      }
      player = carFor(modelKey, { paint, detail: quality.carDetail });
      scene.add(player.group);
    },
    /** A shove on the suspension: "boost" squats the car, "brake" dips its nose. */
    pulse(kind) {
      playerDynamics.pitchV += kind === "boost" ? -0.22 : 0.2;
    },
    /**
     * Draw one frame.
     *   me     { distanceM, speed }
     *   drawn  what race/traffic.js worked out for this frame: `cars`, each
     *          { id, distanceM, lane, lateralSpeed, speedMs, rival: { model, paint, speed } }
     *          placed where it is to be drawn, and `camera` { pull, side }.
     *          Only the nearest few rivals are cars; the rest live on the minimap.
     */
    render(me, drawn, frameMs) {
      if (lost || !player) return;
      resize();
      const dtSeconds = Math.min(0.1, frameMs / 1000);
      playerDistance = me.distanceM;
      const base = Math.floor((playerDistance - BEHIND_M) / STEP_M);
      if (base !== roadBase) layRoad(base);
      const slot = Math.floor((playerDistance - BEHIND_M) / SLOT_M);
      if (slot !== slotBase) layScenery(slot);
      layBoards(playerDistance);

      player.roll(playerDistance - lastPlayerDistance);
      lastPlayerDistance = playerDistance;
      const here = poseCar(player, playerDynamics, playerDistance, 0, me.speed, dtSeconds, true);
      sunTarget.position.set(here.x, 0, here.z);
      sun.position.set(here.x + sunOffset.x, sunOffset.y, here.z + sunOffset.z);

      // The nearest rivals get a car each; assignments change as cars pass.
      const near = drawn.cars
        .map(car => ({ car, rival: car.rival, gap: car.distanceM - playerDistance }))
        .filter(item => item.gap > -BEHIND_M && item.gap < quality.viewDistance)
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
          slotCar = { model: item.rival.model, handle: carFor(item.rival.model, { paint: item.rival.paint, detail: index < 2 ? quality.carDetail : "low" }), paint: item.rival.paint, id: null, last: item.car.distanceM, state: dynamics(index * 1.7 + 0.9) };
          rivalPool[index] = slotCar;
          scene.add(slotCar.handle.group);
        }
        if (slotCar.paint !== item.rival.paint) {
          slotCar.handle.setPaint(item.rival.paint);
          slotCar.paint = item.rival.paint;
        }
        if (slotCar.id !== item.rival.id) {
          slotCar.id = item.rival.id;
          slotCar.last = item.car.distanceM;
          slotCar.state = dynamics(index * 1.7 + 0.9);
        }
        slotCar.handle.group.visible = true;
        slotCar.handle.roll(item.car.distanceM - slotCar.last);
        slotCar.last = item.car.distanceM;
        // Changing lane, the nose points the way the car is going (never more than a real car steers).
        const steer = Math.max(-0.3, Math.min(0.3, Math.atan2(item.car.lateralSpeed ?? 0, Math.max(6, item.car.speedMs ?? 0))));
        // Its speed as it is drawn (it may be making up ground, or waiting behind another car).
        poseCar(slotCar.handle, slotCar.state, item.car.distanceM, item.car.lane, (item.car.speedMs ?? item.rival.speed / 3.6) * 3.6, dtSeconds, false, steer, item.car.lateralSpeed ?? 0);
      }

      // Camera: behind and above, looking down the road. Faster = wider, lower, and it leans into bends.
      // A car coming up behind opens the view: the camera eases back and up and turns a little towards
      // that side, so the car is seen arriving, alongside and going by. It eases back when the car is clear.
      const ease = Math.min(1, dtSeconds * 2.2);
      cameraPull += ((drawn.camera?.pull ?? 0) - cameraPull) * ease;
      cameraPan += ((drawn.camera?.side ?? 0) * (drawn.camera?.pull ?? 0) - cameraPan) * ease;
      const narrow = camera.aspect < 1;
      const speedShare = Math.min(1, me.speed / 240);
      const back = circuit.at(playerDistance - (6.6 + speedShare * 1.5 + cameraPull * (narrow ? 5.5 : 4.4)));
      const far = circuit.at(playerDistance + 16);
      cameraPosition.set(back.x, 2.55 - speedShare * 0.45 + cameraPull * (narrow ? 1.5 : 0.9), back.z);
      camera.position.lerp(cameraPosition, Math.min(1, dtSeconds * 10));
      const pan = cameraPan * (narrow ? 1.1 : 1.6);
      cameraTarget.set(far.x + Math.cos(far.heading) * pan, 0.95, far.z - Math.sin(far.heading) * pan);
      camera.up.copy(tilted.set(Math.cos(here.heading) * lean, 1, -Math.sin(here.heading) * lean).normalize());
      // The view turns into a bend a moment after the car does, and at speed the camera car feels the road.
      if (cameraLooking) cameraLook.lerp(cameraTarget, Math.min(1, dtSeconds * 9));
      else cameraLook.copy(cameraTarget);
      cameraLooking = true;
      if (!calm) {
        cameraClock += dtSeconds;
        const rough = Math.max(0, speedShare - 0.4);
        camera.position.y += (Math.sin(cameraClock * 37.1) + Math.sin(cameraClock * 23.3)) * 0.0045 * rough;
      }
      camera.lookAt(cameraLook);
      const fov = (narrow ? 78 : 62) + speedShare * 12 + cameraPull * (narrow ? 5 : 7);
      if (Math.abs(camera.fov - fov) > 0.2) {
        camera.fov += (fov - camera.fov) * Math.min(1, dtSeconds * 4);
        camera.updateProjectionMatrix();
      }
      // Which rival cars are inside the picture (their centre, at roof height). Each drawn car is told,
      // so a test can say "the car that went past was on screen while it did".
      camera.updateMatrixWorld();
      shown.cars = near.length;
      shown.onScreen = 0;
      for (const car of drawn.cars) car.onScreen = false;
      near.forEach((item, index) => {
        const at = rivalPool[index].handle.group.position;
        probe.set(at.x, 0.7, at.z).project(camera);
        item.car.onScreen = probe.z > -1 && probe.z < 1 && Math.abs(probe.x) < 1 && Math.abs(probe.y) < 1;
        if (item.car.onScreen) shown.onScreen += 1;
      });
      farGroup.position.set(camera.position.x, 0, camera.position.z);
      // The ground slides under the camera in whole tiles, so its pattern stays put.
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
          const offset = side * (ROAD_HALF + 2.2 + hash01(`s${index}`) * 5);
          quaternion.setFromAxisAngle(UP, point.heading);
          matrix.compose(place.set(point.x + Math.cos(point.heading) * offset, 1 + hash01(`h${index}`) * 3.2, point.z - Math.sin(point.heading) * offset), quaternion, scale.set(1, 1, 2 + strength * 16));
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
        if (!quality.shadows) {
          renderer.shadowMap.enabled = false;
          sun.castShadow = false;
        }
        scene.fog.near = Math.min(scene.fog.near, quality.viewDistance * 0.5);
        scene.fog.far = Math.min(scene.fog.far, quality.viewDistance * 1.0);
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
      for (const map of boardMaps) map.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
  };
}
