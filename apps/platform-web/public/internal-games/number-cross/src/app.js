import {
  DIFFICULTIES,
  calculateReasoningIndex,
  calculatePlayerValues,
  generatePuzzle,
  getLineStatus,
  isSolved,
  migrateReasoningHistory,
  scoreGame,
  summarizeReasoningHistory
} from "./game-engine.js";
import {
  ENGAGEMENT_PROFILE_KEY,
  MUSIC_TRACK,
  detectDoubleLogic,
  evaluatePerfectReasoning,
  getAdaptiveRecommendation,
  migrateEngagementProfile,
  updateEngagementProfile
} from "./engagement.js";
import { PREFERENCES_KEY, migratePreferences, parseStoredJson } from "./preferences.js";
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  bestTimeKey,
  legacyBestTimeKey
} from "./storage-keys.js";
import { GAME_VERSION } from "./version.js";

const root = document.querySelector("#app");
const announcer = document.querySelector("#announcer");
document.documentElement.dataset.gameVersion = GAME_VERSION;
const storage = {
  read(key, fallback) {
    try { return parseStoredJson(localStorage.getItem(key), fallback); } catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode can reject writes. */ }
  },
  readMigrated(key, legacyKeys, fallback) {
    try {
      const current = localStorage.getItem(key);
      if (current !== null) return parseStoredJson(current, fallback);
      for (const legacyKey of legacyKeys) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy === null) continue;
        const value = parseStoredJson(legacy, fallback);
        this.write(key, value);
        return value;
      }
    } catch { /* Storage can be unavailable in privacy-restricted hosts. */ }
    return fallback;
  }
};

const rawSavedPrefs = storage.readMigrated(PREFERENCES_KEY, LEGACY_STORAGE_KEYS.preferences, {});
const savedPrefs = migratePreferences(rawSavedPrefs);
const DEFAULT_ACTIVE_MUSIC_VOLUME = 0.24;
// Music is part of the default Number Cross experience. Only an explicit saved
// choice may silence it; an absent or older preference record starts with music on.
if (!Object.prototype.hasOwnProperty.call(rawSavedPrefs, "music")) savedPrefs.music = true;
if (savedPrefs.music && savedPrefs.musicVolume <= 0) savedPrefs.musicVolume = DEFAULT_ACTIVE_MUSIC_VOLUME;
const savedProfile = migrateEngagementProfile(storage.readMigrated(ENGAGEMENT_PROFILE_KEY, LEGACY_STORAGE_KEYS.playerProfile, {}));
const state = {
  screen: "home",
  mode: "addition",
  difficulty: "easy",
  puzzle: null,
  crossed: new Set(),
  locked: new Set(),
  history: [],
  future: [],
  focusedIndex: 0,
  elapsed: 0,
  running: false,
  hintsUsed: 0,
  hintLevel: 0,
  hintText: "",
  hintCells: new Set(),
  impossibleEvents: 0,
  decisions: 0,
  corrections: 0,
  hintLevelsUsed: [],
  reveals: 0,
  reasoningResult: null,
  reasoningSummary: null,
  reasoningInfoOpen: false,
  resultAnimated: false,
  isTimeRecord: false,
  modal: null,
  tutorialStep: 0,
  score: 0,
  playerProfile: savedProfile,
  doubleLogicCount: 0,
  combo: null,
  perfectReasoning: null,
  adaptiveRecommendation: null,
  prefs: { ...savedPrefs }
};

const icons = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  multiply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 22h4M8.2 14.7a7 7 0 1 1 7.6 0c-.7.5-.8 1.1-.8 2.3H9c0-1.2-.1-1.8-.8-2.3Z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6"/></svg>',
  restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 .1 2M20 4v7h-7"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.1 1-1.1 1.7M12 17h.01"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h4l5 4V6l-5 4H5ZM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>'
  ,brain: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M14.2 6.2A5 5 0 0 0 5.9 10a4.6 4.6 0 0 0 .2 8.6A5.2 5.2 0 0 0 14.2 25V6.2ZM17.8 6.2A5 5 0 0 1 26.1 10a4.6 4.6 0 0 1-.2 8.6A5.2 5.2 0 0 1 17.8 25V6.2Z"/><path d="M9.4 9.5c2.3 0 4.1 1.7 4.8 3.7M7.2 17.8c2-.8 4.8-.2 7 1.8M22.6 9.5c-2.3 0-4.1 1.7-4.8 3.7M24.8 17.8c-2-.8-4.8-.2-7 1.8M14.2 10.5h3.6M14.2 16h3.6M14.2 21.5h3.6"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2.8c.5 3.5-1.8 4.6-1.8 7.1 0 1.2.7 2.1 1.7 2.1 1.6 0 2.4-1.7 2.1-3.7 2.3 1.8 3.5 4.2 3.1 6.9-.5 3.7-3.4 6.1-7.1 6.1-4.2 0-7.3-2.9-7.1-7.2.1-2.6 1.6-5 4-6.7-.2 2 .7 3.2 1.7 3.2 1.6 0 1.2-2.4 3.4-7.8Z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.5 2-8 11h6l-1 9 8-12h-6l1-8Z"/></svg>',
  medal: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="m9 13-2 9 5-3 5 3-2-9"/></svg>'
};

class GameAudio {
  context = null;
  music = null;
  musicFadeTimer = null;
  musicPlayPromise = null;
  musicRequestId = 0;
  visibilityPaused = false;
  musicPlayAttempts = 0;
  lastMusicError = null;
  disposed = false;

