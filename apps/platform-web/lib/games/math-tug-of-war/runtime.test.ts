// @vitest-environment node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MATH_TUG_OF_WAR_RUNTIME_SHA256, renderMathTugOfWarDocument } from "@/features/games/math-tug-of-war/document";
import { createInternalGameResponse, getInternalGameRegistration } from "@/lib/games/internal-registry";

const RUNTIME_DIR = resolve(__dirname, "../../../public/internal-games/math-tug-of-war");

/** Every game-authored module (not the vendored three.js bundle, checked separately). */
const GAME_MODULES = [
  "app.js", "answer.js", "audio.js", "dom.js", "online.js", "panel.js", "questions.js", "random.js", "robot.js",
  "scene.js", "scene-composite.js", "tug.js", "version.js",
  "scene3d/arena.js", "scene3d/assets.js", "scene3d/constants.js", "scene3d/effects.js", "scene3d/expressions.js",
  "scene3d/math.js", "scene3d/puller.js", "scene3d/quality.js", "scene3d/rig.js", "scene3d/rope.js", "scene3d/scene3d.js"
];

function listFiles(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

describe("Math Tug of War runtime delivery", () => {
  it("document versions its entry URLs with the current runtime content hash", async () => {
    // Same algorithm as scripts/math-tug-of-war-runtime-hash.mjs.
    const script = await import("../../../../../scripts/math-tug-of-war-runtime-hash.mjs");
    expect(script.runtimeHash()).toBe(MATH_TUG_OF_WAR_RUNTIME_SHA256);
  });

  it("is registered as a same-origin internal game with the strict game CSP", async () => {
    expect(getInternalGameRegistration("math-tug-of-war")).toMatchObject({
      route: "/games/math-tug-of-war/play",
      assetBase: "/internal-games/math-tug-of-war/",
      connectSource: "'self'"
    });
    const response = createInternalGameResponse("math-tug-of-war", "1.0.0");
    expect(response.status).toBe(200);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("worker-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("wasm-unsafe-eval");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    const body = await response.text();
    expect(body).toBe(renderMathTugOfWarDocument());
    expect(body).not.toContain("<base");
    expect(body).toContain(`src="/internal-games/math-tug-of-war/src/app.js?v=${MATH_TUG_OF_WAR_RUNTIME_SHA256.slice(0, 16)}"`);
    expect(body).toContain(`href="/internal-games/math-tug-of-war/styles.css?v=${MATH_TUG_OF_WAR_RUNTIME_SHA256.slice(0, 16)}"`);
    expect(body).not.toMatch(/https?:\/\//);
    expect(body).not.toContain("iframe");
    expect(body).not.toMatch(/<script(?![^>]*type="module"[^>]*src=)/);
  });

  it("every game module is self-contained: no third-party hosts, eval, workers or raw HTML sinks", () => {
    expect(GAME_MODULES.map((file) => existsSync(resolve(RUNTIME_DIR, "src", file)))).not.toContain(false);
    for (const file of GAME_MODULES) {
      const source = readFileSync(resolve(RUNTIME_DIR, "src", file), "utf8");
      expect(source, file).not.toMatch(/\binnerHTML\b|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|new Worker|importScripts/);
      expect(source.replace("http://www.w3.org/2000/svg", ""), file).not.toMatch(/https?:\/\//);
      // Static imports stay relative; the only dynamic import is the literal, relative 3D module.
      expect(source, file).not.toMatch(/from\s+["'](?!\.\.?\/)/);
      const dynamicImports = source.match(/\bimport\s*\([^)]*\)/g) ?? [];
      for (const call of dynamicImports) expect(call, file).toMatch(/^import\s*\(\s*["']\.\/scene3d\/scene3d\.js["']\s*\)$/);
    }
    // Only the composite scene may lazy-load the 3D module.
    const lazy = GAME_MODULES.filter((file) => /\bimport\s*\(/.test(readFileSync(resolve(RUNTIME_DIR, "src", file), "utf8")));
    expect(lazy).toEqual(["scene-composite.js"]);
  });

  it("vendors three.js (MIT) as one same-origin module without eval, workers, WASM or network hosts", () => {
    const vendor = readFileSync(resolve(RUNTIME_DIR, "src/vendor/three.js"), "utf8");
    expect(vendor.slice(0, 1200)).toMatch(/three\.js r\d+\.\d+\.\d+ — subset bundle/);
    expect(vendor.slice(0, 2000)).toContain("MIT License");
    expect(vendor).not.toMatch(/\beval\(|new Function\(|new Worker\(|importScripts\(|WebAssembly|wasm/);
    expect(vendor).not.toMatch(/\bimport\s*\(/);
    expect(vendor).not.toMatch(/^\s*import\s/m);
    // The only URLs are an XHTML namespace and a citation in a comment.
    const hosts = new Set((vendor.match(/https?:\/\/[a-z0-9.-]+/gi) ?? []).map((url) => url.toLowerCase()));
    expect([...hosts].sort()).toEqual(["http://www.w3.org", "https://jcgt.org"]);
  });

  it("ships the 3D characters as plain same-origin glTF with external WebP textures (no decoders, no blob: images)", () => {
    const modelsDir = resolve(RUNTIME_DIR, "models");
    const document = JSON.parse(readFileSync(join(modelsDir, "characters.gltf"), "utf8")) as {
      asset: { version: string };
      extensionsRequired?: string[];
      extensionsUsed?: string[];
      buffers: Array<{ uri?: string; byteLength: number }>;
      images?: Array<{ uri?: string; bufferView?: number }>;
      nodes: Array<{ name?: string; children?: number[]; skin?: number; mesh?: number }>;
      scenes: Array<{ nodes: number[] }>;
    };
    expect(document.asset.version).toBe("2.0");
    // Quantized geometry and WebP are read natively by three.js; nothing needs Draco, meshopt or a worker.
    const allowed = new Set(["KHR_mesh_quantization", "EXT_texture_webp", "KHR_texture_transform", "KHR_materials_emissive_strength"]);
    for (const extension of [...(document.extensionsRequired ?? []), ...(document.extensionsUsed ?? [])]) expect(allowed.has(extension), extension).toBe(true);
    expect(document.buffers.every((buffer) => buffer.uri === "characters.bin")).toBe(true);
    expect(document.images?.length).toBeGreaterThan(0);
    for (const image of document.images ?? []) {
      expect(image.bufferView).toBeUndefined();
      expect(image.uri).toMatch(/^[a-z0-9._-]+\.webp$/);
      expect(existsSync(join(modelsDir, image.uri ?? ""))).toBe(true);
    }
    const names = document.scenes[0].nodes.map((index) => document.nodes[index].name);
    expect(names.sort()).toEqual(["puller-a", "puller-b", "puller-c", "puller-d", "puller-e", "puller-f"]);
    // Budget: the whole 3D asset set stays small enough for a phone on a school network.
    const total = listFiles(modelsDir).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThan(5.5 * 1024 * 1024);
    for (const file of listFiles(modelsDir)) expect(file).toMatch(/\.(gltf|bin|webp)$/);
  });

  it("reuses the shared, approved MathNexa track instead of adding audio", () => {
    const audio = readFileSync(resolve(RUNTIME_DIR, "src/audio.js"), "utf8");
    expect(audio).toContain('path: "/media/audio/cosmic-candy-catchers.mp3"');
    expect(audio).toContain('author: "Eric Matyas"');
    expect(audio).toContain('license: "CC BY 3.0"');
  });

  it("has no timer, difficulty tiers or tutorial in the player-facing runtime", () => {
    const app = readFileSync(resolve(RUNTIME_DIR, "src/app.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(app).not.toMatch(/\b(Easy|Medium|Hard|Expert)\b/);
    expect(app).not.toMatch(/tutorial|countdown|elapsed/i);
  });

  it("keeps the animation layer out of game decisions", () => {
    // The 3D code never imports the engine, the online client or the robot, and
    // only reads TUG_LIMIT from the tug model.
    for (const file of GAME_MODULES.filter((name) => name.startsWith("scene3d/") || name === "scene-composite.js")) {
      const source = readFileSync(resolve(RUNTIME_DIR, "src", file), "utf8");
      expect(source, file).not.toMatch(/from\s+["']\.\.?\/(online|robot|questions|answer|panel|app)\.js["']/);
      expect(source, file).not.toMatch(/createLocalMatch|submit\(|tug_submit|winner\s*=\s*["']/);
    }
    const tugImport = readFileSync(resolve(RUNTIME_DIR, "src/scene3d/constants.js"), "utf8").match(/import \{([^}]+)\} from "\.\.\/tug\.js"/);
    expect(tugImport?.[1].trim()).toBe("TUG_LIMIT");
  });
});
