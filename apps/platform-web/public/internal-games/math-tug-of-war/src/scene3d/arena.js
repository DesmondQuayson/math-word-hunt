// The competition arena: grass, centre and victory lines with team flags,
// stands with a crowd, sky and lighting. Built once per scene; the crowd is
// an instanced mesh so it costs one draw call.

import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Vector3
} from "../vendor/three.js";
import { LINE_X, TEAM } from "./constants.js";
import { makeRandom } from "./math.js";

const SKY_TOP = 0x8fc9f5;
const SKY_HORIZON = 0xe6f3fc;

function grassTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const random = makeRandom(7);
  context.fillStyle = "#4d9f4a";
  context.fillRect(0, 0, size, size);
  // Mown stripes.
  for (let x = 0; x < size; x += 64) {
    context.fillStyle = (x / 64) % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
    context.fillRect(x, 0, 64, size);
  }
  // Blade speckle.
  for (let index = 0; index < 9000; index += 1) {
    const shade = 0.75 + random() * 0.5;
    context.fillStyle = `rgba(${Math.floor(70 * shade)}, ${Math.floor(150 * shade)}, ${Math.floor(60 * shade)}, 0.55)`;
    context.fillRect(random() * size, random() * size, 2, 1 + random() * 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function markTexture(kind, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.fillRect(0, 0, 128, 96);
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  context.lineWidth = 7;
  context.lineCap = "round";
  if (kind === "wave") {
    for (const y of [38, 60]) {
      context.beginPath();
      context.moveTo(24, y);
      context.quadraticCurveTo(40, y - 16, 56, y);
      context.quadraticCurveTo(72, y + 16, 88, y);
      context.quadraticCurveTo(104, y - 16, 112, y);
      context.stroke();
    }
  } else {
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? 14 : 32;
      const angle = (index / 10) * Math.PI * 2 - Math.PI / 2;
      context.lineTo(64 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius);
    }
    context.closePath();
    context.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function flag(team, x) {
  const style = TEAM[team];
  const group = new Group();
  const pole = new Mesh(new CylinderGeometry(0.02, 0.025, 2.2, 8), new MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.5, metalness: 0.4 }));
  pole.position.y = 1.1;
  pole.castShadow = true;
  const cloth = new Mesh(new PlaneGeometry(0.62, 0.42), new MeshStandardMaterial({ map: markTexture(style.mark, style.color), side: DoubleSide, roughness: 0.8 }));
  cloth.position.set(style.dir * -0.33, 1.95, 0);
  cloth.castShadow = true;
  group.add(pole, cloth);
  group.position.set(x, 0, -1.25);
  group.userData.cloth = cloth;
  return group;
}

function dashedLine(x, color) {
  const group = new Group();
  const material = new MeshBasicMaterial({ color, toneMapped: false });
  for (let z = -2.6; z <= 2.6; z += 0.5) {
    const dash = new Mesh(new PlaneGeometry(0.1, 0.28), material);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.004, z);
    group.add(dash);
  }
  return group;
}

