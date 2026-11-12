// Math Race Champions: one game, three experiences. This file owns the screen
// switch, the shared audio and the preferences. Every screen is loaded on
// demand, so opening Classroom Competition never downloads the 3D racing code,
// the car shop or the online room code.

import { GameAudio, readPreferences, writePreferences } from "./audio.js";
import { announce, h } from "./dom.js";

const SCREENS = Object.freeze({
  hub: () => import("./hub.js"),
  "how-to": () => import("./how-to.js"),
  "classroom-setup": () => import("./classroom/setup.js"),
  classroom: () => import("./classroom/classroom.js")
});

/** Music plays on every screen except where a screen says otherwise. */
const QUIET_SCREENS = new Set([]);

const root = document.getElementById("app");
const prefs = readPreferences();
let screenName = "loading";
let current = null;
let navigation = 0;

const audio = new GameAudio(prefs, () => !QUIET_SCREENS.has(screenName));

const context = Object.freeze({
  audio,
  prefs,
  exitHref: document.body.dataset.exitHref || "/",
  exitLabel: document.body.dataset.exitLabel || "MathNexa",
  hasScreen: name => Object.prototype.hasOwnProperty.call(SCREENS, name),
  navigate,
  /** Flip Music or Sound effects; `button` (optional) gets its pressed state updated. */
  toggle(kind, button) {
    prefs[kind] = !prefs[kind];
    writePreferences(prefs);
    button?.setAttribute("aria-pressed", String(prefs[kind]));
    audio.activate();
    if (kind === "sound" && prefs.sound) audio.button();
    announce(`${kind === "music" ? "Music" : "Sound effects"} ${prefs[kind] ? "on" : "off"}`);
    return prefs[kind];
  },
  setVolume(kind, value) {
    prefs[kind === "music" ? "musicVolume" : "soundVolume"] = value;
    writePreferences(prefs);
    audio.syncMusic();
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
  const loader = SCREENS[name] ?? SCREENS.hub;
  const ticket = ++navigation;
  let module;
  try {
    module = await loader();
  } catch {
    if (ticket !== navigation) return;
    root.replaceChildren(
      h("main", { id: "main", class: "page" }, h("h1", { text: "Math Race Champions" }), h("p", { class: "page-lead", text: "This part of the game could not be loaded. Check the connection and try again." }),
        h("button", { type: "button", class: "button button-primary", onclick: () => navigate(name, params) }, "Try again"))
    );
    return;
  }
  if (ticket !== navigation) return;
  current?.destroy?.();
  current = null;
  screenName = SCREENS[name] ? name : "hub";
  document.body.dataset.screen = screenName;
  window.scrollTo(0, 0);
  current = module.mount(root, context, params) ?? null;
  audio.syncMusic();
}

// The earliest real gesture starts the music (when it is on): pointer or key,
// captured before any screen handles it, and synchronously, as Safari requires.
for (const type of ["pointerdown", "keydown"]) {
  document.addEventListener(type, () => audio.activate(), { capture: true, passive: true });
}
document.addEventListener("visibilitychange", () => audio.syncMusic());
window.addEventListener("pagehide", () => {
  current?.destroy?.();
  audio.dispose();
});

navigate("hub");