  ensure() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      if (!this.context) this.context = new AudioContextClass();
      if (this.context.state === "suspended") {
        const resumeAttempt = this.context.resume();
        resumeAttempt?.catch?.(() => { /* The next real gesture retries activation. */ });
      }
    } catch {
      return null;
    }
    return this.context;
  }

  activate() {
    if (this.disposed) return;
    this.ensure();
    this.startMusic();
  }

  tone(frequency, duration = 0.08, type = "sine", volume = state.prefs.soundVolume) {
    if (!state.prefs.sound) return;
    const context = this.ensure();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.12), context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.02);
  }

  tap() { this.tone(320, 0.045, "sine", state.prefs.soundVolume * 0.55); }
  correct() { this.tone(660, 0.11); setTimeout(() => this.tone(880, 0.14), 80); }
  wrong() { this.tone(180, 0.18, "triangle", state.prefs.soundVolume * 0.65); }
  win() { [523, 659, 784, 1047].forEach((note, index) => setTimeout(() => this.tone(note, 0.28), index * 105)); }
  doubleLogic(final = false) {
    const notes = final ? [520, 780, 1040] : [440, 660, 880];
    notes.forEach((note, index) => setTimeout(() => this.tone(note, 0.16, "sine"), index * 70));
  }
  perfect() { [784, 988, 1175].forEach((note, index) => setTimeout(() => this.tone(note, 0.28, "sine"), index * 115)); }

  ensureMusic() {
    if (this.disposed) return null;
    if (this.music) return this.music;
    this.music = new Audio(MUSIC_TRACK.path);
    this.music.loop = true;
    this.music.preload = "none";
    this.music.playsInline = true;
    this.music.volume = 0;
    this.music.addEventListener("error", () => {
      this.lastMusicError = this.music?.error?.message || "Music unavailable";
    });
    return this.music;
  }

  fadeMusic(target, duration = 220, onDone) {
    const track = this.ensureMusic();
    if (!track) return;
    clearInterval(this.musicFadeTimer);
    const destination = Math.max(0, Math.min(1, target));
    if (duration <= 0) {
      track.volume = destination;
      onDone?.();
      return;
    }
    const start = track.volume;
    const started = performance.now();
    this.musicFadeTimer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / duration);
      track.volume = start + (destination - start) * progress;
      if (progress >= 1) {
        clearInterval(this.musicFadeTimer);
        this.musicFadeTimer = null;
        onDone?.();
      }
    }, 30);
  }

  shouldPlayMusic() {
    return !this.disposed
      && state.prefs.music
      && state.prefs.musicVolume > 0
      && state.screen === "game"
      && state.running
      && state.modal !== "pause"
      && state.modal !== "results"
      && !document.hidden;
  }

  startMusic() {
    if (!this.shouldPlayMusic()) return this.musicPlayPromise;
    const track = this.ensureMusic();
    if (!track) return null;
    clearInterval(this.musicFadeTimer);
    this.musicFadeTimer = null;
    if (!track.paused) {
      track.volume = state.prefs.musicVolume;
      this.lastMusicError = null;
      return this.musicPlayPromise;
    }
    if (this.musicPlayPromise) return this.musicPlayPromise;
    const requestId = ++this.musicRequestId;
    this.musicPlayAttempts += 1;
    // Calling play() directly inside the pointer/key activation task is the
    // important autoplay-policy boundary. Do not await fetch/decode first.
    try {
      const attempt = track.play();
      if (!attempt || typeof attempt.then !== "function") {
        track.volume = state.prefs.musicVolume;
        this.lastMusicError = null;
        return null;
      }
      this.musicPlayPromise = attempt.then(() => {
        this.musicPlayPromise = null;
        if (requestId !== this.musicRequestId || !this.shouldPlayMusic()) {
          track.pause();
          return;
        }
        this.lastMusicError = null;
        this.fadeMusic(state.prefs.musicVolume, 280);
      }).catch(error => {
        this.musicPlayPromise = null;
        // NotAllowedError is recoverable: every later gesture retries.
        if (error?.name !== "NotAllowedError") {
          this.lastMusicError = error instanceof Error ? error.message : "Music unavailable";
        }
      });
      return this.musicPlayPromise;
    } catch (error) {
      this.musicPlayPromise = null;
      if (error?.name !== "NotAllowedError") {
        this.lastMusicError = error instanceof Error ? error.message : "Music unavailable";
      }
      return null;
    }
  }

  pauseMusic() {
    if (!this.music) return;
    this.musicRequestId += 1;
    this.musicPlayPromise = null;
    clearInterval(this.musicFadeTimer);
    this.musicFadeTimer = null;
    this.music.pause();
    this.music.volume = 0;
  }

  stopMusic({ reset = true } = {}) {
    if (!this.music) return;
    this.pauseMusic();
    if (reset) this.music.currentTime = 0;
  }

  setMusicVolume(value) {
    if (value <= 0) {
      this.pauseMusic();
      return;
    }
    if (this.music && !this.music.paused) this.music.volume = value;
    else this.startMusic();
  }

  snapshot() {
    return Object.freeze({
      paused: this.music?.paused ?? true,
      loop: this.music?.loop ?? true,
      currentTime: this.music?.currentTime ?? 0,
      activeMusicSources: this.music && !this.music.paused ? 1 : 0,
      playAttempts: this.musicPlayAttempts,
      contextState: this.context?.state ?? "uninitialized",
      error: this.lastMusicError,
      disposed: this.disposed
    });
  }

  dispose() {
    if (this.disposed) return;
    this.stopMusic();
    this.disposed = true;
    if (this.music) {
      this.music.removeAttribute("src");
      this.music.load();
      this.music = null;
    }
    const closeAttempt = this.context?.close?.();
    closeAttempt?.catch?.(() => { /* The page is already leaving. */ });
    this.context = null;
  }
}

const audio = new GameAudio();
window.__MATHNEXA_GAME_MUSIC__ = Object.freeze({
  source: MUSIC_TRACK.path,
  title: `${MUSIC_TRACK.title} — ${MUSIC_TRACK.author}`,
  start: () => audio.startMusic(),
  stop: () => audio.stopMusic({ reset: false }),
  snapshot: () => audio.snapshot()
});
const REASONING_HISTORY_KEY = STORAGE_KEYS.reasoningHistory;

