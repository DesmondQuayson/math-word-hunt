(() => {
  "use strict";

  if (window.__MATHNEXA_CROSSCALC_MUSIC__) return;

  const TRACK_URL = new URL("./assets/oldskool-cc0-CQNT44Pl.mp3", document.baseURI).href;
  const NATIVE_SETTINGS_KEY = "mathnexa.crosscalc.v1.audio";
  const PREFERENCE_KEY = "mathnexa.crosscalc.v2.music-hotfix";
  const SETTINGS_VERSION = "crosscalc-audio/1";
  // Delay even assigning the media source until an eligible user gesture.
  // This avoids an eager codec probe/request in WebKit and keeps route entry
  // silent when the saved preference is off.
  const audio = new Audio();
  const teardown = new AbortController();
  let enabled = readPreference();
  let disposed = false;
  let permanentlyUnavailable = false;
  let playAttempts = 0;
  let lastError = null;
  let syncingControls = false;
  let playbackActive = false;
  let playbackState = "IDLE";
  let playReturnKind = "not-attempted";
  let externalControllerAvailable = false;

  audio.loop = true;
  audio.preload = "none";
  audio.playsInline = true;
  audio.volume = 0.32;

  // The released Web Audio controller fetches and decodes the entire track
  // after activation. Keep its music path disabled so the immediate media
  // element path below is the only possible background-music source. Sound
  // effects still use the native controller and remain unchanged.
  // Persist the resolved preference before suppression so a BFCache navigation
  // can never mistake temporary native "off" state for the player's choice.
  writePreference();
  externalControllerAvailable = suppressNativeMusic();

  function readNativeSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(NATIVE_SETTINGS_KEY) ?? "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function readPreference() {
    try {
      const saved = localStorage.getItem(PREFERENCE_KEY);
      if (saved === "on") return true;
      if (saved === "off") return false;
      const native = readNativeSettings();
      return typeof native?.musicEnabled === "boolean" ? native.musicEnabled : true;
    } catch {
      return true;
    }
  }

  function writePreference() {
    try { localStorage.setItem(PREFERENCE_KEY, enabled ? "on" : "off"); } catch { /* Storage is optional. */ }
  }

  function suppressNativeMusic() {
    try {
      const native = readNativeSettings() ?? {
        version: SETTINGS_VERSION,
        masterMuted: false,
        musicEnabled: true,
        musicVolume: 0.35,
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.6
      };
      localStorage.setItem(NATIVE_SETTINGS_KEY, JSON.stringify({
        ...native,
        version: SETTINGS_VERSION,
        musicEnabled: false
      }));
      const verified = JSON.parse(localStorage.getItem(NATIVE_SETTINGS_KEY) ?? "null");
      return verified?.musicEnabled === false;
    } catch {
      // If native suppression cannot be verified, never start the external
      // player. The released controller remains the sole possible music path.
      return false;
    }
  }

  function restoreNativePreference() {
    if (!externalControllerAvailable) return;
    try {
      const native = readNativeSettings();
      if (!native) return;
      localStorage.setItem(NATIVE_SETTINGS_KEY, JSON.stringify({ ...native, musicEnabled: enabled }));
    } catch { /* Preserve unload even when storage is unavailable. */ }
  }

  function setPlaybackAttributes(state) {
    playbackState = state;
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    setAttributeIfChanged(shell, "data-external-music-playback", state);
    setAttributeIfChanged(shell, "data-external-music-sources", playbackActive ? "1" : "0");
    setAttributeIfChanged(shell, "data-external-music-error", lastError ?? "");
  }

  function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function pauseMusic(state = "PAUSED") {
    audio.pause();
    playbackActive = false;
    setPlaybackAttributes(state);
  }

  function describeMediaError() {
    if (!audio.error) return "MediaError: background music is unavailable.";
    return `MediaError ${audio.error.code}: ${audio.error.message || "background music is unavailable."}`;
  }

  function markUnavailable(error) {
    playbackActive = false;
    permanentlyUnavailable = true;
    lastError = error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string" ? error : describeMediaError();
    setPlaybackAttributes(enabled ? "UNAVAILABLE" : "PAUSED");
  }

  function useNativeFallback() {
    externalControllerAvailable = false;
    audio.pause();
    playbackActive = false;
    setPlaybackAttributes("NATIVE_FALLBACK");
  }

  function startMusic() {
    // Re-verify before every possible start. If storage becomes unavailable
    // after boot, pause this player before the event reaches native handlers.
    if (!externalControllerAvailable || !suppressNativeMusic()) {
      useNativeFallback();
      return;
    }
    if (disposed || !enabled || document.hidden) {
      setPlaybackAttributes(enabled ? "IDLE" : "PAUSED");
      return;
    }
    if (permanentlyUnavailable) {
      setPlaybackAttributes("UNAVAILABLE");
      return;
    }
    if (playbackActive && !audio.paused) {
      setPlaybackAttributes("PLAYING");
      return;
    }
    playAttempts += 1;
    if (!audio.src) audio.src = TRACK_URL;
    // Calling play here, directly inside pointerdown/keydown/click, preserves
    // transient user activation in Chromium and WebKit.
    let attempt;
    try {
      attempt = audio.play();
      playReturnKind = attempt && typeof attempt.then === "function" ? "promise" : typeof attempt;
    } catch (error) {
      playReturnKind = "throw";
      markUnavailable(error);
      return;
    }
    setPlaybackAttributes("STARTING");
    if (attempt && typeof attempt.then === "function") {
      attempt.then(() => {
        lastError = null;
        if (!audio.paused) {
          playbackActive = true;
          setPlaybackAttributes("PLAYING");
        }
      }).catch((error) => {
        if (error?.name !== "NotAllowedError") markUnavailable(error);
        else {
          playbackActive = false;
          lastError = error instanceof Error ? `${error.name}: ${error.message}` : "Music could not start.";
          setPlaybackAttributes("BLOCKED");
        }
      });
    }
  }

  function setEnabled(next) {
    if (!externalControllerAvailable) {
      useNativeFallback();
      return;
    }
    enabled = next;
    writePreference();
    if (!suppressNativeMusic()) {
      useNativeFallback();
      return;
    }
    if (enabled) {
      permanentlyUnavailable = false;
      lastError = null;
      startMusic();
    }
    else pauseMusic();
    syncControls();
  }

  function resolveMusicControl(target) {
    if (!externalControllerAvailable) return null;
    if (!(target instanceof Element)) return null;
    const toolbar = target.closest(".toolbar button[aria-label^='Music ']");
    const settingsMusic = toolbar
      ? null
      : document.querySelector(".settings-modal label.toggle-row input[type='checkbox']");
    const checkbox = settingsMusic
      ? target.closest(".settings-modal input[type='checkbox']")
      : null;
    const control = toolbar ?? (checkbox === settingsMusic ? settingsMusic : null);
    if (!control) return null;
    if (!suppressNativeMusic()) {
      useNativeFallback();
      return null;
    }
    return control;
  }

  function isMusicControl(target) {
    return resolveMusicControl(target) !== null;
  }

  function interceptMusicControl(event) {
    const control = resolveMusicControl(event.target);
    if (!control) return;
    event.stopImmediatePropagation();
    if (control instanceof HTMLInputElement) {
      // Checkbox legacy pre-activation has already updated `checked` when the
      // click event is dispatched. Do not cancel it or the browser will restore
      // the old value after this handler.
      setEnabled(control.checked);
      queueMicrotask(syncControls);
      return;
    }
    event.preventDefault();
    setEnabled(!enabled);
  }

  function requestStart(event) {
    if (event instanceof KeyboardEvent && event.repeat) return;
    if (isMusicControl(event.target)) return;
    startMusic();
  }

  function syncControls() {
    if (syncingControls) return;
    syncingControls = true;
    if (!externalControllerAvailable) {
      setPlaybackAttributes("NATIVE_FALLBACK");
      syncingControls = false;
      return;
    }
    const toolbarButton = document.querySelector(".toolbar button[aria-label^='Music ']");
    if (toolbarButton) {
      setAttributeIfChanged(toolbarButton, "aria-label", enabled ? "Music on" : "Music off");
      setAttributeIfChanged(toolbarButton, "aria-pressed", String(enabled));
      setAttributeIfChanged(toolbarButton, "title", enabled ? "Turn music off" : "Turn music on");
    }
    const settingsCheckbox = document.querySelector(".settings-modal input[type='checkbox']");
    if (settingsCheckbox instanceof HTMLInputElement && settingsCheckbox.checked !== enabled) settingsCheckbox.checked = enabled;
    setPlaybackAttributes(!enabled
      ? "PAUSED"
      : permanentlyUnavailable ? "UNAVAILABLE"
        : playbackActive ? "PLAYING" : playbackState);
    syncingControls = false;
  }

  const controlObserver = new MutationObserver(syncControls);
  controlObserver.observe(document.body, { subtree: true, childList: true, attributes: true });

  document.addEventListener("pointerdown", requestStart, { capture: true, signal: teardown.signal });
  document.addEventListener("keydown", requestStart, { capture: true, signal: teardown.signal });
  document.addEventListener("click", interceptMusicControl, { capture: true, signal: teardown.signal });
  audio.addEventListener("playing", () => {
    playbackActive = true;
    lastError = null;
    setPlaybackAttributes("PLAYING");
  }, { signal: teardown.signal });
  audio.addEventListener("error", () => markUnavailable(describeMediaError()), { signal: teardown.signal });
  audio.addEventListener("ended", () => {
    playbackActive = false;
    if (enabled && !disposed) setPlaybackAttributes("IDLE");
  }, { signal: teardown.signal });
  document.addEventListener("visibilitychange", () => {
    if (!externalControllerAvailable) {
      setPlaybackAttributes("NATIVE_FALLBACK");
      return;
    }
    if (document.hidden) pauseMusic("PAUSED");
    else if (enabled) startMusic();
  }, { signal: teardown.signal });
  window.addEventListener("pageshow", () => {
    disposed = false;
    if (externalControllerAvailable && !suppressNativeMusic()) useNativeFallback();
    syncControls();
  }, { signal: teardown.signal });
  window.addEventListener("pagehide", (event) => {
    pauseMusic("DISPOSED");
    if (event.persisted) return;
    if (disposed) return;
    disposed = true;
    restoreNativePreference();
    teardown.abort();
    controlObserver.disconnect();
    audio.removeAttribute("src");
    audio.load();
  }, { signal: teardown.signal });

  syncControls();

  window.__MATHNEXA_CROSSCALC_MUSIC__ = Object.freeze({
    source: TRACK_URL,
    start: startMusic,
    stop: pauseMusic,
    setEnabled,
    snapshot: () => Object.freeze({
      enabled,
      paused: audio.paused,
      loop: audio.loop,
      currentTime: audio.currentTime,
      playAttempts,
      activeSources: playbackActive ? 1 : 0,
      playbackState,
      controller: externalControllerAvailable ? "external-media" : "native-fallback",
      unavailable: permanentlyUnavailable,
      error: lastError,
      playReturnKind,
      hasSource: Boolean(audio.src),
      mediaErrorCode: audio.error?.code ?? null,
      mediaErrorMessage: audio.error?.message ?? null,
      readyState: audio.readyState,
      networkState: audio.networkState,
      canPlayMpeg: audio.canPlayType("audio/mpeg")
    })
  });
})();
