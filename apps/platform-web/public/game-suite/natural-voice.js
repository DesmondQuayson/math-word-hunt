/*
 * MathNexa natural voice for Math Vocabulary Hunt (v2 — term-first sequencing).
 *
 * The canonical game speaks through window.speechSynthesis. This adapter,
 * injected ahead of the game script by the runtime enhancement pipeline,
 * replaces that surface with a first-party prebuilt-audio engine
 * (Chirp 3: HD, en-US-Chirp3-HD-Aoede clips under /game-suite/voice/).
 *
 * The game itself never requests the vocabulary term on a grid find — it only
 * speaks praise (markFound → playCorrectAudio → praise), while writing the
 * found term into #findTerm in the same tick. So when a praise phrase
 * arrives, this engine reads #findTerm and plays the sequence
 *
 *     [term clip] → short natural gap → [praise clip]
 *
 * firing the game's utterance.onend only when the WHOLE sequence ends, so the
 * game's own music ducking stays lowered through term + praise and restores
 * once. Bank-mode term speech still plays directly; a praise following the
 * same term skips the duplicate pronunciation instead of canceling it.
 *
 * Hard rules honored: one pronunciation per find (duplicate events dropped),
 * newest find wins (old sequence stops cleanly), clips never loop, a missing
 * clip stays SILENT with visible text — browser speech synthesis is never
 * invoked. Diagnostics: data-voice-source (prebuilt|silent),
 * data-voice-state (playing|idle), data-last-spoken-term.
 * No credentials, no third-party requests: same-origin audio only.
 */