function announce(message) {
  announcer.textContent = "";
  requestAnimationFrame(() => { announcer.textContent = message; });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function modeLabel() { return state.mode === "addition" ? "Addition" : "Multiplication"; }
function modeSymbol() { return state.mode === "addition" ? "+" : "×"; }

function brand() {
  return `<button class="brand" data-action="home" aria-label="Number Cross home">
    <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <span><small>MathNexa</small><strong>Number Cross</strong></span>
  </button>`;
}

function header() {
  return `<header class="site-header">
    ${brand()}
    <div class="header-actions">
      <a class="native-back-link" href="/games" aria-label="Back to MathNexa Games">Back to Games</a>
      <button class="icon-button" data-action="help" aria-label="How to play">${icons.help}</button>
      <button class="icon-button" data-action="settings" aria-label="Sound and settings">${icons.settings}</button>
    </div>
  </header>`;
}

function homeScreen() {
  const difficulty = DIFFICULTIES[state.difficulty];
  return `<div class="app-shell home-shell">
    ${header()}
    <main id="main" class="home-main">
      <section class="welcome-copy" aria-labelledby="game-title">
        <div class="eyebrow"><span></span> Think across. Solve together.</div>
        <h1 id="game-title">Every line<br><em>has an answer.</em></h1>
        <p>Cross out the extra numbers until each row and column reaches its target.</p>
        <div class="rule-key" aria-label="How the board works">
          <span class="rule-key-cell">7</span>
          <span class="rule-key-cross">×</span>
          <span>Leave the numbers you need. Cross out the rest.</span>
        </div>
      </section>
      <section class="setup-card" aria-labelledby="setup-title">
        <div class="setup-heading">
          <div><span class="step-kicker">Choose your puzzle</span><h2 id="setup-title">Ready your board</h2></div>
          <span class="setup-size">${difficulty.size} × ${difficulty.size}</span>
        </div>
        <fieldset class="mode-picker">
          <legend>How should the lines work?</legend>
          <button class="mode-card ${state.mode === "addition" ? "selected" : ""}" data-action="set-mode" data-mode="addition" aria-pressed="${state.mode === "addition"}">
            <span class="mode-icon plus">${icons.plus}</span>
            <span><strong>Addition</strong><small>Add the numbers left showing</small></span>
            <i class="radio-dot"></i>
          </button>
          <button class="mode-card ${state.mode === "multiplication" ? "selected" : ""}" data-action="set-mode" data-mode="multiplication" aria-pressed="${state.mode === "multiplication"}">
            <span class="mode-icon multiply">${icons.multiply}</span>
            <span><strong>Multiplication</strong><small>Multiply the numbers left showing</small></span>
            <i class="radio-dot"></i>
          </button>
        </fieldset>
        <fieldset class="difficulty-picker">
          <legend>Pick a challenge</legend>
          <div class="difficulty-options">
            ${Object.entries(DIFFICULTIES).map(([key, item]) => `<button class="difficulty-chip ${state.difficulty === key ? "selected" : ""}" data-action="set-difficulty" data-difficulty="${key}" aria-pressed="${state.difficulty === key}"><strong>${item.label}</strong><small>${item.size}×${item.size}</small></button>`).join("")}
          </div>
        </fieldset>
        <button class="primary-button start-button" data-action="start">Start ${modeLabel()} <span>${icons.next}</span></button>
        <p class="setup-note"><span>${icons.star}</span> Every puzzle is checked for one unique solution.</p>
      </section>
    </main>
    <footer class="home-footer"><span>MathNexa logic lab</span><span>Designed for curious minds</span></footer>
  </div>`;
}

function currentStatuses() {
  const values = calculatePlayerValues(state.puzzle.grid, state.crossed, state.puzzle.mode);
  return {
    values,
    rows: values.rows.map((value, index) => getLineStatus(value, state.puzzle.rowTargets[index], state.puzzle.mode)),
    columns: values.columns.map((value, index) => getLineStatus(value, state.puzzle.columnTargets[index], state.puzzle.mode))
  };
}

function targetBadge(axis, index, target, value, status) {
  const label = `${axis === "row" ? "Row" : "Column"} ${index + 1}, target ${target}, current ${value}, ${status === "correct" ? "correct" : status === "impossible" ? "needs a restored number" : "still in progress"}`;
  const position = axis === "row"
    ? `grid-row:${index + 2};grid-column:${state.puzzle.grid.length + 1}`
    : `grid-row:1;grid-column:${index + 1}`;
  const lengthClass = target >= 1000 ? "long-target" : target >= 100 ? "medium-target" : "";
  const comboTarget = state.combo && ((axis === "row" && state.combo.row === index) || (axis === "column" && state.combo.column === index));
  return `<div class="target-badge ${status} ${lengthClass} ${comboTarget ? "combo-target" : ""}" style="${position}" aria-label="${label}">
    <span class="target-value">${target}</span>
    ${status === "correct" || status === "impossible" ? `<span class="target-status" aria-hidden="true">${status === "correct" ? icons.check : "!"}</span>` : ""}
  </div>`;
}

function gameBoard() {
  const size = state.puzzle.grid.length;
  const statuses = currentStatuses();
  const columnTargets = state.puzzle.columnTargets.map((target, column) => targetBadge("column", column, target, statuses.values.columns[column], statuses.columns[column])).join("");
  const rowTargets = state.puzzle.rowTargets.map((target, row) => targetBadge("row", row, target, statuses.values.rows[row], statuses.rows[row])).join("");
  const cells = state.puzzle.grid.flatMap((row, r) => row.map((value, c) => {
    const index = r * size + c;
    const crossed = state.crossed.has(index);
    const locked = state.locked.has(index);
    const hinted = state.hintCells.has(index);
    return `<button class="number-cell ${crossed ? "crossed" : "active"} ${locked ? "locked" : ""} ${hinted ? "hinted" : ""}"
      style="grid-row:${r + 2};grid-column:${c + 1}" data-action="cell" data-index="${index}"
      role="gridcell" tabindex="${state.focusedIndex === index ? "0" : "-1"}"
      aria-pressed="${crossed}" aria-label="Row ${r + 1}, Column ${c + 1}, value ${value}, ${crossed ? "crossed out" : "active"}${locked ? ", revealed by hint" : ""}">
      <span>${value}</span><i class="cross-line one"></i><i class="cross-line two"></i>${locked ? `<b class="lock-mark" aria-hidden="true">${icons.check}</b>` : ""}
    </button>`;
  })).join("");
  return `<div class="board-wrap">
    <div class="axis-label columns-label"><span>Column targets</span><i></i></div>
    <div class="axis-label rows-label"><span>Row targets</span><i></i></div>
    <div class="puzzle-grid" role="grid" aria-label="${size} by ${size} Number Cross board" data-size="${size}" style="--size:${size}">
      ${columnTargets}${rowTargets}${cells}
      <div class="target-corner" aria-hidden="true" style="grid-row:1;grid-column:${size + 1}">${modeSymbol()}</div>
    </div>
  </div>`;
}

function gameScreen() {
  const difficulty = DIFFICULTIES[state.difficulty];
  const streak = state.playerProfile.puzzleStreak;
  const fullscreenAvailable = document.fullscreenEnabled !== false
    && typeof document.documentElement.requestFullscreen === "function";
  return `<div class="app-shell game-shell">
    ${header()}
    <main id="main" class="game-main">
      <section class="game-topbar" aria-label="Game status">
        <div class="puzzle-identity"><span class="mode-token">${modeSymbol()}</span><div><small>${modeLabel()}</small><strong>${difficulty.label} · ${difficulty.size}×${difficulty.size}</strong></div></div>
        <div class="hud">
          ${streak > 0 ? `<div class="hud-item hud-streak" aria-label="${streak} puzzle completion streak"><span>${icons.flame}</span><div><small>Streak</small><strong>${streak}</strong></div></div>` : ""}
          <div class="hud-item"><span>${icons.clock}</span><div><small>Time</small><strong id="timer-live">${formatTime(state.elapsed)}</strong></div></div>
          <button class="hud-button" data-action="pause" aria-label="Pause puzzle">${icons.pause}<span>Pause</span></button>
          <button class="hud-button classroom-button" data-action="fullscreen" aria-label="Enter classroom fullscreen" ${fullscreenAvailable ? "" : 'disabled aria-disabled="true" title="Fullscreen is unavailable in this host"'}>${icons.expand}<span>Classroom</span></button>
        </div>
      </section>
      <section class="play-layout">
        <div class="board-panel">
          <div class="board-instruction"><span class="pulse-dot"></span><p><strong>Cross out the extras.</strong> ${state.mode === "addition" ? "Add" : "Multiply"} what remains to match every target.</p></div>
          ${state.combo ? `<div class="logic-toast ${state.combo.final ? "final" : ""}" role="status"><span>${icons.bolt}</span><div><strong>${state.combo.final ? "FINAL LOCK!" : "DOUBLE LOGIC!"}</strong><small>${state.combo.final ? "Two lines. One winning move." : "Row + column solved · ×2"}</small></div></div>` : ""}
          ${gameBoard()}
          <div class="mobile-progress" aria-label="Solved lines"><strong>${currentStatuses().rows.filter(s => s === "correct").length + currentStatuses().columns.filter(s => s === "correct").length}</strong> of ${state.puzzle.grid.length * 2} lines solved</div>
        </div>
        <aside class="game-tools" aria-label="Puzzle tools">
          <div class="line-progress">
            <div class="progress-ring" style="--progress:${Math.round((currentStatuses().rows.filter(s => s === "correct").length + currentStatuses().columns.filter(s => s === "correct").length) / (state.puzzle.grid.length * 2) * 360)}deg"><div><strong>${currentStatuses().rows.filter(s => s === "correct").length + currentStatuses().columns.filter(s => s === "correct").length}</strong><small>of ${state.puzzle.grid.length * 2}</small></div></div>
            <div><strong>Lines solved</strong><p>Match every target to finish.</p></div>
          </div>
          <div class="tool-grid">
            <button data-action="hint" class="tool-button hint"><span>${icons.bulb}</span><strong>Hint</strong><small>${state.hintsUsed ? `${state.hintsUsed} used` : "Need a nudge?"}</small></button>
            <button data-action="undo" class="tool-button" ${state.history.length ? "" : "disabled"}><span>${icons.undo}</span><strong>Undo</strong><small>Last move</small></button>
            <button data-action="redo" class="tool-button" ${state.future.length ? "" : "disabled"}><span>${icons.redo}</span><strong>Redo</strong><small>Restore move</small></button>
            <button data-action="restart" class="tool-button"><span>${icons.restart}</span><strong>Restart</strong><small>Clear board</small></button>
          </div>
          ${state.hintText ? `<div class="hint-message" role="status"><span>${icons.bulb}</span><p>${state.hintText}</p></div>` : ""}
          <button class="new-puzzle-button" data-action="new-puzzle">New puzzle ${icons.next}</button>
          <p class="keyboard-tip"><kbd>Space</kbd> crosses a tile · arrow keys move</p>
        </aside>
      </section>
    </main>
  </div>`;
}

function settingsModal() {
  return `<div class="modal-layer" role="presentation"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <button class="modal-close" data-action="close-modal" aria-label="Close settings">×</button>
    <span class="modal-icon">${icons.settings}</span><p class="modal-kicker">Make it yours</p><h2 id="settings-title">Sound & display</h2>
    <div class="setting-row"><div><strong>Sound effects</strong><small>Tiles, targets, and celebrations</small></div><button class="switch ${state.prefs.sound ? "on" : ""}" data-action="toggle-sound" role="switch" aria-label="Sound effects" aria-checked="${state.prefs.sound}"><span></span></button></div>
    <label class="volume-row"><span>Sound volume</span><input data-action="sound-volume" type="range" min="0" max="1" step="0.05" value="${state.prefs.soundVolume}" /></label>
    <div class="setting-row"><div><strong>Background music</strong><small>Cosmic Candy Catchers · looping soundtrack</small></div><button class="switch ${state.prefs.music ? "on" : ""}" data-action="toggle-music" role="switch" aria-label="Background music" aria-checked="${state.prefs.music}"><span></span></button></div>
    <label class="volume-row"><span>Music volume</span><input data-action="music-volume" type="range" min="0.05" max="0.35" step="0.01" value="${state.prefs.musicVolume}" /></label>
    <p class="asset-note">Music: “Cosmic Candy Catchers” by Eric Matyas · soundimage.org · CC BY 3.0. Sound effects are original synthesized tones.</p>
    <button class="primary-button" data-action="close-modal">Done</button>
  </section></div>`;
}

function tutorialBoard({ crossed = [], workedRow = null, solved = false } = {}) {
  const values = [[2, 5, 1], [4, 3, 2], [1, 2, 4]];
  const addition = state.mode === "addition";
  const columnTargets = addition ? [7, 5, 6] : [8, 5, 8];
  const rowTargets = addition ? [7, 6, 5] : [10, 8, 4];
  const crossedSet = new Set(crossed);
  const target = (value, axis, index) => `<span class="tutorial-demo-target ${solved || (axis === "row" && index === workedRow) ? "solved" : ""}" style="grid-${axis === "row" ? `row:${index + 2};grid-column:4` : `column:${index + 1};grid-row:1`}"><b>${value}</b></span>`;
  const cells = values.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
    const index = rowIndex * 3 + columnIndex;
    return `<span class="tutorial-demo-cell ${crossedSet.has(index) ? "crossed" : ""} ${rowIndex === workedRow ? "worked" : ""}" style="grid-row:${rowIndex + 2};grid-column:${columnIndex + 1}"><b>${value}</b><i></i><i></i></span>`;
  })).join("");
  const description = solved
    ? `Solved ${modeLabel().toLowerCase()} board. Column targets ${columnTargets.join(", ")} and row targets ${rowTargets.join(", ")} all match after the extra numbers are crossed out.`
    : workedRow === 0
      ? `Worked first row. Keep 2 and 5, cross out 1, and reach the row target ${rowTargets[0]}.`
      : `Example ${modeLabel().toLowerCase()} board. Column targets ${columnTargets.join(", ")} are above the grid and row targets ${rowTargets.join(", ")} are beside it.`;
  return `<div class="tutorial-board-wrap" role="img" aria-label="${description}">
    <div class="tutorial-board-key" aria-hidden="true"><span><i class="top"></i> Top = column</span><span><i class="side"></i> Side = row</span></div>
    <div class="tutorial-demo-board" aria-hidden="true">
      ${columnTargets.map((value, index) => target(value, "column", index)).join("")}
      ${rowTargets.map((value, index) => target(value, "row", index)).join("")}
      ${cells}<span class="tutorial-demo-corner" style="grid-row:1;grid-column:4">${modeSymbol()}</span>
    </div>
  </div>`;
}

