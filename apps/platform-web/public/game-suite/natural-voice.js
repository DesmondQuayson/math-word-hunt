/*
 * MathNexa natural voice for Math Vocabulary Hunt.
 *
 * The canonical game speaks through window.speechSynthesis. This adapter,
 * injected ahead of the game script by the runtime enhancement pipeline,
 * replaces that surface with a first-party prebuilt-audio engine:
 *
 *   speak(utterance)  -> look up the exact phrase in /game-suite/voice/
 *                        manifest.json -> play the natural MP3 once.
 *   cancel()          -> stop the current clip immediately.
 *
 * The game's own behavior is preserved untouched: its music ducking runs
 * before speak(), and its duck-restore hangs off utterance.onend/onerror,
 * which this engine fires when the clip ends or fails. A phrase with no
 * clip stays SILENT (the game always shows the text) — browser speech
 * synthesis is never used, so the robotic voice cannot return.
 *
 * Diagnostics: document.documentElement.dataset.voiceSource =
 *   "prebuilt" | "silent" (also exposed as data-voice-source).
 * No credentials, no third-party requests: same-origin audio only.
 */
(function () {
  "use strict";
  if (window.__mathnexaNaturalVoice) return;
  window.__mathnexaNaturalVoice = true;

  var MANIFEST_URL = "/game-suite/voice/manifest.json";
  var manifestPromise = null;
  var clipCache = Object.create(null);
  var current = null; // { audio, utterance, token }
  var playToken = 0;

  function normalize(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  }

  function mark(source) {
    try {
      document.documentElement.setAttribute("data-voice-source", source);
    } catch (_) {}
  }

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(MANIFEST_URL, { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error("manifest " + response.status);
          return response.json();
        })
        .catch(function () {
          return null;
        });
    }
    return manifestPromise;
  }

  function settle(utterance, kind) {
    // Mirror the native contract the game relies on for duck-restore.
    try {
      if (kind === "end" && typeof utterance.onend === "function") {
        utterance.onend({ type: "end", utterance: utterance });
      } else if (kind !== "end" && typeof utterance.onerror === "function") {
        utterance.onerror({ type: "error", error: kind, utterance: utterance });
      }
    } catch (_) {}
  }

  function stopCurrent(reason) {
    if (!current) return;
    var stopped = current;
    current = null;
    try {
      stopped.audio.pause();
      stopped.audio.src = "";
    } catch (_) {}
    settle(stopped.utterance, reason || "canceled");
  }

  function FauxUtterance(text) {
    this.text = String(text == null ? "" : text);
    this.lang = "en-US";
    this.voice = null;
    this.volume = 1;
    this.rate = 1;
    this.pitch = 1;
    this.onend = null;
    this.onerror = null;
    this.onstart = null;
  }
  FauxUtterance.prototype.addEventListener = function (name, handler) {
    if (name === "end") this.onend = handler;
    if (name === "error") this.onerror = handler;
    if (name === "start") this.onstart = handler;
  };
  FauxUtterance.prototype.removeEventListener = function () {};

  function speak(utterance) {
    var token = ++playToken;
    stopCurrent("interrupted");
    var phrase = normalize(utterance && utterance.text);
    if (!phrase) {
      settle(utterance, "end");
      return;
    }
    loadManifest().then(function (manifest) {
      if (token !== playToken) return; // superseded while loading
      var file = manifest && manifest.clips ? manifest.clips[phrase] : null;
      if (!file) {
        // No clip: stay silent — the text is always visible in the game.
        mark("silent");
        settle(utterance, "end");
        return;
      }
      var audio = clipCache[file];
      if (!audio) {
        audio = new Audio("/game-suite/voice/" + file);
        audio.preload = "auto";
        clipCache[file] = audio;
      }
      try {
        audio.currentTime = 0;
      } catch (_) {}
      audio.loop = false; // narration never loops
      var entry = { audio: audio, utterance: utterance, token: token };
      current = entry;
      audio.onended = function () {
        if (current === entry) {
          current = null;
          settle(utterance, "end");
        }
      };
      audio.onerror = function () {
        if (current === entry) {
          current = null;
          mark("silent");
          settle(utterance, "not-allowed");
        }
      };
      var played = audio.play();
      if (played && typeof played.then === "function") {
        played
          .then(function () {
            if (current === entry) {
              mark("prebuilt");
              if (typeof utterance.onstart === "function") {
                try { utterance.onstart({ type: "start", utterance: utterance }); } catch (_) {}
              }
            }
          })
          .catch(function () {
            if (current === entry) {
              current = null;
              mark("silent");
              settle(utterance, "not-allowed");
            }
          });
      } else {
        mark("prebuilt");
      }
    });
  }

  var engine = {
    speak: speak,
    cancel: function () {
      playToken++;
      stopCurrent("canceled");
    },
    pause: function () {
      if (current) {
        try { current.audio.pause(); } catch (_) {}
      }
    },
    resume: function () {
      if (current) {
        var played = current.audio.play();
        if (played && typeof played.catch === "function") played.catch(function () {});
      }
    },
    getVoices: function () {
      return [];
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    onvoiceschanged: null
  };
  Object.defineProperty(engine, "speaking", { get: function () { return current !== null; } });
  Object.defineProperty(engine, "pending", { get: function () { return false; } });
  Object.defineProperty(engine, "paused", { get: function () { return current !== null && current.audio.paused; } });

  try {
    Object.defineProperty(window, "speechSynthesis", { value: engine, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FauxUtterance, configurable: true });
  } catch (_) {
    window.speechSynthesis = engine;
    window.SpeechSynthesisUtterance = FauxUtterance;
  }

  // Leaving the page must never leave narration running.
  window.addEventListener("pagehide", function () { engine.cancel(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") engine.pause();
    else engine.resume();
  });

  // Warm the manifest and the short recurring phrases after first interaction.
  var warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    loadManifest().then(function (manifest) {
      if (!manifest || !manifest.preload) return;
      manifest.preload.forEach(function (file) {
        if (!clipCache[file]) {
          var audio = new Audio("/game-suite/voice/" + file);
          audio.preload = "auto";
          clipCache[file] = audio;
        }
      });
    });
  }
  window.addEventListener("pointerdown", warm, { once: true, passive: true });
  window.addEventListener("keydown", warm, { once: true });
})();
