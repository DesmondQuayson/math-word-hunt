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
const DUCKED_LEVEL = 0.15;
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
  /** Every value written to volume, in order, so level transitions are provable. */
  volumeHistory: number[];
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
  ducked: boolean;
  baseLevel: number;
  duckedLevel: number;
}

interface Runtime {
  gameAudio: { soundMode: SoundMode; musicMode: MusicMode };
  musicElement: FakeAudioElement;
  audioElements: FakeAudioElement[];
  gainNodes: FakeGainNode[];
  /** Only the sources carrying a decoded clip — never the silent unlock probe. */
  clipSources(): FakeBufferSourceNode[];
  /** Hold clips open so the ducked level can be inspected mid-speech. */
  holdClipsOpen(): void;
  /** End every clip still playing, as a real one finishing would. */
  endLiveClips(): Promise<void>;
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

  // Clips normally finish on their own. Duck tests turn this off so a term can
  // be held "speaking" while the music level is inspected.
  let autoEndClips = true;
  const audioElements: FakeAudioElement[] = [];
  class FakeAudio implements FakeAudioElement {
    src = "";
    paused = true;
    loop = false;
    playsInline = false;
    preload = "";
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    volumeHistory: number[] = [];
    #volume = 1;
    get volume() {
      return this.#volume;
    }
    set volume(next: number) {
      this.#volume = next;
      this.volumeHistory.push(next);
    }
    constructor(src?: string) {
      if (src) this.src = src;
      audioElements.push(this);
    }
    play() {
      this.paused = false;
      // A one-shot clip reaches its end; the looping music track never does.
      if (!this.loop && autoEndClips) setTimeout(() => this.onended?.(), 0);
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
          if (autoEndClips) setTimeout(() => node.onended?.(), 0);
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
    holdClipsOpen: () => {
      autoEndClips = false;
    },
    endLiveClips: async () => {
      autoEndClips = true;
      for (const node of bufferSources) {
        if (node.started && !node.stopped && node.onended) node.onended();
      }
      for (const element of audioElements) {
        if (!element.loop && !element.paused) (element as unknown as { onended?: () => void }).onended?.();
      }
      await flush();
    },
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

  it("ducks to 0.15 while a term speaks and restores to 0.50 when it finishes", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();

    // A. idle
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
    expect(runtime.musicSnapshot().ducked).toBe(false);

    // B. pronunciation begins
    runtime.holdClipsOpen();
    void runtime.playTerm("Perimeter");
    await flush();
    expect(runtime.musicElement.volume, "music must duck while a term speaks").toBe(DUCKED_LEVEL);
    expect(runtime.musicSnapshot().ducked).toBe(true);
    expect(runtime.voiceLevels().voiceGainValue, "the voice is never ducked").toBe(VOICE_LEVEL);

    // C. pronunciation continues — including through the game's own duck()
    // calls, which must reassert rather than start a rival timer.
    const { duck } = window as unknown as { duck(hold?: number, target?: number): void };
    duck(1600, 0.15);
    duck();
    await new Promise((done) => setTimeout(done, 40));
    expect(runtime.musicElement.volume).toBe(DUCKED_LEVEL);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);

    // D. pronunciation ends
    await runtime.endLiveClips();
    expect(runtime.musicElement.volume, "music must restore when the term finishes").toBe(MUSIC_LEVEL);
    expect(runtime.musicSnapshot().ducked).toBe(false);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);
  });

  it("restores the music when speech is cancelled rather than finishing", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    runtime.holdClipsOpen();
    void runtime.playTerm("Perimeter");
    await flush();
    expect(runtime.musicElement.volume).toBe(DUCKED_LEVEL);

    (window as unknown as { MathNexaVoice: { cancel(): void } }).MathNexaVoice.cancel();
    await flush();
    expect(runtime.musicElement.volume, "a cancelled term must not strand the music quiet").toBe(MUSIC_LEVEL);
    expect(runtime.musicSnapshot().ducked).toBe(false);
  });

  it("stays ducked across a rapid word replacement and restores exactly once", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    runtime.holdClipsOpen();

    void runtime.playTerm("Perimeter");
    await flush();
    expect(runtime.musicElement.volume).toBe(DUCKED_LEVEL);

    const duringReplacement = runtime.musicElement.volumeHistory.length;
    void runtime.playTerm("Area");
    await flush();
    void runtime.playTerm("Volume");
    await flush();

    // The music must never bounce back to the base level between two words.
    const replacementWrites = runtime.musicElement.volumeHistory.slice(duringReplacement);
    expect(replacementWrites, `levels written during replacement: ${replacementWrites.join(", ")}`).not.toContain(
      MUSIC_LEVEL
    );
    expect(runtime.musicElement.volume).toBe(DUCKED_LEVEL);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);

    // And exactly one restore when the last word finally finishes.
    const beforeRestore = runtime.musicElement.volumeHistory.length;
    await runtime.endLiveClips();
    const restores = runtime.musicElement.volumeHistory.slice(beforeRestore).filter((level) => level === MUSIC_LEVEL);
    expect(restores, "the music must restore exactly once").toHaveLength(1);
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
  });

  it("keeps music silent through a whole spoken term when the learner turned it off", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    await runtime.clickMusicButton(); // low -> medium
    await runtime.clickMusicButton(); // medium -> off
    expect(runtime.musicElement.paused).toBe(true);
    expect(runtime.musicSnapshot().level).toBe(0);

    runtime.holdClipsOpen();
    const beforeSpeech = runtime.musicElement.volumeHistory.length;
    void runtime.playTerm("Area");
    await flush();
    // E. music stays off, voice is unaffected.
    expect(runtime.musicElement.paused, "speech must never restart music the learner turned off").toBe(true);
    expect(runtime.musicSnapshot().level).toBe(0);
    expect(runtime.voiceLevels().voiceGainValue).toBe(VOICE_LEVEL);

    // F. still off after the term ends.
    await runtime.endLiveClips();
    expect(runtime.musicElement.paused).toBe(true);
    expect(runtime.musicSnapshot().level).toBe(0);
    expect(
      runtime.musicElement.volumeHistory.slice(beforeSpeech),
      "no level may be written to a track the learner switched off"
    ).toEqual([]);
  });

  it("has no audible music state above 0.50", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    const observed: number[] = [];
    // Walk the canonical game's whole music cycle: low -> medium -> off -> low.
    for (let step = 0; step < 4; step += 1) {
      observed.push(runtime.musicSnapshot().level);
      if (!runtime.musicElement.paused) observed.push(runtime.musicElement.volume);
      await runtime.clickMusicButton();
    }
    expect(Math.max(...observed), `levels seen across the cycle: ${observed.join(", ")}`).toBe(MUSIC_LEVEL);
    expect(observed).not.toContain(0.75);
    expect(observed).not.toContain(1);
    expect(observed).not.toContain(0.25);
  });

  it("turns music off without silencing pronunciation, and restores 50 percent on the way back", async () => {
    const runtime = loadAudioRuntime();
    await runtime.firstGesture();
    expect(runtime.musicElement.paused).toBe(false);

    await runtime.clickMusicButton(); // low -> medium: still audible, still 0.50
    expect(runtime.gameAudio.musicMode).toBe("medium");
    expect(runtime.musicElement.paused).toBe(false);
    expect(runtime.musicElement.volume).toBe(MUSIC_LEVEL);
    expect(runtime.musicSnapshot().level).toBe(MUSIC_LEVEL);

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
  it("declares one audible music level and one unity voice level", () => {
    expect(MUSIC_SOURCE).toContain("const MUSIC_CHANNEL_LEVEL = .5;");
    expect(MUSIC_SOURCE).toContain("const DUCKED_MUSIC_LEVEL = .15;");
    expect(VOICE_SOURCE).toContain("var VOICE_CHANNEL_LEVEL = 1;");
    // Single scalars, not a per-mode table: there is no second audible tier.
    expect(MUSIC_SOURCE).not.toMatch(/MUSIC_CHANNEL_LEVELS/);
    // Neither level may be derived by scaling the other, or by scaling the
    // game's internal synth gain.
    expect(MUSIC_SOURCE).not.toMatch(/effectiveMusicLevel/);
    expect(MUSIC_SOURCE).not.toMatch(/MUSIC_CHANNEL_LEVEL\s*\*|DUCKED_MUSIC_LEVEL\s*\*/);
    // The element volume is only ever set from currentLevel().
    const volumeWrites = MUSIC_SOURCE.match(/audio\.volume\s*=\s*[^;]+/g) ?? [];
    expect(volumeWrites.every((write) => /=\s*(volume|currentLevel\(\))$/.test(write.trim())), volumeWrites.join(" | ")).toBe(true);
    // Ducking is driven by the voice lifecycle, never by a hold timer.
    expect(MUSIC_SOURCE).not.toMatch(/setTimeout|targetPercent|holdDurationMs|duckTimer/);
    // The voice gain is assigned exactly once, from the unity constant, so it
    // can never be attenuated to the music level or boosted past unity.
    expect(VOICE_SOURCE.match(/voiceGain\.gain\.value\s*=\s*[^;]+/g)).toEqual([
      "voiceGain.gain.value = VOICE_CHANNEL_LEVEL"
    ]);
  });

  it("wires speech activity so a stale sibling file cannot silence ducking", () => {
    // These two files ship under unhashed names and are revalidated separately,
    // so a browser can hold one fresh and one stale. The shipped build did
    // exactly one `MathNexaVoice?.onSpeechActivity?.(...)` call at load: against
    // an engine without that method the optional chaining no-opped, ducking was
    // lost for the whole session, and nothing was logged. Never again.
    // Checked against code only: the comments deliberately quote the old
    // pattern to explain why it was removed.
    const musicCode = MUSIC_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(
      musicCode,
      "the music module must not depend on a one-shot optional-chained subscription"
    ).not.toMatch(/onSpeechActivity\s*\?\.\s*\(/);

    // The voice engine broadcasts, so no registration handshake is required.
    expect(VOICE_SOURCE).toContain('var ACTIVITY_EVENT = "mathnexa:voice-activity";');
    expect(VOICE_SOURCE).toMatch(/dispatchEvent\(\s*new CustomEvent\(ACTIVITY_EVENT/);

    // The music module listens for that broadcast...
    expect(MUSIC_SOURCE).toMatch(/addEventListener\(\s*"mathnexa:voice-activity"/);
    // ...and also observes the attribute EVERY build of the engine writes, so
    // ducking still works across a version mismatch between the two files.
    expect(MUSIC_SOURCE).toMatch(/attributeFilter:\s*\[\s*"data-voice-state"\s*\]/);
    expect(MUSIC_SOURCE).toMatch(/data-voice-state"\s*\)\s*===\s*"started"/);

    // One authority: `ducked` is only ever assigned from the resolved state.
    const duckedWrites = MUSIC_SOURCE.match(/\bducked\s*=\s*[^;]+/g) ?? [];
    expect(duckedWrites, duckedWrites.join(" | ")).toEqual(["ducked = false", "ducked = speaking"]);
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
