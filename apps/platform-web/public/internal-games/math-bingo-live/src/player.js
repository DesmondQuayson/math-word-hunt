// Math Bingo Live — the student screen at /join.
//
// Code -> name -> lobby -> card. No account: the server returns a random seat
// token, kept in sessionStorage so a refresh restores the same player, card,
// marks, Free Space and win (never a duplicate player). The card is the
// largest thing on the screen; every tap is checked by the server.

import { ACTION_TIMEOUT_MS, PLAY_ENDPOINT, LiveError, MESSAGES, createLiveSession, liveRequest, pollInterval, readStored, writeStored } from "./api.js";
import { GameAudio, attachAudioLifecycle, readPreferences, writePreferences } from "./audio.js";
import { createCard, isFree } from "./cells.js";
import { announce, clear, fill, h, icon } from "./dom.js";
import { LINES } from "./engine/board.js";
import { EMOJI_CHOICES, isAllowedEmoji, withEmoji } from "./engine/emoji.js";
import { NAME_MAX } from "./engine/settings.js";
import { codeFromSearch } from "./join-link.js";
import {
  LINE_LABEL,
  announcedName,
  bingoBannerChildren,
  calledList,
  createBanner,
  createTimer,
  iconButton,
  leaderboardList,
  medal,
  ordinal,
  phaseTotalMs,
  placeWord,
  playerName,
  questionFace,
  remainingMs,
  revealFace,
  rulesStrip,
  spokenName,
  tutorial
} from "./shared.js";

const SEAT_KEY = "mathnexa:math-bingo-live:seat";
const RECENT_KEY = "mathnexa:math-bingo-live:recent-seat";
const RECENT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** How long the first tap on the star waits for the confirming second tap. */
const FREE_CONFIRM_MS = 8000;
const ACTIVE_PHASES = new Set(["COUNTDOWN", "QUESTION_ACTIVE", "ANSWER_REVEAL", "LEADERBOARD_UPDATE", "WINNER_REVEAL", "PAUSED"]);

const app = document.getElementById("app");
const body = document.body;
const preferences = readPreferences();

let session = null;
let seat = null;
let state = null;
let lastEventSeq = null;
let lastGame = null;
let lastQuestionKey = "";
let spokenSeconds = new Set();
let pendingCell = null;
let freeArmedUntil = 0;
let calledOpen = false;
let game = null;

const audio = new GameAudio(preferences, () => state?.settings?.music === "all" && ACTIVE_PHASES.has(state?.phase));
attachAudioLifecycle(audio);

function readSeat() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? "null");
    if (value && typeof value.token === "string" && typeof value.code === "string") return value;
  } catch {
    /* ignore */
  }
  return null;
}

function saveSeat(next) {
  try {
    if (next) sessionStorage.setItem(SEAT_KEY, JSON.stringify({ token: next.token, code: next.code }));
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* A reload will not restore without storage. */
  }
  writeStored(RECENT_KEY, next ? { token: next.token, code: next.code, name: next.name, emoji: isAllowedEmoji(next.emoji) ? next.emoji : null, at: Date.now() } : null);
}

function setScreen(name) {
  body.dataset.screen = name;
}

// ------------------------------------------------------------------ join

/** The room from a QR code or a shared link (/join?code=537636), or "". */
function initialCode() {
  return codeFromSearch(location.search);
}

function renderJoinCode(message = "", prefill = initialCode()) {
  setScreen("join");
  const input = h("input", {
    id: "code", class: "join-input code-input", type: "text", inputmode: "numeric", autocomplete: "off", autocapitalize: "off",
    spellcheck: "false", maxlength: "7", pattern: "[0-9 ]*", required: true, "aria-describedby": "code-help code-error", value: prefill
  });
  const error = h("p", { id: "code-error", class: "form-error", role: "alert", text: message });
  const recent = readStored(RECENT_KEY);
  const canRejoin = recent && typeof recent.token === "string" && typeof recent.name === "string" && Date.now() - (recent.at ?? 0) < RECENT_MAX_AGE_MS;
  const form = h("form", {
    class: "join-card", novalidate: true,
    onsubmit: event => {
      event.preventDefault();
      const code = input.value.replace(/\D/g, "");
      if (!/^[1-9]\d{5}$/.test(code)) {
        error.textContent = MESSAGES["invalid-code"];
        input.focus();
        return;
      }
      renderJoinName(code);
    }
  },
  h("p", { class: "join-eyebrow", text: "Math Bingo Live" }),
  h("label", { for: "code", class: "join-label", text: "GAME CODE" }),
  input,
  h("p", { id: "code-help", class: "join-help", text: "The 6 numbers on your teacher's screen." }),
  error,
  h("button", { type: "submit", class: "button button-primary button-wide", text: "Next" }),
  canRejoin ? h("button", {
    type: "button", class: "button button-ghost button-wide",
    onclick: () => resume({ token: recent.token, code: recent.code, name: recent.name, emoji: recent.emoji }),
    text: `Rejoin as ${withEmoji(recent.name, recent.emoji)}`
  }) : null);
  fill(app, h("main", { id: "main", class: "join-screen" }, brandHeader(), form));
  input.focus();
}