function tutorialModal() {
  const firstTarget = state.mode === "addition" ? 7 : 10;
  const slides = [
    {
      kicker: "The goal",
      title: "Read the targets",
      body: "Numbers above the board are column targets. Numbers beside the board are row targets.",
      visual: tutorialBoard()
    },
    {
      kicker: "Your move",
      title: "Cross out the extra number",
      body: `First row: keep 2 and 5. Cross out 1, so 2 ${modeSymbol()} 5 = ${firstTarget}. Tap again to restore a number.`,
      visual: tutorialBoard({ crossed: [2], workedRow: 0 })
    },
    {
      kicker: modeLabel(),
      title: "Make both directions match",
      body: "Each move changes one row and one column. Finish when every target has a check.",
      visual: tutorialBoard({ crossed: [2, 4, 7], solved: true })
    }
  ];
  const slide = slides[state.tutorialStep];
  return `<div class="modal-layer tutorial-layer" role="presentation"><section class="modal tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    <button class="text-close" data-action="skip-tutorial">Skip</button>
    <div class="tutorial-visual">${slide.visual}</div>
    <p class="modal-kicker">${slide.kicker}</p><h2 id="tutorial-title">${slide.title}</h2><p class="tutorial-copy">${slide.body}</p>
    <div class="tutorial-footer"><div class="page-dots" role="img" aria-label="Tutorial step ${state.tutorialStep + 1} of ${slides.length}">${slides.map((_, index) => `<i class="${index === state.tutorialStep ? "active" : ""}"></i>`).join("")}</div><button class="primary-button" data-action="tutorial-next">${state.tutorialStep === slides.length - 1 ? "Start solving" : "Next"} ${icons.next}</button></div>
  </section></div>`;
}