export class Arena {
  constructor({ crowdCount = 160, shadows = true }) {
    this.group = new Group();
    this.time = 0;
    this.random = makeRandom(21);

    // Ground.
    this.grass = grassTexture();
    const ground = new Mesh(new PlaneGeometry(90, 50), new MeshStandardMaterial({ map: this.grass, roughness: 1, metalness: 0, envMapIntensity: 0.15 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Centre line and the two victory lines.
    const centre = new Mesh(new PlaneGeometry(0.1, 5.6), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    centre.rotation.x = -Math.PI / 2;
    centre.position.y = 0.004;
    this.group.add(centre);
    const centreDot = new Mesh(new CircleGeometry(0.16, 24), new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    centreDot.rotation.x = -Math.PI / 2;
    centreDot.position.set(0, 0.0045, -1.2);
    this.group.add(centreDot);
    this.group.add(dashedLine(-LINE_X, TEAM.turquoise.dark), dashedLine(LINE_X, TEAM.pink.dark));
    this.flags = [flag("turquoise", -LINE_X), flag("pink", LINE_X)];
    this.group.add(...this.flags);

    // Stands: two tiers on the far side, with a crowd.
    const standMaterial = new MeshStandardMaterial({ color: 0xc9d7e4, roughness: 0.95 });
    const STAND_Z = -10.5;
    const TIER_DEPTH = 0.9;
    const TIER_RISE = 0.42;
    for (let tier = 0; tier < 6; tier += 1) {
      const step = new Mesh(new BoxGeometry(34, TIER_RISE, TIER_DEPTH), standMaterial);
      step.position.set(0, TIER_RISE / 2 + tier * TIER_RISE, STAND_Z - tier * TIER_DEPTH);
      step.receiveShadow = true;
      this.group.add(step);
    }
    const rail = new Mesh(new BoxGeometry(34, 0.08, 0.08), new MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.6, metalness: 0.3 }));
    rail.position.set(0, 0.95, STAND_Z + 0.5);
    this.group.add(rail);
    const back = new Mesh(new BoxGeometry(34, 4.2, 0.3), new MeshStandardMaterial({ color: 0xa9bfd3, roughness: 0.95 }));
    back.position.set(0, 2.1, STAND_Z - 6 * TIER_DEPTH - 0.2);
    this.group.add(back);
    // Banner above the stands.
    const banner = new Mesh(new PlaneGeometry(7.5, 1.0), new MeshStandardMaterial({ color: 0x10243e, roughness: 0.8 }));
    banner.position.set(0, 3.9, STAND_Z - 6 * TIER_DEPTH - 0.04);
    this.group.add(banner);
    for (const [index, color] of [TEAM.turquoise.color, 0xf3a712, TEAM.pink.color].entries()) {
      const bar = new Mesh(new PlaneGeometry(2.1, 0.14), new MeshBasicMaterial({ color, toneMapped: false }));
      bar.position.set(-2.4 + index * 2.4, 3.65, STAND_Z - 6 * TIER_DEPTH - 0.03);
      this.group.add(bar);
    }

    // Crowd: one instanced mesh of simple seated spectators.
    const bodyGeometry = new CapsuleGeometry(0.13, 0.22, 2, 7);
    const crowdMaterial = new MeshLambertMaterial({ color: 0xffffff });
    this.crowd = new InstancedMesh(bodyGeometry, crowdMaterial, crowdCount);
    this.crowd.castShadow = false;
    this.crowd.receiveShadow = false;
    this.heads = new InstancedMesh(new SphereGeometry(0.085, 8, 7), new MeshLambertMaterial({ color: 0xffffff }), crowdCount);
    this.spectators = [];
    const palette = [0x7fcfd9, 0xf29ac0, 0xe9eef3, 0xd9c36a, 0x3f8f9c, 0xb94a7c, 0x8e9bb0, 0x3b4b63, 0x6b7f99, 0xc8b7a6, 0x4f6d8f, 0xf0e6d2];
    const skins = [0x8d5a3b, 0xf1c9a5, 0xc58c62, 0x6b4330, 0xe8b894, 0x5a3a28];
    const dummy = new Object3D();
    const color = new Color();
    for (let index = 0; index < crowdCount; index += 1) {
      const tier = index % 6;
      const x = -16 + (index / crowdCount) * 32 + (this.random() - 0.5) * 0.6;
      const z = STAND_Z - tier * TIER_DEPTH + (this.random() - 0.5) * 0.25;
      const y = TIER_RISE + tier * TIER_RISE;
      const phase = this.random() * Math.PI * 2;
      const energy = 0.3 + this.random() * 0.7;
      const team = x < 0 ? "turquoise" : "pink";
      this.spectators.push({ x, y, z, phase, energy, team });
      dummy.position.set(x, y + 0.22, z);
      dummy.updateMatrix();
      this.crowd.setMatrixAt(index, dummy.matrix);
      color.setHex(palette[Math.floor(this.random() * palette.length)]);
      this.crowd.setColorAt(index, color);
      dummy.position.set(x, y + 0.5, z);
      dummy.updateMatrix();
      this.heads.setMatrixAt(index, dummy.matrix);
      color.setHex(skins[Math.floor(this.random() * skins.length)]);
      this.heads.setColorAt(index, color);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    this.group.add(this.crowd, this.heads);
    this.dummy = dummy;
    this.cheer = 0;
    this.cheerTeam = null;

    // Distant trees for depth.
    const trunk = new CylinderGeometry(0.12, 0.16, 1.6, 6);
    const crown = new ConeGeometry(1.1, 2.6, 7);
    const trunkMaterial = new MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
    const crownMaterial = new MeshStandardMaterial({ color: 0x3f8f45, roughness: 1 });
    for (const x of [-22, -19, 18.5, 21.5, 25]) {
      const tree = new Group();
      const t = new Mesh(trunk, trunkMaterial);
      t.position.y = 0.8;
      const c = new Mesh(crown, crownMaterial);
      c.position.y = 2.7;
      tree.add(t, c);
      tree.position.set(x, 0, -12 + this.random() * 3);
      this.group.add(tree);
    }

    // Sky dome and fog.
    const sky = new Mesh(new SphereGeometry(70, 24, 12), new MeshBasicMaterial({ color: SKY_TOP, side: BackSide, fog: false, toneMapped: false }));
    this.group.add(sky);
    this.fog = new Fog(SKY_HORIZON, 24, 70);

    // Lights.
    // Key light from high behind-left so contact shadows fall towards the
    // camera (readable ground contact); a soft front fill keeps faces lit.
    this.hemisphere = new HemisphereLight(0xcfe6ff, 0x5d8f4a, 0.5);
    this.sun = new DirectionalLight(0xfff2dc, 3.4);
    this.sun.position.set(-5, 12, -3.5);
    this.sun.target.position.set(0, 0.8, 0);
    this.fill = new DirectionalLight(0xe8f1ff, 0.75);
    this.fill.position.set(4, 6, 12);
    this.fill.target.position.set(0, 1, 0);
    this.sunAnchor = new Group();
    this.sunAnchor.add(this.sun, this.sun.target, this.fill, this.fill.target);
    this.group.add(this.hemisphere, this.sunAnchor);
    this.setShadows(shadows ? 1024 : 0);
    this.matrix = new Matrix4();
    this.quaternion = new Quaternion();
    this.scaleVector = new Vector3(1, 1, 1);
  }

  setShadows(mapSize) {
    const sun = this.sun;
    sun.castShadow = mapSize > 0;
    if (mapSize > 0) {
      sun.shadow.mapSize.set(mapSize, mapSize);
      const camera = sun.shadow.camera;
      camera.left = -8.5;
      camera.right = 8.5;
      camera.top = 4.5;
      camera.bottom = -4.5;
      camera.near = 1;
      camera.far = 40;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.025;
      sun.shadow.radius = 3;
      camera.updateProjectionMatrix();
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
  }

  /** Keep the shadow frustum centred on the action. */
  follow(x) {
    this.sunAnchor.position.x = x;
  }

  celebrate(team) {
    this.cheerTeam = team;
    this.cheer = 1;
  }

  reset() {
    this.cheerTeam = null;
    this.cheer = 0;
  }

  update(dt, { animateCrowd = true, excitement = 0 } = {}) {
    this.time += dt;
    for (const group of this.flags) {
      const cloth = group.userData.cloth;
      cloth.rotation.y = Math.sin(this.time * 2.1 + group.position.x) * 0.18;
      cloth.rotation.x = Math.sin(this.time * 3.3 + group.position.x) * 0.06;
    }
    if (!animateCrowd) return;
    const dummy = this.dummy;
    const cheer = this.cheer;
    for (let index = 0; index < this.spectators.length; index += 1) {
      const spectator = this.spectators[index];
      const cheering = cheer > 0 && spectator.team === this.cheerTeam;
      const bounce = cheering
        ? Math.max(0, Math.sin(this.time * 7 + spectator.phase)) * 0.22 * spectator.energy
        : Math.sin(this.time * 1.4 + spectator.phase) * 0.012 * (1 + excitement * 2);
      dummy.position.set(spectator.x, spectator.y + 0.22 + bounce, spectator.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      this.crowd.setMatrixAt(index, dummy.matrix);
      dummy.position.set(spectator.x, spectator.y + 0.5 + bounce, spectator.z);
      dummy.updateMatrix();
      this.heads.setMatrixAt(index, dummy.matrix);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.grass.dispose();
    this.group.traverse((object) => {
      if (object.isMesh) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material?.map?.dispose();
          material?.dispose();
        }
      }
    });
  }
}
