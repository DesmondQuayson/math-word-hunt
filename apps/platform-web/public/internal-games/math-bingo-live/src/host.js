// Math Bingo Live — the teacher's screen (Smart Board first).
//
// Setup -> lobby (JOIN mathnexa.com/join, CODE 482391, live roster) -> live
// board (winning ways; standings and Bingo winners on the left; question,
// timer and reveal top right; called questions below; controls) -> Math
// Bingo Complete. The host is a signed-in MathNexa account; every command is
// checked against that session AND the room's host token on the server.

import { HOST_ENDPOINT, LiveError, MESSAGES, createLiveSession, liveRequest } from "./api.js";
import { GameAudio, MUSIC_TRACK, attachAudioLifecycle, readPreferences, writePreferences } from "./audio.js";
import { announce, clear, fill, h, icon } from "./dom.js";
import { AUDIO_TARGETS, DEFAULT_SETTINGS, MAX_WINNERS, MODES, QUESTION_SECONDS, REVEAL_SECONDS, WINNER_PRESETS, getMode } from "./engine/settings.js";
import {
  LINE_LABEL,
  bingoBannerChildren,
  brandMark,
  calledList,
  createBanner,
  createTimer,
  iconButton,
  medal,
  ordinal,
  phaseTotalMs,
  placeWord,
  progressText,
  questionFace,
  remainingMs,
  revealFace,
  rulesStrip,
  tutorial,
  upperName
} from "./shared.js";

const TOKEN_KEY = "mathnexa:math-bingo-live:host-token";
const SETTINGS_KEY = "mathnexa:math-bingo-live:last-settings";
const ACTIVE_PHASES = new Set(["COUNTDOWN", "QUESTION_ACTIVE", "ANSWER_REVEAL", "LEADERBOARD_UPDATE", "WINNER_REVEAL", "PAUSED"]);
const AUDIO_LABELS = Object.freeze({ host: "Host only", all: "All devices", off: "Off" });

const app = document.getElementById("app");
const body = document.body;
const preferences = readPreferences();

let session = null;
let hostToken = null;
let state = null;
let presence = new Map();
let lastEventSeq = null;
let lastGame = null;
let view = null;
let viewKey = "";
let lastTickSecond = null;
let busy = false;
let banner = null;
/** Dialogs owned by the current view; removed when the view changes. */
let viewDialogs = [];
const oneAway = [];

// The host device plays music unless the room says Off; before a room
// exists the remembered choice applies, so the teacher's first click starts
// it inside a real gesture (the Safari/iPad rule).
const audio = new GameAudio(preferences, () => {
  if (!state) return lastSettings().music !== "off";
  return state.settings?.music !== "off" && state.status === "open";
});
attachAudioLifecycle(audio);

function setScreen(name) {
  body.dataset.screen = name;
}

function joinHost() {
  return location.host === "mathnexa.com" || location.host === "www.mathnexa.com" ? "mathnexa.com" : location.host;
}

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token) {
  hostToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* The signed-in resume path still recovers the room. */
  }
}

function lastSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    return value && typeof value === "object" ? { ...DEFAULT_SETTINGS, ...value, patterns: { ...DEFAULT_SETTINGS.patterns, ...(value.patterns ?? {}) } } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function rememberSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* optional */
  }
}

// ---------------------------------------------------------------- setup

function chip(name, value, label, checked, { type = "radio", hint = "" } = {}) {
  const id = `${name}-${String(value).replace(/[^a-z0-9]/gi, "")}`;
  return h("label", { class: "chip", for: id },
    h("input", { id, type, name, value: String(value), checked: checked ? true : null }),
    h("span", { class: "chip-face" }, h("span", { class: "chip-label", text: label }), hint ? h("span", { class: "chip-hint", text: hint }) : null));
}

function durationLabel(seconds) {
  return seconds === 0 ? "Manual" : `${seconds} sec`;
}

function winnersLabel(count) {
  return count === 0 ? "Everyone" : String(count);
}

