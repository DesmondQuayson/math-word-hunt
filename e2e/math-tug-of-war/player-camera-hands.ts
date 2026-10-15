// What the PLAYER'S camera shows of every Math Tug of War 3D hand. Shared by the
// 3D e2e suite, the hosted staging/production review and the owner review pack
// (Node strips the types when the review scripts import it).
import type { Page } from "@playwright/test";

export type HandPixels = { puller: string; side: string; visible: number; touching: number };

/**
 * What the PLAYER'S camera shows of every hand: one flat-colour render per
 * puller from the live gameplay camera — that puller's hand skin (triangles
 * skinned mostly to a hand or finger bone) in red / blue, every other
 * character triangle black (bodies still hide hands behind them), the rope
 * green, the arena hidden. Counts each hand's visible pixels and how many of
 * them touch rope pixels. Needs the review debug hook (?graphics=…).
 */
export async function playerCameraHands(page: Page): Promise<HandPixels[]> {
  return page.evaluate(async () => {
    type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const THREE: Any = await import("/internal-games/math-tug-of-war/src/vendor/three.js" as string);
    const d: Any = (window as Any).__MATHNEXA_TUG_3D_DEBUG__;
    const { renderer, scene, camera, rope, pullers } = d;
    const gl = renderer.getContext();
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const ropeObjects = new Set<Any>();
    rope.group.traverse((o: Any) => ropeObjects.add(o));
    const characters: Array<{ mesh: Any; team: string; index: number }> = [];
    for (const team of ["turquoise", "pink"]) pullers[team].forEach((p: Any, index: number) => p.root.traverse((o: Any) => o.isMesh && characters.push({ mesh: o, team, index })));
    const characterSet = new Set(characters.map((c) => c.mesh));
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: false });
    const green = new THREE.MeshBasicMaterial({ color: 0x00ff00, toneMapped: false, fog: false });
    const red = new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false, fog: false });
    const blue = new THREE.MeshBasicMaterial({ color: 0x0000ff, toneMapped: false, fog: false });
    // Per geometry: triangles regrouped as [other, left hand, right hand].
    const grouped = new Map<Any, Any>();
    const regroup = (mesh: Any) => {
      const g = mesh.geometry;
      if (grouped.has(g)) return grouped.get(g);
      const names = mesh.skeleton ? mesh.skeleton.bones.map((b: Any) => b.name) : [];
      const si = g.attributes.skinIndex;
      const sw = g.attributes.skinWeight;
      const n = g.attributes.position.count;
      const side = new Int8Array(n);
      if (si && sw) {
        for (let v = 0; v < n; v += 1) {
          let best = -1;
          let weight = 0;
          for (let k = 0; k < 4; k += 1) if (sw.getComponent(v, k) > weight) { weight = sw.getComponent(v, k); best = si.getComponent(v, k); }
          const name = names[best] ?? "";
          if (/Hand/.test(name)) side[v] = /Left/.test(name) ? 1 : 2;
        }
      }
      const source = g.index ? g.index.array : Array.from({ length: n }, (_, k) => k);
      const buckets: number[][] = [[], [], []];
      for (let f = 0; f + 2 < source.length; f += 3) {
        const a = source[f], b = source[f + 1], c = source[f + 2];
        const l = Number(side[a] === 1) + Number(side[b] === 1) + Number(side[c] === 1);
        const r = Number(side[a] === 2) + Number(side[b] === 2) + Number(side[c] === 2);
        buckets[l >= 2 ? 1 : r >= 2 ? 2 : 0].push(a, b, c);
      }
      const probe = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(g.attributes)) probe.setAttribute(name, attribute);
      probe.morphAttributes = g.morphAttributes;
      probe.morphTargetsRelative = g.morphTargetsRelative;
      const all = new Uint32Array(buckets[0].length + buckets[1].length + buckets[2].length);
      all.set(buckets[0], 0);
      all.set(buckets[1], buckets[0].length);
      all.set(buckets[2], buckets[0].length + buckets[1].length);
      probe.setIndex(new THREE.BufferAttribute(all, 1));
      probe.addGroup(0, buckets[0].length, 0);
      probe.addGroup(buckets[0].length, buckets[1].length, 1);
      probe.addGroup(buckets[0].length + buckets[1].length, buckets[2].length, 2);
      if (g.boundingSphere) probe.boundingSphere = g.boundingSphere.clone();
      grouped.set(g, probe);
      return probe;
    };
    const saved: Array<{ o: Any; visible: boolean; material: Any; geometry: Any }> = [];
    scene.traverse((o: Any) => saved.push({ o, visible: o.visible, material: o.material, geometry: o.geometry }));
    const background = scene.background;
    const fog = scene.fog;
    const shadows = renderer.shadowMap.enabled;
    const buffer = new Uint8Array(W * H * 4);
    const results: Array<{ puller: string; side: string; visible: number; touching: number }> = [];
    try {
      scene.background = new THREE.Color(0x000000);
      scene.fog = null;
      renderer.shadowMap.enabled = false;
      scene.traverse((o: Any) => {
        if (characterSet.has(o)) { o.geometry = regroup(o); return; }
        if (ropeObjects.has(o)) { if (o.isMesh) o.material = green; return; }
        if (o.isMesh || o.isSprite || o.isPoints) o.visible = false;
      });
      for (const team of ["turquoise", "pink"]) {
        for (let index = 0; index < pullers[team].length; index += 1) {
          for (const c of characters) c.mesh.material = c.team === team && c.index === index ? [black, red, blue] : [black, black, black];
          renderer.render(scene, camera);
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
          const kind = new Uint8Array(W * H);
          for (let p = 0; p < W * H; p += 1) {
            const r = buffer[p * 4], g = buffer[p * 4 + 1], b = buffer[p * 4 + 2];
            if (r > 110 && r > g * 1.6 && r > b * 1.6) kind[p] = 1;
            else if (b > 110 && b > r * 1.6 && b > g * 1.6) kind[p] = 2;
            else if (g > 110 && g > r * 1.6 && g > b * 1.6) kind[p] = 3;
          }
          const count = { 1: { visible: 0, touching: 0 }, 2: { visible: 0, touching: 0 } } as Record<number, { visible: number; touching: number }>;
          for (let y = 0; y < H; y += 1) {
            for (let x = 0; x < W; x += 1) {
              const k = kind[y * W + x];
              if (k !== 1 && k !== 2) continue;
              count[k].visible += 1;
              let touch = false;
              for (let dy = -2; dy <= 2 && !touch; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
                const xx = x + dx, yy = y + dy;
                if (xx >= 0 && yy >= 0 && xx < W && yy < H && kind[yy * W + xx] === 3) { touch = true; break; }
              }
              if (touch) count[k].touching += 1;
            }
          }
          results.push({ puller: `${team}-${index}`, side: "Left", ...count[1] }, { puller: `${team}-${index}`, side: "Right", ...count[2] });
        }
      }
    } finally {
      for (const { o, visible, material, geometry } of saved) { o.visible = visible; o.material = material; if (geometry) o.geometry = geometry; }
      scene.background = background;
      scene.fog = fog;
      renderer.shadowMap.enabled = shadows;
      for (const g of grouped.values()) g.setIndex(null);
      for (const m of [black, green, red, blue]) m.dispose();
      renderer.render(scene, camera);
    }
    return results;
  });
}
