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
  "assets/index-DXexJzA-.js": "1801220e5b7688626aaf926c7f023f3bc2d108d9f91bdb5426f142e9726fabda"
});
const musicHash = "6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369";

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
      "By Eric Matyas · CC BY 3.0. The verified MP3 derivative is self-hosted and loops through the browser's native audio player."
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
  assert.equal((source.match(/createBufferSource\(/g) ?? []).length, 0, "background music must not create a Web Audio buffer source");
  assert.equal((source.match(/createOscillator\(/g) ?? []).length, 1, "Web Audio remains available for sound effects");
  assert.ok(source.includes("musicVolume:.35"));
  assert.ok(source.includes("soundEffectsVolume:.6"));
  for (const credit of ["Cosmic Candy Catchers", "Eric Matyas", "CC BY 3.0", "https://soundimage.org/"]) assert.ok(source.includes(credit), credit);
  assert.ok(source.includes("loops through the browser's native audio player"));
  assert.doesNotMatch(source, /in-memory seam crossfade/);
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
  assert.ok(source.includes(".then(()=>`UNLOCKED`,e=>"), "a fulfilled resume contract must not be misclassified before Safari publishes its state transition");
});

test("one gesture-synchronous HTMLMedia music backend serves every browser without duplicate sources", () => {
  const source = readFileSync(resolve(nativeRoot, "assets/index-DXexJzA-.js"), "utf8");
  const documentSource = readFileSync(resolve(repositoryRoot, "apps/platform-web/features/games/number-logic/document.ts"), "utf8");
  assert.doesNotMatch(documentSource, /media-fallback|runtime-music/);
  assert.match(documentSource, /const RUNTIME_SHA256 = "1801220e5b7688626aaf926c7f023f3bc2d108d9f91bdb5426f142e9726fabda";/);
  assert.match(documentSource, /const RUNTIME_SRC = `\.\/assets\/index-DXexJzA-\.js\?v=\$\{RUNTIME_SHA256\}`;/);
  assert.match(documentSource, /<script type="module" src="\$\{RUNTIME_SRC\}"><\/script>/);

  for (const contract of [
    "ensureMusicElement(e)",
    "new globalThis.Audio",
    "e.preload=`none`",
    "primeMusic(e,t=!1)",
    "primeMusic(this.assetUrl,!0)",
    "this.mediaPlayPromise",
    "this.musicRequestId",
    "this.musicPlayAttempts",
    "__MATHNEXA_NUMBER_LOGIC_MUSIC__",
    "snapshot:()=>e.musicStatus()",
    "currentTime:Number.isFinite",
    "mediaElements:e?1:0",
    "activeSources:e&&!e.paused?1:0",
    "muted:e?.muted??this.masterMuted",
    "volume:e?.volume??this.musicVolume*so",
    "blocked:this.mediaGestureBlocked??!1",
    "fatal:this.mediaFatal??!1",
    "this.musicElement.removeAttribute(`src`)",
    "this.musicElement.load()",
    ".then(()=>`UNLOCKED`,e=>",
    "globalThis.AudioContext??globalThis.webkitAudioContext",
    "if(!this.AudioContextClass)return Promise.resolve(`UNLOCKED`)",
    "if(!this.AudioContextClass)return;let t=this.ensureContext()",
    "window.addEventListener(`pagehide`,n)",
    "t.persisted?e.setDocumentHidden(!0):e.dispose()",
    "window.addEventListener(`pageshow`,r)",
    "t.persisted&&e.setDocumentHidden(document.hidden)",
    "window.removeEventListener(`pageshow`,r)",
    "onPointerDownCapture",
    "onKeyDownCapture",
  ]) assert.ok(source.includes(contract), contract);

  assert.ok(source.includes("this.backend.primeMusic(this.assetUrl,!0),this.playback!==`UNAVAILABLE`"));
  assert.ok(source.includes("setMusicEnabled(e){this.update({musicEnabled:e}),e?this.activate()"));
  assert.ok(source.includes("if(this.mediaPlayPromise)return this.mediaPlayPromise"));
  assert.ok(source.includes("this.mediaFatal=!0,this.onStatusChange?.()"));
  assert.ok(source.includes("this.permission=`UNAVAILABLE`,this.playback=`UNAVAILABLE`"));
  assert.ok(source.includes("e.emitApprovedGameEvent({type:`mode_preview_opened`,mode:t}),window.scrollTo"));
  assert.doesNotMatch(source, /mode_preview_opened`,mode:t\}\),D\.activate\(\)/);
  assert.equal((source.match(/new globalThis\.Audio/g) ?? []).length, 1);
  assert.doesNotMatch(source, /t\.state===`running`\?`UNLOCKED`:`BLOCKED`|media-fallback/);
});

test("the shipped music backend retries only on a later gesture and preserves one honest media lifecycle", async () => {
  const source = readFileSync(resolve(nativeRoot, "assets/index-DXexJzA-.js"), "utf8");
  const start = source.indexOf("lo=class{");
  const end = source.indexOf(",bo=new URL(", start);
  assert.ok(start >= 0 && end > start, "audio backend and manager must remain extractable from the approved bundle");

  const audioInstances = [];
  const playPlan = ["blocked", "success"];
  class FakeAudio {
    constructor() {
      this.src = "";
      this.paused = true;
      this.loop = false;
      this.preload = "";
      this.playsInline = false;
      this.currentTime = 0;
      this.volume = 1;
      this.muted = false;
      this.error = null;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this.loadCalls = 0;
      this.listeners = new Map();
      audioInstances.push(this);
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    removeEventListener(name, listener) { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
    removeAttribute(name) { if (name === "src") this.src = ""; }
    load() { this.loadCalls += 1; }
    pause() { this.paused = true; this.pauseCalls += 1; }
    play() {
      this.playCalls += 1;
      const outcome = playPlan.shift() ?? "success";
      if (outcome === "blocked") return Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
      if (outcome === "fatal") return Promise.reject(new DOMException("Codec unavailable", "NotSupportedError"));
      this.paused = false;
      this.currentTime += 0.25;
      return Promise.resolve();
    }
  }
  class FakeWebkitAudioContext {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { setValueAtTime() {} }, connect() {} }; }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
  }
  const sandbox = {
    Audio: FakeAudio,
    webkitAudioContext: FakeWebkitAudioContext,
    DOMException,
    structuredClone,
    performance,
  };
  runInNewContext(
    `var so=.92,q=.08,co={};var ${source.slice(start, end)};globalThis.__audioExports={Backend:lo,Manager:_o,MemoryStorage:yo};`,
    sandbox,
  );
  const { Backend, Manager, MemoryStorage } = sandbox.__audioExports;
  const settings = {
    version: "number-logic-audio/1",
    masterMuted: false,
    musicEnabled: true,
    musicVolume: 0.35,
    soundEffectsEnabled: true,
    soundEffectsVolume: 0.6,
  };

  const prefixedBackend = new Backend();
  assert.equal(prefixedBackend.AudioContextClass, FakeWebkitAudioContext, "webkitAudioContext remains the Safari sound-effect constructor");
  await prefixedBackend.dispose();

  const storage = new MemoryStorage(settings);
  const backend = new Backend(null);
  const manager = new Manager("/internal-games/number-logic/assets/oldskool-cc0-CQNT44Pl.mp3", storage, backend);
  assert.equal(audioInstances.length, 0, "route mount must not create or request media");
  await manager.activate();
  assert.equal(audioInstances.length, 1);
  assert.equal(audioInstances[0].playCalls, 1, "one rejected gesture is not retried in a hidden loop");
  assert.deepEqual({ permission: manager.snapshot().permission, playback: manager.snapshot().playback }, { permission: "LOCKED", playback: "IDLE" });
  assert.deepEqual(
    { blocked: backend.musicStatus().blocked, fatal: backend.musicStatus().fatal, activeSources: backend.musicStatus().activeSources },
    { blocked: true, fatal: false, activeSources: 0 },
  );

  await manager.activate();
  assert.equal(audioInstances[0].playCalls, 2, "the next eligible gesture retries once");
  assert.equal(audioInstances[0].currentTime, 0.25, "successful media playback advances");
  assert.deepEqual(
    { permission: manager.snapshot().permission, playback: manager.snapshot().playback, active: backend.musicStatus().activeSources },
    { permission: "UNLOCKED", playback: "PLAYING", active: 1 },
  );
  await Promise.all([manager.activate(), manager.activate(), manager.activate()]);
  assert.equal(audioInstances[0].playCalls, 2, "rapid gestures reuse the playing element without overlap");
  assert.equal(audioInstances.length, 1);

  manager.setMusicEnabled(false);
  assert.equal(backend.musicStatus().activeSources, 0);
  assert.equal(storage.read().musicEnabled, false);
  const persistedOff = storage.read();
  await manager.dispose();
  assert.deepEqual(
    { disposed: backend.musicStatus().disposed, mediaElements: backend.musicStatus().mediaElements, hasSource: backend.musicStatus().hasSource },
    { disposed: true, mediaElements: 0, hasSource: false },
  );
  assert.equal(audioInstances[0].listeners.size, 0, "navigation disposal removes the media error listener");
  assert.ok(audioInstances[0].loadCalls >= 1, "navigation disposal releases the source");

  const reloadedBackend = new Backend(null);
  const reloadedStorage = new MemoryStorage(persistedOff);
  const reloadedManager = new Manager("/internal-games/number-logic/assets/oldskool-cc0-CQNT44Pl.mp3", reloadedStorage, reloadedBackend);
  await reloadedManager.activate();
  assert.equal(reloadedBackend.musicStatus().mediaElements, 0, "stored OFF survives reload without creating media");
  reloadedManager.setMusicEnabled(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(reloadedStorage.read().musicEnabled, true);
  assert.equal(reloadedBackend.musicStatus().activeSources, 1);
  assert.equal(audioInstances.length, 2, "OFF/ON creates only the one element owned by the new document");

  reloadedManager.setDocumentHidden(true);
  assert.equal(reloadedBackend.musicStatus().activeSources, 0, "BFCache-style hiding pauses music");
  reloadedManager.setDocumentHidden(false);
  await reloadedManager.reconcile();
  assert.equal(reloadedBackend.musicStatus().activeSources, 1, "returning from visibility pause reuses the source");

  const activeAudio = audioInstances[1];
  activeAudio.error = { code: 3, message: "Decode failed" };
  activeAudio.listeners.get("error")();
  assert.deepEqual(
    { playback: reloadedManager.snapshot().playback, permission: reloadedManager.snapshot().permission, active: reloadedBackend.musicStatus().activeSources, fatal: reloadedBackend.musicStatus().fatal },
    { playback: "UNAVAILABLE", permission: "UNAVAILABLE", active: 0, fatal: true },
  );
  assert.match(reloadedManager.snapshot().error, /MediaError 3/);
  await reloadedManager.dispose();

  const silentBackend = new Backend(null);
  const silentManager = new Manager("/internal-games/number-logic/assets/oldskool-cc0-CQNT44Pl.mp3", new MemoryStorage({ ...settings, musicVolume: 0 }), silentBackend);
  await silentManager.activate();
  assert.equal(silentBackend.musicStatus().currentTime, 0.25, "explicit zero volume still advances and is distinct from failed playback");
  assert.equal(silentBackend.musicStatus().volume, 0, "the user's explicit zero-volume state is not rewritten");
  assert.equal(silentManager.snapshot().settings.musicVolume, 0);
  await silentManager.dispose();
});

test("only production runtime assets ship and navigation stays native", () => {
  const shipped = files(nativeRoot).map((path) => relative(nativeRoot, path).replaceAll("\\", "/")).sort();
  assert.deepEqual(shipped, [
    "assets/index-0S0ADVv9.css",
    "assets/index-DXexJzA-.js",
    "assets/oldskool-cc0-CQNT44Pl.mp3",
    "integration.css"
  ]);
  assert.equal(shipped.some((path) => path.endsWith(".map") || path.endsWith(".zip")), false);
  const integration = readFileSync(resolve(nativeRoot, "integration.css"), "utf8");
  assert.match(integration, /min-height:\s*44px/);
});
