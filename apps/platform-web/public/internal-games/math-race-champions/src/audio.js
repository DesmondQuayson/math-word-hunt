// Math Race Champions audio.
//
// Music: the shared, already-approved MathNexa game track, as one looping
// HTMLAudioElement started synchronously inside the first real user gesture
// (Safari/iPad autoplay rule), paused while hidden, released on pagehide.
// Nobody has to press the music button to hear it.
//
// Effects: synthesised with Web Audio, no recordings. Short tones for the
// classroom and the menus; for a 3D race, the car itself (sound/race-sound.js:
// engine, gears, road, wind, nearby rivals, passes, the finish line).
//
// Mix: effects meet in one bus with a limiter, so nothing can clip however
// many sounds land together. Music has its own level and is turned down while
// a race is running, so the engine and the answer sounds always sit above it.

import { RaceSound } from "./sound/race-sound.js";

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
/** Music keeps this share of its level while a race is running. */
export const RACE_MUSIC_DUCK = 0.55;
/** The race (engine, road, rivals) relative to the Sound effects volume. */
export const RACE_LEVEL = 0.5;
/** How often, and how many times, routed music is checked for actually sounding. */
const ROUTE_CHECK_MS = 1500;
const ROUTE_CHECKS = 4;
/** After the finish line the engine runs down for this long, then fades. */
const RUN_DOWN_SECONDS = 2.2;
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
const MAX_VOICES = 8;

export class GameAudio {
  constructor(preferences, shouldPlayMusic = () => true) {
    this.prefs = preferences;
    this.shouldPlay = shouldPlayMusic;
    this.context = null;
    this.master = null;
    this.music = null;
    this.musicGain = null;
    this.musicProbe = null;
    this.musicRoute = "element";
    // Whether routed music has been seen to carry sound; "unknown" until checked.
    this.routeHeard = "unknown";
    this.routeSilentChecks = 0;
    this.routeWaits = 0;
    this.routeTimer = 0;
    this.duck = 1;
    this.playPromise = null;
    this.requestId = 0;
    this.playAttempts = 0;
    this.lastError = null;
    this.disposed = false;
    this.voices = 0;
    this.race = null;
    this.raceCar = null;
    this.raceEndsAt = null;
    this.raceStarts = 0;
    // Nothing is played, or even attempted, before the first real gesture.
    this.unlocked = false;
  }

  ensureContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || this.disposed) return null;
    try {
      if (!this.context) {
        this.context = new AudioContextClass();
        // One limiter for every effect: a correct answer, a gear change and a
        // pass landing together are held under full scale instead of clipping.
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 10;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.004;
        limiter.release.value = 0.18;
        limiter.connect(this.context.destination);
        this.master = limiter;
      }
      if (this.context.state !== "running") this.context.resume()?.catch?.(() => { /* next gesture retries */ });
    } catch {
      return null;
    }
    return this.context;
  }

  /** Coming back to a tab: ask a paused audio graph to run again (a gesture retries if the browser says no). */
  wake() {
    try {
      if (this.context && this.context.state !== "running") this.context.resume()?.catch?.(() => { /* next gesture retries */ });
    } catch {
      /* next gesture retries */
    }
  }

  /** Call synchronously from every pointer/key gesture. */
  activate() {
    if (this.disposed) return;
    this.unlocked = true;
    this.ensureContext();
    this.syncMusic();
  }

  /**
   * One voice: `layers` are oscillators sharing an envelope, so a sound can
   * have a body and a shine instead of being a bare beep.
   */
  voice(layers, { duration = 0.1, level = 1, attack = 0.012, delay = 0, endRatio = null } = {}) {
    if (!this.prefs.sound || this.disposed || this.voices >= MAX_VOICES) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;
    try {
      const start = context.currentTime + delay;
      const gain = context.createGain();
      const peak = Math.max(0.0012, this.prefs.soundVolume * 0.16 * level);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      gain.connect(this.master);
      const oscillators = layers.map(([type, frequency, share = 1]) => {
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        if (endRatio) oscillator.frequency.exponentialRampToValueAtTime(frequency * endRatio, start + duration);
        if (share === 1) oscillator.connect(gain);
        else {
          const part = context.createGain();
          part.gain.value = share;
          oscillator.connect(part).connect(gain);
        }
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
        return oscillator;
      });
      this.voices += 1;
      oscillators[0].addEventListener("ended", () => {
        this.voices = Math.max(0, this.voices - 1);
        gain.disconnect();
      });
    } catch {
      /* Effects are optional. */
    }
  }

  tone(frequency, duration = 0.08, type = "sine", level = 1, endFrequency = null) {
    this.voice([[type, frequency]], { duration, level, endRatio: endFrequency ? endFrequency / frequency : null });
  }

  /** A struck note: a sine body with a soft octave shine. */
  note(frequency, duration, level = 0.8, delay = 0) {
    this.voice([["sine", frequency], ["triangle", frequency * 2, 0.28]], { duration, level, delay, attack: 0.008 });
  }

  chime(notes, gap, duration, level = 0.8) {
    notes.forEach((frequency, index) => this.note(frequency, duration, level, index * gap));
  }

  button() { this.tone(360, 0.04, "sine", 0.4); }
  correct() { this.chime([659, 988], 0.07, 0.16, 0.95); }
  incorrect() { this.voice([["triangle", 196], ["sine", 147, 0.6]], { duration: 0.24, level: 0.85, endRatio: 0.8 }); }
  hop() { this.tone(300, 0.14, "sine", 0.5, 520); }
  /** Start lights: three even low beeps, then a higher, longer one. */
  countdown() { this.voice([["sine", 440], ["square", 440, 0.12]], { duration: 0.2, level: 0.75, attack: 0.006 }); }
  go() { this.voice([["sine", 880], ["square", 880, 0.12], ["sine", 1320, 0.25]], { duration: 0.6, level: 0.85, attack: 0.006 }); }
  purchase() { this.chime([784, 988, 1319], 0.08, 0.16); }
  equip() { this.chime([523, 784], 0.06, 0.12, 0.6); }
  finish() { this.chime([523, 659, 784], 0.09, 0.24); }
  victory() { this.chime([523, 659, 784, 1047, 1319], 0.11, 0.34, 0.95); this.note(1568, 0.6, 0.7, 0.58); }
  defeat() { this.chime([392, 330, 262], 0.15, 0.3, 0.6); }

  // ------------------------------------------------------------------ racing

  /** The effects level of a race, from the Sound effects volume. */
  raceLevel() {
    return this.prefs.soundVolume * 2 * RACE_LEVEL;
  }

  /** Begin the sound of a race in this car. Music steps back under it. */
  startRace(carKey) {
    this.stopRace(0.05);
    this.raceCar = carKey;
    this.raceEndsAt = null;
    this.setDuck(RACE_MUSIC_DUCK);
    this.ensureRace();
  }

  /** The race sound, made on demand: Sound effects may be switched on mid-race, and a hidden tab drops it. */
  ensureRace() {
    if (this.race || !this.raceCar || !this.prefs.sound || this.disposed || !this.unlocked || document.hidden) return this.race;
    const context = this.ensureContext();
    if (!context || !this.master) return null;
    try {
      this.race = new RaceSound(context, this.master, this.raceCar, { level: this.raceLevel() });
      this.raceStarts += 1;
    } catch {
      this.race = null;
    }
    return this.race;
  }

  /** Once a frame while a race is on screen. */
  updateRace(seconds, player, rivals) {
    if (!this.raceCar) return;
    if (!this.prefs.sound || document.hidden) {
      if (this.race) this.dropRace(0.08);
      return;
    }
    const race = this.ensureRace();
    if (!race) return;
    if (this.raceEndsAt !== null) {
      // Over the line: the car runs down to a stop, then the sound fades away.
      race.update(seconds, { ...player, speed: 0 }, []);
      if (this.context.currentTime >= this.raceEndsAt) this.stopRace(0.8);
      return;
    }
    race.update(seconds, player, rivals);
  }

  /** A correct answer opens the throttle. */
  raceBoost() { this.race?.boost(); }
  /** A wrong answer shuts it: revs fall, tyres scrub, nothing accelerates. */
  raceLift() { this.race?.lift(); }
  racePass(gained, side) { this.race?.pass(gained, side); }

  /** The finish line: the gantry goes overhead and the engine runs down. */
  endRace() {
    if (!this.raceCar || this.raceEndsAt !== null) return;
    this.race?.finishLine();
    this.race?.lift();
    this.raceEndsAt = (this.context?.currentTime ?? 0) + RUN_DOWN_SECONDS;
    this.setDuck(1);
  }

  /** The Sound effects volume changed while a race is sounding. */
  applyRaceLevel() {
    this.race?.setLevel(this.raceLevel());
  }

  dropRace(fade) {
    this.race?.stop(fade);
    this.race = null;
  }

  /** Leave the race: everything of it fades and is released; music comes back up. */
  stopRace(fade = 0.25) {
    this.dropRace(fade);
    this.raceCar = null;
    this.raceEndsAt = null;
    this.setDuck(1);
  }

  // ------------------------------------------------------------------- music

  setDuck(value) {
    if (this.duck === value) return;
    this.duck = value;
    this.applyMusicLevel(0.4);
  }

  musicLevel() {
    return this.prefs.musicVolume * this.duck;
  }

  applyMusicLevel(tau = 0.05) {
    const track = this.music;
    if (!track) return;
    const level = this.musicLevel();
    if (this.musicGain && this.context) {
      track.volume = 1;
      this.musicGain.gain.setTargetAtTime(level, this.context.currentTime, tau);
    } else {
      track.volume = level;
    }
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

  /**
   * Put the music through the audio graph, so its level is ours to set.
   * iPhone and iPad ignore an audio element's own volume; a gain node is
   * honoured everywhere. If the browser refuses, the element's volume is used.
   */
  routeMusic(track) {
    if (this.musicGain || this.musicRoute === "refused" || !this.context) return;
    try {
      const source = this.context.createMediaElementSource(track);
      const probe = this.context.createAnalyser();
      probe.fftSize = 256;
      const gain = this.context.createGain();
      gain.gain.value = this.musicLevel();
      source.connect(probe).connect(gain).connect(this.context.destination);
      this.musicGain = gain;
      this.musicProbe = probe;
      this.musicRoute = "graph";
    } catch {
      this.musicRoute = "refused";
    }
  }

  /**
   * Routed music is only better if it is heard. While the track is playing
   * through a running graph, look for any signal at all; after a few looks
   * with none, give the route up and play the track the plain way instead.
   */
  watchRoute() {
    if (this.routeTimer || this.routeHeard !== "unknown" || !this.musicProbe) return;
    this.routeTimer = setTimeout(() => {
      this.routeTimer = 0;
      const track = this.music;
      const probe = this.musicProbe;
      if (this.disposed || !track || !probe || this.musicRoute !== "graph") return;
      // Only a track that is really advancing through a running graph can be judged.
      // A paused track is looked at again when it next plays; a graph that is not running yet, a little later.
      if (track.paused) return;
      if (track.currentTime < 1 || this.context?.state !== "running") {
        this.routeWaits += 1;
        if (this.routeWaits < 40) this.watchRoute();
        return;
      }
      const samples = new Uint8Array(probe.fftSize);
      probe.getByteTimeDomainData(samples);
      if (samples.some(value => value !== 128)) {
        this.routeHeard = "yes";
        return;
      }
      this.routeSilentChecks += 1;
      if (this.routeSilentChecks < ROUTE_CHECKS) return this.watchRoute();
      this.abandonRoute();
    }, ROUTE_CHECK_MS);
  }

  /** The graph carries no music here: release that element and use a plain one (its own volume, where the browser honours it). */
  abandonRoute() {
    this.routeHeard = "no";
    this.musicRoute = "refused";
    this.pauseMusic();
    if (this.music) {
      this.music.removeAttribute("src");
      this.music.load();
    }
    this.music = null;
    this.musicGain = null;
    this.musicProbe = null;
    // Plays at once where the browser allows it; otherwise on the next press.
    this.syncMusic();
  }

  syncMusic() {
    if (this.disposed || !this.unlocked) return;
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
    this.routeMusic(track);
    this.applyMusicLevel();
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
          else this.watchRoute();
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
    const frame = this.race?.lastFrame ?? null;
    return Object.freeze({
      source: this.music?.getAttribute("src") ?? null,
      paused: this.music?.paused ?? true,
      loop: this.music?.loop ?? true,
      // The level the listener gets, whichever way the music is routed.
      volume: this.music ? this.musicLevel() : 0,
      musicRoute: this.musicRoute,
      routeHeard: this.routeHeard,
      duck: this.duck,
      playAttempts: this.playAttempts,
      unlocked: this.unlocked,
      contextState: this.context?.state ?? "uninitialized",
      error: this.lastError,
      disposed: this.disposed,
      voices: this.voices,
      race: Object.freeze({
        car: this.raceCar,
        sounding: Boolean(this.race),
        profile: this.race?.profile.key ?? null,
        starts: this.raceStarts,
        ending: this.raceEndsAt !== null,
        oneShots: this.race?.oneShots ?? 0,
        level: this.race ? this.raceLevel() : 0,
        rpm: frame ? Math.round(frame.rpm) : null,
        gear: frame ? frame.gear + 1 : null,
        throttle: frame ? Number(frame.throttle.toFixed(3)) : null,
        firing: frame ? Number(frame.firing.toFixed(1)) : null,
        speed: frame ? Number(frame.speed.toFixed(1)) : null
      })
    });
  }

  dispose() {
    if (this.disposed) return;
    this.stopRace(0.02);
    this.pauseMusic();
    this.disposed = true;
    clearTimeout(this.routeTimer);
    this.routeTimer = 0;
    if (this.music) {
      this.music.removeAttribute("src");
      this.music.load();
      this.music = null;
    }
    this.musicGain = null;
    this.musicProbe = null;
    this.master = null;
    this.context?.close?.()?.catch?.(() => { /* leaving anyway */ });
    this.context = null;
  }
}
