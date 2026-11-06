// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MATH_BINGO_LIVE_RUNTIME_SHA256,
  renderMathBingoLiveHostDocument,
  renderMathBingoLivePlayerDocument
} from "@/features/games/math-bingo-live/document";
import { createInternalDocumentResponse } from "@/lib/games/internal-registry";

const runtimeRoot = resolve(__dirname, "../../../public/internal-games/math-bingo-live");

function runtimeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? runtimeFiles(path) : /\.(js|css)$/.test(name) ? [path] : [];
  });
}

describe("Math Bingo Live documents", () => {
  it("version their entry URLs with the runtime content hash", async () => {
    const script = await import("../../../../../scripts/math-bingo-live-runtime-hash.mjs");
    expect(script.runtimeHash()).toBe(MATH_BINGO_LIVE_RUNTIME_SHA256);
    const version = MATH_BINGO_LIVE_RUNTIME_SHA256.slice(0, 16);
    expect(renderMathBingoLiveHostDocument()).toContain(`src="/internal-games/math-bingo-live/src/host.js?v=${version}"`);
    expect(renderMathBingoLivePlayerDocument()).toContain(`src="/internal-games/math-bingo-live/src/player.js?v=${version}"`);
  });

  it("are inert HTML: no inline script, no <base>, no third-party URL", () => {
    for (const html of [renderMathBingoLiveHostDocument(), renderMathBingoLivePlayerDocument()]) {
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
      expect(html).not.toContain("<base");
      expect(html).not.toMatch(/https?:\/\//);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    }
  });

  it("are served same-origin only, unframeable and uncached", () => {
    const headers = createInternalDocumentResponse(renderMathBingoLivePlayerDocument(), "'self'").headers;
    const csp = headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("cache-control")).toContain("no-store");
    expect(headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("the runtime never reaches another origin and never builds markup from strings", () => {
    for (const file of runtimeFiles(runtimeRoot)) {
      const source = readFileSync(file, "utf8");
      // The only URL allowed is MathNexa's own canonical origin, which the
      // teacher's QR code points students to (join-link.js); nothing fetches it.
      expect(source, file).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg|mathnexa\.com")/);
      expect(source, file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
      expect(source, file).not.toMatch(/new WebSocket|EventSource/);
    }
  });
});