(function () {
  "use strict";
  if (window.__mathnexaNaturalVoice) return;
  window.__mathnexaNaturalVoice = true;

  var MANIFEST_URL = "/game-suite/voice/manifest.json";
  var PRAISE = {
    "Good job, Chief!": true,
    "Nice find, Chief!": true,
    "That's it, Chief!": true,
    "Sharp eyes!": true,
    "You got it!": true,
    "Way to go, Chief!": true
  };
  var SEQUENCE_GAP_MS = 160;
  var DUPLICATE_WINDOW_MS = 600;

  var manifestPromise = null;
  var clipCache = Object.create(null);
  var sequenceToken = 0;
  var active = null; // { token, utterance, audio, texts }
  var lastRequest = { text: "", at: 0 };
  var spokenTermMemory = { term: "", at: 0 };

  function normalize(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  }

  function setAttr(name, value) {
    try { document.documentElement.setAttribute(name, value); } catch (_) {}
  }

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(MANIFEST_URL, { credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error("manifest " + r.status); return r.json(); })
        .catch(function () { return null; });
    }
    return manifestPromise;
  }

  function clipFor(manifest, phrase) {
    return manifest && manifest.clips ? manifest.clips[phrase] || null : null;
  }

  function audioFor(file) {
    var audio = clipCache[file];
    if (!audio) {
      audio = new Audio("/game-suite/voice/" + file);
      audio.preload = "auto";
      clipCache[file] = audio;
    }
    audio.loop = false;
    return audio;
  }

  function settle(utterance, kind) {
    try {
      if (kind === "end" && utterance && typeof utterance.onend === "function") {
        utterance.onend({ type: "end", utterance: utterance });
      } else if (kind !== "end" && utterance && typeof utterance.onerror === "function") {
        utterance.onerror({ type: "error", error: kind, utterance: utterance });
      }
    } catch (_) {}
  }

  function stopActive(reason) {
    if (!active) return;
    var stopped = active;
    active = null;
    try { stopped.audio && stopped.audio.pause(); } catch (_) {}
    setAttr("data-voice-state", "idle");
    settle(stopped.utterance, reason || "canceled");
  }

  function playOne(file, token) {
    return new Promise(function (resolve) {
      if (token !== sequenceToken) return resolve("superseded");
      var audio = audioFor(file);
      try { audio.currentTime = 0; } catch (_) {}
      if (active) active.audio = audio;
      audio.onended = function () { resolve("ended"); };
      audio.onerror = function () { resolve("error"); };
      var played = audio.play();
      if (played && typeof played.then === "function") {
        played.then(function () {
          if (token === sequenceToken) {
            setAttr("data-voice-source", "prebuilt");
            setAttr("data-voice-state", "playing");
          }
        }).catch(function () { resolve("blocked"); });
      } else {
        setAttr("data-voice-source", "prebuilt");
        setAttr("data-voice-state", "playing");
      }
    });
  }

  function wait(ms, token) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(token === sequenceToken ? "ok" : "superseded"); }, ms);
    });
  }

  function currentFindTerm() {
    try {
      var node = document.getElementById("findTerm");
      return node ? normalize(node.textContent) : "";
    } catch (_) { return ""; }
  }

  function speak(utterance) {
    var text = normalize(utterance && utterance.text);
    var now = Date.now();
    // Duplicate-event guard: identical request while the same content is in
    // flight (double listeners, rerenders, pointer+key double events).
    if (text && text === lastRequest.text && now - lastRequest.at < DUPLICATE_WINDOW_MS) {
      settle(utterance, "end");
      return;
    }
    lastRequest = { text: text, at: now };

    var token = ++sequenceToken;
    stopActive("interrupted");
    if (!text) { settle(utterance, "end"); return; }

    loadManifest().then(function (manifest) {
      if (token !== sequenceToken) return;
      var sequence = [];
      var termSpokenHere = "";

      if (PRAISE[text]) {
        // Correct-find praise: the found term is in #findTerm (written by the
        // game 220ms earlier). Speak it FIRST — once per find.
        var term = currentFindTerm();
        var termClip = term ? clipFor(manifest, term) : null;
        var alreadySpoken = term && spokenTermMemory.term === term && now - spokenTermMemory.at < 8000;
        if (termClip && !alreadySpoken) {
          sequence.push(termClip);
          termSpokenHere = term;
        }
        var praiseClip = clipFor(manifest, text);
        if (praiseClip) sequence.push(praiseClip);
      } else {
        var directClip = clipFor(manifest, text);
        if (directClip) {
          sequence.push(directClip);
          if (!PRAISE[text] && manifest && manifest.clips && manifest.clips[text] && text !== "Puzzle complete! Great teamwork!") {
            // Bank-mode (or future) direct term speech.
            termSpokenHere = text;
          }
        }
      }

      if (sequence.length === 0) {
        setAttr("data-voice-source", "silent");
        settle(utterance, "end");
        return;
      }

      if (termSpokenHere) {
        spokenTermMemory = { term: termSpokenHere, at: now };
        setAttr("data-last-spoken-term", termSpokenHere);
      }

      active = { token: token, utterance: utterance, audio: null, texts: sequence.slice() };

      (async function run() {
        for (var i = 0; i < sequence.length; i += 1) {
          if (token !== sequenceToken) return;
          if (i > 0) {
            var gap = await wait(SEQUENCE_GAP_MS, token);
            if (gap !== "ok") return;
          }
          var outcome = await playOne(sequence[i], token);
          if (token !== sequenceToken) return;
          if (outcome === "error" || outcome === "blocked") {
            setAttr("data-voice-source", "silent");
            break;
          }
        }
        if (token === sequenceToken && active && active.token === token) {
          active = null;
          setAttr("data-voice-state", "idle");
          settle(utterance, "end");
        }
      })();
    });
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

  var engine = {
    speak: speak,
    cancel: function () {
      sequenceToken += 1;
      lastRequest = { text: "", at: 0 };
      stopActive("canceled");
    },
    pause: function () { if (active && active.audio) { try { active.audio.pause(); } catch (_) {} } },
    resume: function () {
      if (active && active.audio) {
        var played = active.audio.play();
        if (played && typeof played.catch === "function") played.catch(function () {});
      }
    },
    getVoices: function () { return []; },
    addEventListener: function () {},
    removeEventListener: function () {},
    onvoiceschanged: null
  };
  Object.defineProperty(engine, "speaking", { get: function () { return active !== null; } });
  Object.defineProperty(engine, "pending", { get: function () { return false; } });
  Object.defineProperty(engine, "paused", { get: function () { return active !== null && active.audio !== null && active.audio.paused; } });

  try {
    Object.defineProperty(window, "speechSynthesis", { value: engine, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FauxUtterance, configurable: true });
  } catch (_) {
    window.speechSynthesis = engine;
    window.SpeechSynthesisUtterance = FauxUtterance;
  }

  window.addEventListener("pagehide", function () { engine.cancel(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") engine.pause();
    else engine.resume();
  });

  var warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    loadManifest().then(function (manifest) {
      if (!manifest || !manifest.preload) return;
      manifest.preload.forEach(function (file) { audioFor(file); });
    });
  }
  window.addEventListener("pointerdown", warm, { once: true, passive: true });
  window.addEventListener("keydown", warm, { once: true });
})();
