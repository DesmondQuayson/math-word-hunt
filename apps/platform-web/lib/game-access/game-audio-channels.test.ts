import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Math Vocabulary Hunt audio-channel contract.
 *
 * The game mixes two INDEPENDENT channels:
 *
 *   MUSIC CHANNEL - looping background track, HTMLAudioElement owned by
 *                   game-suite/math-vocabulary-music.js, normal level 0.50.
 *   VOICE CHANNEL - vocabulary pronunciation clips, Web Audio gain node owned
 *                   by game-suite/natural-voice.js, pinned to unity 1.00.
 *
 * These tests fail if the music level drifts, if pronunciation is attenuated,
 * if the two channels are ever wired in series (0.5 x 0.5 = 0.25), or if the
 * music button silences speech.
 */

const GAME_SUITE = resolve(process.cwd(), "public", "game-suite");
const MUSIC_SOURCE = readFileSync(join(GAME_SUITE, "math-vocabulary-music.js"), "utf8");
const VOICE_SOURCE = readFileSync(join(GAME_SUITE, "natural-voice.js"), "utf8");

const MUSIC_LEVEL = 0.5;
const VOICE_LEVEL = 1;
const MUSIC_MODES = ["low", "medium", "off"] as const;

type MusicMode = (typeof MUSIC_MODES)[number];
type SoundMode = "full" | "tones" | "muted";

interface FakeGainNode {
  context: unknown;
  gain: { value: number };
  connectedTo: unknown[];
  connect(node: unknown): unknown;
}

interface FakeBufferSourceNode {
  buffer: unknown;
  loop: boolean;
  onended: (() => void) | null;
  connectedTo: unknown[];
  started: boolean;
  stopped: boolean;
  connect(node: unknown): unknown;
  start(): void;
  stop(): void;
}

interface FakeAudioElement {
  src: string;
  volume: number;
  paused: boolean;
  loop: boolean;
}

interface VoiceLevels {
  voiceChannelLevel: number;
  voiceGainValue: number | null;
  fallbackVolume: number | null;
  sharesMusicChannel: boolean;
}

interface MusicSnapshot {
  paused: boolean;
  loop: boolean;
  error: string | null;
  volume: number;
  level: number;
  mode: MusicMode;
}

interface Runtime {
  gameAudio: { soundMode: SoundMode; musicMode: MusicMode };
  musicElement: FakeAudioElement;
  audioElements: FakeAudioElement[];
  gainNodes: FakeGainNode[];
  /** Only the sources carrying a decoded clip — never the silent unlock probe. */
  clipSources(): FakeBufferSourceNode[];
  destination: unknown;
  musicSnapshot(): MusicSnapshot;
  voiceLevels(): VoiceLevels;
  playTerm(term: string): Promise<unknown>;
  clickMusicButton(): Promise<void>;
  firstGesture(): Promise<void>;
}

const flush = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  await new Promise((done) => setTimeout(done, 0));
};

const CLIPS: Record<string, string> = {
  Perimeter: "perimeter.mp3",
  Area: "area.mp3",
  Volume: "volume.mp3",
  Quotient: "quotient.mp3",
  "Good job, Chief!": "praise.mp3"
};

/**
 * Boots both shipped runtime modules in one jsdom document with fakes that
 * record what each channel really did. The modules are evaluated verbatim from
 * public/ so the assertions bind to shipped bytes, not a re-implementation.
 */
