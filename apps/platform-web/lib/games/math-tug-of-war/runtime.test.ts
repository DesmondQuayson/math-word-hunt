// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MATH_TUG_OF_WAR_RUNTIME_SHA256, renderMathTugOfWarDocument } from "@/features/games/math-tug-of-war/document";
import { createInternalGameResponse, getInternalGameRegistration } from "@/lib/games/internal-registry";

const RUNTIME_DIR = resolve(__dirname, "../../../public/internal-games/math-tug-of-war");

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
    expect(csp).not.toContain("unsafe-eval");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    const body = await response.text();
    expect(body).toBe(renderMathTugOfWarDocument());
    expect(body).toContain('<base href="/internal-games/math-tug-of-war/"');
    expect(body).toContain(`src="./src/app.js?v=${MATH_TUG_OF_WAR_RUNTIME_SHA256.slice(0, 16)}"`);
    expect(body).not.toMatch(/https?:\/\//);
    expect(body).not.toContain("iframe");
    expect(body).not.toMatch(/<script(?![^>]*type="module"[^>]*src=)/);
  });

  it("ships no third-party code, network hosts, eval or raw HTML sinks in the runtime", () => {
    const files = ["app.js", "answer.js", "audio.js", "dom.js", "online.js", "panel.js", "questions.js", "random.js", "robot.js", "scene.js", "tug.js", "version.js"];
    for (const file of files) {
      const source = readFileSync(resolve(RUNTIME_DIR, "src", file), "utf8");
      expect(source, file).not.toMatch(/\binnerHTML\b|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
      expect(source.replace("http://www.w3.org/2000/svg", ""), file).not.toMatch(/https?:\/\//);
      expect(source, file).not.toMatch(/\bimport\s*\(|from\s+["'](?!\.\/)/);
    }
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
});
