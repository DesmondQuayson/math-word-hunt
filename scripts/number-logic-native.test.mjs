import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import { applyNumberLogicHotfix } from "./apply-number-logic-hotfix.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = resolve(repositoryRoot, "apps/platform-web/public/internal-games/number-logic");
const standaloneRoot = process.env.NUMBER_LOGIC_SOURCE_DIR
  ? resolve(process.env.NUMBER_LOGIC_SOURCE_DIR)
  : resolve(repositoryRoot, "..", "..", "Number Logic");

const assetHashes = Object.freeze({
  "assets/index-0S0ADVv9.css": "d29f4a432ea37e570e61ed9d83720ab0107922fc9f6ca15e0c3db54e20d2be29",
  "assets/index-DXexJzA-.js": "963c14f064885b972c303e90bd412f71e4eba11865c2285d741e99b81d42dc20"
});
const musicHash = "6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369";
const fallbackHashes = Object.freeze({
  "media-fallback-loader.js": "6cc6703116a285930a7c74bf0d0aa19a8f53e0c3242434746e1678e8360e198e",
  "media-fallback.js": "724096ee7ec42343fb4ae77567a93680d582e8c0ea5863ce1eefd60833857d54"
});

const sourceAggregates = Object.freeze({
  math: "0f125d147d628173dd883235b230186ba5617be49c00f3c8c2212977dc28c2a5",
  resultContracts: "36f2f20505c80774c1815d6291b37e9d494c8d23da363025ec15ed42a86615a5",
  hostStorage: "85979ddd233322299622a4f62fb49c86a76b2ee55cf9d1c965ff04bc2512c2ea",
  audio: "e92c78621f54e7e7b584a3036a3278cf10f427acfd635fb4c97de56f6f149895"
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function runtimeFiles(...directories) {
  return directories.flatMap((directory) => files(resolve(standaloneRoot, directory)))
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(path));
}

function aggregate(paths) {
  const entries = paths.map((path) => ({
    path: relative(standaloneRoot, path).replaceAll("\\", "/"),
    hash: sha256(readFileSync(path))
  })).sort((left, right) => left.path.localeCompare(right.path));
  return sha256(entries.map(({ path, hash }) => `${path}\0${hash}\n`).join(""));
}

function withCurrentMusicCredit(source) {
  return source
    .replace("Oldskool · Of Far Different Nature", "Cosmic Candy Catchers · Eric Matyas")
    .replace("children:`Oldskool`", "children:`Cosmic Candy Catchers`")
    .replace(
      "By Of Far Different Nature · CC0 1.0 Universal. The exact original MP3 is self-hosted and looped with a local in-memory seam crossfade.",
      "By Eric Matyas · CC BY 3.0. The verified MP3 derivative is self-hosted and looped with a local in-memory seam crossfade."
    )
    .replace("https://opengameart.org/content/oldskool", "https://soundimage.org/")
    .replace("View the verified Oldskool source on OpenGameArt", "Visit the credited artist at SoundImage");
}

test("the native code and styles retain the verified standalone build with only the approved deterministic adaptations", () => {
  for (const [path, hash] of Object.entries(assetHashes)) {
    const nativePath = resolve(nativeRoot, path);
    assert.equal(sha256(readFileSync(nativePath)), hash, path);
    if (existsSync(standaloneRoot)) {
      const standalone = readFileSync(resolve(standaloneRoot, "dist", path));
      const expected = path.endsWith(".js")
        ? Buffer.from(applyNumberLogicHotfix(withCurrentMusicCredit(standalone.toString("utf8"))))
        : standalone;
      assert.deepEqual(readFileSync(nativePath), expected, path);
    }
  }
  const music = resolve(nativeRoot, "assets/oldskool-cc0-CQNT44Pl.mp3");
  assert.equal(sha256(readFileSync(music)), musicHash);
  assert.equal(statSync(music).size, 1_024_417);
  for (const [path, hash] of Object.entries(fallbackHashes)) {
    assert.equal(sha256(readFileSync(resolve(nativeRoot, path))), hash, path);
  }
});

test("approved mathematical, result, adapter, and audio sources have no native drift", (context) => {
  if (!existsSync(resolve(standaloneRoot, "src"))) {
    context.diagnostic("Standalone checkout unavailable; checked-in aggregate and asset hashes remain authoritative.");
    return;
  }
  const math = runtimeFiles("src/core", "src/modes").filter((path) => path.endsWith(".ts"));
  assert.equal(aggregate(math), sourceAggregates.math, "mathematical engine aggregate");
  assert.equal(aggregate(runtimeFiles("src/core/contracts", "src/progress")), sourceAggregates.resultContracts, "result contracts aggregate");
  assert.equal(aggregate(runtimeFiles("src/adapters")), sourceAggregates.hostStorage, "host and storage aggregate");
  assert.equal(aggregate(runtimeFiles("src/audio")), sourceAggregates.audio, "audio aggregate");
});

test("one bundle retains all six modes, exact contracts, and collision-safe storage", () => {
  const source = readFileSync(resolve(nativeRoot, "assets/index-DXexJzA-.js"), "utf8");
  for (const mode of ["lines-of-3", "u-sums", "magic-h", "equal-sums", "square-sums", "product-square"]) {
    assert.match(source, new RegExp(`\\b${mode.replaceAll("-", "\\-")}\\b`), mode);
  }
  for (const contract of [
    "cross-mode-result/1.0.0",
    "number-logic-progress/1",
    "number-logic-audio/1",
    "mathnexa:number-logic:v1:app",
    "mathnexa:number-logic-progress:1",
    "mathnexa:number-logic-audio:1"
  ]) assert.ok(source.includes(contract), contract);
  assert.equal((source.match(/createBufferSource\(/g) ?? []).length, 1);
  assert.ok(source.includes("musicVolume:.35"));
  assert.ok(source.includes("soundEffectsVolume:.6"));
  for (const credit of ["Cosmic Candy Catchers", "Eric Matyas", "CC BY 3.0", "https://soundimage.org/"]) assert.ok(source.includes(credit), credit);
  assert.doesNotMatch(source, /Oldskool|Of Far Different Nature|opengameart\.org\/content\/oldskool/);
  assert.doesNotMatch(source, /number-cross|MATHNEXA_GAME_LAUNCH_SECRET|localhost|[A-Za-z]:\\\\/);
});

test("the Lines of 3 tutorial and gesture-gated audio hotfix remain deterministic", () => {
  const source = readFileSync(resolve(nativeRoot, "assets/index-DXexJzA-.js"), "utf8");
  assert.equal(applyNumberLogicHotfix(source), source, "hotfix must be idempotent");
  for (const tutorialContract of [
    "lines-of-3/tutorial-v2",
    "Make every line match.",
    "7 + ? + 3 = 12",
    "? = 2",
    "Place each number once.",
    "Five green lines means solved.",
    "All five routes = 12",
    'role:"progressbar"',
    '"aria-valuemin":1',
    '"aria-valuemax":3',
    '"aria-valuenow":n+1',
    '"aria-valuetext":"Step "+(n+1)+" of 3"',
  ]) assert.ok(source.includes(tutorialContract), tutorialContract);
  assert.doesNotMatch(source, /lines-of-3\/tutorial-v1|One shared total|4 \+ \? \+ 7/);
  assert.ok(source.includes("initialize(){return Promise.resolve()}"), "mount must not create a pre-gesture AudioContext");
  assert.ok(source.includes("t.state===`running`?`UNLOCKED`:`BLOCKED`"), "resume must verify the real context state");
});

test("the parser-blocking media fallback is conditional, same-origin, single-source, and lifecycle safe", async () => {
  const documentSource = readFileSync(resolve(repositoryRoot, "apps/platform-web/features/games/number-logic/document.ts"), "utf8");
  const loaderSource = readFileSync(resolve(nativeRoot, "media-fallback-loader.js"), "utf8");
  const fallbackSource = readFileSync(resolve(nativeRoot, "media-fallback.js"), "utf8");
  const loaderIndex = documentSource.indexOf('<script src="./media-fallback-loader.js"></script>');
  const moduleIndex = documentSource.indexOf('<script type="module" src="./assets/index-DXexJzA-.js"></script>');
  assert.ok(loaderIndex >= 0 && loaderIndex < moduleIndex, "fallback capability loader must precede the module bundle");
  assert.match(loaderSource, /typeof window\.AudioContext === "function"/);
  assert.match(loaderSource, /typeof window\.webkitAudioContext === "function"/);
  assert.match(loaderSource, /document\.write\('<script src="\.\/media-fallback\.js"/);

  const nativeWrites = [];
  function NativeAudioContext() {}
  runInNewContext(loaderSource, {
    window: { AudioContext: NativeAudioContext },
    document: { write: (value) => nativeWrites.push(value) }
  });
  assert.deepEqual(nativeWrites, [], "native Web Audio must remain untouched");

  const webkitOnlyWrites = [];
  function NativeWebkitAudioContext() {}
  const webkitOnlyWindow = { webkitAudioContext: NativeWebkitAudioContext };
  runInNewContext(loaderSource, {
    window: webkitOnlyWindow,
    document: { write: (value) => webkitOnlyWrites.push(value) }
  });
  assert.deepEqual(webkitOnlyWrites, [], "prefixed native Web Audio must not load the media fallback");
  assert.equal(webkitOnlyWindow.AudioContext, NativeWebkitAudioContext, "the bundle must receive Safari's native constructor under the standards name");

  const fallbackWrites = [];
  runInNewContext(loaderSource, {
    window: {},
    document: { write: (value) => fallbackWrites.push(value) }
  });
  assert.deepEqual(fallbackWrites, ['<script src="./media-fallback.js" data-number-logic-media-fallback></script>']);

  const listeners = new Map();
  const storage = new Map();
  const audioInstances = [];
  const root = { contains: () => true };
  class FakeAudio {
    constructor(source) {
      this.src = source;
      this.paused = true;
      this.ended = false;
      this.currentTime = 0;
      this.loop = false;
      this.muted = false;
      this.volume = 1;
      audioInstances.push(this);
    }
    canPlayType(type) { return type === "audio/mpeg" ? "probably" : ""; }
    setAttribute() {}
    removeAttribute(name) { if (name === "src") this.src = ""; }
    addEventListener(name, listener) { listeners.set(`audio:${name}`, listener); }
    removeEventListener(name) { listeners.delete(`audio:${name}`); }
    load() {}
    play() {
      this.paused = false;
      this.currentTime += 0.125;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  const document = {
    baseURI: "https://mathnexa.test/internal-games/number-logic/",
    hidden: false,
    getElementById: (id) => id === "root" ? root : null,
    addEventListener: (name, listener) => listeners.set(`document:${name}`, listener),
    removeEventListener: (name) => listeners.delete(`document:${name}`)
  };
  const window = {
    location: { origin: "https://mathnexa.test" },
    addEventListener: (name, listener) => listeners.set(`window:${name}`, listener),
    removeEventListener: (name) => listeners.delete(`window:${name}`)
  };
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  };
  runInNewContext(fallbackSource, { window, document, localStorage, Audio: FakeAudio, URL, DOMException });
  const hook = window.__MATHNEXA_NUMBER_LOGIC_MEDIA_FALLBACK__;
  assert.ok(Object.isFrozen(hook));
  const initialSnapshot = hook.snapshot();
  assert.ok(Object.isFrozen(initialSnapshot));
  assert.deepEqual(JSON.parse(JSON.stringify(initialSnapshot)), {
    supported: true,
    contextState: "suspended",
    contextCount: 0,
    mediaElements: 1,
    sourceAssigned: false,
    activeSources: 0,
    paused: true,
    currentTime: 0,
    loop: true,
    muted: false,
    volume: 0.35 * 0.92,
    musicEnabled: true,
    masterMuted: false,
    playAttempts: 0,
    successfulStarts: 0,
    pauseCount: 0,
    lastError: null,
    listenersInstalled: true
  });
  assert.equal(hook.source, "/internal-games/number-logic/assets/oldskool-cc0-CQNT44Pl.mp3");
  assert.equal(audioInstances.length, 1);

  listeners.get("document:keydown")({ type: "keydown", key: "Enter", target: root });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(hook.snapshot().activeSources, 1);
  assert.equal(hook.snapshot().currentTime, 0.125);
  assert.equal(hook.snapshot().sourceAssigned, true, "the source must be assigned inside the trusted gesture");

  const context = new window.AudioContext();
  const firstSource = context.createBufferSource();
  firstSource.start();
  await Promise.resolve();
  assert.equal(audioInstances.length, 1, "buffer-source starts must reuse the one HTMLMediaElement");
  assert.equal(hook.snapshot().activeSources, 1);

  storage.set("mathnexa:number-logic-audio:1", JSON.stringify({
    version: "number-logic-audio/1",
    masterMuted: false,
    musicEnabled: false,
    musicVolume: 0.35
  }));
  firstSource.stop();
  const disabledSource = context.createBufferSource();
  disabledSource.start();
  await Promise.resolve();
  assert.equal(hook.snapshot().activeSources, 0, "a persisted OFF preference must deny playback");

  storage.set("mathnexa:number-logic-audio:1", JSON.stringify({
    version: "number-logic-audio/1",
    masterMuted: false,
    musicEnabled: true,
    musicVolume: 0.5
  }));
  const enabledSource = context.createBufferSource();
  enabledSource.start();
  await Promise.resolve();
  assert.equal(hook.snapshot().activeSources, 1);
  assert.equal(hook.snapshot().volume, 0.5 * 0.92);

  storage.set("mathnexa:number-logic-audio:1", JSON.stringify({
    version: "number-logic-audio/1",
    masterMuted: true,
    musicEnabled: true,
    musicVolume: 0.5
  }));
  context.createGain().gain.setValueAtTime(0, 0);
  assert.equal(hook.snapshot().muted, true, "master mute must synchronize with persisted settings");
  listeners.get("window:pagehide")({ persisted: true });
  assert.equal(hook.snapshot().activeSources, 0);
  assert.equal(hook.snapshot().contextState, "suspended");
  assert.equal(hook.snapshot().sourceAssigned, true, "BFCache keeps the paused source available");
  listeners.get("document:keydown")({ type: "keydown", key: " ", target: root });
  await Promise.resolve();
  await Promise.resolve();
  audioInstances[0].error = { code: 3 };
  listeners.get("audio:error")();
  assert.equal(hook.snapshot().lastError, "MediaError:3");
  assert.equal(hook.snapshot().activeSources, 0);
  listeners.get("window:pagehide")({ persisted: false });
  assert.equal(hook.snapshot().listenersInstalled, false);
  assert.equal(hook.snapshot().contextState, "closed");
  assert.equal(hook.snapshot().sourceAssigned, false, "non-BFCache pagehide must release the source");
  await context.close();

  assert.doesNotMatch(fallbackSource, /https?:\/\//);
  assert.equal((fallbackSource.match(/new Audio\(/g) ?? []).length, 1);
  assert.match(fallbackSource, /audio\.preload = "none"/);
});

test("only production runtime assets ship and navigation stays native", () => {
  const shipped = files(nativeRoot).map((path) => relative(nativeRoot, path).replaceAll("\\", "/")).sort();
  assert.deepEqual(shipped, [
    "assets/index-0S0ADVv9.css",
    "assets/index-DXexJzA-.js",
    "assets/oldskool-cc0-CQNT44Pl.mp3",
    "integration.css",
    "media-fallback-loader.js",
    "media-fallback.js"
  ]);
  assert.equal(shipped.some((path) => path.endsWith(".map") || path.endsWith(".zip")), false);
  const integration = readFileSync(resolve(nativeRoot, "integration.css"), "utf8");
  assert.match(integration, /min-height:\s*44px/);
});