/** A uniformly random index (crypto when available). */
function randomIndex(length) {
  try {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] % length;
  } catch {
    return Math.floor(Math.random() * length);
  }
}

/**
 * Name + optional emoji, then Join. Reached from the code screen, or
 * directly from the teacher's QR code (the room is already in the link).
 */
function renderJoinName(code, message = "", { name = "", emoji = null } = {}) {
  setScreen("join");
  let chosen = isAllowedEmoji(emoji) ? emoji : null;
  const input = h("input", {
    id: "name", class: "join-input name-input", type: "text", autocomplete: "nickname", autocapitalize: "words",
    spellcheck: "false", maxlength: String(NAME_MAX), required: true, "aria-describedby": "name-help name-error", value: name
  });
  const error = h("p", { id: "name-error", class: "form-error", role: "alert", text: message });
  const preview = h("p", { class: "join-preview", "aria-live": "polite" });
  const updatePreview = () => {
    const typed = input.value.replace(/\s+/g, " ").trim();
    preview.textContent = typed.length >= 2 ? `You'll appear as ${withEmoji(typed, chosen)}` : chosen ? `Your emoji: ${chosen}` : "";
  };
  input.addEventListener("input", updatePreview);
  // Native radio buttons in a fieldset: arrow keys move between choices, and
  // each choice has a spoken name ("Lion"). "No emoji" is the default.
  const radios = new Map();
  const options = [{ emoji: null, name: "No emoji" }, ...EMOJI_CHOICES].map((choice, index) => {
    const id = `emoji-${index}`;
    const radio = h("input", {
      id, type: "radio", name: "emoji", class: "emoji-radio", value: choice.emoji ?? "",
      checked: (choice.emoji ?? null) === chosen ? true : null,
      onchange: () => {
        chosen = choice.emoji ?? null;
        updatePreview();
      }
    });
    radios.set(choice.emoji ?? "", radio);
    return h("label", { class: `emoji-option${choice.emoji ? "" : " is-none"}`, for: id, title: choice.name },
      radio,
      h("span", { class: "emoji-face", "aria-hidden": "true", text: choice.emoji ?? "None" }),
      h("span", { class: "sr-only", text: choice.name }));
  });
  const random = h("button", {
    type: "button", class: "button button-ghost button-small emoji-random",
    onclick: () => {
      // A different emoji every press (never the one already chosen).
      const others = EMOJI_CHOICES.filter(choice => choice.emoji !== chosen);
      chosen = others[randomIndex(others.length)].emoji;
      const radio = radios.get(chosen);
      if (radio) radio.checked = true;
      updatePreview();
    }
  }, h("span", { "aria-hidden": "true", text: "\u{1F3B2}" }), h("span", { text: "Random" }));
  const submit = h("button", { type: "submit", class: "button button-primary button-wide", text: "JOIN GAME" });
  const form = h("form", {
    class: "join-card", novalidate: true,
    onsubmit: async event => {
      event.preventDefault();
      audio.activate();
      const typed = input.value.replace(/\s+/g, " ").trim();
      if (typed.length < 2) {
        error.textContent = typed ? MESSAGES["name-too-short"] : MESSAGES["name-required"];
        input.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = "Joining…";
      try {
        const payload = await liveRequest(PLAY_ENDPOINT, { action: "join", code, name: typed, emoji: chosen }, { timeoutMs: ACTION_TIMEOUT_MS });
        seat = { token: payload.token, code, name: payload.state.me.name, emoji: payload.state.me.emoji };
        saveSeat(seat);
        startSession(payload.state);
      } catch (failure) {
        submit.disabled = false;
        submit.textContent = "JOIN GAME";
        const failed = failure instanceof LiveError ? failure.code : "unavailable";
        if (["room-not-found", "room-expired", "room-locked", "room-full", "invalid-code"].includes(failed)) {
          renderJoinCode(failure.message, failed === "room-not-found" || failed === "invalid-code" ? "" : code);
          return;
        }
        error.textContent = failure.message;
        input.focus();
      }
    }
  },
  h("p", { class: "join-eyebrow", text: `Game ${code.slice(0, 3)} ${code.slice(3)}` }),
  h("label", { for: "name", class: "join-label", text: "YOUR NAME" }),
  input,
  h("p", { id: "name-help", class: "join-help", text: "Your first name or a nickname. 2–20 characters. Only this game sees it." }),
  h("fieldset", { class: "emoji-field" },
    h("legend", { class: "emoji-legend" }, h("span", { class: "join-label", text: "CHOOSE AN EMOJI" }), h("span", { class: "emoji-optional", text: " (optional)" })),
    random,
    h("div", { class: "emoji-picker" }, options)),
  preview,
  error,
  submit,
  h("button", { type: "button", class: "button button-ghost button-wide", text: "Back", onclick: () => renderJoinCode("", code) }));
  fill(app, h("main", { id: "main", class: "join-screen" }, brandHeader(), form));
  updatePreview();
  input.focus();
}

function brandHeader() {
  return h("header", { class: "join-brand" },
    h("img", { src: "/brand/mathnexa-mark.png", alt: "", width: "40", height: "40", class: "brand-mark" }),
    h("p", { class: "join-title" }, h("span", { class: "title-math", text: "Math " }), h("span", { class: "title-bingo", text: "Bingo" }), h("span", { class: "title-live", text: " Live" })));
}

// --------------------------------------------------------------- session

function startSession(initialState) {
  session?.stop();
  lastEventSeq = null;
  session = createLiveSession({
    endpoint: PLAY_ENDPOINT,
    credentials: () => ({ token: seat.token }),
    since: current => (current ? { since: current.version, sinceMe: current.me.version } : {}),
    intervalFor: current => (current && ACTIVE_PHASES.has(current.phase) ? pollInterval(1000, current.playerCount) : 2000),
    onState: next => {
      state = next;
      render();
    },
    onConnection: status => {
      body.classList.toggle("is-reconnecting", status === "reconnecting");
    },
    onFatal: error => ended(error)
  });
  session.start(initialState);
}

function resume(stored) {
  seat = stored;
  setScreen("loading");
  fill(app, h("main", { id: "main", class: "join-screen" }, brandHeader(), h("p", { class: "loading-text", role: "status", text: "Reconnecting to your game…" })));
  liveRequest(PLAY_ENDPOINT, { action: "state", token: stored.token })
    .then(payload => {
      saveSeat({ ...stored, name: payload.state.me.name, emoji: payload.state.me.emoji });
      startSession(payload.state);
    })
    .catch(error => {
      if (error instanceof LiveError && error.status >= 400 && error.status < 500) {
        saveSeat(null);
        renderJoinCode(error.code === "seat-not-found" ? "" : error.message);
      } else {
        renderJoinCode(error.message);
      }
    });
}

function ended(error) {
  session?.stop();
  saveSeat(null);
  game = null;
  setScreen("ended");
  fill(app, h("main", { id: "main", class: "join-screen" }, brandHeader(),
    h("div", { class: "join-card ended-card", role: "status" },
      h("p", { class: "ended-title", text: error.code === "removed" ? "You're no longer in this game" : "This game has ended" }),
      h("p", { class: "ended-text", text: error.message }),
      h("a", { class: "button button-primary button-wide", href: "/join", text: "Join a game" }))));
}

// ---------------------------------------------------------------- render

function render() {
  if (!state) return;
  if (state.gameNumber !== lastGame) {
    lastGame = state.gameNumber;
    lastEventSeq = null;
    lastQuestionKey = "";
    pendingCell = null;
  }
  processEvents();
  audio.syncMusic();
  if (state.phase === "LOBBY" || state.gameNumber === 0) {
    game = null;
    renderLobby();
    return;
  }
  if (!game) buildGame();
  updateGame();
}

function renderLobby() {
  setScreen("lobby");
  fill(app, h("main", { id: "main", class: "lobby-screen" },
    h("section", { class: "youre-in", role: "status" },
      h("p", { class: "youre-in-title", text: "You're in!" }),
      h("p", { class: "youre-in-name", text: withEmoji(state.me.name, state.me.emoji) }),
      h("p", { class: "youre-in-wait", text: "Waiting for your teacher to start." })),
    state.settings ? rulesStrip(state.settings.patterns) : null,
    tutorial(state.settings?.mode),
    h("button", {
      type: "button", class: "button button-ghost leave-button", text: "Not you? Leave this game",
      onclick: async () => {
        try {
          await session.act("leave");
        } catch {
          /* best effort */
        }
        session.stop();
        saveSeat(null);
        renderJoinCode();
      }
    })));
}

function buildGame() {
  const card = createCard({ onCell: tapCell, onFree: tapFree });
  const timer = createTimer("timer-small");
  const strip = {
    name: h("span", { class: "strip-name" }),
    rank: h("span", { class: "strip-rank" }),
    best: h("span", { class: "strip-best" })
  };
  const band = h("section", { class: "question-band", "aria-live": "off" });
  const toast = h("p", { class: "toast", role: "status", "aria-live": "polite" });
  const winnerRibbon = h("p", { class: "winner-ribbon", hidden: true });
  const calledButton = h("button", { type: "button", class: "called-toggle", "aria-expanded": "false", "aria-controls": "called-panel", onclick: () => {
    calledOpen = !calledOpen;
    updateGame();
  } });
  const calledPanel = h("div", { id: "called-panel", class: "called-panel", hidden: true });
  const rules = h("div", { class: "rules-holder" });
  // Wide screens (tablet landscape, desktop) also show the top three.
  const leaders = h("section", { class: "mini-leaders", "aria-label": "Top of the leaderboard" });
  const overlay = h("div", { class: "phase-overlay", hidden: true });
  const soundButton = iconButton("Sound effects", preferences.sound ? "sound" : "mute", () => {
    preferences.sound = !preferences.sound;
    writePreferences(preferences);
    soundButton.replaceChildren(icon(preferences.sound ? "sound" : "mute"));
    soundButton.setAttribute("aria-pressed", String(preferences.sound));
  }, { attributes: { "aria-pressed": String(preferences.sound) } });
  const main = h("main", { id: "main", class: "play-screen" },
    h("header", { class: "status-strip" }, strip.name, strip.rank, strip.best, timer.element, soundButton),
    winnerRibbon,
    band,
    leaders,
    h("div", { class: "card-holder" }, card.element, overlay),
    toast,
    h("footer", { class: "play-footer" }, rules, calledButton, calledPanel));
  fill(app, main);
  const banner = createBanner(document.body);
  game = { card, timer, strip, band, toast, winnerRibbon, calledButton, calledPanel, rules, leaders, overlay, banner, rulesKey: "", leadersKey: "" };
  tick();
}

function myWinMask() {
  const line = LINES.find(item => item.id === state.me.winLine);
  return line ? line.mask : 0;
}

function canMark() {
  return state.phase === "QUESTION_ACTIVE" && state.me.board && !state.me.hasWon && !state.me.markUsed && state.me.attemptsLeft > 0;
}

function updateGame() {
  if (!game || !state) return;
  setScreen(`play-${state.phase.toLowerCase()}`);
  const me = state.me;
  const settings = state.settings;
  const fractions = settings?.mode === "fractions";
  body.classList.toggle("is-fractions", fractions);

  game.strip.name.textContent = withEmoji(me.name, me.emoji);
  game.strip.rank.textContent = me.rank ? `#${me.rank}` : "";
  game.strip.rank.setAttribute("aria-label", me.rank ? `Rank ${me.rank}` : "");
  game.strip.best.textContent = me.hasWon ? "BINGO" : `${me.best}/5${me.bestType ? ` ${LINE_LABEL[me.bestType]}` : ""}`;
  game.strip.best.setAttribute("aria-label", me.hasWon ? "You have Bingo" : `Best line ${me.best} of 5${me.bestType ? `, ${LINE_LABEL[me.bestType]}` : ""}`);

  const rulesKey = JSON.stringify(settings?.patterns ?? {});
  if (rulesKey !== game.rulesKey) {
    game.rulesKey = rulesKey;
    fill(game.rules, rulesStrip(settings?.patterns, { compact: true }));
  }

  if (me.hasWon && me.placement) {
    game.winnerRibbon.hidden = false;
    game.winnerRibbon.textContent = `${medal(me.placement)} BINGO! You finished ${ordinal(me.placement)}`;
  } else {
    game.winnerRibbon.hidden = true;
  }

  const freeArmed = Date.now() < freeArmedUntil;
  game.card.update(me.board, {
    marks: me.marks,
    winMask: myWinMask(),
    glow: me.hasWon,
    pending: pendingCell,
    interactive: canMark(),
    freeUsable: state.phase === "QUESTION_ACTIVE" && !me.hasWon && settings?.freeSpace === true && !me.freeUsed && Boolean(me.board),
    freeArmed,
    freeUsed: me.freeUsed
  });
  // Without a playable mark the normal cells say so; the Free Space may still be usable.
  game.card.element.classList.toggle("is-locked", !canMark());

  updateBand();
  const leadersKey = JSON.stringify(state.leaderboard.slice(0, 3));
  if (leadersKey !== game.leadersKey) {
    game.leadersKey = leadersKey;
    fill(game.leaders, leaderboardList(state.leaderboard, { limit: 3, highlightYou: true }));
  }
  updateCalled(fractions);
  updateOverlay();
}

function updateBand() {
  const question = state.question;
  const key = `${state.gameNumber}:${state.phase}:${state.questionNumber}`;
  if (key === lastQuestionKey) return;
  lastQuestionKey = key;
  const phase = state.phase === "PAUSED" ? state.pausedPhase : state.phase;
  let content;
  if (state.phase === "COUNTDOWN") {
    content = h("p", { class: "band-ready", text: "Get ready…" });
  } else if (phase === "QUESTION_ACTIVE" && question) {
    content = [h("p", { class: "band-label", text: `Question ${question.number}` }), questionFace(question)];
    if (state.phase === "QUESTION_ACTIVE") {
      spokenSeconds = new Set();
      announce(`Question ${question.number}: ${question.spoken}.`);
      if (state.settings?.music === "all") audio.question();
    }
  } else if ((phase === "ANSWER_REVEAL" || phase === "WINNER_REVEAL" || phase === "GAME_COMPLETE") && question?.reveal) {
    content = [h("p", { class: "band-label", text: "Answer" }), revealFace(question)];
    if (state.phase === "ANSWER_REVEAL") announce(`Time's up. ${question.kind === "fraction" ? `${question.text}: ${question.reveal.description}` : question.reveal.text}.`);
  } else if (phase === "LEADERBOARD_UPDATE") {
    content = [h("p", { class: "band-label", text: "Standings" }), leaderboardList(state.leaderboard, { limit: 3, highlightYou: true })];
  } else {
    content = h("p", { class: "band-ready", text: "" });
  }
  fill(game.band, content);
}

function updateCalled(fractions) {
  const previous = state.called.filter(item => item.reveal || (state.question && item.number === state.question.number));
  game.calledButton.replaceChildren(
    h("span", { text: `${fractions ? "Called Fractions" : "Called"} (${previous.length})` }),
    icon("chevron", calledOpen ? "is-open" : ""));
  game.calledButton.setAttribute("aria-expanded", String(calledOpen));
  game.calledPanel.hidden = !calledOpen;
  if (calledOpen) fill(game.calledPanel, calledList(previous, state.question, { fractions }));
}

function updateOverlay() {
  const overlay = game.overlay;
  if (state.phase === "PAUSED") {
    overlay.hidden = false;
    fill(overlay, h("p", { class: "overlay-title", role: "status", text: "PAUSED" }), h("p", { class: "overlay-text", text: "Your teacher paused the game." }));
  } else if (state.phase === "GAME_COMPLETE") {
    overlay.hidden = false;
    fill(overlay, completeView());
  } else {
    overlay.hidden = true;
    clear(overlay);
  }
}

function completeView() {
  const winners = state.winners;
  const me = state.me;
  return h("div", { class: "complete", role: "status" },
    h("p", { class: "complete-title", text: "MATH BINGO COMPLETE" }),
    winners.length
      ? h("ol", { class: "podium" }, winners.slice(0, 10).map(winner => h("li", { class: `podium-place${winner.you ? " is-you" : ""}` },
          h("span", { class: "podium-medal", "aria-hidden": "true", text: medal(winner.placement) || ordinal(winner.placement) }),
          h("span", { class: "podium-name", text: playerName(winner) }),
          h("span", { class: "sr-only", text: `, ${ordinal(winner.placement)}` }))))
      : h("p", { class: "complete-text", text: "No Bingo this time — great effort!" }),
    h("p", { class: "complete-text", text: me.hasWon ? `You finished ${ordinal(me.placement)}!` : `Your best line: ${me.best}/5.` }),
    h("p", { class: "complete-wait", text: "Waiting for your teacher…" }));
}

// ---------------------------------------------------------------- events

function processEvents() {
  const events = state.events ?? [];
  if (lastEventSeq === null) {
    // A fresh screen (first load or a reload) does not replay old news.
    lastEventSeq = state.eventSeq;
    return;
  }
  for (const event of events) {
    if (event.seq <= lastEventSeq) continue;
    lastEventSeq = event.seq;
    if (!game) continue;
    if (event.type === "free-space") {
      game.banner.show({
        tone: "free",
        duration: 2200,
        children: [h("p", { class: "banner-title", text: event.you ? `${isAllowedEmoji(event.emoji) ? event.emoji : "\u{1F389}"} YOU USED YOUR FREE SPACE!` : `${announcedName(event)} USED FREE SPACE!` })]
      });
      announce(event.you ? "You used your Free Space." : `${spokenName(event)} used Free Space.`, { assertive: true });
    } else if (event.type === "bingo") {
      const winner = state.winners.find(item => item.placement === event.placement);
      game.banner.show({ tone: "bingo", duration: 3600, children: bingoBannerChildren(event, winner) });
      announce(event.you ? `Bingo! You finished ${ordinal(event.placement)}.` : `${spokenName(event)}, Bingo! ${placeWord(event.placement).toLowerCase()} Bingo.`, { assertive: true });
      if (state.settings?.celebration === "all") {
        if (event.you) audio.bingo();
        else audio.winnerAnnouncement();
      }
    }
  }
}

// ---------------------------------------------------------------- taps

const FEEDBACK = Object.freeze({
  correct: "Marked!",
  "out-of-attempts": "No tries left for this question. Wait for the next one.",
  "mark-used": "You already marked a square for this question.",
  "already-marked": "That square is already marked.",
  "too-late": "Time's up for that question.",
  "not-active": "Wait for the next question.",
  "game-won": "The Bingo winners are in — this game is over.",
  stale: "That question has ended.",
  paused: "Paused — your tap wasn't counted.",
  "already-won": "You already have Bingo! Enjoy the rest of the game.",
  "free-space": "Free Space used!",
  "free-used": "Your Free Space is already used.",
  "no-card": "Getting your card…",
  "use-free-space": "That's your Free Space.",
  "no-free-space": "Free Space is off for this game."
});

function showToast(message, tone = "info") {
  if (!game) return;
  game.toast.textContent = message;
  game.toast.className = `toast tone-${tone} is-visible`;
  window.clearTimeout(showToast.timer);
  const toast = game.toast;
  showToast.timer = window.setTimeout(() => {
    toast.className = `toast tone-${tone}`;
  }, 2600);
}

async function tapCell(index) {
  audio.activate();
  if (!state || pendingCell !== null) return;
  if (state.phase === "PAUSED") return showToast(FEEDBACK.paused);
  if (state.phase === "WINNER_REVEAL") return showToast(FEEDBACK["game-won"]);
  if (state.phase !== "QUESTION_ACTIVE") return showToast(FEEDBACK["not-active"]);
  if (state.me.hasWon) return showToast(FEEDBACK["already-won"]);
  if (((state.me.marks >>> index) & 1) === 1) return showToast(FEEDBACK["already-marked"]);
  if (state.me.markUsed) return showToast(FEEDBACK["mark-used"]);
  if (state.me.attemptsLeft <= 0) return showToast(FEEDBACK["out-of-attempts"]);
  pendingCell = index;
  updateGame();
  try {
    const payload = await session.act("mark", { game: state.gameNumber, question: state.questionNumber, cell: index });
    pendingCell = null;
    if (payload.result === "correct") {
      audio.correct();
      if (!state.me.hasWon) showToast(FEEDBACK.correct, "good");
      announce(`Marked row ${Math.floor(index / 5) + 1}, column ${"BINGO"[index % 5]}.`);
    } else if (payload.result === "incorrect") {
      audio.wrong();
      const left = state.me.attemptsLeft;
      const shows = payload.tapped ? ` That square shows ${payload.tapped}.` : "";
      showToast(left > 0 ? `Not quite.${shows} ${left} more try.` : `Not quite.${shows} Wait for the next question.`, "warn");
      shake(index);
    } else if (payload.result === "not-active" && state.phase === "WINNER_REVEAL") {
      showToast(FEEDBACK["game-won"]);
    } else {
      showToast(FEEDBACK[payload.result] ?? "That tap wasn't counted.");
      // A refusal this screen did not expect means it is behind: catch up now.
      if (payload.result === "already-marked" || payload.result === "mark-used" || payload.result === "stale") session.pollNow();
    }
  } catch (error) {
    pendingCell = null;
    showToast(error instanceof LiveError ? error.message : MESSAGES.unavailable, "warn");
  }
  updateGame();
}

async function tapFree(index) {
  audio.activate();
  if (!state) return;
  const me = state.me;
  if (!state.settings?.freeSpace) return showToast(FEEDBACK["no-free-space"]);
  if (me.freeUsed) return showToast(FEEDBACK["free-used"]);
  if (me.hasWon) return showToast(FEEDBACK["already-won"]);
  if (state.phase !== "QUESTION_ACTIVE") return showToast(state.phase === "PAUSED" ? FEEDBACK.paused : "Use your Free Space while a question is live.");
  // Two steps, so a stray tap never spends the one Free Space.
  if (Date.now() >= freeArmedUntil) {
    freeArmedUntil = Date.now() + FREE_CONFIRM_MS;
    showToast("Tap the star again to use your Free Space.");
    updateGame();
    window.setTimeout(updateGame, FREE_CONFIRM_MS + 100);
    return;
  }
  freeArmedUntil = 0;
  pendingCell = index;
  updateGame();
  try {
    const payload = await session.act("free", { game: state.gameNumber, question: state.questionNumber });
    pendingCell = null;
    if (payload.result === "free-space") audio.freeSpace();
    showToast(FEEDBACK[payload.result] ?? "That tap wasn't counted.", payload.result === "free-space" ? "good" : "info");
  } catch (error) {
    pendingCell = null;
    showToast(error instanceof LiveError ? error.message : MESSAGES.unavailable, "warn");
  }
  updateGame();
}

function shake(index) {
  const button = game?.card.buttons[index];
  if (!button) return;
  button.classList.remove("is-wrong");
  void button.offsetWidth;
  button.classList.add("is-wrong");
  window.setTimeout(() => button.classList.remove("is-wrong"), 600);
}

// ---------------------------------------------------------------- clock

function tick() {
  if (!game || !state || !session) return;
  const remaining = remainingMs(state, session.clock);
  const total = phaseTotalMs(state);
  const manual = state.phase === "QUESTION_ACTIVE" && state.settings?.questionSeconds === 0;
  game.timer.update(remaining, total, { paused: state.phase === "PAUSED", manual });
  if (state.phase === "QUESTION_ACTIVE" && remaining !== null && total && total >= 15_000) {
    const seconds = Math.ceil(remaining / 1000);
    for (const mark of [10, 5]) {
      if (seconds === mark && !spokenSeconds.has(mark)) {
        spokenSeconds.add(mark);
        announce(`${mark} seconds left.`);
      }
    }
  }
  if (Date.now() >= freeArmedUntil && game.card.element.querySelector(".is-armed")) updateGame();
  window.requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- boot

window.__MATH_BINGO_LIVE__ = Object.freeze({
  get state() {
    return state;
  },
  audio: () => audio.snapshot(),
  get clockOffset() {
    return session?.clock.offset ?? 0;
  }
});

// A seat in this tab is resumed (a refresh keeps the same player, card and
// emoji). Opening a QR code or link for a DIFFERENT room starts a new join.
const stored = readSeat();
const linked = initialCode();
if (stored && (!linked || linked === stored.code)) resume(stored);
else if (linked) renderJoinName(linked);
else renderJoinCode();
