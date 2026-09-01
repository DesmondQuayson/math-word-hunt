/*
 * MathNexa natural voice engine v4 — direct API + Web Audio.
 *
 * The game now calls this engine EXPLICITLY at the real event sources
 * (word-bank selection, correct-find praise, completion) via:
 *
 *   window.MathNexaVoice.playVocabularyTerm(display)
 *   window.MathNexaVoice.playPraise(text)
 *   window.MathNexaVoice.preloadTerms([displays])
 *
 * Playback is Web Audio: one shared AudioContext, created/resumed
 * SYNCHRONOUSLY inside real user gestures (capture-phase first interaction
 * AND again inside every play call, which runs in the click stack), decoded
 * clip buffers cached per phrase. Clips are first-party Chirp 3: HD Aoede
 * MP3s under /game-suite/voice/ — browser speechSynthesis is never used.
 *
 * Honest states (set only when true):
 *   data-voice-state: requested | started | ended | blocked | error
 *   data-voice-source: prebuilt (only once playback genuinely started) | silent
 *   data-last-spoken-term
 * "started" is set strictly after the AudioContext is running and the
 * buffer source has started. Diagnostics: window.__MATHNEXA_VOICE_DEBUG__
 * always; visible panel with ?audioDebug=1. No credentials anywhere.
 *
 * A tiny speechSynthesis-compatible shim remains only as a safety net for
 * any legacy call path; it routes praise/terms into this engine and never
 * falls back to the robotic browser voice.
 */
