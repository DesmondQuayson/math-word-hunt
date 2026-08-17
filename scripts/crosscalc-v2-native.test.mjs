import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(repositoryRoot, "apps/platform-web/public");
const nativeRoot = resolve(publicRoot, "internal-games/crosscalc-v2");
const coreRoot = resolve(repositoryRoot, "apps/platform-web/features/games/crosscalc-v2/core");
const standaloneRoot = process.env.CROSSCALC_SOURCE_DIR
  ? resolve(process.env.CROSSCALC_SOURCE_DIR)
  : resolve(repositoryRoot, "..", "..", "crosscalc");
const approvedSource = "9d27dbc21fce043569fae89ab5b4434ae2d0bac0";
const adapterSource = "8bc4704";
const assetHashes = Object.freeze({
  "assets/index-B-S_H4Ce.css": "f5c39c4c16b25b5cdd24827147449ef11c5faaa2f0f769b8a7dec3897568bdbf",
  "assets/index-B0m_QJed.js": "5bb4968416f222c3bcdebfc49844d7084d59999fd5b1efeff049a26fcaf426ac"
});
const musicHash = "6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test("V2 native production code and styles are byte-identical to the verified standalone build", () => {
  assert.equal(existsSync(standaloneRoot), true, `standalone source missing: ${standaloneRoot}`);
  for (const [path, hash] of Object.entries(assetHashes)) {
    const native = readFileSync(resolve(nativeRoot, path));
    const standalone = readFileSync(resolve(standaloneRoot, "dist", path));
    assert.equal(sha256(native), hash, path);
    assert.deepEqual(native, standalone, path);
  }
  assert.equal(sha256(readFileSync(resolve(nativeRoot, "assets/oldskool-cc0-CQNT44Pl.mp3"))), musicHash);
});

test("the auditable native TypeScript core is byte-identical to the integration-approved standalone core", () => {
  const names = readdirSync(coreRoot).filter((name) => name.endsWith(".ts")).sort();
  assert.deepEqual(names, ["arithmetic.ts", "generator.ts", "hints.ts", "progress.ts", "random.ts", "reasoning.ts", "session.ts", "solver.ts", "types.ts", "validator.ts"]);
  for (const name of names) assert.deepEqual(readFileSync(resolve(coreRoot, name)), readFileSync(resolve(standaloneRoot, "src/core", name)), name);
});

test("V2 retains its versioned provenance, result, storage, audio, and palette contracts", () => {
  const bundle = readFileSync(resolve(nativeRoot, "assets/index-B0m_QJed.js"), "utf8");
  for (const contract of ["mathnexa.crosscalc.v2", "crosscalc-result/2", "0.2.0", "number-placement", "mathnexa:game-result"]) assert.ok(bundle.includes(contract), contract);
  for (const mode of ["addition", "subtraction", "multiplication", "division", "mixed"]) assert.ok(bundle.includes(mode), mode);
  for (const difficulty of ["beginner", "easy", "medium", "hard", "expert"]) assert.ok(bundle.includes(difficulty), difficulty);
  assert.doesNotMatch(bundle, /MATHNEXA_GAME_LAUNCH_SECRET|localhost|[A-Za-z]:\\\\/);
  const styles = readFileSync(resolve(nativeRoot, "assets/index-B-S_H4Ce.css"), "utf8").toLowerCase();
  for (const color of ["#071525", "#20cfe3", "#ff4f9a"]) assert.ok(styles.includes(color), color);
});

