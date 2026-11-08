// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { POLYGON_SHOWDOWN_RUNTIME_SHA256, renderPolygonShowdownDocument, renderPolygonShowdownJoinDocument } from "@/features/games/polygon-showdown/document";

import { runtimeFiles, runtimeHash } from "../../../../../scripts/polygon-showdown-runtime-hash.mjs";

describe("the game documents", () => {
  it("load only same-origin files", () => {
    for (const html of [renderPolygonShowdownDocument(), renderPolygonShowdownJoinDocument()]) {
      expect(html).toContain('src="/internal-games/polygon-showdown/src/');
      expect(html).not.toMatch(/(src|href)="https?:/);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
    }
  });

  it("have no inline script", () => {
    for (const html of [renderPolygonShowdownDocument(), renderPolygonShowdownJoinDocument()]) {
      expect(/<script(?![^>]*\bsrc=)[^>]*>/.test(html)).toBe(false);
    }
  });

  it("the app and the join screen start different entries", () => {
    expect(renderPolygonShowdownDocument()).toContain("src/app.js");
    expect(renderPolygonShowdownJoinDocument()).toContain("src/join.js");
  });

  it("is versioned by a hash of every runtime file", () => {
    expect(runtimeHash()).toBe(POLYGON_SHOWDOWN_RUNTIME_SHA256);
  });
});

describe("the runtime", () => {
  const files = runtimeFiles();

  it("contacts no third party and uses no eval", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const urls = text.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      for (const url of urls) expect(url.startsWith("http://www.w3.org/"), `${file}: ${url}`).toBe(true);
      expect(/\beval\(|new Function\(/.test(text), file).toBe(false);
    }
  });

  it("keeps the 3D renderer out of the gameplay screens", () => {
    for (const name of ["board-view.js", "local-game.js", "solo.js", "showdown.js", "join.js"]) {
      const file = files.find((path) => path.replace(/\\/g, "/").endsWith(`/src/${name}`))!;
      const text = readFileSync(file, "utf8");
      expect(text, name).not.toMatch(/vendor\/three|avatar\/stage|avatar-preview/);
    }
  });

  it("loads the 3D renderer only through a dynamic import", () => {
    const file = files.find((path) => path.replace(/\\/g, "/").endsWith("/src/avatar-preview.js"))!;
    const text = readFileSync(file, "utf8");
    expect(text).toContain('import("./avatar/stage.js")');
    expect(text).not.toMatch(/^import .*avatar\/stage/m);
  });
});