function pauseModal() {
  return `<div class="modal-layer pause-layer" role="presentation"><section class="modal pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
    <span class="modal-icon">${icons.pause}</span><p class="modal-kicker">Board hidden</p><h2 id="pause-title">Take a breather</h2><p>Your time is paused at <strong>${formatTime(state.elapsed)}</strong>.</p>
    <button class="primary-button" data-action="resume">${icons.play} Resume puzzle</button><button class="secondary-button" data-action="home">Leave game</button>
  </section></div>`;
}

function confirmModal() {
  return `<div class="modal-layer" role="presentation"><section class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <span class="modal-icon warm">${icons.restart}</span><p class="modal-kicker">Start fresh?</p><h2 id="confirm-title">Clear your moves</h2><p>Your puzzle will stay the same, but every crossed-out tile and hint will reset.</p>
    <div class="modal-actions"><button class="secondary-button" data-action="close-modal">Keep playing</button><button class="danger-button" data-action="confirm-restart">Restart puzzle</button></div>
  </section></div>`;
}

function resultsModal() {
  const result = state.reasoningResult;
  if (!result) return "";
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const displayScore = result.score;
  const stars = state.hintsUsed === 0 && state.impossibleEvents <= 1 ? 3 : state.hintsUsed <= 2 ? 2 : 1;
  const component = (label, key, maximum) => `<div class="reasoning-component"><span>${label}</span><strong>${result.components[key]}<small> / ${maximum}</small></strong><i><b style="width:${result.components[key] / maximum * 100}%"></b></i></div>`;
  const growth = result.growth == null ? "" : result.growth > 0
    ? `<span class="growth positive">↑ +${result.growth} from recent average</span>`
    : result.growth === 0 ? `<span class="growth">Matches your recent average</span>` : `<span class="growth">Recent average ${result.recentAverage}</span>`;
  const perfect = state.perfectReasoning;
  const recommendation = state.adaptiveRecommendation;
  const recommendationMarkup = recommendation ? `<section class="adaptive-card" aria-labelledby="adaptive-title">
    <div class="adaptive-icon" aria-hidden="true">${recommendation.direction === "harder" ? icons.bolt : icons.medal}</div>
    <div class="adaptive-copy">
      <p class="modal-kicker">Your pace, your choice</p>
      <h3 id="adaptive-title">${recommendation.direction === "harder" ? "Ready for a sharper challenge?" : "Build momentum with a lighter board?"}</h3>
      <p>${recommendation.direction === "harder" ? "Your recent reasoning is consistently strong." : "A steadier round can help the pattern click."} Try <strong>${DIFFICULTIES[recommendation.toDifficulty].label}</strong> next?</p>
      <div class="adaptive-scores" aria-label="Recent Reasoning Index scores">${recommendation.recentScores.map(score => `<span>${score}</span>`).join("")}<small>avg ${recommendation.average}</small></div>
    </div>
    <div class="adaptive-actions"><button class="adaptive-accept" data-action="accept-adaptive">Try ${DIFFICULTIES[recommendation.toDifficulty].label}</button><button data-action="decline-adaptive">Not now</button></div>
  </section>` : "";
  return `<div class="modal-layer result-layer" role="presentation"><section class="modal result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title" tabindex="-1">
    <div class="confetti" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
    <div class="completion-heading"><div class="result-check">${icons.check}</div><div><p class="modal-kicker">Every line matches</p><h2 id="result-title">Puzzle complete!</h2></div><div class="result-stars" aria-label="${stars} out of 3 stars">${[1, 2, 3].map(value => `<span class="${value <= stars ? "earned" : ""}">${icons.star}</span>`).join("")}</div></div>
    <section class="reasoning-card ${result.band}" aria-labelledby="reasoning-title">
      <div class="reasoning-topline">
        <div class="brain-seal" aria-hidden="true">${icons.brain}<i></i><i></i><i></i></div>
        <div class="reasoning-title"><span id="reasoning-title">Reasoning Index</span><small>Number Cross performance</small></div>
        <button class="reasoning-info" data-action="reasoning-info" aria-label="How the Reasoning Index works" aria-expanded="${state.reasoningInfoOpen}">${icons.info}</button>
      </div>
      <div class="reasoning-value"><strong data-reasoning-value="${result.score}">${displayScore}</strong><span>/ 100</span></div>
      <div class="reasoning-meter" role="img" aria-label="Reasoning Index ${result.score} out of 100">
        <div class="reasoning-track"><i class="reasoning-fill" data-reasoning-fill style="width:${displayScore}%"><b></b></i><span class="meter-notches" aria-hidden="true"></span></div>
        <div class="meter-scale"><span>0</span><span>100</span></div>
      </div>
      <strong class="reasoning-band">${result.label}</strong>${growth}
      ${state.reasoningInfoOpen ? `<p class="reasoning-explainer">Your Reasoning Index is a 0–100 MathNexa game-performance rating based on puzzle difficulty, accuracy, efficiency, hints, and solving pace. It measures this Number Cross game—not standardized IQ.</p>` : ""}
    </section>
    ${perfect?.qualifies ? `<section class="perfect-card" aria-labelledby="perfect-title"><div class="perfect-mark">${icons.medal}</div><div><p class="modal-kicker">Flawless solve</p><h3 id="perfect-title">Perfect Reasoning</h3><p>No hints · No impossible states · ${perfect.efficiencyPercent}% decision efficiency</p></div><strong>${state.playerProfile.totalPerfect}<small> all-time</small></strong></section>` : ""}
    <div class="component-heading"><strong>How your result was built</strong><span>Five measured parts · 100 total</span></div>
    <div class="reasoning-components">
      ${component("Accuracy", "accuracy", 25)}
      ${component("Efficiency", "efficiency", 20)}
      ${component("Independence", "independence", 20)}
      ${component("Pace", "pace", 10)}
      ${component("Complexity", "complexity", 25)}
    </div>
    <div class="reasoning-history" aria-label="Reasoning Index history"><div><small>Latest</small><strong>${state.reasoningSummary.latest}</strong></div><div><small>Personal best</small><strong>${state.reasoningSummary.best}</strong></div><div><small>Average</small><strong>${state.reasoningSummary.average}</strong></div></div>
    <div class="result-engagement" aria-label="Engagement achievements">
      <div class="engagement-chip"><span>${icons.flame}</span><div><small>Puzzle streak</small><strong>${state.playerProfile.puzzleStreak}</strong></div></div>
      ${state.playerProfile.masterStreak > 0 ? `<div class="engagement-chip"><span>${icons.medal}</span><div><small>Master streak</small><strong>${state.playerProfile.masterStreak}</strong></div></div>` : ""}
      ${state.doubleLogicCount > 0 ? `<div class="engagement-chip"><span>${icons.bolt}</span><div><small>Double Logic</small><strong>${state.doubleLogicCount}</strong></div></div>` : ""}
    </div>
    <div class="result-meta"><span>${icons.clock} ${formatTime(state.elapsed)}${state.isTimeRecord ? " · New best time" : ""}</span><span>${state.score.toLocaleString()} points</span><span>${state.hintsUsed} hints</span></div>
    ${recommendationMarkup}
    <button class="primary-button" data-action="new-puzzle">Next puzzle ${icons.next}</button>
    <div class="result-links"><button data-action="play-again">Play again</button><button data-action="home">Change mode</button></div>
  </section></div>`;
}

