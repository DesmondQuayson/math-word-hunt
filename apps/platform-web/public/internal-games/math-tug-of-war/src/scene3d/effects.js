// Confetti, dust puffs and contact shadows. Purely decorative and cheap:
// one instanced mesh for confetti, a few sprites for dust, flat discs for
// contact shadows on tiers without shadow maps.

import { CanvasTexture, CircleGeometry, Color, DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Sprite, SpriteMaterial } from "../vendor/three.js";
import { makeRandom } from "./math.js";

const CONFETTI_COLORS = [0x0fb5c6, 0xff4f9a, 0xf3a712, 0x5b6cff, 0xffffff, 0x7ee787];

export class Confetti {
  constructor(count = 180) {
    this.count = count;
    this.mesh = new InstancedMesh(new PlaneGeometry(0.055, 0.085), new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }), count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.pieces = new Float32Array(count * 9); // x y z vx vy vz rx ry spin
    this.dummy = new Object3D();
    this.random = makeRandom(99);
    this.active = false;
    this.life = 0;
    const color = new Color();
    for (let index = 0; index < count; index += 1) {
      color.setHex(CONFETTI_COLORS[index % CONFETTI_COLORS.length]);
      this.mesh.setColorAt(index, color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  burst(centreX, spread = 3.5) {
    const pieces = this.pieces;
    for (let index = 0; index < this.count; index += 1) {
      const o = index * 9;
      pieces[o] = centreX + (this.random() - 0.5) * spread;
      pieces[o + 1] = 3.2 + this.random() * 1.6;
      pieces[o + 2] = -0.6 + this.random() * 1.8;
      pieces[o + 3] = (this.random() - 0.5) * 0.8;
      pieces[o + 4] = -0.2 - this.random() * 0.6;
      pieces[o + 5] = (this.random() - 0.5) * 0.4;
      pieces[o + 6] = this.random() * Math.PI * 2;
      pieces[o + 7] = this.random() * Math.PI * 2;
      pieces[o + 8] = 2 + this.random() * 6;
    }
    this.active = true;
    this.life = 0;
    this.mesh.visible = true;
  }

  stop() {
    this.active = false;
    this.mesh.visible = false;
  }

  update(dt, time) {
    if (!this.active) return;
    this.life += dt;
    const pieces = this.pieces;
    const dummy = this.dummy;
    let alive = 0;
    for (let index = 0; index < this.count; index += 1) {
      const o = index * 9;
      if (pieces[o + 1] > 0.01) {
        alive += 1;
        // Gravity, drag and a flutter.
        pieces[o + 4] = Math.max(-1.6, pieces[o + 4] - 2.2 * dt);
        pieces[o] += (pieces[o + 3] + Math.sin(time * pieces[o + 8] + index) * 0.35) * dt;
        pieces[o + 1] += pieces[o + 4] * dt * 0.55;
        pieces[o + 2] += pieces[o + 5] * dt;
        pieces[o + 6] += dt * pieces[o + 8] * 0.6;
        pieces[o + 7] += dt * pieces[o + 8] * 0.4;
      }
      dummy.position.set(pieces[o], Math.max(0.01, pieces[o + 1]), pieces[o + 2]);
      dummy.rotation.set(pieces[o + 6], pieces[o + 7], 0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(index, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (alive === 0 && this.life > 2) this.stop();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function puffTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(230, 216, 182, 0.85)");
  gradient.addColorStop(0.6, "rgba(217, 201, 163, 0.35)");
  gradient.addColorStop(1, "rgba(217, 201, 163, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

export class Dust {
  constructor(count = 10) {
    this.group = new Group();
    this.texture = puffTexture();
    this.sprites = [];
    for (let index = 0; index < count; index += 1) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      sprite.userData.life = 0;
      this.group.add(sprite);
      this.sprites.push(sprite);
    }
    this.random = makeRandom(5);
  }

  puff(position, strength = 1) {
    for (const sprite of this.sprites) {
      if (sprite.visible) continue;
      sprite.visible = true;
      sprite.position.copy(position);
      sprite.position.y = 0.08;
      sprite.position.x += (this.random() - 0.5) * 0.2;
      sprite.userData.life = 0;
      sprite.userData.strength = strength;
      sprite.scale.setScalar(0.25);
      sprite.material.opacity = 0.8 * strength;
      return;
    }
  }

  update(dt) {
    for (const sprite of this.sprites) {
      if (!sprite.visible) continue;
      sprite.userData.life += dt;
      const t = sprite.userData.life / 0.7;
      if (t >= 1) {
        sprite.visible = false;
        continue;
      }
      sprite.scale.setScalar(0.25 + t * 0.6 * sprite.userData.strength);
      sprite.position.y = 0.08 + t * 0.25;
      sprite.material.opacity = 0.75 * (1 - t) * sprite.userData.strength;
    }
  }

  dispose() {
    this.texture.dispose();
    for (const sprite of this.sprites) sprite.material.dispose();
  }
}

/** Soft dark discs under each puller for tiers without shadow maps. */
export class ContactShadows {
  constructor(count) {
    this.group = new Group();
    this.discs = [];
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 32);
    gradient.addColorStop(0, "rgba(10, 30, 20, 0.5)");
    gradient.addColorStop(1, "rgba(10, 30, 20, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.texture = new CanvasTexture(canvas);
    const geometry = new CircleGeometry(0.48, 20);
    for (let index = 0; index < count; index += 1) {
      const disc = new Mesh(geometry, new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.006;
      this.group.add(disc);
      this.discs.push(disc);
    }
    this.geometry = geometry;
  }

  place(index, x, z, scale = 1) {
    const disc = this.discs[index];
    if (!disc) return;
    disc.position.x = x;
    disc.position.z = z;
    disc.scale.set(scale * 1.25, scale, 1);
  }

  dispose() {
    this.geometry.dispose();
    this.texture.dispose();
    for (const disc of this.discs) disc.material.dispose();
  }
}
