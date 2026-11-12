// The frame both documents share (the game at /games/math-race-champions/play
// and the racer's screen at /join): one screen at a time, loaded on demand, one
// audio object, one set of preferences.

import { GameAudio, readPreferences, writePreferences } from "./audio.js";
import { announce, h } from "./dom.js";

export function startShell(screens, first, firstParams = {}) {
  const root = document.getElementById("app");
  const prefs = readPreferences();
  let screenName = "loading";
  let current = null;
  let navigation = 0;

  const audio = new GameAudio(prefs, () => true);

  const context = Object.freeze({
    audio,
    prefs,
    role: document.body.dataset.role || "app",
    exitHref: document.body.dataset.exitHref || "/",
    exitLabel: document.body.dataset.exitLabel || "MathNexa",
    hasScreen: name => Object.prototype.hasOwnProperty.call(screens, name),
    get screen() {
      return screenName;
    },
    navigate,
    /** Flip Music or Sound effects; `button` (optional) gets its pressed state updated. */
    toggle(kind, button) {
      prefs[kind] = !prefs[kind];
      writePreferences(prefs);
      button?.setAttribute("aria-pressed", String(prefs[kind]));
      audio.activate();
      if (kind === "sound" && prefs.sound) audio.button();
      if (kind === "sound" && !prefs.sound) audio.dropRace(0.08);
      announce(`${kind === "music" ? "Music" : "Sound effects"} ${prefs[kind] ? "on" : "off"}`);
      return prefs[kind];
    },
    setVolume(kind, value) {
      prefs[kind === "music" ? "musicVolume" : "soundVolume"] = value;
      writePreferences(prefs);
      audio.syncMusic();
      audio.applyRaceLevel();
    },
    fullscreen() {
      try {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.()?.catch?.(() => { /* not allowed here */ });
      } catch {
        /* Full screen is a convenience. */
      }
    }
  });

  async function navigate(name, params = {}) {
    const target = screens[name] ? name : first;
    const ticket = ++navigation;
    let module;
    try {
      module = await screens[target]();
    } catch {
      if (ticket !== navigation) return;
      current?.destroy?.();
      current = null;
      root.replaceChildren(
        h(
          "main",
          { id: "main", class: "page" },
          h("h1", { text: "Math Race Champions" }),
          h("p", { class: "page-lead", text: "This part of the game could not be loaded. Check the connection and try again." }),
          h("button", { type: "button", class: "button button-primary", onclick: () => navigate(name, params) }, "Try again")
        )
      );
      return;
    }
    if (ticket !== navigation) return;
    current?.destroy?.();
    current = null;
    screenName = target;
    document.body.dataset.screen = target;
    window.scrollTo(0, 0);
    current = module.mount(root, context, params) ?? null;
    audio.syncMusic();
  }

  // The earliest real gesture starts the music (when it is on): pointer or key,
  // captured before any screen handles it, and synchronously, as Safari requires.
  // Nobody has to press the music button to hear it.
  for (const type of ["pointerdown", "keydown"]) {
    document.addEventListener(type, () => audio.activate(), { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    audio.syncMusic();
    // A hidden tab makes no engine noise; the race screen brings it back when it is seen again.
    if (document.hidden) audio.dropRace(0.05);
  });
  window.addEventListener("pagehide", () => {
    current?.destroy?.();
    audio.dispose();
  });
  // Read by the browser tests.
  window.__MATH_RACE__ = { ...(window.__MATH_RACE__ ?? {}), audio: () => audio.snapshot(), context };

  navigate(first, firstParams);
  return context;
}