(function () {
  "use strict";
  if (window.MathNexaVoice) return;

  var MANIFEST_URL = "/game-suite/voice/manifest.json";
  var CLIP_BASE = "/game-suite/voice/";
  var PRAISE_SET = {
    "Good job, Chief!": 1, "Nice find, Chief!": 1, "That's it, Chief!": 1,
    "Sharp eyes!": 1, "You got it!": 1, "Way to go, Chief!": 1,
    "Puzzle complete! Great teamwork!": 1
  };
  var DUPLICATE_MS = 300;

  // ---------- diagnostics ----------
  var debug = {
    enabled: /[?&]audioDebug=1/.test(location.search),
    events: [],
    state: {
      selectedTerm: null, handler: null, termId: null, audioUrl: null,
      voice: "Chirp3-HD Aoede", audioContext: "none", unlock: "not-attempted",
      playVocabularyTerm: "not-called", playback: "idle", voiceSource: null,
      lastError: "none", playbackCount: 0
    }
  };
  window.__MATHNEXA_VOICE_DEBUG__ = debug;
  function log(event, detail) {
    debug.events.push({ t: Date.now(), event: event, detail: detail == null ? null : String(detail).slice(0, 140) });
    if (debug.events.length > 200) debug.events.shift();
    renderPanel();
  }
  function setAttr(name, value) { try { document.documentElement.setAttribute(name, value); } catch (_) {} }
  function setState(key, value) { debug.state[key] = value; renderPanel(); }
  var panel = null;
  function renderPanel() {
    if (!debug.enabled) return;
    try {
      if (!panel) {
        if (!document.body) return;
        panel = document.createElement("div");
        panel.id = "mathnexa-audio-debug";
        panel.setAttribute("style", "position:fixed;right:8px;bottom:8px;z-index:99999;max-width:300px;background:rgba(7,21,37,.94);color:#9fe8f2;font:11px/1.5 monospace;padding:8px 10px;border:1px solid #20cfe3;border-radius:8px;pointer-events:none;white-space:pre-wrap;");
        document.body.appendChild(panel);
      }
      var s = debug.state;
      panel.textContent =
        "AUDIO DEBUG\n" +
        "Selected term: " + (s.selectedTerm || "-") + "\n" +
        "Selection handler: " + (s.handler || "-") + "\n" +
        "Term ID: " + (s.termId || "-") + "\n" +
        "Audio URL: " + (s.audioUrl || "-") + "\n" +
        "Voice: " + s.voice + "\n" +
        "AudioContext: " + s.audioContext + "\n" +
        "Unlock: " + s.unlock + "\n" +
        "playVocabularyTerm: " + s.playVocabularyTerm + "\n" +
        "Playback: " + s.playback + "\n" +
        "Voice source: " + (s.voiceSource || "-") + "\n" +
        "Last error: " + s.lastError + "\n" +
        "Playback count: " + s.playbackCount;
    } catch (_) {}
  }
  if (debug.enabled) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderPanel);
    else renderPanel();
  }

  // ---------- audio context ----------
  /*
   * VOICE CHANNEL - pronunciation runs at unity and nothing may attenuate it.
   *
   * Every clip is routed through this engine's OWN gain node, pinned to 1.0,
   * inside this engine's OWN AudioContext. It is never connected to the
   * background-music channel (a separate HTMLAudioElement owned by
   * math-vocabulary-music.js), so lowering the music cannot lower a spoken
   * term, and the music button cannot silence one. Unity means unity: the
   * clips are already normalised, so gain is never pushed above 1.0.
   */
  var VOICE_CHANNEL_LEVEL = 1;
  var voiceGain = null;
  var context = null;
  function ensureContext() {
    if (!context) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { setState("audioContext", "unsupported"); return null; }
      try { context = new Ctor(); } catch (error) { setState("audioContext", "create-failed"); setState("lastError", String(error)); return null; }
    }
    return context;
  }
  function ensureVoiceGain(ctx) {
    if (!ctx) return null;
    if (!voiceGain || voiceGain.context !== ctx) {
      try {
        voiceGain = ctx.createGain();
        voiceGain.gain.value = VOICE_CHANNEL_LEVEL;
        voiceGain.connect(ctx.destination);
      } catch (error) {
        voiceGain = null;
        setState("lastError", "voiceGain: " + error);
      }
    }
    return voiceGain;
  }

  function voiceDestination(ctx) {
    return ensureVoiceGain(ctx) || ctx.destination;
  }

  function resumeContext(reason) {
    var ctx = ensureContext();
    if (!ctx) return null;
    if (ctx.state !== "running") {
      try {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function (e) { setState("lastError", "resume: " + e); });
      } catch (e) { setState("lastError", "resume: " + e); }
    }
    setState("audioContext", ctx.state);
    log("audioContextResume", reason + " -> " + ctx.state);
    return ctx;
  }
  // HTMLAudio fallback for environments without Web Audio (real desktop and
  // mobile Safari both have it; this covers unusual embedders and the
  // Windows WebKit test build). Playback stays first-party and CSP-legal
  // (media-src 'self').
  var fallbackEl = null;
  function ensureFallbackEl() {
    if (!fallbackEl) { fallbackEl = new Audio(); fallbackEl.preload = "auto"; fallbackEl.loop = false; }
    fallbackEl.volume = VOICE_CHANNEL_LEVEL;
    return fallbackEl;
  }

  function unlock() {
    setState("unlock", "attempted");
    log("audioUnlockAttempt");
    var ctx = resumeContext("unlock");
    if (!ctx) {
      setState("unlock", "html-audio-fallback");
      log("audioUnlockResult", "no WebAudio - HTMLAudio fallback armed");
      ensureFallbackEl();
      return;
    }
    // Play one silent sample synchronously in the gesture: definitive unlock.
    try {
      var buffer = ctx.createBuffer(1, 1, 22050);
      var source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      setState("unlock", "success");
      log("audioUnlockResult", "success state=" + ctx.state);
    } catch (error) {
      setState("unlock", "failed");
      setState("lastError", String(error));
      log("audioUnlockResult", "failed " + error);
    }
    setState("audioContext", ctx.state);
  }
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  window.addEventListener("touchend", unlock, { once: true, capture: true });

  // ---------- manifest + clip buffers ----------
  var manifestPromise = null;
  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(MANIFEST_URL, { credentials: "same-origin" })
        .then(function (r) {
          log("manifestLookup", "HTTP " + r.status);
          if (!r.ok) throw new Error("manifest " + r.status);
          return r.json();
        })
        .catch(function (error) {
          setState("lastError", "manifest: " + error);
          manifestPromise = null; // allow retry on the next call
          return null;
        });
    }
    return manifestPromise;
  }
  loadManifest();

  var buffers = Object.create(null); // file -> Promise<AudioBuffer|null>
  function bufferFor(file) {
    if (!buffers[file]) {
      buffers[file] = fetch(CLIP_BASE + file, { credentials: "same-origin" })
        .then(function (r) {
          log("clipFetch", file + " HTTP " + r.status);
          if (!r.ok) throw new Error("clip " + r.status);
          return r.arrayBuffer();
        })
        .then(function (bytes) {
          var ctx = ensureContext();
          if (!ctx) throw new Error("no-audio-context");
          return new Promise(function (resolve, reject) {
            ctx.decodeAudioData(bytes.slice(0), resolve, reject);
          });
        })
        .then(function (buffer) { log("clipDecoded", file); return buffer; })
        .catch(function (error) {
          setState("lastError", "clip " + file + ": " + error);
          delete buffers[file];
          return null;
        });
    }
    return buffers[file];
  }

  var normalize = function (text) { return String(text == null ? "" : text).replace(/\s+/g, " ").trim(); };

  // ---------- playback core ----------
  var activeSource = null; // { source, kind, phrase, startedAt, onDone }
  var queuedPraise = null;
  var lastPlay = { phrase: "", at: 0 };

  /*
   * SPEECH ACTIVITY — the signal the music channel ducks against.
   *
   * Derived from live state (is a clip playing, or is praise queued behind one)
   * rather than from paired start/stop events, so no listener can be left
   * believing speech is still running. syncSpeech() is deliberately NOT called
   * inside stopActive(): replacing a term stops the old source and starts the
   * new one in the same synchronous block, so the listener never sees the gap
   * and the music cannot bounce back to its base level between two words.
   *
   * Praise queued behind a term counts as still speaking, so the music does not
   * restore in the pause between "Decimal" and "Nice find, Chief!".
   */
  var speechActive = false;
  var speechListeners = [];

  /*
   * The activity signal is BROADCAST as a window event, not only handed to
   * callbacks registered against this object.
   *
   * A direct `MathNexaVoice.onSpeechActivity(fn)` subscription is a one-shot
   * coupling: whoever registers must run after this file, must find the method
   * present, and gets no error if it is missing. A single stale copy of this
   * file in a browser cache is enough to make that registration evaporate --
   * pronunciation keeps working, the music silently never ducks again, and
   * nothing is logged. That is a real failure that shipped.
   *
   * An event has none of those properties: a listener can be added before or
   * after this module loads, survives the namespace being replaced, and works
   * across mismatched builds of the two files.
   */
  var ACTIVITY_EVENT = "mathnexa:voice-activity";

  function syncSpeech() {
    var active = Boolean(activeSource) || Boolean(queuedPraise);
    if (active === speechActive) return;
    speechActive = active;
    log("speechActivity", active ? "speaking" : "idle");
    for (var index = 0; index < speechListeners.length; index += 1) {
      try { speechListeners[index](active); } catch (error) { setState("lastError", "speechListener: " + error); }
    }
    try {
      window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: { active: active } }));
    } catch (error) {
      setState("lastError", "activityEvent: " + error);
    }
  }

  function stopActive(reason) {
    if (!activeSource) return;
    var stopped = activeSource;
    activeSource = null;
    try { stopped.source.onended = null; stopped.source.stop(); } catch (_) {}
    log("playStopped", stopped.phrase + " (" + reason + ")");
  }

  function playPhrase(phrase, kind) {
    phrase = normalize(phrase);
    var now = Date.now();
    if (phrase && phrase === lastPlay.phrase && now - lastPlay.at < DUPLICATE_MS) {
      log("duplicateSuppressed", phrase);
      syncSpeech();
      return Promise.resolve("duplicate");
    }
    lastPlay = { phrase: phrase, at: now };
    setState("playback", "requested");
    setAttr("data-voice-state", "requested");
    log("playRequested", kind + ": " + phrase);
    resumeContext("play:" + kind); // synchronous inside the user's click stack
    return loadManifest().then(function (manifest) {
      var file = manifest && manifest.clips ? manifest.clips[phrase] : null;
      setState("audioUrl", file ? CLIP_BASE + file : null);
      if (!file) {
        setState("playback", "no-clip");
        setAttr("data-voice-state", "error");
        setAttr("data-voice-source", "silent");
        setState("voiceSource", "silent");
        log("playError", "no clip for: " + phrase);
        syncSpeech();
        return "no-clip";
      }
      var ctxProbe = ensureContext();
      if (!ctxProbe) {
        // No Web Audio in this environment: shared HTMLAudio element path.
        if (kind === "term") stopActive("new-term");
        return new Promise(function (resolve) {
          var el = ensureFallbackEl();
          var entry = { source: { stop: function () { try { el.pause(); } catch (_) {} }, onended: null }, kind: kind, phrase: phrase, startedAt: Date.now() };
          activeSource = entry;
          el.onended = function () {
            if (activeSource === entry) activeSource = null;
            setState("playback", "ended");
            setAttr("data-voice-state", "ended");
            log("playEnded", phrase + " (html-audio)");
            syncSpeech();
            var next = queuedPraise; queuedPraise = null;
            resolve("ended");
            if (next) playPhrase(next, "praise");
          };
          el.onerror = function () {
            if (activeSource === entry) activeSource = null;
            setState("playback", "error");
            setAttr("data-voice-state", "error");
            setAttr("data-voice-source", "silent");
            setState("voiceSource", "silent");
            syncSpeech();
            resolve("error");
          };
          el.src = CLIP_BASE + file;
          var played = el.play();
          var markStarted = function () {
            setState("playback", "started");
            setAttr("data-voice-state", "started");
            setAttr("data-voice-source", "prebuilt");
            setState("voiceSource", "prebuilt");
            debug.state.playbackCount += 1;
            renderPanel();
            log("playStarted", phrase + " (html-audio)");
            syncSpeech();
          };
          if (played && typeof played.then === "function") played.then(markStarted).catch(function (error) {
            if (activeSource === entry) activeSource = null;
            setState("playback", "blocked");
            setAttr("data-voice-state", "blocked");
            setState("lastError", String(error));
            log("playRejected", error);
            syncSpeech();
            resolve("blocked");
          });
          else markStarted();
        });
      }
      return bufferFor(file).then(function (buffer) {
        var ctx = ensureContext();
        if (!buffer || !ctx) {
          setAttr("data-voice-state", "error");
          setAttr("data-voice-source", "silent");
          setState("voiceSource", "silent");
          setState("playback", "error");
          syncSpeech();
          return "error";
        }
        if (ctx.state !== "running") {
          setAttr("data-voice-state", "blocked");
          setState("playback", "blocked (context " + ctx.state + ")");
          log("playRejected", "context " + ctx.state);
          syncSpeech();
          return "blocked";
        }
        if (kind === "term") stopActive("new-term");
        return new Promise(function (resolve) {
          var source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = false; // narration never loops
          source.connect(voiceDestination(ctx));
          var entry = { source: source, kind: kind, phrase: phrase, startedAt: Date.now() };
          activeSource = entry;
          source.onended = function () {
            if (activeSource === entry) activeSource = null;
            setState("playback", "ended");
            setAttr("data-voice-state", "ended");
            log("playEnded", phrase);
            // Reported while queuedPraise is still set, so a queued praise
            // phrase keeps the music ducked across the gap.
            syncSpeech();
            var next = queuedPraise;
            queuedPraise = null;
            resolve("ended");
            if (next) playPhrase(next, "praise");
          };
          try {
            source.start(0);
            // Genuinely started: context running AND source started.
            setState("playback", "started");
            setAttr("data-voice-state", "started");
            setAttr("data-voice-source", "prebuilt");
            setState("voiceSource", "prebuilt");
            debug.state.playbackCount += 1;
            renderPanel();
            log("playStarted", phrase);
            syncSpeech();
          } catch (error) {
            activeSource = null;
            setState("playback", "error");
            setState("lastError", String(error));
            setAttr("data-voice-state", "error");
            log("playError", error);
            syncSpeech();
            resolve("error");
          }
        });
      });
    });
  }

  // ---------- public API ----------
  var api = {
    /** Speak the selected vocabulary term once. Called by the game's own
     *  word-bank selection handler with the entry's display string. */
    playVocabularyTerm: function (display) {
      var term = normalize(display);
      setState("selectedTerm", term);
      setState("handler", "FIRED");
      setState("termId", term);
      setState("playVocabularyTerm", "called");
      setAttr("data-last-spoken-term", term);
      log("wordBankSelection", term);
      return playPhrase(term, "term");
    },
    /** One praise phrase after a genuine successful find; if a term clip is
     *  still speaking, praise waits for it instead of cutting it off. */
    playPraise: function (text) {
      var phrase = normalize(text);
      log("praiseRequested", phrase);
      if (activeSource && activeSource.kind === "term") {
        queuedPraise = phrase; // single-slot queue; newest praise wins
        return Promise.resolve("queued");
      }
      return playPhrase(phrase, "praise");
    },
    /** Warm the clips for the current puzzle's word bank. */
    preloadTerms: function (displays) {
      loadManifest().then(function (manifest) {
        if (!manifest || !manifest.clips) return;
        var hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);
        (displays || []).slice(0, 40).forEach(function (display) {
          var file = manifest.clips[normalize(display)];
          if (!file) return;
          if (hasWebAudio) bufferFor(file);
          else try { fetch(CLIP_BASE + file, { credentials: "same-origin" }).catch(function () {}); } catch (_) {}
        });
        log("preloadTerms", (displays || []).length + " terms");
      });
    },
    /** Subscribe to speech activity so the music channel can duck while a term
     *  is spoken and restore when it finishes. Fires immediately with the
     *  current state and returns an unsubscribe function. The listener is the
     *  ONLY duck authority: it is driven by playback lifecycle, never a timer,
     *  so music cannot be stranded at the ducked level. */
    onSpeechActivity: function (listener) {
      if (typeof listener !== "function") return function () {};
      speechListeners.push(listener);
      try { listener(speechActive); } catch (error) { setState("lastError", "speechListener: " + error); }
      return function () {
        var at = speechListeners.indexOf(listener);
        if (at >= 0) speechListeners.splice(at, 1);
      };
    },
    isSpeaking: function () { return speechActive; },
    /** Report the voice channel's real level so the 100% contract is testable
     *  and any accidental routing through the music channel is visible. */
    audioLevels: function () {
      return {
        voiceChannelLevel: VOICE_CHANNEL_LEVEL,
        voiceGainValue: voiceGain ? voiceGain.gain.value : null,
        fallbackVolume: fallbackEl ? fallbackEl.volume : null,
        sharesMusicChannel: false
      };
    },
    cancel: function () {
      queuedPraise = null;
      stopActive("cancel");
      setAttr("data-voice-state", "ended");
      setState("playback", "idle");
      syncSpeech();
    },
    unlock: unlock
  };
  window.MathNexaVoice = api;

  window.addEventListener("pagehide", function () { api.cancel(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") api.cancel(); // no replay on return
  });

  // ---------- legacy speechSynthesis safety net (never robotic) ----------
  function FauxUtterance(text) { this.text = String(text == null ? "" : text); this.onend = null; this.onerror = null; }
  FauxUtterance.prototype.addEventListener = function (n, h) { if (n === "end") this.onend = h; if (n === "error") this.onerror = h; };
  FauxUtterance.prototype.removeEventListener = function () {};
  var shim = {
    speak: function (utterance) {
      var text = normalize(utterance && utterance.text);
      var done = function () { try { utterance && utterance.onend && utterance.onend({ type: "end" }); } catch (_) {} };
      if (!text) return done();
      (PRAISE_SET[text] ? api.playPraise(text) : api.playVocabularyTerm(text)).then(done, done);
    },
    cancel: function () { api.cancel(); },
    pause: function () {}, resume: function () {},
    getVoices: function () { return []; },
    addEventListener: function () {}, removeEventListener: function () {}, onvoiceschanged: null,
    speaking: false, pending: false, paused: false
  };
  try {
    Object.defineProperty(window, "speechSynthesis", { value: shim, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FauxUtterance, configurable: true });
  } catch (_) { window.speechSynthesis = shim; window.SpeechSynthesisUtterance = FauxUtterance; }
})();
