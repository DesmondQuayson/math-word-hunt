// Math Tug of War audio. Same approach as the other MathNexa internal games
// (Number Cross, Number Logic, CrossCalc): one looping HTMLAudioElement for
// the shared, already-approved MathNexa game track, started synchronously
// inside a user gesture (Safari/iPad autoplay rule), paused while hidden,
// released on pagehide; tiny Web Audio tones for effects. The preference
// record has the same shape as Number Cross's, in this game's namespace.

export const MUSIC_TRACK = Object.freeze({
  title: "Cosmic Candy Catchers",
  author: "Eric Matyas",
  license: "CC BY 3.0",
  // The shared MathNexa copy (byte-identical to the Number Cross / Number
  // Logic / CrossCalc copies); no new audio file is added for this game.
  path: "/media/audio/cosmic-candy-catchers.mp3"
});

export const PREFERENCES_KEY = "mathnexa:math-tug-of-war:preferences";
export const MUSIC_VOLUME = 0.24;
export const DEFAULT_PREFERENCES = Object.freeze({ sound: true, music: true, soundVolume: 0.5, musicVolume: MUSIC_VOLUME });

export function migratePreferences(raw) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const volume = (input, fallback, max) => {
    const number = typeof input === "number" ? input : Number.NaN;
    return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : fallback;
  };
  return {
    sound: typeof value.sound === "boolean" ? value.sound : DEFAULT_PREFERENCES.sound,
    music: typeof value.music === "boolean" ? value.music : DEFAULT_PREFERENCES.music,
    soundVolume: volume(value.soundVolume, DEFAULT_PREFERENCES.soundVolume, 1),
    musicVolume: volume(value.musicVolume, DEFAULT_PREFERENCES.musicVolume, 0.35) || MUSIC_VOLUME
  };
}

export function readPreferences() {
  try {
    return migratePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null"));
  } catch {
    return migratePreferences(null);
  }
}

export function writePreferences(preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    /* Private browsing can refuse storage; the in-memory choice still applies. */
  }
}

export class GameAudio {
  constructor(preferences, shouldPlayMusic) {
    this.prefs = preferences;
    this.shouldPlay = shouldPlayMusic;
    this.context = null;
    this.music = null;
    this.playPromise = null;
    this.requestId = 0;
    this.playAttempts = 0;
    this.lastError = null;
    this.disposed = false;
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
    this.ensureContext();
    this.syncMusic();
  }

  tone(frequency, duration = 0.08, type = "sine", level = 1, endFrequency = null) {
    if (!this.prefs.sound || this.disposed) return;
    const context = this.ensureContext();
    if (!context) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, context.currentTime + duration);
      const peak = Math.max(0.0012, this.prefs.soundVolume * 0.11 * level);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(peak, context.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration + 0.03);
    } catch {
      /* Effects are optional. */
    }
  }

  button() { this.tone(360, 0.04, "sine", 0.45); }
  correct() { this.tone(620, 0.09, "sine", 0.8); setTimeout(() => this.tone(830, 0.12, "sine", 0.8), 70); }
  incorrect() { this.tone(210, 0.16, "triangle", 0.6); }
  pull() { this.tone(170, 0.22, "sawtooth", 0.28, 90); }
  victory() { [523, 659, 784, 1047].forEach((note, index) => setTimeout(() => this.tone(note, 0.26, "sine", 0.9), index * 110)); }

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
    const wanted = this.prefs.music && this.prefs.musicVolume > 0 && !document.hidden && this.shouldPlay();
    if (!wanted) {
      this.pauseMusic();
      return;
    }
    const track = this.ensureMusic();
    if (!track) return;
    // Assign the source lazily, inside the gesture, then play() synchronously:
    // awaiting anything first would leave the activation window on Safari.
    if (!track.getAttribute("src")) track.src = MUSIC_TRACK.path;
    track.volume = this.prefs.musicVolume;
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
          // NotAllowedError: locked until the next gesture, which retries.
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
      loop: this.music?.loop ?? true,
      volume: this.music?.volume ?? 0,
      playAttempts: this.playAttempts,
      contextState: this.context?.state ?? "uninitialized",
      error: this.lastError,
      disposed: this.disposed
    });
  }

  dispose() {
    if (this.disposed) return;
    this.pauseMusic();
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
