// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MATH_RACE_CHAMPIONS_RUNTIME_SHA256, renderMathRaceChampionsDocument, renderMathRaceChampionsJoinDocument } from "@/features/games/math-race-champions/document";

import { runtimeFiles, runtimeHash } from "../../../../../scripts/math-race-champions-runtime-hash.mjs";

const files: string[] = runtimeFiles();
const source = (name: string) => readFileSync(files.find((path) => path.replace(/\\/g, "/").endsWith(`/src/${name}`))!, "utf8");

/** Every module a module can reach through STATIC imports (dynamic imports are loaded on demand). */
function staticGraph(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const folder = entry.split("/").slice(0, -1);
  for (const match of source(entry).matchAll(/^import\s[^;]*?from\s+"(\.[^"]+)";/gm)) {
    const parts = [...folder];
    for (const piece of match[1]!.split("/")) {
      if (piece === "..") parts.pop();
      else if (piece !== ".") parts.push(piece);
    }
    const target = parts.join("/");
    // Modules of other games (the shared emoji, QR and three.js files) end the walk.
    if (files.some((path) => path.replace(/\\/g, "/").endsWith(`/math-race-champions/src/${target}`))) staticGraph(target, seen);
    else seen.add(`external:${match[1]}`);
  }
  return seen;
}

describe("the game documents", () => {
  it("load only same-origin files", () => {
    for (const html of [renderMathRaceChampionsDocument(), renderMathRaceChampionsJoinDocument()]) {
      expect(html).toContain('src="/internal-games/math-race-champions/src/');
      expect(html).not.toMatch(/(src|href)="https?:/);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
    }
  });

  it("have no inline script", () => {
    for (const html of [renderMathRaceChampionsDocument(), renderMathRaceChampionsJoinDocument()]) {
      expect(/<script(?![^>]*\bsrc=)[^>]*>/.test(html)).toBe(false);
    }
  });

  it("the game and the join screen start different entries", () => {
    expect(renderMathRaceChampionsDocument()).toContain("src/app.js");
    expect(renderMathRaceChampionsJoinDocument()).toContain("src/join.js");
    expect(renderMathRaceChampionsJoinDocument()).toContain('data-role="join"');
  });

  it("the page body does not share a class with any screen", () => {
    expect(renderMathRaceChampionsDocument()).toContain('<body class="math-race"');
    const css = readFileSync(files.find((path) => path.endsWith("styles.css"))!, "utf8");
    expect(css).not.toMatch(/^\.math-race\b/m);
  });

  it("is versioned by a hash of every runtime file", () => {
    expect(runtimeHash()).toBe(MATH_RACE_CHAMPIONS_RUNTIME_SHA256);
  });
});

describe("the runtime", () => {
  it("contacts no third party and uses no eval", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const urls = text.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      for (const url of urls) expect(url.startsWith("http://www.w3.org/"), `${file}: ${url}`).toBe(true);
      expect(/\beval\(|new Function\(/.test(text), file).toBe(false);
      expect(/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write/.test(text), file).toBe(false);
    }
  });

  it("opening the game, or Classroom Competition, downloads no 3D code, no shop and no online room code", () => {
    for (const entry of ["app.js", "hub.js", "how-to.js", "classroom/setup.js", "classroom/classroom.js"]) {
      const graph = [...staticGraph(entry)];
      expect(graph.filter((name) => /vendor\/three|scene3d\//.test(name)), entry).toEqual([]);
      expect(graph.filter((name) => /^(computer|online|race)\//.test(name)), entry).toEqual([]);
    }
  });

  it("loads the 3D library only through dynamic imports: the race screen, the garage, and a warm-up in the lobby", () => {
    const users = files
      .map((path) => path.replace(/\\/g, "/").split("/math-race-champions/src/")[1])
      .filter((name): name is string => Boolean(name) && !name.startsWith("scene3d/") && /scene3d\//.test(source(name)));
    expect(users.sort()).toEqual(["computer/garage.js", "online/lobby.js", "race/race-screen.js"]);
    for (const name of users) {
      expect(source(name)).not.toMatch(/^import [^;]*scene3d\//m);
      expect(source(name)).toMatch(/import\("\.\.\/scene3d\/(quality|world)\.js"\)/);
    }
    for (const name of ["race/drivers.js", "computer/stages.js", "computer/start.js", "online/lobby.js", "online/online-driver.js", "online/create.js", "progress.js", "palette.js"]) {
      expect([...staticGraph(name)].filter((item) => /vendor\/three|scene3d\//.test(item)), name).toEqual([]);
    }
  });

  it("the join screen never loads the garage, the shop or the stages", () => {
    const graph = [...staticGraph("join.js"), ...staticGraph("online/join-form.js"), ...staticGraph("online/lobby.js"), ...staticGraph("race/race-screen.js")];
    expect(graph.filter((name) => /^computer\/|^account\.js$|^progress\.js$/.test(name))).toEqual([]);
    expect(source("join.js")).not.toMatch(/import\([^)]*(garage|computer\/|progress|account)/);
  });

  it("the garage shows the model the race drives: one builder for both", () => {
    expect(source("scene3d/showroom.js")).toContain('import { buildCar } from "./cars.js";');
    expect(source("scene3d/world.js")).toContain('import { buildCar } from "./cars.js";');
    for (const name of files.map((path) => path.replace(/\\/g, "/").split("/math-race-champions/")[1]!)) {
      expect(/\.(png|jpe?g|webp|avif|gltf|glb)["'`]/.test(readFileSync(files.find((path) => path.replace(/\\/g, "/").endsWith(name))!, "utf8")), name).toBe(false);
    }
  });

  it("an Online Race never reads the garage or a garage car", () => {
    for (const name of ["online/online-driver.js", "online/lobby.js", "online/create.js", "online/join-form.js", "online/people.js"]) {
      const text = source(name);
      expect(text, name).not.toMatch(/\bCARS\b|getCar\(|equipped|purchase|account\.js/);
    }
    expect(source("online/online-driver.js")).toContain("ONLINE_CAR");
  });

  it("uses the approved MathNexa music with its credit, started by the first gesture", () => {
    const audio = source("audio.js");
    expect(audio).toContain('path: "/media/audio/cosmic-candy-catchers.mp3"');
    expect(audio).toContain('title: "Cosmic Candy Catchers"');
    expect(audio).toContain('author: "Eric Matyas"');
    expect(audio).toContain('license: "CC BY 3.0"');
    expect(source("hub.js")).toContain("MUSIC_CREDIT");
    const shell = source("shell.js");
    expect(shell).toMatch(/for \(const type of \["pointerdown", "keydown"\]\)/);
    expect(shell).toContain("audio.activate()");
  });
});
