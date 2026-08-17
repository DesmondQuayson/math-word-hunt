(function installNumberLogicMediaFallback() {
  "use strict";

  var HOOK = "__MATHNEXA_NUMBER_LOGIC_MEDIA_FALLBACK__";
  var STORAGE_KEY = "mathnexa:number-logic-audio:1";
  var SETTINGS_VERSION = "number-logic-audio/1";
  var TRACK_PATH = "./assets/oldskool-cc0-CQNT44Pl.mp3";
  var HEADROOM = 0.92;
  var trackUrl = new URL(TRACK_PATH, document.baseURI);

  if (window[HOOK] || trackUrl.origin !== window.location.origin) return;

  var audio = new Audio();
  var mediaSupported = audio.canPlayType("audio/mpeg") !== "";
  var activeNode = null;
  var contextState = "suspended";
  var disposed = false;
  var playPromise = null;
  var playAttempts = 0;
  var successfulStarts = 0;
  var pauseCount = 0;
  var contextCount = 0;
  var lastError = null;
  var listenersInstalled = false;

  audio.loop = true;
  audio.preload = "none";
  audio.setAttribute("playsinline", "");

  function readSettings() {
    var defaults = {
      masterMuted: false,
      musicEnabled: true,
      musicVolume: 0.35
    };
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.version !== SETTINGS_VERSION) return defaults;
      return {
        masterMuted: parsed.masterMuted === true,
        musicEnabled: parsed.musicEnabled !== false,
        musicVolume: typeof parsed.musicVolume === "number" && Number.isFinite(parsed.musicVolume)
          ? Math.max(0, Math.min(1, parsed.musicVolume))
          : defaults.musicVolume
      };
    } catch (_error) {
      return defaults;
    }
  }

  function syncLevels() {
    var settings = readSettings();
    audio.muted = settings.masterMuted;
    audio.volume = settings.musicVolume * HEADROOM;
    return settings;
  }

  function mayPlay() {
    var settings = syncLevels();
    return mediaSupported && settings.musicEnabled && !settings.masterMuted && !document.hidden && !disposed;
  }

  function autoplayError() {
    return new DOMException("Number Logic music needs a user gesture.", "NotAllowedError");
  }

  function ensureSource() {
    if (!audio.src) audio.src = trackUrl.href;
  }

  function startMedia() {
    if (!mayPlay()) return Promise.resolve(false);
    if (!audio.paused && !audio.ended) {
      contextState = "running";
      return Promise.resolve(true);
    }
    if (playPromise) return playPromise;

    playAttempts += 1;
    var requested;
    try {
      ensureSource();
      requested = audio.play();
    } catch (error) {
      lastError = error && error.name ? error.name : "MediaPlayError";
      return Promise.resolve(false);
    }
    playPromise = Promise.resolve(requested).then(function onPlaying() {
      contextState = "running";
      successfulStarts += 1;
      lastError = null;
      return true;
    }, function onBlocked(error) {
      contextState = "suspended";
      lastError = error && error.name ? error.name : "MediaPlayError";
      return false;
    }).finally(function clearPlayPromise() {
      playPromise = null;
    });
    return playPromise;
  }

  function pauseMedia(reason) {
    if (!audio.paused) {
      audio.pause();
      pauseCount += 1;
    }
    if (reason === "pagehide" || reason === "close") contextState = reason === "close" ? "closed" : "suspended";
  }

  function releaseMedia() {
    disposed = true;
    activeNode = null;
    pauseMedia("close");
    removeListeners();
    audio.removeAttribute("src");
    audio.load();
  }

  function eligibleGesture(event) {
    var root = document.getElementById("root");
    if (!root || !root.contains(event.target)) return;
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    void startMedia();
  }

  function onVisibilityChange() {
    if (document.hidden) pauseMedia("visibility");
  }

  function onMediaError() {
    var code = audio.error && typeof audio.error.code === "number" ? audio.error.code : 0;
    lastError = code ? "MediaError:" + code : "MediaError";
    activeNode = null;
    pauseMedia("media-error");
  }

  function onPageHide(event) {
    pauseMedia("pagehide");
    if (!event.persisted) releaseMedia();
  }

  function installListeners() {
    if (listenersInstalled) return;
    document.addEventListener("pointerdown", eligibleGesture, true);
    document.addEventListener("keydown", eligibleGesture, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    audio.addEventListener("error", onMediaError);
    listenersInstalled = true;
  }

  function removeListeners() {
    if (!listenersInstalled) return;
    document.removeEventListener("pointerdown", eligibleGesture, true);
    document.removeEventListener("keydown", eligibleGesture, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    audio.removeEventListener("error", onMediaError);
    listenersInstalled = false;
  }

  function MediaGain() {
    this.gain = {
      setValueAtTime: function setValueAtTime() { syncLevels(); },
      exponentialRampToValueAtTime: function exponentialRampToValueAtTime() { syncLevels(); }
    };
  }
  MediaGain.prototype.connect = function connect() { return this; };
  MediaGain.prototype.disconnect = function disconnect() {};

  function MediaBufferSource() {
    this.buffer = null;
    this.loop = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.stopped = false;
  }
  MediaBufferSource.prototype.connect = function connect() { return this; };
  MediaBufferSource.prototype.disconnect = function disconnect() {};
  MediaBufferSource.prototype.start = function start() {
    if (activeNode && activeNode !== this) activeNode.stop();
    activeNode = this;
    this.stopped = false;
    void startMedia().then(function clearRejectedSource(started) {
      if (!started && activeNode === this) activeNode = null;
    }.bind(this));
  };
  MediaBufferSource.prototype.stop = function stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (activeNode === this) activeNode = null;
    pauseMedia("source-stop");
  };

  function MediaOscillator() {
    this.type = "sine";
    this.frequency = { setValueAtTime: function setValueAtTime() {}, linearRampToValueAtTime: function linearRampToValueAtTime() {} };
    this.ended = null;
  }
  MediaOscillator.prototype.connect = function connect() { return this; };
  MediaOscillator.prototype.disconnect = function disconnect() {};
  MediaOscillator.prototype.addEventListener = function addEventListener(name, listener) {
    if (name === "ended") this.ended = listener;
  };
  MediaOscillator.prototype.start = function start() {};
  MediaOscillator.prototype.stop = function stop() { if (this.ended) this.ended(); };

  function MediaAudioContext() {
    contextCount += 1;
    this.destination = {};
  }
  Object.defineProperty(MediaAudioContext.prototype, "state", { get: function getState() { return contextState; } });
  Object.defineProperty(MediaAudioContext.prototype, "currentTime", { get: function getCurrentTime() { return Number.isFinite(audio.currentTime) ? audio.currentTime : 0; } });
  MediaAudioContext.prototype.createGain = function createGain() { return new MediaGain(); };
  MediaAudioContext.prototype.createBufferSource = function createBufferSource() { return new MediaBufferSource(); };
  MediaAudioContext.prototype.createOscillator = function createOscillator() { return new MediaOscillator(); };
  MediaAudioContext.prototype.decodeAudioData = function decodeAudioData() {
    var samples = new Float32Array(1_000);
    return Promise.resolve({
      sampleRate: 1_000,
      length: samples.length,
      duration: 1,
      numberOfChannels: 1,
      getChannelData: function getChannelData() { return samples; }
    });
  };
  MediaAudioContext.prototype.resume = function resume() {
    if (disposed || contextState === "closed") return Promise.reject(new DOMException("Audio context is closed.", "InvalidStateError"));
    return startMedia().then(function verifyStarted(started) {
      if (!started) throw autoplayError();
    });
  };
  MediaAudioContext.prototype.close = function close() {
    if (!disposed) releaseMedia();
    return Promise.resolve();
  };

  var diagnostic = Object.freeze({
    kind: "html-media-fallback",
    source: trackUrl.pathname,
    snapshot: function snapshot() {
      var settings = readSettings();
      return Object.freeze({
        supported: mediaSupported,
        contextState: contextState,
        contextCount: contextCount,
        mediaElements: 1,
        sourceAssigned: audio.src === trackUrl.href,
        activeSources: audio.paused ? 0 : 1,
        paused: audio.paused,
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        loop: audio.loop,
        muted: audio.muted,
        volume: audio.volume,
        musicEnabled: settings.musicEnabled,
        masterMuted: settings.masterMuted,
        playAttempts: playAttempts,
        successfulStarts: successfulStarts,
        pauseCount: pauseCount,
        lastError: lastError,
        listenersInstalled: listenersInstalled
      });
    }
  });

  Object.defineProperty(window, HOOK, { configurable: false, enumerable: false, writable: false, value: diagnostic });
  Object.defineProperty(window, "AudioContext", { configurable: true, value: MediaAudioContext });
  if (typeof window.webkitAudioContext !== "function") Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: MediaAudioContext });
  syncLevels();
  installListeners();
})();