function loadAudioRuntime(options: { savedMusicMode?: string; webAudio?: boolean } = {}): Runtime {
  const scope = globalThis as unknown as Record<string, unknown>;
  const win = window as unknown as Record<string, unknown>;
  const webAudio = options.webAudio !== false;

  delete win.MathNexaVoice;
  delete win.__MATH_WORD_HUNT__;
  delete win.__MATHNEXA_GAME_MUSIC__;
  delete win.startMusic;
  delete win.stopMusic;
  delete win.duck;
  localStorage.clear();
  if (options.savedMusicMode) localStorage.setItem("mathnexa:math-vocabulary-hunt:music:1", options.savedMusicMode);
  // The music module refuses to play into a hidden document; pin the flag so
  // the harness models a learner looking at the game.
  Object.defineProperty(document, "hidden", { value: false, configurable: true });

  // Built node by node rather than through innerHTML: the security baseline
  // bans raw HTML assignment anywhere under lib/, tests included.
  document.body.replaceChildren();
  const gameScreen = document.createElement("div");
  gameScreen.id = "gameScreen";
  const letterGrid = document.createElement("div");
  letterGrid.id = "letterGrid";
  gameScreen.append(letterGrid);
  const musicButton = document.createElement("button");
  musicButton.id = "musicButton";
  musicButton.type = "button";
  document.body.append(gameScreen, musicButton);

  const gameAudio: { soundMode: SoundMode; musicMode: MusicMode } = { soundMode: "full", musicMode: "low" };
  win.__MATH_WORD_HUNT__ = { getAudioState: () => ({ ...gameAudio }) };

  // Mirrors the canonical game's own cycleMusicMode click handler, which is
  // registered before the music module attaches its persistence listener.
  document.querySelector("#musicButton")!.addEventListener("click", () => {
    gameAudio.musicMode = MUSIC_MODES[(MUSIC_MODES.indexOf(gameAudio.musicMode) + 1) % MUSIC_MODES.length];
  });

  const audioElements: FakeAudioElement[] = [];
  class FakeAudio implements FakeAudioElement {
    src = "";
    volume = 1;
    paused = true;
    loop = false;
    playsInline = false;
    preload = "";
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(src?: string) {
      if (src) this.src = src;
      audioElements.push(this);
    }
    play() {
      this.paused = false;
      // A one-shot clip reaches its end; the looping music track never does.
      if (!this.loop) setTimeout(() => this.onended?.(), 0);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    load() {}
    removeAttribute() {
      this.src = "";
    }
  }
  scope.Audio = FakeAudio;

  const destination = { node: "destination" };
  const gainNodes: FakeGainNode[] = [];
  const bufferSources: FakeBufferSourceNode[] = [];
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = destination;
    createGain(): FakeGainNode {
      const node: FakeGainNode = {
        context: this,
        gain: { value: 1 },
        connectedTo: [],
        connect(target: unknown) {
          node.connectedTo.push(target);
          return target;
        }
      };
      gainNodes.push(node);
      return node;
    }
    createBufferSource(): FakeBufferSourceNode {
      const node: FakeBufferSourceNode = {
        buffer: null,
        loop: false,
        onended: null,
        connectedTo: [],
        started: false,
        stopped: false,
        connect(target: unknown) {
          node.connectedTo.push(target);
          return target;
        },
        start() {
          node.started = true;
          // Real clips finish and fire onended; the engine resolves on that.
          setTimeout(() => node.onended?.(), 0);
        },
        stop() {
          node.stopped = true;
        }
      };
      bufferSources.push(node);
      return node;
    }
    // The silent unlock probe; a source carrying this is not a clip.
    createBuffer() {
      return { kind: "silent-unlock" };
    }
    decodeAudioData(bytes: ArrayBuffer, onDecoded: (buffer: unknown) => void) {
      void bytes;
      onDecoded({ kind: "clip" });
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
  }
  if (webAudio) {
    scope.AudioContext = FakeAudioContext;
    win.AudioContext = FakeAudioContext;
  } else {
    delete scope.AudioContext;
    delete win.AudioContext;
    delete scope.webkitAudioContext;
    delete win.webkitAudioContext;
  }

  scope.fetch = (input: unknown) => {
    const url = String(input);
    if (url.endsWith("manifest.json")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ engine: "chirp3-hd", voice: "en-US-Chirp3-HD-Aoede", clips: CLIPS })
      });
    }
    return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  };

  // Shipped bytes, evaluated as the browser would run them.
  new Function(VOICE_SOURCE)();
  new Function(MUSIC_SOURCE)();

  const music = win.__MATHNEXA_GAME_MUSIC__ as { snapshot(): MusicSnapshot };
  const voice = win.MathNexaVoice as {
    audioLevels(): VoiceLevels;
    playVocabularyTerm(display: string): Promise<unknown>;
  };
  const musicElement = audioElements[0];

  return {
    gameAudio,
    musicElement,
    audioElements,
    gainNodes,
    clipSources: () => bufferSources.filter((node) => (node.buffer as { kind?: string } | null)?.kind === "clip"),
    destination,
    musicSnapshot: () => music.snapshot(),
    voiceLevels: () => voice.audioLevels(),
    playTerm: (term) => voice.playVocabularyTerm(term),
    clickMusicButton: async () => {
      (document.querySelector("#musicButton") as HTMLButtonElement).click();
      await flush();
    },
    firstGesture: async () => {
      window.dispatchEvent(new Event("pointerdown"));
      document.dispatchEvent(new Event("pointerdown"));
      await flush();
    }
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("math vocabulary hunt audio channels", () => {
  it("plays background music at exactly 50 percent", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    expect(runtime.musicElement.paused).toBe(false);
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
    expect(runtime.musicSnapshot()).toMatchObject({
      mode: "low",
      level: MUSIC_LEVEL,
      volume: MUSIC_LEVEL,
      loop: true
    });
  });

  it("plays vocabulary pronunciation at exactly unity", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    await runtime.playTerm("Perimeter");
    await flush();
    expect(runtime.voiceLevels()).toMatchObject({
      voiceChannelLevel: VOICE_LEVEL,
      voiceGainValue: VOICE_LEVEL,
      sharesMusicChannel: false
    });
    expect(runtime.clipSources()).toHaveLength(1);
    expect(runtime.clipSources()[0].started).toBe(true);
  });

  it("keeps the two channels independent - voice never routes through the music level", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    await runtime.playTerm("Perimeter");
    await flush();

    const voiceGain = runtime.gainNodes.find((node) => node.gain.value === VOICE_LEVEL);
    expect(voiceGain, "voice channel gain node").toBeTruthy();
    // The clip reaches the speakers through the voice gain, and that gain goes
    // straight to the destination. No music node sits anywhere in the chain.
    expect(runtime.clipSources()[0].connectedTo).toEqual([voiceGain]);
    expect(voiceGain!.connectedTo).toEqual([runtime.destination]);
    // No gain node anywhere carries the music level, so speech cannot inherit it.
    expect(runtime.gainNodes.map((node) => node.gain.value)).not.toContain(MUSIC_LEVEL);
    // The music channel is an HTMLAudioElement the voice engine never touches.
    expect(runtime.audioElements).toHaveLength(1);
    expect(runtime.audioElements[0].volume).toBe(MUSIC_LEVEL);
  });

  it("never compounds two half-levels into a quarter-level", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    await runtime.playTerm("Perimeter");
    await flush();
    expect(runtime.musicElement.volume).not.toBe(0.25);
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
    expect(runtime.voiceLevels().voiceGainValue).not.toBe(MUSIC_LEVEL);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);
    // Restarting the music must re-apply the authoritative level, not scale
    // whatever the element already held.
    (window as unknown as { startMusic(): void }).startMusic();
    await flush();
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
  });

  it("ducks only the music channel while a term is spoken", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    await runtime.playTerm("Perimeter");
    await flush();
    (window as unknown as { duck(hold: number, target: number): void }).duck(10, 0.15);
    expect(runtime.musicElement.volume).toBeCloseTo(MUSIC_LEVEL * 0.15, 10);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);
    await new Promise((done) => setTimeout(done, 40));
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);
  });

  it("turns music off without silencing pronunciation, and restores 50 percent on the way back", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    expect(runtime.musicElement.paused).toBe(false);

    await runtime.clickMusicButton(); // low -> medium
    expect(runtime.gameAudio.musicMode).toBe("medium");
    expect(runtime.musicElement.paused).toBe(false);

    await runtime.clickMusicButton(); // medium -> off
    expect(runtime.gameAudio.musicMode).toBe("off");
    expect(runtime.musicElement.paused).toBe(true);
    expect(runtime.musicSnapshot().level).toBe(0);

    // Pronunciation is unaffected by the music button.
    await runtime.playTerm("Area");
    await flush();
    expect(runtime.voiceLevels()).toMatchObject({
      voiceChannelLevel: VOICE_LEVEL,
      voiceGainValue: VOICE_LEVEL
    });
    expect(runtime.clipSources().at(-1)!.started).toBe(true);

    await runtime.clickMusicButton(); // off -> low
    expect(runtime.gameAudio.musicMode).toBe("low");
    expect(runtime.musicElement.paused).toBe(false);
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
  });

  it("keeps every pronunciation at unity across repeated and rapid selections", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();

    const terms = ["Perimeter", "Area", "Volume", "Quotient", "Perimeter"];
    for (const term of terms) {
      await runtime.playTerm(term);
      await flush();
      expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);
    }
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);

    // Rapid selection: three terms with no await between them. The newest wins
    // and the earlier sources are stopped, so speech never stacks up. The
    // superseded calls are deliberately not awaited — the engine detaches their
    // onended handler when it cuts them off.
    const before = runtime.clipSources().length;
    void runtime.playTerm("Area");
    void runtime.playTerm("Volume");
    void runtime.playTerm("Quotient");
    await flush();
    expect(runtime.clipSources().length - before).toBe(3);
    const live = runtime.clipSources().slice(before).filter((node) => node.started && !node.stopped);
    expect(live.length).toBeLessThanOrEqual(1);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
  });

  it("keeps the whole-game mute silencing music while the music button never does more than music", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);

    // The sound button's Muted position is the game's explicit global mute.
    runtime.gameAudio.soundMode = "muted";
    expect(runtime.musicSnapshot().level).toBe(0);
    (window as unknown as { startMusic(): void }).startMusic();
    await flush();
    expect(runtime.musicElement.paused).toBe(true);

    runtime.gameAudio.soundMode = "full";
    (window as unknown as { startMusic(): void }).startMusic();
    await flush();
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
  });

  it("holds unity on the HTMLAudio fallback when Web Audio is unavailable", async () => {
    const runtime = loadAudioRuntime({ webAudio: false });
    await runtime.firstGesture();
    await runtime.playTerm("Perimeter");
    await flush();
    const levels = runtime.voiceLevels();
    expect(levels.voiceChannelLevel).toBe(VOICE_LEVEL);
    expect(levels.fallbackVolume).toBe(VOICE_LEVEL);
    expect(levels.fallbackVolume).not.toBe(MUSIC_LEVEL);
  });

  it("restores a saved music preference and never leaves a duplicate loop running", async () => {
    const runtime = loadAudioRuntime({ savedMusicMode: "off" });
    expect(runtime.gameAudio.musicMode).toBe("off");
    await runtime.firstGesture();
    expect(runtime.musicElement.paused).toBe(true);
    expect(runtime.audioElements).toHaveLength(1);

    window.dispatchEvent(new Event("pagehide"));
    await flush();
    expect(runtime.musicElement.paused).toBe(true);
    expect(runtime.audioElements).toHaveLength(1);
  });

  it("persists the real music mode rather than a fixed default", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    await runtime.clickMusicButton();
    expect(localStorage.getItem("mathnexa:math-vocabulary-hunt:music:1")).toBe("medium");
    await runtime.clickMusicButton();
    expect(localStorage.getItem("mathnexa:math-vocabulary-hunt:music:1")).toBe("off");
  });
});