test("only same-origin release runtime assets ship and the preview banner is explicit", () => {
  const shipped = files(nativeRoot).map((path) => relative(nativeRoot, path).replaceAll("\\", "/")).sort();
  assert.deepEqual(shipped, [
    "assets/index-B-S_H4Ce.css",
    "assets/index-B0m_QJed.js",
    "assets/oldskool-cc0-CQNT44Pl.mp3",
    "integration.css",
    "runtime-music.js"
  ]);
  assert.equal(shipped.some((path) => path.endsWith(".map") || path.endsWith(".zip")), false);
  const document = readFileSync(resolve(repositoryRoot, "apps/platform-web/features/games/crosscalc-v2/document.ts"), "utf8");
  for (const value of [approvedSource, adapterSource, "Admin Preview · Version 0.2.0", "NOT LIVE", "/internal-games/crosscalc-v2/"]) assert.ok(document.includes(value), value);
  assert.doesNotMatch(document, /iframe|https?:\/\//);
  assert.ok(document.indexOf("./assets/index-B-S_H4Ce.css") < document.indexOf("./integration.css"));
  assert.ok(document.indexOf("./runtime-music.js") < document.indexOf("./assets/index-B0m_QJed.js"));
  const integration = readFileSync(resolve(nativeRoot, "integration.css"), "utf8");
  assert.match(integration, /@media \(max-width: 560px\)[\s\S]*header \.toolbar \{ justify-content: flex-start; \}/);
  assert.match(integration, /@media \(max-width: 560px\) and \(orientation: portrait\)/);
  for (const contract of ["--cell: 48px", "overflow-x: clip", "min-height: 48px", "position: sticky", "scrollbar-gutter: stable both-edges"]) assert.ok(integration.includes(contract), contract);
  const browserSpec = readFileSync(resolve(repositoryRoot, "e2e/crosscalc-v2/native-crosscalc-v2.spec.ts"), "utf8");
  assert.match(browserSpec, /\{ width: 844, height: 390 \}/);
});

test("CrossCalc music hotfix starts one same-origin HTML media source inside the user gesture", () => {
  const runtime = readFileSync(resolve(nativeRoot, "runtime-music.js"), "utf8");
  for (const contract of [
    'new Audio()',
    'if (!audio.src) audio.src = TRACK_URL',
    'audio.play()',
    'audio.pause()',
    'audio.loop = true',
    'audio.addEventListener("playing"',
    'audio.addEventListener("error"',
    'externalControllerAvailable = suppressNativeMusic()',
    'if (!externalControllerAvailable || !suppressNativeMusic())',
    'useNativeFallback()',
    'NATIVE_FALLBACK',
    'document.addEventListener("pointerdown", requestStart',
    'document.addEventListener("keydown", requestStart',
    'target.closest(',
    'event.repeat',
    'setEnabled(control.checked)',
    'data-external-music-sources',
    'mathnexa.crosscalc.v2.music-hotfix',
    'window.__MATHNEXA_CROSSCALC_MUSIC__'
  ]) assert.ok(runtime.includes(contract), contract);
  assert.match(runtime, /new URL\("\.\/assets\/oldskool-cc0-CQNT44Pl\.mp3", document\.baseURI\)/);
  assert.match(runtime, /writePreference\(\);\s+externalControllerAvailable = suppressNativeMusic\(\);/);
  assert.ok(runtime.indexOf("writePreference();") < runtime.indexOf("suppressNativeMusic();"));
  assert.ok(runtime.indexOf("playAttempts += 1") < runtime.indexOf("audio.src = TRACK_URL"));
  assert.doesNotMatch(runtime, /https?:\/\//);
  assert.equal((runtime.match(/new Audio\(/g) ?? []).length, 1);
});

test("storage failure leaves the released native controller as the only music path", () => {
  const runtime = readFileSync(resolve(nativeRoot, "runtime-music.js"), "utf8");
  const documentListeners = new Map();
  const windowListeners = new Map();
  const attributes = new Map();
  const shell = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value)
  };
  class FakeElement { closest() { return null; } }
  class FakeInput extends FakeElement {}
  class FakeKeyboardEvent {}
  class FakeAudio {
    constructor() {
      this.src = "";
      this.paused = true;
      this.currentTime = 0;
      this.readyState = 0;
      this.networkState = 0;
      this.error = null;
      this.playCalls = 0;
      FakeAudio.instance = this;
    }
    addEventListener() {}
    canPlayType() { return "probably"; }
    load() {}
    pause() { this.paused = true; }
    play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); }
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  class FakeMutationObserver { observe() {} disconnect() {} }
  const document = {
    baseURI: "https://mathnexa.example/internal-games/crosscalc-v2/",
    body: {},
    hidden: false,
    addEventListener: (name, listener) => documentListeners.set(name, listener),
    querySelector: (selector) => selector === ".app-shell" ? shell : null
  };
  const window = {
    addEventListener: (name, listener) => windowListeners.set(name, listener)
  };
  const localStorage = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); }
  };
  runInNewContext(runtime, {
    AbortController,
    Audio: FakeAudio,
    Element: FakeElement,
    HTMLInputElement: FakeInput,
    KeyboardEvent: FakeKeyboardEvent,
    MutationObserver: FakeMutationObserver,
    URL,
    document,
    localStorage,
    queueMicrotask,
    window
  });
  const controller = window.__MATHNEXA_CROSSCALC_MUSIC__;
  assert.deepEqual(JSON.parse(JSON.stringify(controller.snapshot())), {
    enabled: true,
    paused: true,
    loop: true,
    currentTime: 0,
    playAttempts: 0,
    activeSources: 0,
    playbackState: "NATIVE_FALLBACK",
    controller: "native-fallback",
    unavailable: false,
    error: null,
    playReturnKind: "not-attempted",
    hasSource: false,
    mediaErrorCode: null,
    mediaErrorMessage: null,
    readyState: 0,
    networkState: 0,
    canPlayMpeg: "probably"
  });
  controller.start();
  controller.setEnabled(true);
  documentListeners.get("pointerdown")({ target: new FakeElement() });
  let intercepted = false;
  documentListeners.get("click")({
    target: new FakeElement(),
    preventDefault: () => { intercepted = true; },
    stopImmediatePropagation: () => { intercepted = true; }
  });
  assert.equal(FakeAudio.instance.playCalls, 0);
  assert.equal(FakeAudio.instance.src, "");
  assert.equal(intercepted, false);
  assert.equal(attributes.get("data-external-music-playback"), "NATIVE_FALLBACK");
  assert.equal(attributes.get("data-external-music-sources"), "0");

  const dynamicDocumentListeners = new Map();
  const dynamicAttributes = new Map();
  const dynamicShell = {
    getAttribute: (name) => dynamicAttributes.get(name) ?? null,
    setAttribute: (name, value) => dynamicAttributes.set(name, value)
  };
  const dynamicDocument = {
    ...document,
    addEventListener: (name, listener) => dynamicDocumentListeners.set(name, listener),
    querySelector: (selector) => selector === ".app-shell" ? dynamicShell : null
  };
  const dynamicWindow = { addEventListener() {} };
  const stored = new Map();
  let storageAvailable = true;
  const dynamicStorage = {
    getItem(name) {
      if (!storageAvailable) throw new Error("storage became unavailable");
      return stored.get(name) ?? null;
    },
    setItem(name, value) {
      if (!storageAvailable) throw new Error("storage became unavailable");
      stored.set(name, value);
    }
  };
  runInNewContext(runtime, {
    AbortController,
    Audio: FakeAudio,
    Element: FakeElement,
    HTMLInputElement: FakeInput,
    KeyboardEvent: FakeKeyboardEvent,
    MutationObserver: FakeMutationObserver,
    URL,
    document: dynamicDocument,
    localStorage: dynamicStorage,
    queueMicrotask,
    window: dynamicWindow
  });
  assert.equal(dynamicWindow.__MATHNEXA_CROSSCALC_MUSIC__.snapshot().controller, "external-media");
  storageAvailable = false;
  dynamicDocumentListeners.get("pointerdown")({ target: new FakeElement() });
  assert.equal(FakeAudio.instance.playCalls, 0);
  assert.equal(FakeAudio.instance.src, "");
  assert.equal(dynamicWindow.__MATHNEXA_CROSSCALC_MUSIC__.snapshot().controller, "native-fallback");
  assert.equal(dynamicAttributes.get("data-external-music-playback"), "NATIVE_FALLBACK");
  assert.equal(dynamicAttributes.get("data-external-music-sources"), "0");
});