/** The compact setup form. Returns the form; calls onSubmit(settings, joinLock). */
function settingsForm(initial, { submitLabel, onSubmit, onCancel = null, joinLocked = false }) {
  const error = h("p", { class: "form-error", role: "alert" });
  const levelHolder = h("div", { class: "chips" });
  const fractionOptions = h("div", { class: "fraction-options" });

  const renderLevels = (modeId, selected) => {
    const mode = getMode(modeId) ?? MODES[0];
    const chosen = mode.levels.some(level => level.id === selected) ? selected : mode.levels[0].id;
    fill(levelHolder, mode.levels.map(level => chip("level", level.id, level.label, level.id === chosen, { hint: level.hint })));
    fractionOptions.hidden = mode.id !== "fractions";
  };

  const customWinners = h("input", {
    id: "winners-custom", class: "number-input", type: "number", inputmode: "numeric", min: "1", max: String(MAX_WINNERS),
    "aria-label": "Custom number of winners", placeholder: "#",
    value: WINNER_PRESETS.includes(initial.winners) ? "" : String(initial.winners)
  });

  const form = h("form", {
    class: "setup-form", novalidate: true,
    onchange: event => {
      if (event.target.name === "mode") renderLevels(event.target.value, null);
      if (event.target.name === "winners") customWinners.value = "";
    },
    onsubmit: event => {
      event.preventDefault();
      audio.activate();
      const data = new FormData(form);
      const custom = Number.parseInt(customWinners.value, 10);
      const winners = Number.isInteger(custom) && custom >= 1 ? Math.min(MAX_WINNERS, custom) : Number(data.get("winners"));
      const settings = {
        mode: data.get("mode"),
        level: data.get("level"),
        questionSeconds: Number(data.get("questionSeconds")),
        revealSeconds: Number(data.get("revealSeconds")),
        patterns: { rows: data.has("rows"), columns: data.has("columns"), diagonals: data.has("diagonals") },
        winners,
        freeSpace: data.has("freeSpace"),
        music: data.get("music"),
        celebration: data.get("celebration"),
        equivalentFractions: data.get("mode") === "fractions" && data.has("equivalentFractions")
      };
      if (!settings.patterns.rows && !settings.patterns.columns && !settings.patterns.diagonals) {
        error.textContent = MESSAGES["pattern-required"];
        form.querySelector("input[name=rows]")?.focus();
        return;
      }
      error.textContent = "";
      onSubmit(settings, data.has("joinLock"), error);
    }
  },
  h("div", { class: "setup-grid" },
    h("fieldset", { class: "setup-section" },
      h("legend", { class: "section-title", text: "MATH" }),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Mode" }),
        h("div", { class: "chips chips-modes" }, MODES.map(mode => chip("mode", mode.id, mode.label, mode.id === initial.mode, { hint: mode.symbol })))),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Difficulty" }), levelHolder),
      fractionOptions),
    h("fieldset", { class: "setup-section" },
      h("legend", { class: "section-title", text: "PACE" }),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Question duration" }),
        h("div", { class: "chips" }, QUESTION_SECONDS.map(seconds => chip("questionSeconds", seconds, durationLabel(seconds), seconds === initial.questionSeconds)))),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Answer reveal" }),
        h("div", { class: "chips" }, REVEAL_SECONDS.map(seconds => chip("revealSeconds", seconds, durationLabel(seconds), seconds === initial.revealSeconds))))),
    h("fieldset", { class: "setup-section" },
      h("legend", { class: "section-title", text: "WINNING" }),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Ways to win" }),
        h("div", { class: "chips" },
          chip("rows", "on", "Rows", initial.patterns.rows, { type: "checkbox" }),
          chip("columns", "on", "Columns", initial.patterns.columns, { type: "checkbox" }),
          chip("diagonals", "on", "Diagonals", initial.patterns.diagonals, { type: "checkbox" }))),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Number of winners" }),
        h("div", { class: "chips" }, WINNER_PRESETS.map(count => chip("winners", count, winnersLabel(count), count === initial.winners)), customWinners))),
    h("fieldset", { class: "setup-section" },
      h("legend", { class: "section-title", text: "CLASSROOM" }),
      h("div", { class: "toggles" },
        chip("freeSpace", "on", "Free Space", initial.freeSpace, { type: "checkbox" }),
        chip("joinLock", "on", "Lock joining", joinLocked, { type: "checkbox" })),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Music" }),
        h("div", { class: "chips" }, AUDIO_TARGETS.map(target => chip("music", target, AUDIO_LABELS[target], target === initial.music)))),
      h("fieldset", { class: "setup-field" }, h("legend", { class: "field-title", text: "Celebration sounds" }),
        h("div", { class: "chips" }, AUDIO_TARGETS.map(target => chip("celebration", target, AUDIO_LABELS[target], target === initial.celebration)))))),
  error,
  h("div", { class: "setup-actions" },
    onCancel ? h("button", { type: "button", class: "button button-ghost", text: "Cancel", onclick: onCancel }) : null,
    h("button", { type: "submit", class: "button button-primary button-cta", text: submitLabel })));

  fill(fractionOptions, chip("equivalentFractions", "on", "Allow Equivalent Fractions", initial.equivalentFractions, { type: "checkbox", hint: "Off: exact match only" }));
  renderLevels(initial.mode, initial.level);
  return form;
}

function renderSetup(message = "") {
  resetView();
  setScreen("setup");
  const form = settingsForm(lastSettings(), {
    submitLabel: "CREATE GAME",
    onSubmit: (settings, joinLock, error) => createRoom(settings, joinLock, error)
  });
  fill(app, h("main", { id: "main", class: "setup-screen" },
    h("header", { class: "setup-header" }, brandMark(),
      h("h1", { class: "game-title" }, h("span", { class: "title-math", text: "Math " }), h("span", { class: "title-bingo", text: "Bingo" }), h("span", { class: "title-live", text: " Live" })),
      h("p", { class: "game-tagline", text: "Solve math questions, mark your card, and race classmates to Bingo." })),
    message ? h("p", { class: "notice", role: "status", text: message }) : null,
    h("div", { class: "setup-layout" }, form, tutorial(lastSettings().mode)),
    h("footer", { class: "credits" },
      h("p", { text: `Music: “${MUSIC_TRACK.title}” by ${MUSIC_TRACK.author} (${MUSIC_TRACK.site}), ${MUSIC_TRACK.license}.` }))));
}

