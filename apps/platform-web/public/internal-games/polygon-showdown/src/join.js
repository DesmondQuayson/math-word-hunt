// Polygon Showdown at /join: code, name, emoji, then the room. No account: the
// server returns a random seat token, kept in sessionStorage so a refresh
// restores the same player, board and score while the room lasts. That is
// session recovery, not progress: nothing about this player outlives the room.

import { fill, h } from "../../math-bingo-live/src/dom.js";
import { EMOJI_CHOICES, isAllowedEmoji } from "../../math-bingo-live/src/engine/emoji.js";
import { NAME_MAX } from "../../math-bingo-live/src/engine/settings.js";
import { codeFromSearch } from "../../math-bingo-live/src/join-link.js";
import { playRequest } from "./api.js";
import { attachAudioLifecycle, GameAudio, readPreferences } from "./audio.js";
import { codeLabel, readSeat, RECENT_KEY, saveSeat, ShowdownScreen } from "./showdown.js";
import { brand, errorNote, setScreen } from "./ui.js";

const app = document.getElementById("app");
const preferences = readPreferences();
// A joining device stays quiet unless its player turns music on.
const audio = new GameAudio(preferences, () => preferences.showdownMusic);
attachAudioLifecycle(audio);
window.__POLYGON_SHOWDOWN__ = { audio };

const startRoom = (seat, room) => {
  const screen = new ShowdownScreen({ app, audio, seat, room, exitLabel: "Join Another Game", onExit: () => location.assign("/join") });
  screen.start();
};

function readPrefill(code) {
  try {
    const value = JSON.parse(sessionStorage.getItem("mathnexa:live-join:prefill") ?? "null");
    sessionStorage.removeItem("mathnexa:live-join:prefill");
    if (value?.code === code && typeof value.name === "string") return value;
  } catch {
    /* ignore */
  }
  return null;
}

function readRecent(code) {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "null");
    if (value && value.code === code && typeof value.token === "string" && typeof value.name === "string" && Date.now() - value.at < 4 * 3600_000) return value;
  } catch {
    /* ignore */
  }
  return null;
}

function renderCode(message = "") {
  setScreen("join");
  const input = h("input", { id: "code", class: "text-input code-input", type: "text", inputmode: "numeric", autocomplete: "off", maxlength: "7", required: true, "aria-describedby": "code-help" });
  const form = h("form", { class: "card join-form", novalidate: true },
    h("h1", { text: "Join a Showdown" }),
    h("label", { for: "code", text: "Game code" }), input,
    h("p", { id: "code-help", class: "muted", text: "Type the 6 numbers on the creator's screen." }),
    message ? errorNote(message) : null,
    h("button", { type: "submit", class: "button primary", text: "Next" }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = input.value.replace(/\s/g, "");
    if (!/^[1-9]\d{5}$/.test(code)) {
      renderCode("Check the code. It has 6 numbers.");
      return;
    }
    location.assign(`/join?code=${code}`);
  });
  fill(app, h("main", { id: "main", class: "center-screen" }, brand(), form));
  input.focus();
}

function renderName(code, message = "", prefill = null) {
  setScreen("join");
  let chosen = isAllowedEmoji(prefill?.emoji) ? prefill.emoji : null;
  const input = h("input", { id: "name", class: "text-input", type: "text", autocomplete: "nickname", maxlength: String(NAME_MAX), required: true, value: prefill?.name ?? "" });
  const choices = EMOJI_CHOICES.map(({ emoji, name }) => h("button", { type: "button", class: `emoji-choice${emoji === chosen ? " on" : ""}`, "aria-pressed": String(emoji === chosen), "aria-label": name, text: emoji, onclick: (event) => {
    chosen = chosen === emoji ? null : emoji;
    choices.forEach((button) => {
      const on = button.textContent === chosen;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
    event.currentTarget.blur();
  } }));
  const submit = h("button", { type: "submit", class: "button primary", id: "join-game", text: "JOIN SHOWDOWN" });
  const error = message ? errorNote(message) : null;
  const form = h("form", { class: "card join-form", novalidate: true },
    h("h1", { text: "Polygon Showdown" }),
    h("p", { class: "join-code-line" }, h("span", { class: "muted", text: "Code " }), h("strong", { text: code, "aria-label": codeLabel(code) })),
    h("label", { for: "name", text: "Your name" }), input,
    h("p", { class: "muted", text: "Pick an emoji if you like." }),
    h("div", { class: "emoji-grid", role: "group", "aria-label": "Emoji" }, choices),
    error,
    submit,
    h("p", { class: "muted small", text: "No account needed. Your name and score last only for this Showdown." }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    audio.activate();
    submit.disabled = true;
    submit.textContent = "Joining…";
    try {
      const payload = await playRequest("join", { code, name: input.value, emoji: chosen });
      const seat = { token: payload.token, code, name: payload.room.me.name, emoji: payload.room.me.emoji };
      startRoom(seat, payload.room);
    } catch (failure) {
      renderName(code, failure.message, { name: input.value, emoji: chosen });
    }
  });
  const recent = readRecent(code);
  fill(app, h("main", { id: "main", class: "center-screen" }, brand(),
    recent ? h("button", { type: "button", class: "button ghost", id: "rejoin", text: `Rejoin as ${recent.name}`, onclick: () => reconnect({ token: recent.token, code, name: recent.name, emoji: recent.emoji }, () => renderName(code)) }) : null,
    form));
  if (!prefill) input.focus();
}

async function reconnect(seat, fallback) {
  setScreen("loading");
  fill(app, h("main", { id: "main", class: "center-screen" }, brand(), h("p", { class: "status-text", role: "status", text: "Reconnecting to your Showdown…" })));
  try {
    const payload = await playRequest("state", { token: seat.token });
    startRoom(seat, payload.room);
  } catch {
    saveSeat(null);
    fallback();
  }
}

function boot() {
  const code = codeFromSearch(location.search);
  const seat = readSeat();
  if (seat && (!code || seat.code === code)) {
    reconnect(seat, () => (code ? renderName(code) : renderCode()));
    return;
  }
  if (!code) {
    renderCode();
    return;
  }
  const prefill = readPrefill(code);
  if (prefill) {
    // Typed already on the Math Bingo Live join screen: go straight in.
    renderName(code, "", prefill);
    document.querySelector("form.join-form")?.requestSubmit();
    return;
  }
  renderName(code);
}

boot();
