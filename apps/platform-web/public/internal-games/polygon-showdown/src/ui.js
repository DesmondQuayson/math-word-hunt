// Small shared pieces of the Polygon Showdown screens.

import { h, s, icon } from "../../math-bingo-live/src/dom.js";
import { encodeQr, qrPath } from "../../math-bingo-live/src/engine/qr.js";
import { COIN_IMAGE_URL, shapeImageUrl } from "./board-art.js";
import { SHAPE_INDEX } from "./engine/shapes.js";
import { MUSIC_TRACK, writePreferences } from "./audio.js";

export const numberText = (value) => Number(value ?? 0).toLocaleString("en-US");

export function setScreen(name) {
  document.body.dataset.screen = name;
}

export function coinIcon(extraClass = "") {
  return h("img", { class: `coin ${extraClass}`.trim(), src: COIN_IMAGE_URL, alt: "", draggable: "false" });
}

export function coinAmount(value, extraClass = "") {
  return h("span", { class: `coin-amount ${extraClass}`.trim() }, coinIcon(), h("span", { class: "coin-number", text: numberText(value) }));
}

/** The title with the four shapes as its crest. */
export function brand({ compact = false } = {}) {
  const shapes = ["circle", "triangle", "square", "rectangle"].map((key) => h("img", { src: shapeImageUrl(SHAPE_INDEX[key]), alt: "", draggable: "false" }));
  return h("div", { class: `brand${compact ? " compact" : ""}` },
    h("div", { class: "brand-crest", "aria-hidden": "true" }, shapes),
    h("span", { class: "brand-name" }, h("span", { text: "POLYGON" }), " ", h("span", { class: "brand-accent", text: "SHOWDOWN" })));
}

/** A QR code drawn locally as SVG. No QR service is contacted. */
export function qrCode(text, label) {
  const code = encodeQr(text);
  const size = code.size + 8;
  return s("svg", { viewBox: `0 0 ${size} ${size}`, class: "qr-code", role: "img", "aria-label": label, "shape-rendering": "crispEdges", focusable: "false" },
    s("rect", { width: String(size), height: String(size), class: "qr-light" }),
    s("path", { d: qrPath(code, 4), class: "qr-dark" }));
}

export function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Sound and Music on/off buttons bound to the saved preferences. */
export function soundControls(audio, { musicKey = "music" } = {}) {
  const button = (label, iconOn, read, write) => {
    const element = h("button", { type: "button", class: "icon-button", "aria-pressed": String(read()), "aria-label": label, title: label },
      icon(read() ? iconOn : "mute"));
    element.addEventListener("click", () => {
      write(!read());
      writePreferences(audio.prefs);
      audio.syncMusic();
      element.setAttribute("aria-pressed", String(read()));
      element.replaceChildren(icon(read() ? iconOn : "mute"));
    });
    return element;
  };
  return h("div", { class: "sound-controls" },
    button("Sound effects", "sound", () => audio.prefs.sound, (value) => { audio.prefs.sound = value; }),
    button("Music", "music", () => audio.prefs[musicKey], (value) => { audio.prefs[musicKey] = value; }));
}

export const musicCredit = () => h("p", { class: "music-credit", text: `Music: “${MUSIC_TRACK.title}” by ${MUSIC_TRACK.author}, ${MUSIC_TRACK.site}, ${MUSIC_TRACK.license}. Sound effects are original synthesized tones.` });

export function errorNote(message) {
  return h("p", { class: "form-error", role: "alert", text: message });
}

/** A confirm dialog; resolves true if the player confirmed. */
export function confirmDialog({ title, body, confirm, cancel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const dialog = h("dialog", { class: "dialog", "aria-labelledby": "confirm-title" });
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.append(
      h("h2", { id: "confirm-title", text: title }),
      h("p", { text: body }),
      h("div", { class: "dialog-actions" },
        h("button", { type: "button", class: "button ghost", text: cancel, onclick: () => finish(false) }),
        h("button", { type: "button", class: `button ${danger ? "danger" : "primary"}`, text: confirm, onclick: () => finish(true) }))
    );
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function toast(message, { tone = "info" } = {}) {
  let host = document.getElementById("toasts");
  if (!host) {
    host = h("div", { id: "toasts", class: "toasts", "aria-hidden": "true" });
    document.body.append(host);
  }
  const note = h("div", { class: `toast toast-${tone}`, text: message });
  host.append(note);
  setTimeout(() => note.remove(), 3200);
}