test("the V2 release thumbnail is the optimized exact 1200x675 WebP catalog format", () => {
  const thumbnail = readFileSync(resolve(publicRoot, "media/games/crosscalc-v2-rc.webp"));
  assert.equal(thumbnail.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(thumbnail.subarray(8, 16).toString("ascii"), "WEBPVP8X");
  assert.equal(thumbnail.readUIntLE(24, 3) + 1, 1200);
  assert.equal(thumbnail.readUIntLE(27, 3) + 1, 675);
  assert.ok(thumbnail.byteLength > 50_000 && thumbnail.byteLength < 100_000, thumbnail.byteLength);
});

test("one CrossCalc identity is version-gated between the V1 rollback and V2 public runtime", () => {
  const registry = readFileSync(resolve(repositoryRoot, "apps/platform-web/lib/games/internal-registry.ts"), "utf8");
  assert.match(registry, /"crosscalc"\s*:\s*Object\.freeze\(\{/);
  assert.ok(registry.includes('assetBase: "/internal-games/crosscalc/"'));
  assert.ok(registry.includes("CROSSCALC_V2_PREVIEW"));
  assert.ok(registry.includes('version === "0.2.0"'));
  assert.doesNotMatch(registry, /"crosscalc-v2"\s*:/);
  const adminRoute = readFileSync(resolve(repositoryRoot, "apps/platform-web/app/admin/games/catalog/[catalogId]/preview/route.ts"), "utf8");
  const directRoute = readFileSync(resolve(repositoryRoot, "apps/platform-web/app/games/crosscalc/v2/preview/route.ts"), "utf8");
  assert.ok(adminRoute.includes('requestedVersion === "0.2.0"'));
  assert.ok(directRoute.includes("inspectAdminAccess"));
  assert.ok(directRoute.includes('status: 404'));
  const migration = readFileSync(resolve(repositoryRoot, "supabase/migrations/20260814190000_crosscalc_internal_game.sql"), "utf8");
  assert.ok(migration.includes("'mixed','draft',32,'0.1.0'"));
  assert.doesNotMatch(migration, /0\.2\.0|crosscalc-v2/);
  const release = readFileSync(resolve(repositoryRoot, "supabase/migrations/20260816050000_crosscalc_v2_public_release.sql"), "utf8");
  assert.ok(release.includes("f457a0db-98bb-4401-8584-c8ba5cd93c98"));
  assert.ok(release.includes("version='0.2.0'"));
  assert.ok(release.includes("version=target_row.snapshot->>'version'"));
  assert.ok(release.includes("crosscalc-result/2"));
});