function modalMarkup() {
  if (state.modal === "settings") return settingsModal();
  if (state.modal === "tutorial") return tutorialModal();
  if (state.modal === "pause") return pauseModal();
  if (state.modal === "confirm") return confirmModal();
  if (state.modal === "results") return resultsModal();
  return "";
}

function render({ restoreFocus = false } = {}) {
  root.innerHTML = (state.screen === "home" ? homeScreen() : gameScreen()) + modalMarkup();
  if (state.modal) {
    const shell = root.querySelector(".app-shell");
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");
  }
  if (restoreFocus && state.screen === "game" && !state.modal) {
    requestAnimationFrame(() => root.querySelector(`[data-index="${state.focusedIndex}"]`)?.focus());
  } else if (state.modal) {
    requestAnimationFrame(() => state.modal === "results"
      ? root.querySelector(".result-modal")?.focus()
      : root.querySelector(".modal button:not([disabled])")?.focus());
  }
  if (state.modal === "results") requestAnimationFrame(animateReasoningReveal);
}

function animateReasoningReveal() {
  const value = root.querySelector("[data-reasoning-value]");
  const fill = root.querySelector("[data-reasoning-fill]");
  const brain = root.querySelector(".brain-seal");
  if (!value || !fill || !state.reasoningResult) return;
  const finalScore = state.reasoningResult.score;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reducedMotion || state.resultAnimated) {
    value.textContent = finalScore;
    fill.style.width = `${finalScore}%`;
    brain?.classList.add("revealed");
    return;
  }
  state.resultAnimated = true;
  value.textContent = "0";
  fill.style.width = "0%";
  brain?.classList.add("revealed");
  const started = performance.now();
  const duration = 880;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    value.textContent = finalScore;
    fill.style.width = `${finalScore}%`;
    announce(`Reasoning Index ${finalScore} out of 100. ${state.reasoningResult.label}.`);
  };
  const update = now => {
    if (finished) return;
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(finalScore * eased);
    value.textContent = current;
    fill.style.width = `${current}%`;
    if (progress < 1) requestAnimationFrame(update);
    else finish();
  };
  requestAnimationFrame(update);
  setTimeout(finish, duration + 140);
}

function persistPrefs() {
  storage.write(PREFERENCES_KEY, state.prefs);
}

function persistProfile() {
  storage.write(ENGAGEMENT_PROFILE_KEY, state.playerProfile);
}

async function toggleFullscreen() {
  const entering = !document.fullscreenElement;
  const action = entering ? document.documentElement.requestFullscreen : document.exitFullscreen;
  if (typeof action !== "function" || (entering && document.fullscreenEnabled === false)) {
    announce("Fullscreen is unavailable in this host.");
    return;
  }
  try {
    await action.call(entering ? document.documentElement : document);
  } catch {
    announce("Fullscreen could not be opened by this host.");
  }
}

function freshPuzzle(seed = `${Date.now()}-${Math.random()}`) {
  state.puzzle = generatePuzzle({ mode: state.mode, difficulty: state.difficulty, seed });
  state.crossed = new Set();
  state.locked = new Set();
  state.history = [];
  state.future = [];
  state.focusedIndex = 0;
  state.elapsed = 0;
  state.hintsUsed = 0;
  state.hintLevel = 0;
  state.hintText = "";
  state.hintCells = new Set();
  state.impossibleEvents = 0;
  state.decisions = 0;
  state.corrections = 0;
  state.hintLevelsUsed = [];
  state.reveals = 0;
  state.reasoningResult = null;
  state.reasoningSummary = null;
  state.reasoningInfoOpen = false;
  state.resultAnimated = false;
  state.isTimeRecord = false;
  state.score = 0;
  state.doubleLogicCount = 0;
  state.combo = null;
  state.perfectReasoning = null;
  state.adaptiveRecommendation = null;
  state.running = true;
}

function startGame() {
  freshPuzzle();
  state.screen = "game";
  if (!storage.readMigrated(STORAGE_KEYS.tutorialComplete, LEGACY_STORAGE_KEYS.tutorialComplete, false)) {
    state.modal = "tutorial";
    state.tutorialStep = 0;
  }
  render();
  window.scrollTo({ top: 0, left: 0 });
  if (state.prefs.music) audio.startMusic();
}

function completePuzzle() {
  if (state.reasoningResult) return;
  state.running = false;
  state.score = scoreGame({ difficulty: state.difficulty, elapsedSeconds: state.elapsed, hintsUsed: state.hintsUsed, impossibleEvents: state.impossibleEvents, moves: state.decisions });
  const reasoning = calculateReasoningIndex({
    puzzle: state.puzzle,
    elapsedSeconds: state.elapsed,
    decisions: state.decisions,
    corrections: state.corrections,
    impossibleEvents: state.impossibleEvents,
    hintLevels: state.hintLevelsUsed,
    reveals: state.reveals
  });
  const priorHistory = migrateReasoningHistory(storage.readMigrated(REASONING_HISTORY_KEY, LEGACY_STORAGE_KEYS.reasoningHistory, []));
  const recentScores = priorHistory.slice(-5).map(record => record.score);
  const recentAverage = recentScores.length ? Math.round(recentScores.reduce((total, score) => total + score, 0) / recentScores.length) : null;
  state.reasoningResult = {
    ...reasoning,
    growth: recentAverage == null ? null : reasoning.score - recentAverage,
    recentAverage
  };
  const updatedHistory = [...priorHistory, {
    version: 2,
    score: reasoning.score,
    mode: state.mode,
    difficulty: state.difficulty,
    completedAt: new Date().toISOString(),
    components: reasoning.components
  }].slice(-100);
  storage.write(REASONING_HISTORY_KEY, updatedHistory);
  state.reasoningSummary = summarizeReasoningHistory(updatedHistory);
  state.perfectReasoning = evaluatePerfectReasoning({
    completed: true,
    puzzle: state.puzzle,
    decisions: state.decisions,
    reveals: state.reveals,
    hintsUsed: state.hintsUsed,
    impossibleEvents: state.impossibleEvents
  });
  state.playerProfile = updateEngagementProfile(state.playerProfile, {
    completed: true,
    score: reasoning.score,
    perfect: state.perfectReasoning.qualifies,
    doubleLogicCount: state.doubleLogicCount
  });
  persistProfile();
  state.adaptiveRecommendation = getAdaptiveRecommendation({
    history: updatedHistory,
    mode: state.mode,
    difficulty: state.difficulty,
    declines: state.playerProfile.declines
  });
  const bestKey = bestTimeKey(state.mode, state.difficulty);
  const priorBest = storage.readMigrated(bestKey, [legacyBestTimeKey(state.mode, state.difficulty)], null);
  state.isTimeRecord = priorBest === null || state.elapsed < priorBest;
  if (state.isTimeRecord) storage.write(bestKey, state.elapsed);
  state.modal = "results";
  audio.pauseMusic();
  audio.win();
  if (state.perfectReasoning.qualifies) setTimeout(() => audio.perfect(), 520);
  announce("Puzzle complete. Calculating your Reasoning Index.");
}

