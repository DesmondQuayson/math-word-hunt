/*
 * MathNexa — Math Vocabulary Hunt production ducking diagnostic (READ-ONLY).
 *
 * HOW TO USE (about 15 seconds):
 *  1. On mathnexa.com, sign in and open Math Vocabulary Hunt so the game
 *     (grade -> topic -> lesson -> letter grid) is on screen with music playing.
 *  2. Open DevTools (F12) -> Console tab, paste this whole file, press Enter.
 *  3. When the console says "TAP A VOCABULARY WORD NOW", tap one word card.
 *  4. After ~10 seconds it prints one block starting with
 *     "=== MVH DIAGNOSTIC RESULT ===". Copy that whole block back.
 *
 * This observes only. It never changes volume or game state, never touches
 * your account, and prints no tokens, cookies, storage or personal data.
 */
(async () => {
  const SIZE_TO_BUILD = {
    11033: "music ae71504 (CURRENT - event+observer duck)", 10751: "music ae71504 (CURRENT - event+observer duck)",
    9119: "music 074751b (STALE - fragile one-shot duck)", 8880: "music 074751b (STALE - fragile one-shot duck)",
    7975: "music 7af077e (STALE - no ducking by design)", 7760: "music 7af077e (STALE - no ducking by design)",
    7010: "music 29eb2ab (STALE - timer duck)", 6815: "music 29eb2ab (STALE - timer duck)",
    5030: "music v1.2.5 (STALE - quiet 0.084 base)", 4879: "music v1.2.5 (STALE - quiet 0.084 base)",
    23044: "voice ae71504 (CURRENT - broadcasts activity)", 22506: "voice ae71504 (CURRENT - broadcasts activity)",
    21984: "voice 074751b (STALE - callback only)", 21468: "voice 074751b (STALE - callback only)",
    19493: "voice 7af077e/29eb2ab (STALE - no activity API)", 19032: "voice 7af077e/29eb2ab (STALE - no activity API)",
    17888: "voice v1.2.5 (STALE - no activity API)", 17469: "voice v1.2.5 (STALE - no activity API)"
  };
  const scriptEntry = (name) => {
    const hits = performance.getEntriesByType("resource").filter((e) => e.name.includes(name));
    const e = hits[hits.length - 1];
    return e
      ? {
          url: e.name.split("?")[0].replace(location.origin, ""),
          bytes: e.decodedBodySize || 0,
          identifiedAs: SIZE_TO_BUILD[e.decodedBodySize] || "UNKNOWN SIZE " + e.decodedBodySize,
          transferSize: e.transferSize,
          fromCacheWithoutNetwork: e.transferSize === 0,
          deliveryType: e.deliveryType !== undefined ? e.deliveryType : "n/a",
          status: e.responseStatus !== undefined ? e.responseStatus : "n/a"
        }
      : { url: name, error: "no resource-timing entry (buffer cleared or not loaded)" };
  };
  const music = () => {
    try { return window.__MATHNEXA_GAME_MUSIC__ ? window.__MATHNEXA_GAME_MUSIC__.snapshot() : null; } catch (e) { return { error: String(e) }; }
  };
  const registrations = navigator.serviceWorker && navigator.serviceWorker.getRegistrations
    ? await navigator.serviceWorker.getRegistrations().then((r) => r.map((x) => x.scope)).catch(() => ["unreadable"])
    : [];
  const gameState = (() => {
    try {
      const s = window.__MATH_WORD_HUNT__ && window.__MATH_WORD_HUNT__.getAudioState ? window.__MATH_WORD_HUNT__.getAudioState() : null;
      return s
        ? { soundMode: s.soundMode, musicMode: s.musicMode, internalSynthSessions: s.musicSessions, internalSynthActiveNodes: s.activeMusicNodes, contextState: s.contextState }
        : null;
    } catch (e) { return { error: String(e) }; }
  })();
  const report = {
    when: new Date().toISOString(),
    page: location.pathname,
    serviceWorkerControllingThisPage: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
    serviceWorkerScopes: registrations,
    musicModule: scriptEntry("math-vocabulary-music.js"),
    voiceModule: scriptEntry("natural-voice.js"),
    musicSnapshotFields: window.__MATHNEXA_GAME_MUSIC__ ? Object.keys(window.__MATHNEXA_GAME_MUSIC__) : "MISSING",
    musicNow: music(),
    voiceApi: window.MathNexaVoice
      ? { isSpeaking: typeof window.MathNexaVoice.isSpeaking, onSpeechActivity: typeof window.MathNexaVoice.onSpeechActivity, audioLevels: typeof window.MathNexaVoice.audioLevels }
      : "MISSING",
    voiceState: document.documentElement.getAttribute("data-voice-state"),
    gameAudio: gameState,
    duckFunctionIsCurrent: typeof window.duck === "function" && /applyMusicLevel|currentLevel/.test(String(window.duck))
  };
  console.log("Snapshot taken. TAP A VOCABULARY WORD NOW - watching for 10 seconds...");
  const timeline = [];
  const started = performance.now();
  await new Promise((done) => {
    const timer = setInterval(() => {
      const m = music();
      timeline.push({
        t: Math.round(performance.now() - started),
        voice: document.documentElement.getAttribute("data-voice-state"),
        vol: m && typeof m.volume === "number" ? m.volume : null,
        paused: m ? m.paused : null,
        ducked: m && "ducked" in m ? m.ducked : "n/a"
      });
      if (performance.now() - started > 10000) { clearInterval(timer); done(); }
    }, 250);
  });
  const compact = [];
  let last = "";
  for (const s of timeline) {
    const key = s.voice + "|" + s.vol + "|" + s.paused + "|" + s.ducked;
    if (key !== last) { compact.push(s); last = key; }
  }
  report.watch = compact;
  console.log("=== MVH DIAGNOSTIC RESULT ===\n" + JSON.stringify(report, null, 1) + "\n=== END ===");
})();
