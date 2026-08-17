(() => {
  "use strict";

  const TRACK_URL = "/media/audio/cosmic-candy-catchers.mp3";
  const STORAGE_KEY = "mathnexa:math-vocabulary-hunt:music:1";
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

  function currentLevel() {
    try {
      const level = Number(window.effectiveMusicLevel?.());
      return Number.isFinite(level) ? Math.min(.34, Math.max(0, level * 2.8)) : .2;
    } catch {
      return .2;
    }
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

  function currentMode() {
    try { return window.__MATH_WORD_HUNT_TEST_HOOKS__?.getAudioState?.().musicMode ?? "low"; }
    catch { return "low"; }
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

  const originalHooks = window.__MATH_WORD_HUNT_TEST_HOOKS__;
  if (originalHooks?.getAudioState) {
    window.__MATH_WORD_HUNT_TEST_HOOKS__ = {
      ...originalHooks,
      getAudioState: () => ({
        ...originalHooks.getAudioState(),
        musicTheme: "Cosmic Candy Catchers — Eric Matyas",
        musicRunning: !audio.paused,
        musicSessions: audio.paused ? 0 : 1,
        externalTrack: TRACK_URL,
        externalTrackLooping: audio.loop,
        externalTrackError: lastError
      })
    };
  }

  window.__MATHNEXA_GAME_MUSIC__ = Object.freeze({
    source: TRACK_URL,
    start: startMusic,
    stop: pauseMusic,
    snapshot: () => Object.freeze({ paused: audio.paused, loop: audio.loop, error: lastError })
  });
})();