function toggleCell(index, { fromHistory = false } = {}) {
  if (state.locked.has(index) || state.modal || !state.running) return;
  const beforeStatuses = currentStatuses();
  const wasCrossed = state.crossed.has(index);
  state.decisions += 1;
  if (wasCrossed) state.corrections += 1;
  if (wasCrossed) state.crossed.delete(index); else state.crossed.add(index);
  if (!fromHistory) {
    state.history.push({ index, wasCrossed });
    state.future = [];
  }
  state.hintCells = new Set();
  state.hintText = "";
  const afterStatuses = currentStatuses();
  const beforeLines = [...beforeStatuses.rows, ...beforeStatuses.columns];
  const afterLines = [...afterStatuses.rows, ...afterStatuses.columns];
  const newlyCorrect = afterLines.some((status, i) => status === "correct" && beforeLines[i] !== "correct");
  const newlyImpossible = afterLines.some((status, i) => status === "impossible" && beforeLines[i] !== "impossible");
  const size = state.puzzle.grid.length;
  const row = Math.floor(index / size);
  const column = index % size;
  const combo = detectDoubleLogic({
    beforeRows: beforeStatuses.rows,
    beforeColumns: beforeStatuses.columns,
    afterRows: afterStatuses.rows,
    afterColumns: afterStatuses.columns,
    row,
    column,
    source: fromHistory ? "history" : "manual"
  });
  const solved = isSolved(state.puzzle, state.crossed);
  if (combo.triggered) {
    state.doubleLogicCount += 1;
    state.combo = { row, column, final: solved };
    audio.doubleLogic(solved);
  }
  if (combo.triggered) { /* The combo cue replaces the standard line cue. */ }
  else if (newlyCorrect) audio.correct();
  else if (newlyImpossible) { state.impossibleEvents += 1; audio.wrong(); }
  else audio.tap();
  if (solved && combo.triggered) {
    state.running = false;
    render();
    setTimeout(() => { completePuzzle(); render(); }, 720);
    return;
  }
  if (solved) completePuzzle();
  render({ restoreFocus: !state.modal });
  if (combo.triggered && !solved) {
    const activeCombo = state.combo;
    setTimeout(() => {
      if (state.combo === activeCombo && !state.modal) { state.combo = null; render({ restoreFocus: true }); }
    }, 1050);
  }
}

function undo() {
  const move = state.history.pop();
  if (!move) return;
  const currentlyCrossed = state.crossed.has(move.index);
  state.decisions += 1;
  state.corrections += 1;
  if (move.wasCrossed) state.crossed.add(move.index); else state.crossed.delete(move.index);
  if (move.hint) state.locked.delete(move.index);
  state.future.push({ index: move.index, wasCrossed: currentlyCrossed, hint: move.hint });
  state.focusedIndex = move.index;
  state.hintText = "";
  audio.tap();
  render({ restoreFocus: true });
  announce("Move undone.");
}

function redo() {
  const move = state.future.pop();
  if (!move) return;
  const currentlyCrossed = state.crossed.has(move.index);
  state.decisions += 1;
  state.corrections += 1;
  if (move.wasCrossed) state.crossed.add(move.index); else state.crossed.delete(move.index);
  if (move.hint) state.locked.add(move.index);
  state.history.push({ index: move.index, wasCrossed: currentlyCrossed, hint: move.hint });
  state.focusedIndex = move.index;
  audio.tap();
  render({ restoreFocus: true });
  announce("Move restored.");
}

function useHint() {
  const size = state.puzzle.grid.length;
  const solutionMismatch = index => state.crossed.has(index) === state.puzzle.solution[Math.floor(index / size)][index % size];
  const status = currentStatuses();
  const candidates = [];
  status.rows.forEach((lineStatus, index) => { if (lineStatus !== "correct") candidates.push({ axis: "row", index }); });
  status.columns.forEach((lineStatus, index) => { if (lineStatus !== "correct") candidates.push({ axis: "column", index }); });
  if (!candidates.length) return;
  candidates.sort((a, b) => {
    const aIndexes = Array.from({ length: size }, (_, p) => a.axis === "row" ? a.index * size + p : p * size + a.index);
    const bIndexes = Array.from({ length: size }, (_, p) => b.axis === "row" ? b.index * size + p : p * size + b.index);
    return aIndexes.filter(solutionMismatch).length - bIndexes.filter(solutionMismatch).length;
  });
  const line = candidates[0];
  const indexes = Array.from({ length: size }, (_, p) => line.axis === "row" ? line.index * size + p : p * size + line.index);
  const target = line.axis === "row" ? state.puzzle.rowTargets[line.index] : state.puzzle.columnTargets[line.index];
  const current = line.axis === "row" ? status.values.rows[line.index] : status.values.columns[line.index];
  const wrongIndex = indexes.find(solutionMismatch);
  const value = state.puzzle.grid[Math.floor(wrongIndex / size)][wrongIndex % size];
  const shouldCross = !state.puzzle.solution[Math.floor(wrongIndex / size)][wrongIndex % size];
  state.hintsUsed += 1;
  state.hintLevelsUsed.push(state.hintLevel);
  state.hintCells = new Set(indexes);
  if (state.hintLevel === 0) {
    state.hintText = `Start with ${line.axis} ${line.index + 1}. It has a useful next step.`;
  } else if (state.hintLevel === 1) {
    state.hintText = `${line.axis === "row" ? "This row" : "This column"} is ${current} now and needs ${target}. Think about which ${modeLabel().toLowerCase()} combination can make ${target}.`;
  } else if (state.hintLevel === 2) {
    state.hintCells = new Set([wrongIndex]);
    state.hintText = `Look closely at the ${value}. It ${shouldCross ? "is extra" : "belongs in the calculation"}.`;
  } else {
    const wasCrossed = state.crossed.has(wrongIndex);
    if (shouldCross) state.crossed.add(wrongIndex); else state.crossed.delete(wrongIndex);
    state.locked.add(wrongIndex);
    state.hintCells = new Set([wrongIndex]);
    state.history.push({ index: wrongIndex, wasCrossed, hint: true });
    state.reveals += 1;
    state.hintText = `Revealed: the ${value} should be ${shouldCross ? "crossed out" : "left active"}.`;
  }
  state.hintLevel = (state.hintLevel + 1) % 4;
  audio.correct();
  render();
  announce(state.hintText);
  if (isSolved(state.puzzle, state.crossed)) {
    completePuzzle();
    render();
  }
}