describe("math vocabulary hunt audio channel sources", () => {
  it("declares one authoritative music level and one unity voice level", () => {
    expect(MUSIC_SOURCE).toContain("const MUSIC_CHANNEL_LEVELS = Object.freeze({ low: .5, medium: .75, off: 0 });");
    expect(VOICE_SOURCE).toContain("var VOICE_CHANNEL_LEVEL = 1;");
    // The music level must not be derived by scaling another level.
    expect(MUSIC_SOURCE).not.toMatch(/effectiveMusicLevel/);
    // The voice gain is assigned exactly once, from the unity constant, so it
    // can never be attenuated to the music level or boosted past unity.
    expect(VOICE_SOURCE.match(/voiceGain\.gain\.value\s*=\s*[^;]+/g)).toEqual([
      "voiceGain.gain.value = VOICE_CHANNEL_LEVEL"
    ]);
  });

  it("leaves the other games' audio untouched by this contract", () => {
    const others = [
      join(process.cwd(), "public", "internal-games", "crosscalc-v2", "runtime-music.js"),
      join(process.cwd(), "public", "internal-games", "number-cross", "src", "app.js"),
      join(process.cwd(), "public", "internal-games", "number-cross", "src", "preferences.js")
    ];
    for (const path of others) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} must not import the Math Vocabulary Hunt music contract`).not.toContain(
        "MUSIC_CHANNEL_LEVELS"
      );
      expect(source, `${path} must not import the Math Vocabulary Hunt voice contract`).not.toContain(
        "VOICE_CHANNEL_LEVEL"
      );
    }
  });
});
