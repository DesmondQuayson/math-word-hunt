// Polygon Showdown audio, built like the other MathNexa internal games: one
// looping HTMLAudioElement for the shared, already-approved MathNexa track,
// started inside a user gesture (Safari/iPad rule), paused while hidden,
// released on pagehide; one lazily created AudioContext for short effects.
// Every effect is generated here from oscillators and filtered noise:
// original, no sample files, no licences.

export const MUSIC_TRACK = Object.freeze({
  title: "Cosmic Candy Catchers (Looping)",
  author: "Eric Matyas",
  site: "www.soundimage.org",
  license: "CC BY 3.0",
  path: "/media/audio/cosmic-candy-catchers.mp3"
});

export const PREFERENCES_KEY = "mathnexa:polygon-showdown:preferences";
export const MUSIC_VOLUME = 0.2;

export function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null");
    return {
      sound: typeof value?.sound === "boolean" ? value.sound : true,
      music: typeof value?.music === "boolean" ? value.music : true,
      // A player's own device in a Showdown stays quiet unless they opt in.
      showdownMusic: typeof value?.showdownMusic === "boolean" ? value.showdownMusic : false
    };
  } catch {
    return { sound: true, music: true, showdownMusic: false };
  }
}

export function writePreferences(preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ sound: preferences.sound, music: preferences.music, showdownMusic: preferences.showdownMusic }));
  } catch {
    /* The in-memory choice still applies. */
  }
}

export class GameAudio {
  /** @param shouldPlayMusic () => boolean — whether this device should have music right now. */
  constructor(preferences, shouldPlayMusic) {
    this.prefs = preferences;
    this.shouldPlay = shouldPlayMusic;
    this.context = null;
    this.music = null;
    this.playPromise = null;
    this.requestId = 0;
    this.unlocked = false;
    this.disposed = false;
    this.effects = [];
    this.noise = null;
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
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0012, 0.07 * level), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    } catch {
      /* Effects are optional. */
    }
  }

  /** A short burst of filtered noise: the sound of something breaking or landing. */
  burst(duration = 0.12, cutoff = 1800, level = 1, delay = 0) {
    if (!this.prefs.sound || this.disposed || !this.unlocked) return;
    const context = this.ensureContext();
    if (!context) return;
    try {
      if (!this.noise) {
        this.noise = context.createBuffer(1, context.sampleRate * 0.4, context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      }
      const start = context.currentTime + delay;
      const source = context.createBufferSource();
      source.buffer = this.noise;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(cutoff, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), start + duration);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.002, 0.16 * level), start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter).connect(gain).connect(context.destination);
      source.start(start);
      source.stop(start + duration + 0.02);
    } catch {
      /* Effects are optional. */
    }
  }

  record(name) {
    this.effects.push(name);
    if (this.effects.length > 60) this.effects.shift();
  }

  swap() { this.record("swap"); this.tone(420, 0.07, "sine", 0.45, 560); }
  invalid() { this.record("invalid"); this.tone(200, 0.16, "triangle", 0.6, 150); }
  match(chain = 1) { this.record("match"); const base = 520 * Math.pow(1.122, Math.min(chain - 1, 8)); this.tone(base, 0.09, "sine", 0.8); this.tone(base * 1.5, 0.12, "sine", 0.6, null, 0.06); }
  break() { this.record("break"); this.burst(0.14, 2400, 0.9); }
  fall() { this.record("fall"); this.burst(0.1, 500, 0.55, 0.02); }
  cascade(chain = 2) { this.record("cascade"); [0, 1, 2].forEach((step) => this.tone(620 * Math.pow(1.19, step + chain - 2), 0.08, "triangle", 0.5, null, step * 0.05)); }
  combo(chain = 3) { this.record("combo"); [523, 659, 784, 1047].slice(0, Math.min(chain + 1, 4)).forEach((note, index) => this.tone(note, 0.22, "triangle", 0.55, null, index * 0.035)); }
  coin() { this.record("coin"); this.tone(1320, 0.05, "square", 0.22); this.tone(1760, 0.11, "sine", 0.4, null, 0.04); }
  reshuffle() { this.record("reshuffle"); [392, 523, 659, 523].forEach((note, index) => this.tone(note, 0.09, "sine", 0.5, null, index * 0.06)); }
  tick() { this.record("tick"); this.tone(880, 0.06, "square", 0.25); }
  go() { this.record("go"); [523, 784, 1047].forEach((note) => this.tone(note, 0.4, "triangle", 0.6)); }
  finish() { this.record("finish"); [523, 659, 784, 1047, 1319].forEach((note, index) => this.tone(note, 0.28, "triangle", 0.6, null, index * 0.11)); }
  purchase() { this.record("purchase"); this.tone(988, 0.08, "sine", 0.6); this.tone(1319, 0.2, "sine", 0.7, null, 0.08); this.burst(0.12, 3200, 0.4, 0.04); }
  equip() { this.record("equip"); this.tone(660, 0.06, "sine", 0.5); this.tone(880, 0.09, "sine", 0.5, null, 0.05); }

  ensureMusic() {
    if (this.disposed) return null;
    if (this.music) return this.music;
    const track = new Audio();
    track.loop = true;
    track.preload = "none";
    track.playsInline = true;
    track.setAttribute("playsinline", "");
    this.music = track;
    return track;
  }

  syncMusic() {
    if (this.disposed) return;
    const wanted = !document.hidden && this.shouldPlay();
    if (!wanted) {
      this.pauseMusic();
      return;
    }
    if (!this.unlocked) return;
    const track = this.ensureMusic();
    if (!track) return;
    // Assign the source inside the gesture, then play() synchronously:
    // awaiting anything first would leave Safari's activation window.
    if (!track.getAttribute("src")) track.src = MUSIC_TRACK.path;
    track.volume = MUSIC_VOLUME;
    if (!track.paused || this.playPromise) return;
    const request = ++this.requestId;
    try {
      const attempt = track.play();
      if (attempt && typeof attempt.then === "function") {
        this.playPromise = attempt.then(() => {
          this.playPromise = null;
          if (request !== this.requestId) track.pause();
        }).catch(() => {
          this.playPromise = null;
        });
      }
    } catch {
      this.playPromise = null;
    }
  }

  pauseMusic() {
    if (!this.music) return;
    this.requestId += 1;
    this.playPromise = null;
    this.music.pause();
  }

  snapshot() {
    return Object.freeze({ source: this.music?.getAttribute("src") ?? null, paused: this.music?.paused ?? true, volume: this.music?.volume ?? 0, effects: this.effects.slice() });
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

/** Wire one GameAudio to the page lifecycle (gesture unlock, hide, leave). */
export function attachAudioLifecycle(audio) {
  const activate = () => audio.activate();
  window.addEventListener("pointerdown", activate, { capture: true });
  window.addEventListener("keydown", activate, { capture: true });
  document.addEventListener("visibilitychange", () => audio.syncMusic());
  window.addEventListener("pagehide", () => audio.dispose(), { once: true });
}