function resetCurrentPuzzle() {
  state.crossed = new Set(); state.locked = new Set(); state.history = []; state.future = [];
  state.elapsed = 0; state.hintsUsed = 0; state.hintLevel = 0; state.hintText = ""; state.hintCells = new Set(); state.impossibleEvents = 0;
  state.decisions = 0; state.corrections = 0; state.hintLevelsUsed = []; state.reveals = 0; state.reasoningResult = null; state.reasoningSummary = null; state.reasoningInfoOpen = false; state.resultAnimated = false; state.isTimeRecord = false;
  state.doubleLogicCount = 0; state.combo = null; state.perfectReasoning = null; state.adaptiveRecommendation = null;
  state.modal = null; state.running = true;
  render(); announce("Puzzle restarted.");
}

function leaveGame() {
  state.running = false; state.modal = null; state.screen = "home"; audio.stopMusic(); render(); window.scrollTo({ top: 0, left: 0 });
}

root.addEventListener("click", event => {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (state.combo?.final && !state.reasoningResult) return;
  if (!["cell", "sample-cell"].includes(action)) audio.tap();
  if (action === "set-mode") { state.mode = target.dataset.mode; render(); }
  else if (action === "set-difficulty") { state.difficulty = target.dataset.difficulty; render(); }
  else if (action === "start") startGame();
  else if (action === "cell") { state.focusedIndex = Number(target.dataset.index); toggleCell(state.focusedIndex); }
  else if (action === "undo") undo();
  else if (action === "redo") redo();
  else if (action === "hint") useHint();
  else if (action === "restart") { state.modal = state.history.length ? "confirm" : null; if (!state.history.length) resetCurrentPuzzle(); else render(); }
  else if (action === "confirm-restart") resetCurrentPuzzle();
  else if (action === "new-puzzle") { freshPuzzle(); state.modal = null; render(); if (state.prefs.music) audio.startMusic(); }
  else if (action === "play-again") { state.modal = null; resetCurrentPuzzle(); if (state.prefs.music) audio.startMusic(); }
  else if (action === "pause") { state.running = false; state.modal = "pause"; audio.pauseMusic(); render(); }
  else if (action === "resume") { state.modal = null; state.running = true; render(); if (state.prefs.music) audio.startMusic(); }
  else if (action === "home") leaveGame();
  else if (action === "settings") { state.modal = "settings"; render(); }
  else if (action === "help") { state.tutorialStep = 0; state.modal = "tutorial"; render(); }
  else if (action === "close-modal") { state.modal = null; render(); }
  else if (action === "toggle-sound") { state.prefs.sound = !state.prefs.sound; persistPrefs(); render(); }
  else if (action === "toggle-music") {
    state.prefs.music = !state.prefs.music;
    if (state.prefs.music && state.prefs.musicVolume <= 0) state.prefs.musicVolume = DEFAULT_ACTIVE_MUSIC_VOLUME;
    persistPrefs();
    state.prefs.music ? audio.startMusic() : audio.stopMusic({ reset: false });
    render();
  }
  else if (action === "reasoning-info") { state.reasoningInfoOpen = !state.reasoningInfoOpen; render(); }
  else if (action === "accept-adaptive") {
    const recommendation = state.adaptiveRecommendation;
    if (recommendation) {
      state.difficulty = recommendation.toDifficulty;
      freshPuzzle();
      state.modal = null;
      render();
      if (state.prefs.music) audio.startMusic();
      announce(`${DIFFICULTIES[state.difficulty].label} challenge selected.`);
    }
  }
  else if (action === "decline-adaptive") {
    const recommendation = state.adaptiveRecommendation;
    if (recommendation) {
      state.playerProfile = {
        ...state.playerProfile,
        declines: {
          ...state.playerProfile.declines,
          [recommendation.key]: { relevantCount: recommendation.relevantCount }
        }
      };
      persistProfile();
      state.adaptiveRecommendation = null;
      render();
      announce("No change. Keep playing at your current challenge.");
    }
  }
  else if (action === "tutorial-next") {
    if (state.tutorialStep < 2) { state.tutorialStep += 1; render(); }
    else { storage.write(STORAGE_KEYS.tutorialComplete, true); state.modal = null; render(); if (state.prefs.music) audio.startMusic(); }
  }
  else if (action === "skip-tutorial") { storage.write(STORAGE_KEYS.tutorialComplete, true); state.modal = null; render(); if (state.prefs.music) audio.startMusic(); }
  else if (action === "sample-cell") { target.classList.toggle("sample-crossed"); }
  else if (action === "fullscreen") {
    void toggleFullscreen();
  }
});

root.addEventListener("input", event => {
  if (event.target.dataset.action === "sound-volume") state.prefs.soundVolume = Number(event.target.value);
  if (event.target.dataset.action === "music-volume") { state.prefs.musicVolume = Number(event.target.value); audio.setMusicVolume(state.prefs.musicVolume); }
  persistPrefs();
});

root.addEventListener("keydown", event => {
  const cell = event.target.closest('[data-action="cell"]');
  if (!cell) return;
  const size = state.puzzle.grid.length;
  let next = Number(cell.dataset.index);
  if (["Enter", " "].includes(event.key)) { event.preventDefault(); toggleCell(next); return; }
  if (event.key === "ArrowRight") next = next % size === size - 1 ? next - size + 1 : next + 1;
  else if (event.key === "ArrowLeft") next = next % size === 0 ? next + size - 1 : next - 1;
  else if (event.key === "ArrowDown") next = (next + size) % (size * size);
  else if (event.key === "ArrowUp") next = (next - size + size * size) % (size * size);
  else return;
  event.preventDefault();
  state.focusedIndex = next;
  root.querySelectorAll('[data-action="cell"]').forEach(button => { button.tabIndex = Number(button.dataset.index) === next ? 0 : -1; });
  root.querySelector(`[data-index="${next}"]`)?.focus();
});

document.addEventListener("keydown", event => {
  if (event.key === "Tab" && state.modal) {
    const controls = [...root.querySelectorAll(".modal button:not([disabled]), .modal input:not([disabled])")].filter(element => element.offsetParent !== null);
    if (controls.length) {
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  if (event.key === "Escape" && state.modal && state.modal !== "results") {
    const wasPaused = state.modal === "pause";
    if (wasPaused) state.running = true;
    state.modal = null;
    render();
    if (wasPaused && state.prefs.music) audio.startMusic();
  }
});

setInterval(() => {
  if (!state.running || state.screen !== "game" || state.modal === "pause" || state.modal === "results") return;
  state.elapsed += 1;
  const timer = document.querySelector("#timer-live");
  if (timer) timer.textContent = formatTime(state.elapsed);
}, 1000);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state.screen === "game" && state.prefs.music && !audio.music?.paused) {
      audio.visibilityPaused = true;
      audio.pauseMusic();
    }
    return;
  }
  if (audio.visibilityPaused) {
    audio.visibilityPaused = false;
    if (state.screen === "game" && state.running && (!state.modal || state.modal === "settings")) audio.startMusic();
  }
});

// Keep activation synchronous with the browser gesture. A rejected autoplay
// attempt is harmless; the next pointer or keyboard gesture retries it.
document.addEventListener("pointerdown", () => audio.activate(), { capture: true });
document.addEventListener("keydown", event => {
  if (!event.repeat) audio.activate();
}, { capture: true });

window.addEventListener("pagehide", event => {
  if (event.persisted) audio.pauseMusic();
  else audio.dispose();
});

render();