async function createRoom(settings, joinLock, error) {
  if (busy) return;
  busy = true;
  const button = app.querySelector(".setup-actions .button-primary");
  if (button) {
    button.disabled = true;
    button.textContent = "Creating…";
  }
  try {
    const payload = await liveRequest(HOST_ENDPOINT, { action: "create", settings });
    rememberSettings(settings);
    saveToken(payload.hostToken);
    startSession(payload.state);
    if (joinLock) await session.act("lock");
  } catch (failure) {
    if (error) error.textContent = failure instanceof LiveError ? failure.message : MESSAGES.unavailable;
    if (button) {
      button.disabled = false;
      button.textContent = "CREATE GAME";
    }
  } finally {
    busy = false;
  }
}

// --------------------------------------------------------------- session

function startSession(initialState) {
  session?.stop();
  lastEventSeq = null;
  session = createLiveSession({
    endpoint: HOST_ENDPOINT,
    credentials: () => ({ hostToken }),
    // Room version + player progress: ordinary taps change only the progress.
    since: current => (current ? { since: current.version, sinceProgress: current.progress } : {}),
    intervalFor: current => (current && ACTIVE_PHASES.has(current.phase) ? 800 : 1500),
    onState: next => {
      state = next;
      presence = new Map(next.players.map(player => [player.id, player.connected]));
      render();
    },
    onUnchanged: payload => {
      let changed = false;
      for (const entry of payload.presence ?? []) {
        if (presence.get(entry.id) !== entry.connected) changed = true;
        presence.set(entry.id, entry.connected);
      }
      if (changed && view?.updatePresence) view.updatePresence();
    },
    onConnection: status => body.classList.toggle("is-reconnecting", status === "reconnecting"),
    onFatal: error => {
      if (error.code === "room-not-found") renderTakenOver();
      else if (error.code === "host-sign-in-required") renderSignedOut();
      else renderSetup(error.message);
    }
  });
  session.start(initialState);
}

async function boot() {
  setScreen("loading");
  fill(app, h("main", { id: "main", class: "setup-screen" }, h("p", { class: "loading-text", role: "status", text: "Loading Math Bingo Live…" })));
  const stored = readToken();
  if (stored) {
    hostToken = stored;
    try {
      const payload = await liveRequest(HOST_ENDPOINT, { action: "state", hostToken: stored });
      if (payload.state) {
        startSession(payload.state);
        return;
      }
    } catch {
      saveToken(null);
    }
  }
  try {
    const payload = await liveRequest(HOST_ENDPOINT, { action: "resume" });
    saveToken(payload.hostToken);
    startSession(payload.state);
  } catch (failure) {
    if (failure instanceof LiveError && failure.code === "host-sign-in-required") renderSignedOut();
    else renderSetup();
  }
}

/** Leave the current view: the next state rebuilds a fresh one. */
function resetView() {
  view = null;
  viewKey = "";
  for (const dialog of viewDialogs) dialog.remove();
  viewDialogs = [];
}

function renderTakenOver() {
  resetView();
  setScreen("notice");
  fill(app, h("main", { id: "main", class: "setup-screen" },
    h("div", { class: "notice-card", role: "status" },
      h("p", { class: "notice-title", text: "This game is open in another window" }),
      h("p", { text: "Only one screen controls a game at a time." }),
      h("button", { type: "button", class: "button button-primary", text: "Take control here", onclick: async () => {
        try {
          const payload = await liveRequest(HOST_ENDPOINT, { action: "resume" });
          saveToken(payload.hostToken);
          startSession(payload.state);
        } catch (failure) {
          renderSetup(failure instanceof LiveError ? failure.message : "");
        }
      } }),
      h("button", { type: "button", class: "button button-ghost", text: "Start a new game", onclick: () => { saveToken(null); renderSetup(); } }))));
}

function renderSignedOut() {
  resetView();
  setScreen("notice");
  fill(app, h("main", { id: "main", class: "setup-screen" },
    h("div", { class: "notice-card", role: "status" },
      h("p", { class: "notice-title", text: "Sign in to host" }),
      h("p", { text: MESSAGES["host-sign-in-required"] }),
      h("a", { class: "button button-primary", href: `/sign-in?next=${encodeURIComponent("/games/math-bingo-live/host")}`, text: "Sign in" }))));
}

