(() => {
  "use strict";

  const TRACK_URL = "/media/audio/cosmic-candy-catchers.mp3";
  const STORAGE_KEY = "mathnexa:math-vocabulary-hunt:music:1";

  /*
   * MUSIC CHANNEL — the single authoritative background-music level.
   *
   * The game's music button chooses a MODE; the LEVEL lives here and is never
   * multiplied by a second level, so the looping track cannot silently land on
   * a halved value (0.5 x 0.5 = 0.25). "low" is the normal background level the
   * game starts in and is the owner-specified 50%.
   *
   * Vocabulary pronunciation is a SEPARATE channel owned by natural-voice.js
   * (its own AudioContext, unity gain). It never passes through this element,
   * so nothing here can make a spoken term quieter. The only interaction is
   * ducking, which lowers THIS element while a term is spoken.
   */
  const MUSIC_CHANNEL_LEVELS = Object.freeze({ low: .5, medium: .75, off: 0 });
  const DEFAULT_MUSIC_MODE = "low";

  const audio = new Audio(TRACK_URL);
  let disposed = false;
  let duckTimer = 0;
  let lastError = null;

  function normalizeGridRows() {
    const grid = document.querySelector("#letterGrid");
    if (!grid) return;
    const cells = Array.from(grid.children).filter((child) => child.matches(".grid-cell[role='gridcell']"));
    if (!cells.length) return;
    const rows = new Map();
    for (const cell of cells) {
      const rowIndex = cell.getAttribute("data-row") ?? "0";
      if (!rows.has(rowIndex)) {
        const row = document.createElement("div");
        row.className = "mathnexa-a11y-grid-row";
        row.setAttribute("role", "row");
        row.setAttribute("aria-rowindex", String(Number(rowIndex) + 1));
        rows.set(rowIndex, row);
      }
      rows.get(rowIndex).append(cell);
    }
    grid.append(...rows.values());
  }

  const letterGrid = document.querySelector("#letterGrid");
  const gridObserver = new MutationObserver(normalizeGridRows);
  if (letterGrid) gridObserver.observe(letterGrid, { childList: true });
  normalizeGridRows();

  audio.loop = true;
  audio.preload = "none";
  audio.playsInline = true;

  function gameIsVisible() {
    const game = document.querySelector("#gameScreen");
    const review = document.querySelector("#reviewLayer");
    return Boolean(game && !game.classList.contains("hidden") && (!review || review.classList.contains("hidden")));
  }

  // The canonical game publishes its live audio modes here. Read them rather
  // than the game's internal synth gain: that gain drives the retired built-in
  // score, and scaling it into this element is what produced compounded levels.
  // Captured before this module augments that object below, so reading a mode
  // can never re-enter our own reporting wrapper.
  const gameHooks = window.__MATH_WORD_HUNT__ ?? null;

  function gameAudioState() {
    try {
      return (gameHooks ?? window.__MATH_WORD_HUNT__)?.getAudioState?.() ?? null;
    } catch {
      return null;
    }
  }

  function currentMode() {
    const mode = gameAudioState()?.musicMode;
    return Object.prototype.hasOwnProperty.call(MUSIC_CHANNEL_LEVELS, mode) ? mode : DEFAULT_MUSIC_MODE;
  }

  function currentLevel() {
    // The sound button's "Muted" position is the game's explicit whole-game
    // mute and silences music with everything else. The music button is not:
    // it only ever moves this channel.
    if (gameAudioState()?.soundMode === "muted") return 0;
    return MUSIC_CHANNEL_LEVELS[currentMode()];
  }

  function pauseMusic() {
    window.clearTimeout(duckTimer);
    audio.pause();
  }

  function startMusic() {
    if (disposed || document.hidden || !gameIsVisible()) return;
    const volume = currentLevel();
    if (volume <= 0) {
      pauseMusic();
      return;
    }
    audio.volume = volume;
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.then(() => { lastError = null; }).catch((error) => {
        if (error?.name !== "NotAllowedError") lastError = error instanceof Error ? error.message : "Music unavailable";
      });
    }
  }

  // Speech ducking, unchanged in behaviour: it lowers the MUSIC element for the
  // length of a spoken term and restores it to the authoritative level. The
  // voice channel is untouched — a duck never attenuates pronunciation.
  function duckMusic(holdDurationMs = 300, targetPercent = .3) {
    if (audio.paused) return;
    window.clearTimeout(duckTimer);
    audio.volume = Math.max(0, currentLevel() * Math.min(1, Math.max(0, targetPercent)));
    duckTimer = window.setTimeout(() => {
      if (!audio.paused) audio.volume = currentLevel();
    }, Math.max(0, holdDurationMs));
  }

  function readSavedMode() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "low" || value === "medium" || value === "off" ? value : null;
    } catch {
      return null;
    }
  }

  function saveCurrentMode() {
    const mode = currentMode();
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* Storage may be unavailable. */ }
    if (mode === "off") pauseMusic();
    else startMusic();
  }

  window.startMusic = startMusic;
  window.stopMusic = pauseMusic;
  window.duck = duckMusic;

  const savedMode = readSavedMode();
  const musicButton = document.querySelector("#musicButton");
  if (musicButton && savedMode && savedMode !== "low") {
    musicButton.click();
    if (savedMode === "off") musicButton.click();
  }
  musicButton?.addEventListener("click", () => queueMicrotask(saveCurrentMode));

  const requestStart = () => queueMicrotask(startMusic);
  document.addEventListener("pointerdown", requestStart);
  document.addEventListener("keydown", requestStart);
  window.addEventListener("pagehide", () => {
    disposed = true;
    gridObserver.disconnect();
    pauseMusic();
    audio.removeAttribute("src");
    audio.load();
  }, { once: true });

  if (gameHooks?.getAudioState) {
    window.__MATH_WORD_HUNT__ = {
      ...gameHooks,
      getAudioState: () => ({
        ...gameHooks.getAudioState(),
        musicTheme: "Cosmic Candy Catchers — Eric Matyas",
        musicRunning: !audio.paused,
        musicSessions: audio.paused ? 0 : 1,
        externalTrack: TRACK_URL,
        externalTrackLooping: audio.loop,
        externalTrackError: lastError,
        musicChannelLevel: currentLevel(),
        musicElementVolume: audio.volume
      })
    };
  }

  window.__MATHNEXA_GAME_MUSIC__ = Object.freeze({
    source: TRACK_URL,
    channelLevels: MUSIC_CHANNEL_LEVELS,
    level: currentLevel,
    start: startMusic,
    stop: pauseMusic,
    snapshot: () => Object.freeze({
      paused: audio.paused,
      loop: audio.loop,
      error: lastError,
      volume: audio.volume,
      level: currentLevel(),
      mode: currentMode()
    })
  });
})();
