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
   * so nothing here can make a spoken term quieter — ducking moves THIS
   * element only, and the voice stays at 1.00 throughout.
   *
   * Speech ducking: while a term is spoken the background drops to 0.15 and
   * returns to 0.50 when the voice finishes. Both are absolute levels, never a
   * percentage of each other, so the duck cannot compound.
   *
   * The duck is driven by the voice engine's playback lifecycle
   * (see SPEECH STATE below), NOT by a hold duration. That matters:
   * the old timer-per-call version raced with itself when a learner replaced
   * one word with another, and a lost race left the music stranded quiet.
   * Lifecycle-driven means restore is automatic on a normal end, an
   * interruption, a replacement, an error and a cancel alike.
   *
   * The canonical game's music button is still a three-state cycle
   * (Low / Medium / Off) because docs/index.html is a protected artifact: about
   * twenty verify-phase gates assert it is byte-unchanged and its sha256 is
   * pinned in 42 files. Both audible states therefore resolve to 0.50 here.
   * FOLLOW-UP: simplify that control to Music On / Music Off in the canonical
   * game, which needs its own owner-approved canonical-hash change.
   */
  const MUSIC_CHANNEL_LEVEL = .5;
  const DUCKED_MUSIC_LEVEL = .15;
  const SILENT_MUSIC_MODE = "off";
  const AUDIBLE_MUSIC_MODES = Object.freeze(["low", "medium"]);
  const DEFAULT_MUSIC_MODE = "low";

  const audio = new Audio(TRACK_URL);
  let disposed = false;
  let ducked = false;
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
    // Silence wins over ducking: music the learner switched off stays off,
    // and speech never nudges it back up.
    if (gameAudioState()?.soundMode === "muted") return 0;
    if (currentMode() === SILENT_MUSIC_MODE) return 0;
    return ducked ? DUCKED_MUSIC_LEVEL : MUSIC_CHANNEL_LEVEL;
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
   * The one place this element's volume is written after playback starts.
   *
   * Never calls play(): music the learner switched off must stay off, so a
   * duck or a restore can only move a track that is already running.
   *
   * This also shadows the canonical game's own duck(), which took a hold
   * duration and ramped the retired internal synth gain. The game still calls
   * duck() from selectTerm and from its tone helpers; routing those calls here
   * makes them reassert the correct current level instead of starting a rival
   * timer, which keeps this module the single duck authority.
   */
  function applyMusicLevel() {
    if (audio.paused) return;
    audio.volume = currentLevel();
  }

  /*
   * SPEECH STATE — one authority, several ways to be woken.
   *
   * voiceIsSpeaking() is the single source of truth for `ducked`. The signals
   * below only ask it to re-read; none of them carries the answer, so they
   * cannot disagree with each other.
   *
   * The previous build subscribed once, at load, with
   * `window.MathNexaVoice?.onSpeechActivity?.(...)`. Optional chaining made
   * that silent: against a voice engine without the method -- a stale cached
   * copy of the sibling file, either file being unhashed -- the subscription
   * evaporated with no error, pronunciation carried on, and the music never
   * ducked again. Reading the state instead of receiving it removes that whole
   * class of failure, and the DOM fallback keeps ducking working even against
   * an older voice engine, which only publishes data-voice-state.
   */
  function voiceIsSpeaking() {
    const voice = window.MathNexaVoice;
    if (voice && typeof voice.isSpeaking === "function") {
      try { return Boolean(voice.isSpeaking()); } catch { /* fall through to the DOM state */ }
    }
    return document.documentElement.getAttribute("data-voice-state") === "started";
  }

  function refreshSpeechDuck() {
    const speaking = voiceIsSpeaking();
    if (speaking === ducked) return;
    ducked = speaking;
    applyMusicLevel();
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
  window.duck = applyMusicLevel;

  /*
   * Two wake-ups, both event-driven, neither dependent on load order:
   *
   *  - the voice engine's broadcast, which needs no registration handshake and
   *    works whichever of the two files loads first;
   *  - the data-voice-state attribute it writes on <html>, which every build of
   *    the engine sets, so ducking survives a version mismatch between these
   *    two unhashed files.
   *
   * No timers and no polling: the observer fires only when the attribute
   * actually changes.
   */
  window.addEventListener("mathnexa:voice-activity", refreshSpeechDuck);
  const voiceStateObserver = new MutationObserver(refreshSpeechDuck);
  voiceStateObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-voice-state"]
  });
  refreshSpeechDuck();

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
    voiceStateObserver.disconnect();
    window.removeEventListener("mathnexa:voice-activity", refreshSpeechDuck);
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
    duckedLevel: DUCKED_MUSIC_LEVEL,
    ducks: true,
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
      ducks: true,
      ducked,
      baseLevel: MUSIC_CHANNEL_LEVEL,
      duckedLevel: DUCKED_MUSIC_LEVEL
    })
  });
})();