async function command(action, extra = {}) {
  if (busy) return null;
  busy = true;
  try {
    return await session.act(action, extra);
  } catch (failure) {
    banner?.show({ tone: "info", duration: 2600, children: [h("p", { class: "banner-subtitle", text: failure instanceof LiveError ? failure.message : MESSAGES.unavailable })] });
    return null;
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------- render

function render() {
  if (!state) return;
  if (state.status !== "open") {
    session?.stop();
    saveToken(null);
    renderSetup("The room has ended. Every player name and card was deleted.");
    return;
  }
  if (state.gameNumber !== lastGame) {
    lastGame = state.gameNumber;
    lastEventSeq = null;
    oneAway.length = 0;
  }
  if (!banner) banner = createBanner(document.body);
  processEvents();
  audio.syncMusic();
  const key = state.phase === "LOBBY" ? "lobby" : state.phase === "GAME_COMPLETE" ? "complete" : "game";
  if (key !== viewKey) {
    viewKey = key;
    for (const dialog of viewDialogs) dialog.remove();
    viewDialogs = [];
    view = key === "lobby" ? buildLobby() : key === "complete" ? buildComplete() : buildGame();
  }
  view.update();
}

function codeDisplay(code, className = "") {
  return h("span", { class: `code-display ${className}`.trim(), "aria-label": `Code ${code.split("").join(" ")}` },
    h("span", { "aria-hidden": "true", text: code.slice(0, 3) }), h("span", { "aria-hidden": "true", class: "code-gap" }), h("span", { "aria-hidden": "true", text: code.slice(3) }));
}

function playersDialog() {
  const list = h("ul", { class: "player-admin-list" });
  const lockButton = h("button", { type: "button", class: "button button-ghost" });
  const dialog = h("dialog", { class: "dialog", "aria-labelledby": "players-title" },
    h("div", { class: "dialog-head" }, h("h2", { id: "players-title", class: "dialog-title", text: "Players" }),
      iconButton("Close", "close", () => dialog.close())),
    lockButton,
    list);
  const update = () => {
    lockButton.replaceChildren(icon(state.joinLocked ? "unlock" : "lock"), h("span", { text: state.joinLocked ? "Unlock joining" : "Lock joining" }));
    lockButton.onclick = () => command(state.joinLocked ? "unlock" : "lock");
    fill(list, state.players.length ? state.players.map(player => h("li", { class: "player-admin" },
      h("span", { class: `presence ${presence.get(player.id) ? "is-on" : "is-off"}`, "aria-label": presence.get(player.id) ? "Connected" : "Away" }),
      h("span", { class: "player-admin-name", text: player.name }),
      h("span", { class: "player-admin-progress", text: player.hasWon ? `${medal(player.placement) || ordinal(player.placement)} BINGO` : `${player.best}/5` }),
      h("button", { type: "button", class: "button button-ghost button-small", "aria-label": `Remove ${player.name}`, text: "Remove", onclick: () => confirmRemove(player) })))
      : h("li", { class: "player-admin-empty", text: "No players yet." }));
  };
  document.body.append(dialog);
  viewDialogs.push(dialog);
  return { dialog, update };
}

function confirmDialog({ title, text, confirm, onConfirm, danger = false }) {
  const dialog = h("dialog", { class: "dialog", "aria-labelledby": "confirm-title" },
    h("h2", { id: "confirm-title", class: "dialog-title", text: title }),
    h("p", { text }),
    h("div", { class: "dialog-actions" },
      h("button", { type: "button", class: "button button-ghost", text: "Cancel", onclick: () => dialog.close() }),
      h("button", { type: "button", class: `button ${danger ? "button-danger" : "button-primary"}`, text: confirm, onclick: () => {
        dialog.close();
        onConfirm();
      } })));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function confirmRemove(player) {
  confirmDialog({
    title: `Remove ${player.name}?`,
    text: "They leave this game and their name is deleted. Lock joining to stop them coming back.",
    confirm: "Remove",
    danger: true,
    onConfirm: () => command("remove", { participant: player.id })
  });
}

function confirmEndRoom() {
  confirmDialog({
    title: "End the room?",
    text: "Every player is removed and their names and cards are deleted.",
    confirm: "End room",
    danger: true,
    onConfirm: () => command("close")
  });
}

function settingsDialog() {
  const dialog = h("dialog", { class: "dialog dialog-wide", "aria-labelledby": "settings-title" },
    h("div", { class: "dialog-head" }, h("h2", { id: "settings-title", class: "dialog-title", text: "Game settings" }), iconButton("Close", "close", () => dialog.close())));
  const form = settingsForm(state.settings, {
    submitLabel: "Save settings",
    joinLocked: state.joinLocked,
    onCancel: () => dialog.close(),
    onSubmit: async (settings, joinLock) => {
      rememberSettings(settings);
      await command("settings", { settings });
      if (joinLock !== state.joinLocked) await command(joinLock ? "lock" : "unlock");
      dialog.close();
    }
  });
  dialog.append(form);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function topBar(extra = []) {
  const musicButton = iconButton("Music", "music", () => {
    preferences.music = !preferences.music;
    writePreferences(preferences);
    musicButton.setAttribute("aria-pressed", String(preferences.music));
    audio.syncMusic();
  }, { attributes: { "aria-pressed": String(preferences.music) } });
  const soundButton = iconButton("Sound effects", preferences.sound ? "sound" : "mute", () => {
    preferences.sound = !preferences.sound;
    writePreferences(preferences);
    soundButton.replaceChildren(icon(preferences.sound ? "sound" : "mute"));
    soundButton.setAttribute("aria-pressed", String(preferences.sound));
  }, { attributes: { "aria-pressed": String(preferences.sound) } });
  const fullscreen = iconButton("Full screen", "expand", () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  return h("header", { class: "host-bar" }, brandMark(),
    h("p", { class: "host-title" }, h("span", { class: "title-math", text: "Math " }), h("span", { class: "title-bingo", text: "Bingo" }), h("span", { class: "title-live", text: " Live" })),
    h("div", { class: "host-bar-extra" }, extra),
    h("div", { class: "host-bar-tools" }, musicButton, soundButton, fullscreen));
}

// ----------------------------------------------------------------- lobby

function buildLobby() {
  setScreen("lobby");
  const players = playersDialog();
  const codeHolder = h("div", { class: "join-code" });
  const count = h("h2", { class: "roster-title" });
  const roster = h("ul", { class: "roster", "aria-live": "polite", "aria-relevant": "additions" });
  const summary = h("div", { class: "lobby-summary" });
  const lockToggle = h("button", { type: "button", class: "button button-ghost" });
  const startButton = h("button", { type: "button", class: "button button-primary button-cta", text: "START GAME", onclick: () => command("start") });
  const main = h("main", { id: "main", class: "lobby-host" },
    topBar([h("button", { type: "button", class: "button button-ghost button-small", onclick: () => { players.update(); players.dialog.showModal(); } }, icon("users"), h("span", { text: "Players" }))]),
    h("section", { class: "join-panel", "aria-label": "How to join" },
      h("p", { class: "join-step", text: "JOIN" }),
      h("p", { class: "join-url", text: `${joinHost()}/join` }),
      h("p", { class: "join-step", text: "CODE" }),
      codeHolder,
      h("p", { class: "join-note", text: "No account needed — just the code and a first name or nickname." })),
    h("section", { class: "roster-panel", "aria-labelledby": "roster-title" }, count, roster),
    h("section", { class: "lobby-actions" }, summary,
      h("div", { class: "lobby-buttons" },
        startButton,
        h("button", { type: "button", class: "button button-ghost", onclick: settingsDialog }, icon("settings"), h("span", { text: "Settings" })),
        lockToggle,
        h("button", { type: "button", class: "button button-ghost", onclick: () => command("code") }, icon("refresh"), h("span", { text: "New code" })),
        h("button", { type: "button", class: "button button-ghost", text: "End room", onclick: confirmEndRoom }))));
  fill(app, main);
  let rosterKey = null;
  const updatePresence = () => {
    for (const item of roster.querySelectorAll("[data-player]")) item.classList.toggle("is-away", presence.get(item.dataset.player) === false);
    players.update();
  };
  return {
    updatePresence,
    update() {
      fill(codeHolder, codeDisplay(state.code, "is-giant"));
      count.id = "roster-title";
      count.textContent = `PLAYERS — ${state.players.length}`;
      const key = state.players.map(player => `${player.id}:${player.name}`).join("|");
      if (key !== rosterKey) {
        rosterKey = key;
        fill(roster, state.players.length
          ? state.players.map(player => h("li", { class: "roster-name", dataset: { player: player.id } },
              h("span", { text: player.name }),
              h("button", { type: "button", class: "roster-remove", "aria-label": `Remove ${player.name}`, onclick: () => confirmRemove(player) }, icon("close"))))
          : h("li", { class: "roster-empty", text: "Waiting for players…" }));
        const newest = state.players[state.players.length - 1];
        if (newest) announce(`${newest.name} joined. ${state.players.length} players.`);
      }
      updatePresence();
      const settings = state.settings;
      fill(summary,
        h("p", { class: "summary-mode", text: state.modeLabel }),
        h("p", { class: "summary-pace", text: `${durationLabel(settings.questionSeconds)} questions · ${durationLabel(settings.revealSeconds)} reveal · ${settings.winners === 0 ? "Everyone can win" : `${settings.winners} winner${settings.winners === 1 ? "" : "s"}`}${settings.freeSpace ? " · Free Space" : ""}${settings.equivalentFractions ? " · Equivalent fractions" : ""}` }),
        rulesStrip(settings.patterns));
      lockToggle.replaceChildren(icon(state.joinLocked ? "lock" : "unlock"), h("span", { text: state.joinLocked ? "Joining locked" : "Lock joining" }));
      lockToggle.setAttribute("aria-pressed", String(state.joinLocked));
      lockToggle.onclick = () => command(state.joinLocked ? "unlock" : "lock");
      startButton.disabled = state.players.length === 0;
      startButton.textContent = state.players.length === 0 ? "WAITING FOR PLAYERS" : "START GAME";
    }
  };
}

// ------------------------------------------------------------------ game

/** Winners so far, e.g. "Winners 2 / 3" (or just the count when everyone can win). */
function winnersText(settings) {
  return settings.winners === 0 ? `Winners ${state.winnerCount}` : `Winners ${state.winnerCount} / ${settings.winners}`;
}

/** One compact row per player, however many there are. */
function standingsList(rows) {
  if (!rows.length) return h("p", { class: "panel-empty", text: "Waiting for players…" });
  return h("ol", { class: "standings-list", "aria-label": "Standings" }, rows.map(row => h("li", {
    class: `standing${row.won ? " is-winner" : ""}${!row.won && row.best === 4 ? " is-close" : ""}`
  },
  h("span", { class: "standing-rank", "aria-hidden": "true", text: row.won && row.placement <= 3 ? medal(row.placement) : String(row.rank) }),
  h("span", { class: "standing-name", text: row.name }),
  h("span", { class: "standing-progress", text: progressText(row) }),
  h("span", { class: "sr-only", text: row.won ? `, ${ordinal(row.placement)} Bingo` : `, rank ${row.rank}, best line ${row.best} of 5` }))));
}

/** Confirmed winners in placement order; they stay listed for the rest of the game. */
function winnersList(winners) {
  if (!winners.length) return h("p", { class: "panel-empty", text: "Waiting for the first Bingo…" });
  return h("ol", { class: "winners-list", "aria-label": "Bingo winners" }, winners.map(winner => h("li", { class: "winner-row" },
    h("span", { class: "winner-medal", "aria-hidden": "true", text: medal(winner.placement) || ordinal(winner.placement) }),
    h("span", { class: "winner-name", text: winner.name }),
    h("span", { class: "winner-line", text: winner.placement === 1 ? "FIRST BINGO" : `${LINE_LABEL[winner.lineType] ?? ""} Bingo`.trim() }),
    h("span", { class: "sr-only", text: `, ${ordinal(winner.placement)} place, ${LINE_LABEL[winner.lineType] ?? ""} Bingo` }))));
}

/** A titled dashboard panel whose list scrolls inside it (never the page). */
function panel(id, className, title, ...extra) {
  const heading = h("h2", { id, class: "panel-title", text: title });
  const meta = h("p", { class: "panel-meta" });
  const content = h("div", { class: "panel-scroll", tabindex: "0", role: "region", "aria-labelledby": id });
  const element = h("section", { class: `panel ${className}`, "aria-labelledby": id },
    h("div", { class: "panel-head" }, heading, meta), ...extra, content);
  return { element, heading, meta, content };
}

/*
 * The live classroom board (desktop, projector, Smart Board):
 *   header: title, mode, JOIN + CODE, winners so far, sound and full screen
 *   winning ways: always visible, from the room's own settings
 *   left: STANDINGS (one compact row per player) over BINGO WINNERS
 *   right: the current question and its timer (the answer reveal replaces it
 *          in place) over CALLED / CALLED FRACTIONS
 *   bottom: Pause, Next, Players, Lock join, End game
 * Only the panels scroll, so nothing pushes the controls off the screen.
 */
function buildGame() {
  setScreen("host-game");
  const players = playersDialog();
  const timer = createTimer("host-timer");
  const stage = h("div", { class: "stage", "aria-live": "off" });
  const stageLabel = h("p", { class: "stage-label" });
  const overlay = h("div", { class: "stage-overlay", hidden: true });
  const ways = h("div", { class: "ways-strip" });
  const ticker = h("p", { class: "one-away", "aria-live": "polite" });
  const standings = panel("standings-title", "panel-standings", "STANDINGS", ticker);
  const winners = panel("winners-title", "panel-winners", "BINGO WINNERS");
  const called = panel("called-title", "panel-called", "CALLED");
  const boardLeft = h("div", { class: "board-left" }, standings.element, winners.element);
  // Free Space and Bingo announcements appear over the left column for a few
  // seconds, so the winning ways and the question stay in view.
  const celebration = createBanner(boardLeft);

  const modeChip = h("p", { class: "head-mode" });
  const joinChip = h("p", { class: "head-join" });
  const winnersChip = h("p", { class: "head-winners", "aria-live": "polite" });
  const musicButton = iconButton("Music", "music", () => {
    preferences.music = !preferences.music;
    writePreferences(preferences);
    musicButton.setAttribute("aria-pressed", String(preferences.music));
    audio.syncMusic();
  }, { attributes: { "aria-pressed": String(preferences.music) } });
  const soundButton = iconButton("Sound effects", preferences.sound ? "sound" : "mute", () => {
    preferences.sound = !preferences.sound;
    writePreferences(preferences);
    soundButton.replaceChildren(icon(preferences.sound ? "sound" : "mute"));
    soundButton.setAttribute("aria-pressed", String(preferences.sound));
  }, { attributes: { "aria-pressed": String(preferences.sound) } });
  const fullscreen = iconButton("Full screen", "expand", () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  const pauseButton = h("button", { type: "button", class: "button button-control" });
  const nextButton = h("button", { type: "button", class: "button button-control button-primary" });
  const playersButton = h("button", { type: "button", class: "button button-control button-ghost", onclick: () => { players.update(); players.dialog.showModal(); } }, icon("users"), h("span", { class: "players-count" }));
  const lockButton = h("button", { type: "button", class: "button button-control button-ghost" });
  const endButton = h("button", { type: "button", class: "button button-control button-ghost", onclick: () => confirmDialog({
    title: "End this game?", text: "The game finishes now and the winners so far are shown.", confirm: "End game", onConfirm: () => command("end")
  }) }, icon("stop"), h("span", { text: "End game" }));

  const main = h("main", { id: "main", class: "host-game" },
    h("header", { class: "host-head" },
      h("p", { class: "host-title" }, h("img", { src: "/brand/mathnexa-mark.png", alt: "MathNexa", class: "brand-mark", width: "28", height: "28" }),
        h("span", { class: "title-math", text: " Math " }), h("span", { class: "title-bingo", text: "Bingo" }), h("span", { class: "title-live", text: " Live" })),
      modeChip, joinChip, winnersChip,
      h("div", { class: "host-bar-tools" }, musicButton, soundButton, fullscreen)),
    ways,
    h("div", { class: "host-board" },
      boardLeft,
      h("div", { class: "board-right" },
        h("section", { class: "panel panel-question", "aria-labelledby": "question-title" },
          h("h2", { id: "question-title", class: "sr-only", text: "Current question" }),
          stageLabel, timer.element, stage, overlay),
        called.element)),
    h("nav", { class: "controls", "aria-label": "Game controls" }, pauseButton, nextButton, playersButton, lockButton, endButton));
  fill(app, main);

  let stageKey = "";
  const updateStage = () => {
    const key = `${state.gameNumber}:${state.phase}:${state.questionNumber}:${state.winnerCount}`;
    if (key === stageKey) return;
    stageKey = key;
    const question = state.question;
    const phase = state.phase === "PAUSED" ? state.pausedPhase : state.phase;
    body.dataset.phase = state.phase;
    stage.dataset.face = "";
    if (state.phase === "COUNTDOWN") {
      stageLabel.textContent = state.gameNumber > 1 ? `GAME ${state.gameNumber}` : "GET READY";
      stage.dataset.face = "ready";
      fill(stage, h("p", { class: "stage-ready", text: "GET READY!" }), h("p", { class: "stage-mode", text: state.modeLabel }));
    } else if (phase === "QUESTION_ACTIVE" && question) {
      stageLabel.textContent = `QUESTION ${question.number}`;
      stage.dataset.face = question.kind === "fraction" ? "fraction" : "question";
      // Shorter questions get bigger type; the stylesheet sizes by length.
      stage.style.setProperty("--q-len", String(question.text.length));
      fill(stage, questionFace(question, { className: "is-giant" }));
      if (state.phase === "QUESTION_ACTIVE") {
        lastTickSecond = null;
        audio.question();
        announce(`Question ${question.number}: ${question.spoken}.`);
      }
    } else if (["ANSWER_REVEAL", "LEADERBOARD_UPDATE", "WINNER_REVEAL"].includes(phase) && question?.reveal) {
      // The answer replaces the question in the same place.
      stageLabel.textContent = phase === "WINNER_REVEAL" ? "BINGO!" : `ANSWER · QUESTION ${question.number}`;
      stage.dataset.face = question.kind === "fraction" ? "reveal-fraction" : "reveal";
      stage.style.setProperty("--r-len", String((question.reveal.text ?? question.text).length));
      fill(stage, revealFace(question));
      if (phase === "ANSWER_REVEAL" && state.phase === "ANSWER_REVEAL") announce(`The answer: ${question.kind === "fraction" ? `${question.text}, ${question.reveal.description}` : question.reveal.text}.`);
    } else {
      stageLabel.textContent = "";
      clear(stage);
    }
  };

  // Lists are rebuilt only when what they show changes, so a teacher's scroll
  // position and keyboard focus survive the once-a-second refresh.
  let standingsKey = null;
  let winnersKey = null;
  let calledKey = null;
  let waysKey = null;
  return {
    timer,
    banner: celebration,
    updatePresence: () => players.update(),
    update() {
      updateStage();
      const settings = state.settings;
      const fractions = settings.mode === "fractions";
      modeChip.textContent = state.modeLabel;
      fill(joinChip, state.joinLocked
        ? h("span", { class: "head-locked" }, icon("lock"), h("span", { text: "JOINING LOCKED" }))
        : [h("span", { class: "head-label", text: "JOIN" }), h("span", { class: "head-url", text: `${joinHost()}/join` }),
           h("span", { class: "head-label", text: "CODE" }), codeDisplay(state.code, "head-code")]);
      winnersChip.textContent = winnersText(settings);

      const patterns = JSON.stringify(settings.patterns);
      if (patterns !== waysKey) {
        waysKey = patterns;
        fill(ways, rulesStrip(settings.patterns, { title: "WINNING WAYS", className: "is-board" }));
      }

      const nextStandings = JSON.stringify(state.leaderboard);
      if (nextStandings !== standingsKey) {
        standingsKey = nextStandings;
        fill(standings.content, standingsList(state.leaderboard));
      }
      standings.meta.textContent = `${state.players.length} player${state.players.length === 1 ? "" : "s"}`;
      ticker.textContent = oneAway.length ? oneAway.slice(-2).map(name => `${name} is one away!`).join("  ·  ") : "";

      const nextWinners = JSON.stringify(state.winners.map(winner => [winner.placement, winner.name, winner.lineType]));
      if (nextWinners !== winnersKey) {
        winnersKey = nextWinners;
        fill(winners.content, winnersList(state.winners));
      }
      winners.meta.textContent = winnersText(settings);

      const shown = state.called.filter(item => item.reveal || (state.question && item.number === state.question.number));
      called.heading.textContent = fractions ? "CALLED FRACTIONS" : "CALLED";
      called.meta.textContent = shown.length ? `${shown.length} called` : "";
      const nextCalled = JSON.stringify([fractions, state.question?.number ?? 0, shown.map(item => [item.number, item.reveal ? 1 : 0])]);
      if (nextCalled !== calledKey) {
        const grew = calledKey === null || shown.length !== JSON.parse(calledKey)[2].length;
        calledKey = nextCalled;
        fill(called.content, shown.length
          ? calledList(shown, state.question, { fractions })
          : h("p", { class: "panel-empty", text: "Questions appear here as they are called." }));
        // Keep the newest question in view as the list grows.
        if (grew) called.content.scrollTop = called.content.scrollHeight;
      }

      players.update();
      playersButton.querySelector(".players-count").textContent = `Players — ${state.players.length}`;

      const paused = state.phase === "PAUSED";
      pauseButton.replaceChildren(icon(paused ? "play" : "pause"), h("span", { text: paused ? "Resume" : "Pause" }));
      pauseButton.disabled = !["COUNTDOWN", "QUESTION_ACTIVE", "ANSWER_REVEAL", "LEADERBOARD_UPDATE", "PAUSED"].includes(state.phase);
      pauseButton.onclick = () => command(paused ? "unpause" : "pause");
      const nextLabel = { COUNTDOWN: "Start now", QUESTION_ACTIVE: "Reveal answer", ANSWER_REVEAL: "Next question", LEADERBOARD_UPDATE: "Next question" }[state.phase];
      nextButton.replaceChildren(icon("next"), h("span", { text: nextLabel ?? "Next question" }));
      nextButton.disabled = !nextLabel;
      nextButton.onclick = () => command("next", { phase: state.phase, question: state.questionNumber });
      lockButton.replaceChildren(icon(state.joinLocked ? "lock" : "unlock"), h("span", { text: state.joinLocked ? "Unlock join" : "Lock join" }));
      lockButton.setAttribute("aria-pressed", String(state.joinLocked));
      lockButton.onclick = () => command(state.joinLocked ? "unlock" : "lock");

      overlay.hidden = !paused;
      if (paused) fill(overlay, h("p", { class: "overlay-title", role: "status", text: "PAUSED" }), h("p", { class: "overlay-text", text: "Marks are not accepted while paused." }));
      else clear(overlay);
    }
  };
}

// -------------------------------------------------------------- complete

function buildComplete() {
  setScreen("complete");
  const podium = h("ol", { class: "podium is-giant" });
  const note = h("p", { class: "complete-text" });
  const main = h("main", { id: "main", class: "complete-host" },
    topBar(),
    h("section", { class: "complete", "aria-labelledby": "complete-title" },
      h("h1", { id: "complete-title", class: "complete-title", text: "MATH BINGO COMPLETE" }),
      podium,
      note,
      h("div", { class: "complete-actions" },
        h("button", { type: "button", class: "button button-primary button-cta", onclick: () => command("again") }, icon("refresh"), h("span", { text: "Play Again" })),
        h("button", { type: "button", class: "button button-ghost", onclick: () => command("change-settings") }, icon("settings"), h("span", { text: "Change Settings" })),
        h("button", { type: "button", class: "button button-ghost", text: "End Room", onclick: confirmEndRoom }))));
  fill(app, main);
  let announced = "";
  return {
    update() {
      fill(podium, state.winners.length
        ? state.winners.map(winner => h("li", { class: "podium-place" },
            h("span", { class: "podium-medal", "aria-hidden": "true", text: medal(winner.placement) || ordinal(winner.placement) }),
            h("span", { class: "podium-name", text: winner.name }),
            h("span", { class: "podium-line", text: `${LINE_LABEL[winner.lineType] ?? ""}` }),
            h("span", { class: "sr-only", text: `, ${ordinal(winner.placement)} place` })))
        : h("li", { class: "podium-empty", text: "No Bingo this time." }));
      note.textContent = state.completedReason === "deck" ? "Every question was called." : state.completedReason === "host" ? "Game ended by the host." : "";
      const summary = state.winners.map(winner => `${ordinal(winner.placement)}: ${winner.name}`).join(", ");
      if (summary !== announced) {
        announced = summary;
        announce(`Math Bingo complete. ${summary || "No Bingo this time."}`);
      }
    }
  };
}

// ---------------------------------------------------------------- events

function processEvents() {
  if (lastEventSeq === null) {
    lastEventSeq = state.eventSeq;
    return;
  }
  for (const event of state.events) {
    if (event.seq <= lastEventSeq) continue;
    lastEventSeq = event.seq;
    if (event.type === "free-space") {
      (view?.banner ?? banner).show({ tone: "free", duration: 2400, children: [h("p", { class: "banner-title", text: `\u{1F389} ${upperName(event.name)} USED FREE SPACE!` })] });
      audio.freeSpace();
      announce(`${event.name} used Free Space.`, { assertive: true });
    } else if (event.type === "bingo") {
      const winner = state.winners.find(item => item.placement === event.placement);
      (view?.banner ?? banner).show({ tone: "bingo", duration: 4200, children: bingoBannerChildren(event, winner) });
      if (state.settings.celebration !== "off") audio.bingo();
      announce(`${event.name}, Bingo! ${placeWord(event.placement).toLowerCase()} Bingo${event.cap > 0 ? `, ${event.placement} of ${event.cap}` : ""}.`, { assertive: true });
    } else if (event.type === "one-away") {
      oneAway.push(event.name);
    }
  }
}

// ----------------------------------------------------------------- clock

function tick() {
  if (state && session && viewKey === "game" && view) {
    const remaining = remainingMs(state, session.clock);
    const total = phaseTotalMs(state);
    const manual = (state.phase === "QUESTION_ACTIVE" && state.settings.questionSeconds === 0) || (state.phase === "ANSWER_REVEAL" && state.settings.revealSeconds === 0);
    view.timer?.update(remaining, total, { paused: state.phase === "PAUSED", manual });
    if (state.phase === "QUESTION_ACTIVE" && remaining !== null) {
      const seconds = Math.ceil(remaining / 1000);
      if (seconds <= 3 && seconds >= 1 && seconds !== lastTickSecond) {
        lastTickSecond = seconds;
        audio.tick();
      }
    }
  }
  window.requestAnimationFrame(tick);
}

window.__MATH_BINGO_LIVE__ = Object.freeze({
  get state() {
    return state;
  },
  audio: () => audio.snapshot()
});

boot();
window.requestAnimationFrame(tick);
