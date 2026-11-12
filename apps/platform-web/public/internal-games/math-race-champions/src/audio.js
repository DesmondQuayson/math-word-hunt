// Math Race Champions audio. Same approach as the other MathNexa internal
// games: one looping HTMLAudioElement for the shared, already-approved MathNexa
// game track, started synchronously inside the first real user gesture
// (Safari/iPad autoplay rule), paused while hidden, released on pagehide; tiny
// Web Audio tones for effects. Nobody has to press the music button to hear it.

export const MUSIC_TRACK = Object.freeze({
  title: "Cosmic Candy Catchers",
  author: "Eric Matyas",
  site: "www.soundimage.org",
  license: "CC BY 3.0",
  // The shared MathNexa copy; no new audio file is added for this game.
  path: "/media/audio/cosmic-candy-catchers.mp3"
});

export const MUSIC_CREDIT = `"${MUSIC_TRACK.title}" by ${MUSIC_TRACK.author} — ${MUSIC_TRACK.site}`;

export const PREFERENCES_KEY = "mathnexa:math-race-champions:preferences";
export const MUSIC_VOLUME = 0.2;
export const DEFAULT_PREFERENCES = Object.freeze({ sound: true, music: true, soundVolume: 0.5, musicVolume: MUSIC_VOLUME, graphics: "auto" });

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
    musicVolume: volume(value.musicVolume, DEFAULT_PREFERENCES.musicVolume, 0.35) || MUSIC_VOLUME,
    // "auto": the best 3D quality the device can hold; "low": always the lightest.
    graphics: value.graphics === "low" ? "low" : "auto"
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

/** Effects never stack louder than this many voices: a classroom has two teams pressing at once. */
const MAX_VOICES = 6;

export class GameAudio {
  constructor(preferences, shouldPlayMusic = () => true) {
    this.prefs = preferences;
    this.shouldPlay = shouldPlayMusic;
    this.context = null;
    this.music = null;
    this.playPromise = null;
    this.requestId = 0;
    this.playAttempts = 0;
    this.lastError = null;
    this.disposed = false;
    this.voices = 0;
    this.engine = null;
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
    if (!this.prefs.sound || this.disposed || this.voices >= MAX_VOICES) return;
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
      this.voices += 1;
      oscillator.addEventListener("ended", () => { this.voices = Math.max(0, this.voices - 1); });
      oscillator.start();
      oscillator.stop(context.currentTime + duration + 0.03);
    } catch {
      /* Effects are optional. */
    }
  }

  sequence(notes, gapMs, duration, type = "sine", level = 0.9) {
    notes.forEach((note, index) => setTimeout(() => this.tone(note, duration, type, level), index * gapMs));
  }

  button() { this.tone(360, 0.04, "sine", 0.45); }
  correct() { this.tone(620, 0.09, "sine", 0.8); setTimeout(() => this.tone(830, 0.12, "sine", 0.8), 70); }
  incorrect() { this.tone(210, 0.16, "triangle", 0.6); }
  hop() { this.tone(300, 0.14, "sine", 0.5, 520); }
  countdown() { this.tone(440, 0.12, "square", 0.35); }
  go() { this.tone(880, 0.3, "square", 0.4); }
  accelerate() { this.tone(110, 0.38, "sawtooth", 0.3, 260); }
  overtake() { this.tone(520, 0.1, "triangle", 0.5, 780); }
  overtaken() { this.tone(420, 0.14, "triangle", 0.4, 260); }
  purchase() { this.sequence([784, 988, 1319], 80, 0.14); }
  equip() { this.tone(500, 0.08, "square", 0.3); setTimeout(() => this.tone(700, 0.1, "square", 0.3), 60); }
  finish() { this.sequence([523, 659, 784], 90, 0.2); }
  victory() { this.sequence([523, 659, 784, 1047, 1319], 110, 0.26); }
  defeat() { this.sequence([392, 330, 262], 150, 0.24, "triangle", 0.6); }

  /** A quiet continuous engine note whose pitch follows the car's speed (0..1). */
  setEngine(level) {
    if (!this.prefs.sound || this.disposed) return this.stopEngine();
    const context = this.ensureContext();
    if (!context) return;
    try {
      if (!this.engine) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sawtooth";
        gain.gain.value = 0.0001;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        this.engine = { oscillator, gain };
      }
      const clamped = Math.min(1, Math.max(0, level));
      this.engine.oscillator.frequency.setTargetAtTime(55 + clamped * 110, context.currentTime, 0.12);
      this.engine.gain.gain.setTargetAtTime(this.prefs.soundVolume * (0.006 + clamped * 0.016), context.currentTime, 0.12);
    } catch {
      /* Effects are optional. */
    }
  }

  stopEngine() {
    if (!this.engine) return;
    try {
      this.engine.gain.gain.setTargetAtTime(0.0001, this.context?.currentTime ?? 0, 0.05);
      this.engine.oscillator.stop((this.context?.currentTime ?? 0) + 0.2);
    } catch {
      /* already stopped */
    }
    this.engine = null;
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
    this.stopEngine();
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
