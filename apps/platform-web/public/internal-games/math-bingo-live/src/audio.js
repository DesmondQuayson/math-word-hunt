// Math Bingo Live audio, built the same way as the other MathNexa internal
// games (Math Tug of War, Number Cross, Number Logic, CrossCalc): ONE looping
// HTMLAudioElement for the shared, already-approved MathNexa track, started
// synchronously inside a user gesture (Safari/iPad autoplay rule), paused
// while hidden, released on pagehide; one lazily created AudioContext for
// short synthesized effects. Every effect, including the Bingo fanfare, is
// generated here from oscillators: original, no sample files, no licences.

export const MUSIC_TRACK = Object.freeze({
  title: "Cosmic Candy Catchers (Looping)",
  author: "Eric Matyas",
  site: "www.soundimage.org",
  license: "CC BY 3.0",
  // The shared, verified same-origin MathNexa copy (also used by Math Tug of
  // War); no new audio file is added for this game.
  path: "/media/audio/cosmic-candy-catchers.mp3"
});

export const PREFERENCES_KEY = "mathnexa:math-bingo-live:preferences";
export const MUSIC_VOLUME = 0.22;
const DUCKED_VOLUME = 0.06;

export function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null");
    return {
      sound: typeof value?.sound === "boolean" ? value.sound : true,
      music: typeof value?.music === "boolean" ? value.music : true
    };
  } catch {
    return { sound: true, music: true };
  }
}

export function writePreferences(preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ sound: preferences.sound, music: preferences.music }));
  } catch {
    /* The in-memory choice still applies. */
  }
}

export class GameAudio {
  /** @param shouldPlayMusic () => boolean — the room's music rule for this device. */
  constructor(preferences, shouldPlayMusic) {
    this.prefs = preferences;
    this.shouldPlay = shouldPlayMusic;
    this.context = null;
    this.music = null;
    this.playPromise = null;
    this.requestId = 0;
    this.playAttempts = 0;
    this.lastError = null;
    this.duckTimer = null;
    this.ducked = false;
    this.disposed = false;
    this.unlocked = false;
    this.lastEffect = null;
    this.effects = [];
  }

  ensureContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || this.disposed) return null;
    try {
      if (!this.context) this.context = new AudioContextClass();
      if (this.context.state === "suspended") this.context.resume()?.catch?.(() => { /* next gesture retries */ });
    } catch {
      return null;
    }
    return this.context;
  }

  /** Call synchronously from every pointer/key gesture. */
  activate() {
    if (this.disposed) return;
    this.unlocked = true;
    this.ensureContext();
    this.syncMusic();
  }

  tone(frequency, duration = 0.08, type = "sine", level = 1, endFrequency = null, delay = 0) {
    if (!this.prefs.sound || this.disposed || !this.unlocked) return;
    const context = this.ensureContext();
    if (!context) return;
    try {
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      const peak = Math.max(0.0012, 0.07 * level);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    } catch {
      /* Effects are optional. */
    }
  }

  record(name) {
    this.lastEffect = { name, at: Date.now() };
    this.effects.push(name);
    if (this.effects.length > 50) this.effects.shift();
  }

  /** Correct mark: a bright rising two-note "pop". */
  correct() { this.record("correct"); this.tone(660, 0.08, "sine", 0.9); this.tone(990, 0.12, "sine", 0.8, null, 0.07); }
  /** Wrong choice: one soft low note, never a buzzer. */
  wrong() { this.record("wrong"); this.tone(220, 0.18, "triangle", 0.7, 180); }
  /** Free Space: a quick sparkle glissando. */
  freeSpace() { this.record("free-space"); [1047, 1319, 1568, 2093].forEach((note, index) => this.tone(note, 0.09, "sine", 0.45, null, index * 0.045)); }
  /** Final-seconds tick (3, 2, 1). */
  tick() { this.record("tick"); this.tone(880, 0.05, "square", 0.25); }
  /** New question chime. */
  question() { this.record("question"); this.tone(523, 0.08, "sine", 0.5); this.tone(784, 0.1, "sine", 0.5, null, 0.06); }
  /** Someone else's Bingo on a player device: a short friendly chord. */
  winnerAnnouncement() { this.record("winner-announcement"); [523, 659, 784].forEach(note => this.tone(note, 0.32, "triangle", 0.45)); }

  /**
   * The Bingo celebration: a two-bar brass-like fanfare (major arpeggio,
   * held top chord, sparkle). Distinct from every other effect; the music
   * ducks under it and comes back.
   */
  bingo() {
    this.record("bingo");
    if (!this.prefs.sound || !this.unlocked) return;
    this.duck(2600);
    const melody = [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36], [659, 0.52], [784, 0.62]];
    for (const [note, at] of melody) {
      this.tone(note, 0.16, "sawtooth", 0.38, null, at);
      this.tone(note * 2, 0.12, "sine", 0.25, null, at);
    }
    for (const note of [523, 659, 784, 1047]) this.tone(note, 0.9, "triangle", 0.5, null, 0.8);
    [1568, 2093, 2637].forEach((note, index) => this.tone(note, 0.12, "sine", 0.3, null, 1.1 + index * 0.08));
  }

  duck(milliseconds) {
    if (!this.music) return;
    clearTimeout(this.duckTimer);
    this.ducked = true;
    this.music.volume = DUCKED_VOLUME;
    this.duckTimer = setTimeout(() => {
      this.ducked = false;
      if (this.music) this.music.volume = MUSIC_VOLUME;
    }, milliseconds);
  }

  ensureMusic() {
    if (this.disposed) return null;
    if (this.music) return this.music;
    const track = new Audio();
    track.loop = true;
    track.preload = "none";
    track.playsInline = true;
    track.setAttribute("playsinline", "");
    track.addEventListener("error", () => {
      this.lastError = track.error?.message || "Music unavailable";
    });
    this.music = track;
    return track;
  }

  syncMusic() {
    if (this.disposed) return;
    const wanted = this.prefs.music && !document.hidden && this.shouldPlay();
    if (!wanted) {
      this.pauseMusic();
      return;
    }
    if (!this.unlocked) return;
    const track = this.ensureMusic();
    if (!track) return;
    // Assign the source lazily, inside the gesture, then play() synchronously:
    // awaiting anything first would leave the activation window on Safari.
    if (!track.getAttribute("src")) track.src = MUSIC_TRACK.path;
    track.volume = this.ducked ? DUCKED_VOLUME : MUSIC_VOLUME;
    if (!track.paused || this.playPromise) return;
    const request = ++this.requestId;
    this.playAttempts += 1;
    try {
      const attempt = track.play();
      if (attempt && typeof attempt.then === "function") {
        this.playPromise = attempt.then(() => {
          this.playPromise = null;
          this.lastError = null;
          if (request !== this.requestId) track.pause();
        }).catch(error => {
          this.playPromise = null;
          if (error?.name !== "NotAllowedError") this.lastError = error instanceof Error ? error.message : "Music unavailable";
        });
      }
    } catch (error) {
      this.playPromise = null;
      if (error?.name !== "NotAllowedError") this.lastError = error instanceof Error ? error.message : "Music unavailable";
    }
  }

  pauseMusic() {
    if (!this.music) return;
    this.requestId += 1;
    this.playPromise = null;
    this.music.pause();
  }

  snapshot() {
    return Object.freeze({
      source: this.music?.getAttribute("src") ?? null,
      paused: this.music?.paused ?? true,
      volume: this.music?.volume ?? 0,
      playAttempts: this.playAttempts,
      contextState: this.context?.state ?? "uninitialized",
      lastEffect: this.lastEffect,
      effects: this.effects.slice(),
      error: this.lastError,
      disposed: this.disposed
    });
  }

  dispose() {
    if (this.disposed) return;
    this.pauseMusic();
    clearTimeout(this.duckTimer);
    this.disposed = true;
    if (this.music) {
      this.music.removeAttribute("src");
      this.music.load();
      this.music = null;
    }
    this.context?.close?.()?.catch?.(() => { /* leaving anyway */ });
    this.context = null;
  }
}

/** Wire one GameAudio to the page lifecycle (gesture unlock, hide, leave). */
export function attachAudioLifecycle(audio) {
  const activate = () => audio.activate();
  window.addEventListener("pointerdown", activate, { capture: true });
  window.addEventListener("keydown", activate, { capture: true });
  document.addEventListener("visibilitychange", () => audio.syncMusic());
  window.addEventListener("pagehide", () => audio.dispose(), { once: true });
}
