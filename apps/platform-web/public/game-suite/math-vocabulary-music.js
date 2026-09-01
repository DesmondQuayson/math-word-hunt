(() => {
  "use strict";

  const TRACK_URL = "/media/audio/cosmic-candy-catchers.mp3";
  const STORAGE_KEY = "mathnexa:math-vocabulary-hunt:music:1";

  /*
   * MUSIC CHANNEL — one audible level, and only one.
   *
   * Math Vocabulary Hunt background music plays at 0.50 whenever it is audible.
   * This is a single scalar rather than a per-mode table so a second audible
   * tier cannot exist: there is no value here to raise to 0.75 or 1.00, and
   * nothing multiplies it, so the track can never land on a compounded 0.25.
   *
   * Vocabulary pronunciation is a SEPARATE channel owned by natural-voice.js
   * (its own AudioContext, unity gain). It never passes through this element,
   * so nothing here can make a spoken term quieter.
   *
   * There is NO speech ducking. The contrast a learner hears is the mix itself
   * — music 0.50 against voice 1.00 — not a background that drops out while a
   * word is spoken. The music level is identical before, during and after
   * pronunciation.
   *
   * The canonical game's music button is still a three-state cycle
   * (Low / Medium / Off) because docs/index.html is a protected artifact: about
   * twenty verify-phase gates assert it is byte-unchanged and its sha256 is
   * pinned in 42 files. Both audible states therefore resolve to 0.50 here.
   * FOLLOW-UP: simplify that control to Music On / Music Off in the canonical
   * game, which needs its own owner-approved canonical-hash change.
   */
  const MUSIC_CHANNEL_LEVEL = .5;
  const SILENT_MUSIC_MODE = "off";
  const AUDIBLE_MUSIC_MODES = Object.freeze(["low", "medium"]);
  const DEFAULT_MUSIC_MODE = "low";

  const audio = new Audio(TRACK_URL);
  let disposed = false;
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
    return mode === SILENT_MUSIC_MODE || AUDIBLE_MUSIC_MODES.includes(mode) ? mode : DEFAULT_MUSIC_MODE;
  }

  function currentLevel() {
    // The sound button's "Muted" position is the game's explicit whole-game
    // mute and silences music with everything else. The music button is not:
    // it only ever moves this channel, and only between silent and 0.50.
    if (gameAudioState()?.soundMode === "muted") return 0;
    return currentMode() === SILENT_MUSIC_MODE ? 0 : MUSIC_CHANNEL_LEVEL;
  }

  function pauseMusic() {
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

  /*
   * Math Vocabulary Hunt does not duck.
   *
   * The canonical game calls duck() from selectTerm, the correct/wrong/bonus
   * tones and the completion fanfare. Those calls resolve here because this
   * module owns the global, so overriding it with a hold is what keeps the
   * background steady: the level a learner hears is 0.50 before, during and
   * after a spoken term. The owner's contrast is the 50/100 mix itself, not a
   * background that drops away while a word plays.
   *
   * This deliberately shadows the canonical game's own duck(), which ramped the
   * retired internal synth gain. That gain has no inputs once this module takes
   * over startMusic, so nothing is lost.
   */
  function holdMusicLevel() {
    if (audio.paused) return;
    audio.volume = currentLevel();
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
  window.duck = holdMusicLevel;

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
    channelLevel: MUSIC_CHANNEL_LEVEL,
    ducks: false,
    level: currentLevel,
    start: startMusic,
    stop: pauseMusic,
    snapshot: () => Object.freeze({
      paused: audio.paused,
      loop: audio.loop,
      error: lastError,
      volume: audio.volume,
      level: currentLevel(),
      mode: currentMode(),
      ducks: false
    })
  });
})();
