// Math Tug of War — MathNexa internal game runtime.
// Screens: home → setup (VS Robot / Two Teams / Online) → game → result.
// There is no timer, no difficulty and no tutorial: the rope is the score.

import { h, clear, icon } from "./dom.js";
import { normalizeKey } from "./answer.js";
import { SKILLS, formatInteger, getSkill } from "./questions.js";
import { DEFAULT_TEAM_NAMES, NAME_MAX_LENGTH, TUG_LIMIT, createLocalMatch, describePosition, otherTeam, sanitizeName } from "./tug.js";
import { ROBOT_TUNING, planRobotAnswer, robotEntry } from "./robot.js";
import { createScene, prefersReducedMotion } from "./scene.js";
import { TEAM_LABEL, createPanel, teamBadge } from "./panel.js";
import { GameAudio, MUSIC_TRACK, readPreferences, writePreferences } from "./audio.js";
import { OnlineError, createOnlineSeat, forgetSeat, onlineRequest, readSeat, saveSeat } from "./online.js";
import { GAME_VERSION } from "./version.js";

const INSTRUCTION = "Answer correctly to pull the other team across the line.";
const ROBOT_NAME = "MathNexa Robot";
const CORRECT_HOLD_MS = 420;
const INCORRECT_HOLD_MS = 1150;
const READY_HOLD_MS = 1700;
const ROBOT_STATUS_HOLD_MS = 1100;

const root = document.querySelector("#app");
const politeRegion = document.querySelector("#announcer");
const alertRegion = document.querySelector("#alert-announcer");
document.documentElement.dataset.gameVersion = GAME_VERSION;

const app = {
  screen: "home",
  mode: null,
  skill: "addition",
  names: { turquoise: "", pink: "" },
  onlineName: "",
  match: null,
  scene: null,
  panels: {},
  keyboardOwner: "turquoise",
  robot: null,
  overlay: null,
  online: null,
  prefs: readPreferences()
};

const audio = new GameAudio(app.prefs, () => app.screen === "game" || app.screen === "lobby");
window.__MATHNEXA_GAME_MUSIC__ = Object.freeze({
  source: MUSIC_TRACK.path,
  title: `${MUSIC_TRACK.title} — ${MUSIC_TRACK.author}`,
  snapshot: () => audio.snapshot()
});

function announce(message, urgent = false) {
  const region = urgent ? alertRegion : politeRegion;
  region.textContent = "";
  requestAnimationFrame(() => { region.textContent = message; });
}

function setScreen(screen) {
  app.screen = screen;
  document.body.dataset.screen = screen;
  document.body.dataset.mode = app.mode ?? "";
  audio.syncMusic();
}

// Where "back" goes: Math Games for subscribers, Home for free players (set
// by the server on <body>; only these two values are ever accepted).
const EXIT = document.body.dataset.exitHref === "/"
  ? Object.freeze({ href: "/", label: "Home", back: "Back to Home", aria: "Back to MathNexa Home" })
  : Object.freeze({ href: "/games", label: "Math Games", back: "Back to Math Games", aria: "Back to MathNexa Games" });

function gamesLink(extraClass = "") {
  return h("a", { class: `games-link ${extraClass}`.trim(), href: EXIT.href, "aria-label": EXIT.aria },
    icon("back"), h("span", { class: "games-link-text", text: EXIT.label }));
}

function brand() {
  return h("div", { class: "brand" },
    h("span", { class: "brand-mark", "aria-hidden": "true" }, h("span", { class: "brand-dot dot-t" }), h("span", { class: "brand-dot dot-p" })),
    h("span", { class: "brand-name" }, "Math", h("span", { class: "brand-nexa", text: "Nexa" })));
}

function audioControls() {
  const musicButton = h("button", { type: "button", class: "tool-button", "aria-pressed": String(app.prefs.music), "aria-label": "Music", "data-action": "music" },
    icon("music"), h("span", { class: "tool-label", text: "Music" }));
  const soundButton = h("button", { type: "button", class: "tool-button", "aria-pressed": String(app.prefs.sound), "aria-label": "Sound effects", "data-action": "sound" },
    icon("sound"), h("span", { class: "tool-label", text: "Sounds" }));
  musicButton.addEventListener("click", () => {
    app.prefs.music = !app.prefs.music;
    writePreferences(app.prefs);
    musicButton.setAttribute("aria-pressed", String(app.prefs.music));
    audio.syncMusic();
    announce(app.prefs.music ? "Music on" : "Music off");
  });
  soundButton.addEventListener("click", () => {
    app.prefs.sound = !app.prefs.sound;
    writePreferences(app.prefs);
    soundButton.setAttribute("aria-pressed", String(app.prefs.sound));
    if (app.prefs.sound) audio.button();
    announce(app.prefs.sound ? "Sound effects on" : "Sound effects off");
  });
  return [musicButton, soundButton];
}

function fullscreenButton() {
  const available = document.fullscreenEnabled !== false && typeof document.documentElement.requestFullscreen === "function";
  const button = h("button", {
    type: "button",
    class: "tool-button",
    "data-action": "fullscreen",
    "aria-pressed": String(Boolean(document.fullscreenElement)),
    disabled: !available,
    title: available ? null : "Fullscreen is unavailable here"
  }, icon("expand"), h("span", { class: "tool-label", text: "Classroom" }));
  button.setAttribute("aria-label", "Classroom fullscreen");
  button.addEventListener("click", () => {
    const entering = !document.fullscreenElement;
    const request = entering ? document.documentElement.requestFullscreen?.({ navigationUI: "hide" }) : document.exitFullscreen?.();
    request?.catch?.(() => announce("Fullscreen is unavailable here."));
  });
  return button;
}

document.addEventListener("fullscreenchange", () => {
  document.querySelectorAll('[data-action="fullscreen"]').forEach(button => button.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement))));
});

function credits() {
  return h("details", { class: "credits" },
    h("summary", { text: "Credits" }),
    h("p", { text: `Music: “${MUSIC_TRACK.title}” by ${MUSIC_TRACK.author} — soundimage.org · ${MUSIC_TRACK.license}` }));
}

// ---------------------------------------------------------------------------
// Home and setup screens

function renderHome() {
  teardownGame();
  app.mode = null;
  setScreen("home");
  const modes = [
    { mode: "robot", title: "VS Robot", text: "Play against the computer", badge: "One Player", iconName: "robot", accent: "turquoise" },
    { mode: "teams", title: "Two Teams", text: "Play together on one device", badge: "Best Played on Smart Board", iconName: "teams", accent: "split" },
    { mode: "online", title: "Online Match", text: "Play from two devices", badge: "Two Devices", iconName: "online", accent: "pink" }
  ];
  const cards = modes.map(entry => {
    const button = h("button", { type: "button", class: `mode-card accent-${entry.accent}`, "data-mode": entry.mode },
      h("span", { class: "mode-icon", "aria-hidden": "true" }, icon(entry.iconName)),
      h("span", { class: "mode-title", text: entry.title }),
      h("span", { class: "mode-text", text: entry.text }),
      h("span", { class: "mode-badge", text: entry.badge }));
    button.addEventListener("click", () => {
      audio.button();
      if (entry.mode === "robot") renderRobotSetup();
      else if (entry.mode === "teams") renderTeamsSetup();
      else renderOnlineMenu();
    });
    return button;
  });
  clear(root).append(
    h("div", { class: "screen screen-home" },
      h("header", { class: "top-bar" }, gamesLink(), brand(), h("div", { class: "tools" }, audioControls())),
      h("main", { class: "setup-shell", id: "main" },
        h("section", { class: "setup-card home-card", "aria-labelledby": "home-title" },
          heroRope(),
          h("h1", { id: "home-title", class: "game-title" }, h("span", { class: "title-t", text: "Math " }), h("span", { text: "Tug of " }), h("span", { class: "title-p", text: "War" })),
          h("p", { class: "tagline", text: "Solve the math. Pull the rope. Beat the other side!" }),
          h("p", { class: "instruction", text: INSTRUCTION }),
          h("h2", { class: "sr-only", text: "Choose a game mode" }),
          h("div", { class: "mode-grid" }, cards)),
        credits()))
  );
  cards[0].focus({ preventScroll: true });
}

function heroRope() {
  return h("div", { class: "hero-rope", "aria-hidden": "true" },
    h("span", { class: "hero-team hero-t" }, icon("wave")),
    h("span", { class: "hero-line" }, h("span", { class: "hero-knot" })),
    h("span", { class: "hero-team hero-p" }, icon("star")));
}

function skillPicker(selected) {
  const options = SKILLS.map(skill => {
    const input = h("input", { type: "radio", name: "skill", value: skill.id, id: `skill-${skill.id}`, checked: skill.id === selected });
    return h("label", { class: "skill-option", for: `skill-${skill.id}` },
      input,
      h("span", { class: "skill-title" }, h("span", { class: "skill-full", text: skill.title }), h("span", { class: "skill-short", "aria-hidden": "true", text: skill.shortTitle })),
      skill.signed ? h("span", { class: "skill-note", text: "Uses + and −" }) : null);
  });
  return h("fieldset", { class: "skill-picker" }, h("legend", { text: "Math Skill" }), h("div", { class: "skill-grid" }, options));
}

function nameField(id, label, value, placeholder, team) {
  return h("div", { class: `field ${team ? `field-${team}` : ""}`.trim() },
    h("label", { for: id }, team ? teamBadge(team) : null, h("span", { text: label })),
    h("input", {
      id, name: id, type: "text", value, placeholder,
      maxlength: NAME_MAX_LENGTH, autocomplete: "off", autocapitalize: "words", spellcheck: "false", enterkeyhint: "next"
    }));
}

function setupScreen({ title, subtitle, badge, body, submitLabel, onSubmit, onBack, error }) {
  teardownGame();
  const errorElement = h("p", { class: "form-error", role: "alert", text: error ?? "" });
  const submit = h("button", { type: "submit", class: "primary-button", text: submitLabel });
  const back = h("button", { type: "button", class: "secondary-button", text: "Back" });
  back.addEventListener("click", () => { audio.button(); onBack(); });
  const form = h("form", { class: "setup-form", novalidate: true }, body, errorElement, h("div", { class: "form-actions" }, back, submit));
  form.addEventListener("submit", event => {
    event.preventDefault();
    audio.activate();
    onSubmit(new FormData(form), { submit, errorElement });
  });
  clear(root).append(h("div", { class: "screen screen-setup" },
    h("header", { class: "top-bar" }, gamesLink(), brand(), h("div", { class: "tools" }, audioControls())),
    h("main", { class: "setup-shell", id: "main" },
      h("section", { class: "setup-card", "aria-labelledby": "setup-title" },
        h("p", { class: "setup-eyebrow", text: "Game Setup" }),
        h("h1", { id: "setup-title", class: "setup-title" }, title, badge ? h("span", { class: "mode-badge", text: badge }) : null),
        subtitle ? h("p", { class: "setup-subtitle", text: subtitle }) : null,
        form))));
  form.querySelector("input")?.focus({ preventScroll: true });
  return form;
}

function selectedSkill(data) {
  const value = data.get("skill");
  return getSkill(String(value)) ? String(value) : "addition";
}

function renderRobotSetup() {
  app.mode = "robot";
  setScreen("setup-robot");
  setupScreen({
    title: "VS Robot",
    subtitle: "Play against the computer",
    badge: "One Player",
    body: [
      nameField("player-name", "Your Name", app.names.turquoise, "Player 1", "turquoise"),
      h("div", { class: "field field-pink opponent-field" },
        h("span", { class: "field-label" }, teamBadge("pink"), h("span", { text: "Opponent" })),
        h("p", { class: "opponent-name" }, icon("robot"), h("span", { text: ROBOT_NAME }))),
      skillPicker(app.skill)
    ],
    submitLabel: "Start Game",
    onBack: renderHome,
    onSubmit: data => {
      app.skill = selectedSkill(data);
      app.names = { turquoise: sanitizeName(data.get("player-name"), "Player 1"), pink: ROBOT_NAME };
      startLocalGame("robot");
    }
  });
}

function renderTeamsSetup() {
  app.mode = "teams";
  setScreen("setup-teams");
  setupScreen({
    title: "Two Teams",
    subtitle: "Play together on one device",
    badge: "Same Screen",
    body: [
      h("div", { class: "field-pair" },
        nameField("team-1-name", "Team 1 Name", app.names.turquoise === "Player 1" ? "" : app.names.turquoise, DEFAULT_TEAM_NAMES.turquoise, "turquoise"),
        nameField("team-2-name", "Team 2 Name", app.names.pink === ROBOT_NAME ? "" : app.names.pink, DEFAULT_TEAM_NAMES.pink, "pink")),
      skillPicker(app.skill)
    ],
    submitLabel: "Start Game",
    onBack: renderHome,
    onSubmit: data => {
      app.skill = selectedSkill(data);
      app.names = {
        turquoise: sanitizeName(data.get("team-1-name"), DEFAULT_TEAM_NAMES.turquoise),
        pink: sanitizeName(data.get("team-2-name"), DEFAULT_TEAM_NAMES.pink)
      };
      startLocalGame("teams");
    }
  });
}

// ---------------------------------------------------------------------------
// Game screen (shared by all modes)

function teardownGame() {
  app.robot?.stop();
  app.robot = null;
  for (const panel of Object.values(app.panels)) panel.destroy();
  app.panels = {};
  app.scene = null;
  app.overlay = null;
  if (app.online && app.screen !== "lobby" && app.screen !== "game") {
    app.online.seat?.stop();
  }
}

function skillChip() {
  const skill = getSkill(app.skill);
  return h("p", { class: "skill-chip" }, h("span", { class: "skill-full", text: skill.title }), h("span", { class: "skill-short", "aria-hidden": "true", text: skill.shortTitle }));
}

function buildGameScreen({ panels, sideContent, onExit }) {
  const scene = createScene();
  app.scene = scene;
  const exit = h("button", { type: "button", class: "tool-button exit-button", "data-action": "exit" }, icon("home"), h("span", { class: "tool-label", text: "Exit" }));
  exit.setAttribute("aria-label", "Exit to game setup");
  exit.addEventListener("click", () => { audio.button(); onExit(); });
  const status = h("p", { class: "scene-status", "aria-hidden": "true" });
  const banner = h("p", { class: "game-banner", role: "status" });
  const sceneBox = h("div", { class: "scene-box" }, scene.element, status);
  const layout = h("main", { class: `game-layout mode-${app.mode}`, id: "main" },
    h("h1", { class: "sr-only", text: `Math Tug of War: ${app.names.turquoise} versus ${app.names.pink}` }),
    h("div", { class: "side side-turquoise" }, panels.turquoise ?? sideContent.turquoise),
    h("div", { class: "center" }, sceneBox, banner, h("p", { class: "instruction game-instruction", text: INSTRUCTION })),
    h("div", { class: "side side-pink" }, panels.pink ?? sideContent.pink));
  const screen = h("div", { class: `screen screen-game mode-${app.mode}` },
    h("header", { class: "top-bar game-bar" },
      exit,
      h("div", { class: "match-title" }, h("span", { class: "vs-names" },
        h("span", { class: "vs-t", text: app.names.turquoise }), h("span", { class: "vs", text: " vs " }), h("span", { class: "vs-p", text: app.names.pink })),
      skillChip()),
      h("div", { class: "tools" }, audioControls(), fullscreenButton())),
    layout,
    h("div", { class: "overlay-host" }));
  clear(root).append(screen);
  watchSceneFit(layout.querySelector(".center"), sceneBox);
  scene.describe(`Tug of war rope. ${describePosition(0, app.names)}`);
  return { scene, status, banner, screen };
}

let sceneObserver = null;
const LANDSCAPE_QUERY = "(min-aspect-ratio: 6/5)";

function watchSceneFit(center, sceneBox) {
  sceneObserver?.disconnect();
  const refit = () => {
    if (!app.scene) return;
    const wide = window.matchMedia(LANDSCAPE_QUERY).matches;
    if (!wide) {
      // Tall portrait tablets have room for a taller, closer scene.
      if (window.innerHeight >= 900) app.scene.fit(1000, 440);
      else app.scene.fit(1000, 310);
      return;
    }
    // Height left in the centre column once the other centre rows are placed.
    const others = [...center.children].filter(child => child !== sceneBox).reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
    const gaps = 10 * Math.max(0, center.children.length - 1);
    app.scene.fit(center.clientWidth, Math.max(120, center.clientHeight - others - gaps - 6));
  };
  sceneObserver = typeof ResizeObserver === "function" ? new ResizeObserver(refit) : null;
  sceneObserver?.observe(center);
  refit();
}

function setSceneStatus(text) {
  const status = root.querySelector(".scene-status");
  if (status) status.textContent = text;
}

function showOverlay(content, { labelledBy, className = "" } = {}) {
  const host = root.querySelector(".overlay-host");
  if (!host) return null;
  const dialog = h("div", { class: `overlay ${className}`.trim(), role: "dialog", "aria-modal": "true", "aria-labelledby": labelledBy }, h("div", { class: "overlay-card" }, content));
  clear(host).append(dialog);
  app.overlay = dialog;
  root.querySelector(".game-layout")?.setAttribute("inert", "");
  requestAnimationFrame(() => (dialog.querySelector("[data-autofocus]") ?? dialog.querySelector("button"))?.focus());
  return dialog;
}

function hideOverlay() {
  const host = root.querySelector(".overlay-host");
  if (host) clear(host);
  app.overlay = null;
  root.querySelector(".game-layout")?.removeAttribute("inert");
}

function winnerContent(winner, actions) {
  const name = app.names[winner];
  return [
    h("div", { class: `winner-badge winner-${winner}` }, teamBadge(winner)),
    h("h2", { id: "winner-title", class: `winner-title winner-${winner}`, text: `${name} WINS!` }),
    h("p", { class: "winner-sub", text: `${name} pulled ${app.names[otherTeam(winner)]} across the line.` }),
    h("div", { class: "overlay-actions" }, actions)
  ];
}

function actionButton(label, onClick, kind = "secondary", autofocus = false) {
  const button = h("button", { type: "button", class: `${kind}-button`, text: label, "data-autofocus": autofocus || null });
  button.addEventListener("click", () => { audio.button(); onClick(button); });
  return button;
}

function backToGames() {
  window.location.assign(EXIT.href);
}

// ---------------------------------------------------------------------------
// Local modes: VS Robot and Two Teams

function startLocalGame(mode) {
  teardownGame();
  app.mode = mode;
  app.match = createLocalMatch({ skill: app.skill, names: { ...app.names } });
  const signed = getSkill(app.skill).signed;
  const panels = {};
  const humanTeams = mode === "robot" ? ["turquoise"] : ["turquoise", "pink"];
  for (const team of humanTeams) {
    panels[team] = createPanel({
      team,
      name: app.names[team],
      signed,
      onSubmit: localSubmit,
      onActivate: claimKeyboard,
      onInteract: () => audio.button()
    });
  }
  app.panels = panels;
  const sideContent = {};
  if (mode === "robot") sideContent.pink = robotCard();
  setScreen("game");
  const { scene } = buildGameScreen({
    panels: { turquoise: panels.turquoise?.element, pink: panels.pink?.element },
    sideContent,
    onExit: () => (mode === "robot" ? renderRobotSetup() : renderTeamsSetup())
  });
  scene.describe(`Tug of war rope. ${describePosition(0, app.names)}`);
  syncLocalPanels(app.match.snapshot());
  claimKeyboard("turquoise");
  if (mode === "robot") {
    app.robot = createRobotPlayer();
    app.robot.start();
  }
  audio.activate();
  announce(`${app.names.turquoise} versus ${app.names.pink}. ${getSkill(app.skill).title}. ${INSTRUCTION}`);
}

function syncLocalPanels(snapshot) {
  for (const [team, panel] of Object.entries(app.panels)) {
    panel.setQuestion(snapshot.questions[team]);
    panel.setPulls(snapshot.tug.pulls[team]);
    panel.setEnabled(snapshot.status === "playing");
  }
  updateRobotCard(snapshot);
}

function claimKeyboard(team) {
  if (!app.panels[team]) return;
  app.keyboardOwner = team;
  for (const [key, panel] of Object.entries(app.panels)) panel.setKeyboardOwner(app.mode === "teams" && key === team);
}

function localSubmit(team, raw) {
  const result = app.match.submit(team, raw);
  handleLocalResult(result);
}

function handleLocalResult(result) {
  if (result.type === "finished" || result.type === "invalid") {
    if (result.type === "invalid") app.panels[result.team]?.flash("Type an answer", "hint", 900);
    return;
  }
  const { team, question, match } = result;
  const panel = app.panels[team];
  const name = app.names[team];
  const nextQuestion = match.status === "playing" ? match.questions[team] : null;
  if (result.type === "correct") {
    audio.correct();
    audio.pull();
    panel?.showResult("correct", "Pull!", nextQuestion, CORRECT_HOLD_MS);
    panel?.setPulls(match.tug.pulls[team]);
    app.scene.pull(team, match.tug.position);
    const where = describePosition(match.tug.position, app.names);
    setSceneStatus(`${name} pulled!`);
    app.scene.describe(`Tug of war rope. ${where}`);
    announce(`Correct. ${name} pulled. ${where}`);
    if (match.tug.winner) finishLocal(match);
  } else {
    audio.incorrect();
    const solved = `${question.kind === "sentence" ? `Opposite of ${formatInteger(question.operands[0])}` : question.text} = ${formatInteger(question.answer)}`;
    panel?.showResult("incorrect", solved, nextQuestion, INCORRECT_HOLD_MS);
    if (panel) announce(`Not this time. ${question.spoken} is ${question.answer < 0 ? `negative ${Math.abs(question.answer)}` : question.answer}. No pull.`);
  }
}

function finishLocal(match) {
  const winner = match.tug.winner;
  app.robot?.stop();
  for (const panel of Object.values(app.panels)) panel.setEnabled(false);
  const scene = app.scene;
  scene.settled().then(() => {
    if (app.scene !== scene || app.match?.snapshot().status !== "won") return;
    scene.celebrate(winner);
    audio.victory();
    announce(`${app.names[winner]} wins!`, true);
    afterCelebration(scene, () => showOverlay(winnerContent(winner, [
      actionButton("Play Again", playAgainLocal, "primary", true),
      actionButton("Change Game Setup", () => (app.mode === "robot" ? renderRobotSetup() : renderTeamsSetup())),
      actionButton(EXIT.back, backToGames)
    ]), { labelledBy: "winner-title", className: `overlay-won won-${winner}` }));
  });
}

/** Let the victory pose and confetti play before the result card arrives. */
function afterCelebration(scene, show) {
  setTimeout(() => {
    if (app.scene === scene && app.screen === "game") show();
  }, prefersReducedMotion() ? 250 : 1300);
}

function playAgainLocal() {
  hideOverlay();
  const snapshot = app.match.rematch();
  app.scene.reset();
  app.scene.describe(`Tug of war rope. ${describePosition(0, app.names)}`);
  setSceneStatus("");
  syncLocalPanels(snapshot);
  if (app.mode === "robot") {
    app.robot = createRobotPlayer();
    app.robot.start();
  }
  announce("New match. The rope is centered.");
}

// VS Robot ------------------------------------------------------------------

function robotCard() {
  return h("section", { class: "robot-card team-pink", "aria-labelledby": "robot-name" },
    h("header", { class: "panel-header" }, teamBadge("pink"), h("h2", { id: "robot-name", class: "panel-name", text: ROBOT_NAME })),
    h("div", { class: "robot-face", "aria-hidden": "true" }, icon("robot")),
    h("p", { class: "robot-status", "aria-live": "off", text: "Getting ready…" }),
    h("p", { class: "panel-pulls robot-pulls", text: "Pulls: 0" }));
}

function updateRobotCard(snapshot) {
  if (app.mode !== "robot") return;
  const pulls = root.querySelector(".robot-pulls");
  if (pulls) pulls.textContent = `Pulls: ${snapshot.tug.pulls.pink}`;
}

function setRobotStatus(text, kind = "") {
  const status = root.querySelector(".robot-status");
  if (!status) return;
  status.textContent = text;
  status.dataset.kind = kind;
}

function createRobotPlayer() {
  let timer = null;
  let stopped = false;
  let paused = false;
  let remaining = null;
  let dueAt = 0;
  let plan = null;

  let statusTimer = null;
  const random = () => Math.random();
  const schedule = (extraDelay, holdStatusMs = 0) => {
    if (stopped || paused) return;
    const snapshot = app.match.snapshot();
    if (snapshot.status !== "playing") return;
    const question = snapshot.questions.pink;
    plan = planRobotAnswer(question, random);
    const delay = plan.delayMs + (extraDelay ?? 0);
    // Leave "Pulled!" / "Missed one" readable for a moment before thinking again.
    clearTimeout(statusTimer);
    if (holdStatusMs > 0) statusTimer = setTimeout(() => setRobotStatus("Thinking…", "thinking"), Math.min(holdStatusMs, delay - 200));
    else setRobotStatus("Thinking…", "thinking");
    dueAt = performance.now() + delay;
    timer = setTimeout(act, delay);
  };
  const act = () => {
    timer = null;
    if (stopped || paused) return;
    const snapshot = app.match.snapshot();
    if (snapshot.status !== "playing") return;
    // The robot answers its own current question through the normal path.
    const result = app.match.submit("pink", robotEntry(plan.answer));
    if (result.type === "correct") {
      setRobotStatus("Pulled!", "pulled");
      audio.pull();
      app.scene.pull("pink", result.match.tug.position);
      const where = describePosition(result.match.tug.position, app.names);
      setSceneStatus(`${ROBOT_NAME} pulled!`);
      app.scene.describe(`Tug of war rope. ${where}`);
      announce(`${ROBOT_NAME} pulled. ${where}`);
      updateRobotCard(result.match);
      if (result.match.tug.winner) {
        finishLocal(result.match);
        return;
      }
      schedule(0, ROBOT_STATUS_HOLD_MS);
    } else if (result.type === "incorrect") {
      setRobotStatus("Missed one", "missed");
      schedule(ROBOT_TUNING.afterMistakeMs, ROBOT_STATUS_HOLD_MS);
    }
  };
  return Object.freeze({
    start() { schedule(); },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(statusTimer);
    },
    pause() {
      if (paused || stopped) return;
      paused = true;
      if (timer) {
        remaining = Math.max(400, dueAt - performance.now());
        clearTimeout(timer);
        timer = null;
      }
    },
    resume() {
      if (!paused || stopped) return;
      paused = false;
      if (remaining !== null) {
        dueAt = performance.now() + remaining;
        timer = setTimeout(act, remaining);
        remaining = null;
      } else {
        schedule();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Online Match

function renderOnlineMenu(error) {
  app.mode = "online";
  teardownGame();
  if (app.online?.seat) app.online.seat.stop();
  app.online = null;
  setScreen("online-menu");
  const create = h("button", { type: "button", class: "mode-card accent-turquoise", "data-online": "create" },
    h("span", { class: "mode-icon", "aria-hidden": "true" }, icon("online")),
    h("span", { class: "mode-title", text: "Create Game" }),
    h("span", { class: "mode-text", text: "Get a room code to share" }));
  const join = h("button", { type: "button", class: "mode-card accent-pink", "data-online": "join" },
    h("span", { class: "mode-icon", "aria-hidden": "true" }, icon("signal")),
    h("span", { class: "mode-title", text: "Join Game" }),
    h("span", { class: "mode-text", text: "Type your friend’s room code" }));
  create.addEventListener("click", () => { audio.button(); renderOnlineCreate(); });
  join.addEventListener("click", () => { audio.button(); renderOnlineJoin(); });
  const seat = readSeat();
  const rejoin = seat ? actionButton(`Return to room ${seat.code}`, () => resumeSeat(seat), "secondary") : null;
  const back = actionButton("Back", renderHome);
  clear(root).append(h("div", { class: "screen screen-setup" },
    h("header", { class: "top-bar" }, gamesLink(), brand(), h("div", { class: "tools" }, audioControls())),
    h("main", { class: "setup-shell", id: "main" },
      h("section", { class: "setup-card", "aria-labelledby": "online-title" },
        h("p", { class: "setup-eyebrow", text: "Game Setup" }),
        h("h1", { id: "online-title", class: "setup-title" }, "Online Match", h("span", { class: "mode-badge", text: "Two Devices" })),
        h("p", { class: "setup-subtitle", text: "Play from two devices" }),
        h("p", { class: "form-error", role: "alert", text: error ?? "" }),
        h("div", { class: "mode-grid mode-grid-two" }, create, join),
        h("div", { class: "form-actions" }, back, rejoin)))));
  create.focus({ preventScroll: true });
}

function renderOnlineCreate(error) {
  app.mode = "online";
  setScreen("online-create");
  setupScreen({
    title: "Create Game",
    subtitle: "You will be the Turquoise Team",
    body: [nameField("online-name", "Your Name", app.onlineName, "Player 1", "turquoise"), skillPicker(app.skill)],
    submitLabel: "Create Room",
    error,
    onBack: () => renderOnlineMenu(),
    onSubmit: async (data, { submit, errorElement }) => {
      app.skill = selectedSkill(data);
      app.onlineName = sanitizeName(data.get("online-name"), "Player 1");
      submit.disabled = true;
      submit.textContent = "Creating…";
      try {
        const payload = await onlineRequest({ action: "create", name: app.onlineName, skill: app.skill });
        enterRoom(payload.state, payload.token);
      } catch (failure) {
        submit.disabled = false;
        submit.textContent = "Create Room";
        errorElement.textContent = failure instanceof OnlineError ? failure.message : "Online Match is temporarily unavailable.";
      }
    }
  });
}

function renderOnlineJoin(error) {
  app.mode = "online";
  setScreen("online-join");
  const form = setupScreen({
    title: "Join Game",
    subtitle: "You will be the Pink Team",
    body: [
      nameField("online-name", "Your Name", app.onlineName, "Player 2", "pink"),
      h("div", { class: "field" },
        h("label", { for: "room-code" }, h("span", { text: "Room Code" })),
        h("input", {
          id: "room-code", name: "room-code", type: "text", class: "code-input", maxlength: 7,
          autocomplete: "off", autocapitalize: "characters", spellcheck: "false", inputmode: "text", placeholder: "AB7K2", enterkeyhint: "go"
        }))
    ],
    submitLabel: "Join Game",
    error,
    onBack: () => renderOnlineMenu(),
    onSubmit: async (data, { submit, errorElement }) => {
      app.onlineName = sanitizeName(data.get("online-name"), "Player 2");
      const code = String(data.get("room-code") ?? "").toUpperCase().replace(/[\s-]/g, "");
      if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code)) {
        errorElement.textContent = "Check the room code. It has 5 letters and numbers.";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Joining…";
      try {
        const payload = await onlineRequest({ action: "join", name: app.onlineName, code });
        enterRoom(payload.state, payload.token);
      } catch (failure) {
        submit.disabled = false;
        submit.textContent = "Join Game";
        errorElement.textContent = failure instanceof OnlineError ? failure.message : "Online Match is temporarily unavailable.";
      }
    }
  });
  const codeInput = form.querySelector("#room-code");
  codeInput?.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase(); });
}

async function resumeSeat(seat) {
  try {
    const payload = await onlineRequest({ action: "state", code: seat.code, token: seat.token });
    enterRoom(payload.state, seat.token);
  } catch (failure) {
    forgetSeat();
    renderOnlineMenu(failure instanceof OnlineError ? failure.message : "That match is no longer available.");
  }
}

function enterRoom(state, token) {
  saveSeat({ code: state.code, token });
  app.skill = state.skill;
  app.online = {
    seat: null,
    state: null,
    team: state.team,
    lastRound: state.round,
    lastPulls: { turquoise: state.pulls.turquoise, pink: state.pulls.pink },
    readyShown: state.status !== "waiting",
    opponentAwayDismissed: false,
    connection: "online"
  };
  const seat = createOnlineSeat({
    code: state.code,
    token,
    onState: onlineState,
    onConnection: onlineConnection,
    onFatal: error => {
      forgetSeat();
      if (app.screen === "game") showOnlineEnd(error.status === 401 ? error.message : "This match is no longer available.");
      else renderOnlineMenu(error.message);
    }
  });
  app.online.seat = seat;
  if (state.status === "waiting") renderLobby(state);
  else if (state.result === "joined") {
    // The guest sees the same "both players ready" card as the host.
    renderReady(state);
    setTimeout(() => {
      const latest = app.online?.seat?.state;
      if (latest && app.screen === "lobby") renderOnlineGame(latest);
    }, READY_HOLD_MS);
  } else if (state.status === "playing" || state.status === "won") renderOnlineGame(state);
  else {
    forgetSeat();
    renderOnlineMenu(state.status === "expired" ? "That room has expired. Ask for a new room code." : "That match has ended.");
    return;
  }
  seat.start(state);
}

function renderLobby(state) {
  setScreen("lobby");
  const cancel = actionButton("Cancel", async () => {
    await app.online?.seat?.leave();
    forgetSeat();
    renderOnlineMenu();
  });
  const letters = state.code.split("").map(letter => h("span", { class: "code-letter", text: letter }));
  clear(root).append(h("div", { class: "screen screen-setup screen-lobby" },
    h("header", { class: "top-bar" }, gamesLink(), brand(), h("div", { class: "tools" }, audioControls())),
    h("main", { class: "setup-shell", id: "main" },
      h("section", { class: "setup-card lobby-card", "aria-labelledby": "lobby-title" },
        h("p", { class: "setup-eyebrow", text: "Online Match" }),
        h("h1", { id: "lobby-title", class: "setup-title", text: "Room Code" }),
        h("p", { class: "room-code", "aria-label": `Room code ${state.code.split("").join(" ")}` }, letters),
        h("p", { class: "lobby-status", role: "status" }, h("span", { class: "pulse-dot", "aria-hidden": "true" }), h("span", { text: "Waiting for opponent…" })),
        h("dl", { class: "lobby-facts" },
          h("div", {}, h("dt", { text: "Host" }), h("dd", {}, teamBadge("turquoise"), h("span", { text: state.names.turquoise }))),
          h("div", {}, h("dt", { text: "Math Skill" }), h("dd", { text: getSkill(state.skill).title }))),
        h("p", { class: "lobby-help", text: "On the other device, open Math Tug of War, choose Online Match, then Join Game and type this code." }),
        h("div", { class: "form-actions" }, cancel)))));
  announce(`Room created. Room code ${state.code.split("").join(" ")}. Waiting for opponent.`);
}

function renderReady(state) {
  setScreen("lobby");
  const facts = h("div", { class: "ready-grid" },
    h("div", { class: "ready-player ready-t" }, teamBadge("turquoise"), h("strong", { text: state.names.turquoise }), h("span", { class: "ready-mark", text: "Ready ✓" })),
    h("span", { class: "vs-big", "aria-hidden": "true", text: "VS" }),
    h("div", { class: "ready-player ready-p" }, teamBadge("pink"), h("strong", { text: state.names.pink ?? "" }), h("span", { class: "ready-mark", text: "Ready ✓" })));
  clear(root).append(h("div", { class: "screen screen-setup screen-lobby" },
    h("header", { class: "top-bar" }, gamesLink(), brand(), h("div", { class: "tools" }, audioControls())),
    h("main", { class: "setup-shell", id: "main" },
      h("section", { class: "setup-card lobby-card", "aria-labelledby": "ready-title" },
        h("p", { class: "setup-eyebrow", text: "Online Match" }),
        h("h1", { id: "ready-title", class: "setup-title", text: "Both players ready" }),
        facts,
        h("p", { class: "lobby-facts-skill", text: getSkill(state.skill).title }),
        h("p", { class: "lobby-status", role: "status", text: "Starting the match…" })))));
  announce(`${state.names.turquoise} versus ${state.names.pink}. Both players ready. Starting.`);
}

function onlineNames(state) {
  return { turquoise: state.names.turquoise, pink: state.names.pink ?? "Waiting…" };
}

function renderOnlineGame(state) {
  teardownGame();
  app.mode = "online";
  app.names = onlineNames(state);
  const me = state.team;
  const opponent = otherTeam(me);
  const panel = createPanel({
    team: me,
    name: app.names[me],
    signed: getSkill(state.skill).signed,
    onSubmit: onlineSubmit,
    onActivate: () => {},
    onInteract: () => audio.button()
  });
  app.panels = { [me]: panel };
  setScreen("game");
  buildGameScreen({
    panels: { [me]: panel.element },
    sideContent: { [opponent]: opponentCard(state, opponent) },
    onExit: async () => {
      await app.online?.seat?.leave();
      forgetSeat();
      renderOnlineMenu();
    }
  });
  root.querySelector(".screen-game")?.classList.add(`me-${me}`);
  app.scene.set(state.position);
  app.online.lastRound = state.round;
  app.online.lastPulls = { ...state.pulls };
  applyOnlineState(state, null, {});
  audio.activate();
}

function opponentCard(state, team) {
  return h("section", { class: `opponent-card team-${team}`, "aria-labelledby": "opponent-name" },
    h("header", { class: "panel-header" }, teamBadge(team), h("h2", { id: "opponent-name", class: "panel-name", text: state.names[team] ?? "" })),
    h("div", { class: "robot-face opponent-face", "aria-hidden": "true" }, icon("online")),
    h("p", { class: "connection", "data-presence": state.presence[team] }, icon("signal"), h("span", { class: "connection-text", text: presenceText(state.presence[team]) })),
    h("p", { class: "panel-pulls opponent-pulls", text: `Pulls: ${state.pulls[team]}` }));
}

function presenceText(presence) {
  return { connected: "Connected", reconnecting: "Reconnecting…", disconnected: "Disconnected", waiting: "Waiting…" }[presence] ?? "Connected";
}

function onlineConnection(connection) {
  if (!app.online) return;
  app.online.connection = connection;
  const banner = root.querySelector(".game-banner");
  if (connection === "reconnecting") {
    if (banner) banner.textContent = "Reconnecting…";
    document.body.dataset.connection = "reconnecting";
    announce("Connection lost. Reconnecting.");
  } else {
    if (banner && banner.textContent === "Reconnecting…") banner.textContent = "";
    document.body.dataset.connection = "online";
    announce("Reconnected.");
  }
  refreshOnlineInput();
}

function refreshOnlineInput() {
  const state = app.online?.seat?.state;
  const panel = state ? app.panels[state.team] : null;
  if (!panel || !state) return;
  const opponent = otherTeam(state.team);
  const opponentHere = state.presence[opponent] === "connected";
  panel.setEnabled(state.status === "playing" && app.online.connection === "online" && opponentHere && !app.overlay);
}

function onlineState(state, previous, extra) {
  if (!app.online) return;
  app.online.state = state;
  if (app.screen === "lobby" && !app.online.readyShown) {
    if (state.status === "playing") {
      app.online.readyShown = true;
      audio.button();
      renderReady(state);
      setTimeout(() => {
        const latest = app.online?.seat?.state;
        if (latest && app.screen === "lobby") renderOnlineGame(latest);
      }, READY_HOLD_MS);
    } else if (state.status === "closed" || state.status === "expired") {
      forgetSeat();
      app.online.seat?.stop();
      renderOnlineMenu(state.status === "expired" ? "The room expired before anyone joined." : "The room was closed.");
    }
    return;
  }
  if (app.screen === "game") applyOnlineState(state, previous, extra ?? {});
}

function applyOnlineState(state, previous, extra) {
  const online = app.online;
  const me = state.team;
  const opponent = otherTeam(me);
  app.names = onlineNames(state);
  const panel = app.panels[me];

  // New round (rematch): reset the rope.
  if (state.round !== online.lastRound) {
    online.lastRound = state.round;
    online.lastPulls = { turquoise: 0, pink: 0 };
    hideOverlay();
    app.scene.reset();
    setSceneStatus("");
    announce("Rematch! The rope is centered.");
  }

  // Animate authoritative pulls we have not shown yet. Only counts and the
  // final position cross the network; motion is local.
  const newPulls = [];
  for (const team of ["turquoise", "pink"]) {
    const delta = state.pulls[team] - online.lastPulls[team];
    for (let index = 0; index < delta; index += 1) newPulls.push(team);
  }
  if (newPulls.length) {
    let position = app.scene.position;
    newPulls.forEach((team, index) => {
      position = index === newPulls.length - 1 ? state.position : Math.max(-TUG_LIMIT, Math.min(TUG_LIMIT, position + (team === "turquoise" ? -1 : 1)));
      app.scene.pull(team, position);
    });
    online.lastPulls = { ...state.pulls };
    const last = newPulls[newPulls.length - 1];
    const where = describePosition(state.position, app.names);
    setSceneStatus(`${app.names[last]} pulled!`);
    app.scene.describe(`Tug of war rope. ${where}`);
    if (newPulls.some(team => team === opponent)) {
      audio.pull();
      announce(`${app.names[opponent]} pulled. ${where}`);
    }
  } else if (app.scene.position !== state.position && !previous) {
    app.scene.set(state.position);
  }

  // Own result feedback.
  if (panel) {
    panel.setName(app.names[me]);
    panel.setPulls(state.pulls[me]);
    if (state.result === "correct" && extra.solved !== undefined) {
      audio.correct();
      audio.pull();
      panel.showResult("correct", "Pull!", state.question, CORRECT_HOLD_MS);
      announce(`Correct. You pulled. ${describePosition(state.position, app.names)}`);
    } else if (state.result === "incorrect" && extra.solved !== undefined) {
      audio.incorrect();
      panel.showResult("incorrect", `Answer: ${formatInteger(extra.solved)}`, state.question, INCORRECT_HOLD_MS);
      announce(`Not this time. The answer was ${extra.solved < 0 ? `negative ${Math.abs(extra.solved)}` : extra.solved}. No pull.`);
    } else if (!panel.question || !state.question || panel.question.index !== state.question.index || panel.question.text !== state.question.text) {
      if (!root.querySelector(`.team-panel.team-${me}[data-result]`)) panel.setQuestion(state.question);
    }
  }

  // Opponent card.
  const card = root.querySelector(".opponent-card");
  if (card) {
    card.querySelector(".panel-name").textContent = state.names[opponent] ?? "";
    const connection = card.querySelector(".connection");
    connection.dataset.presence = state.presence[opponent];
    connection.querySelector(".connection-text").textContent = presenceText(state.presence[opponent]);
    card.querySelector(".opponent-pulls").textContent = `Pulls: ${state.pulls[opponent]}`;
  }
  const vsT = root.querySelector(".vs-t");
  const vsP = root.querySelector(".vs-p");
  if (vsT) vsT.textContent = app.names.turquoise;
  if (vsP) vsP.textContent = app.names.pink;

  const banner = root.querySelector(".game-banner");
  const opponentPresence = state.presence[opponent];
  if (banner && online.connection === "online") {
    banner.textContent = state.status === "playing" && opponentPresence === "reconnecting" ? `${app.names[opponent]} is reconnecting…` : "";
  }
  if (previous && previous.presence[opponent] !== opponentPresence && opponentPresence !== "connected") {
    announce(`${app.names[opponent]} is ${opponentPresence === "reconnecting" ? "reconnecting" : "disconnected"}.`);
  }
  if (previous && previous.presence[opponent] !== "connected" && opponentPresence === "connected") {
    online.opponentAwayDismissed = false;
    if (app.overlay?.classList.contains("overlay-away")) hideOverlay();
    announce(`${app.names[opponent]} is back.`);
  }

  // Terminal and waiting states.
  if (state.status === "won") {
    showOnlineWin(state);
  } else if (state.status === "closed") {
    forgetSeat();
    online.seat?.stop();
    showOnlineEnd(state.closedBy === opponent ? `${app.names[opponent]} left the match.` : "This match has ended.");
  } else if (state.status === "expired") {
    forgetSeat();
    online.seat?.stop();
    showOnlineEnd("This room has expired.");
  } else if (state.status === "playing" && opponentPresence === "disconnected" && !online.opponentAwayDismissed && !app.overlay) {
    showOpponentAway(state);
  }
  refreshOnlineInput();
}

function onlineSubmit(team, raw) {
  const seat = app.online?.seat;
  const panel = app.panels[team];
  if (!seat || !panel) return;
  panel.setBusy(true);
  seat.answer(raw).then(payload => {
    panel.setBusy(false);
    const result = payload?.state?.result;
    if (result === "opponent-away") panel.flash("Waiting for your opponent", "hint", 1400);
    else if (result === "stale") panel.setQuestion(payload.state.question);
  }).catch(failure => {
    panel.setBusy(false);
    panel.flash(failure instanceof OnlineError && failure.code !== "unavailable" ? failure.message : "Reconnecting…", "hint", 1600);
    seat.pollNow();
  });
}

function showOnlineWin(state) {
  if (app.overlay?.classList.contains("overlay-won")) {
    updateRematchText(state);
    return;
  }
  // Polls keep arriving while the celebration plays: celebrate once per round.
  if (app.online.celebratedRound === state.round) return;
  app.online.celebratedRound = state.round;
  const winner = state.winner;
  const scene = app.scene;
  app.panels[state.team]?.setEnabled(false);
  scene.settled().then(() => {
    if (app.scene !== scene || app.online?.seat?.state?.status !== "won") return;
    scene.celebrate(winner);
    audio.victory();
    announce(`${app.names[winner]} wins!`, true);
    const rematchText = h("p", { class: "rematch-status", role: "status" });
    afterCelebration(scene, () => showOverlay([
      ...winnerContent(winner, [
        actionButton("Play Again", async button => {
          button.disabled = true;
          try {
            await app.online.seat.rematch();
          } catch {
            button.disabled = false;
          }
          updateRematchText(app.online?.seat?.state);
        }, "primary", true),
        actionButton("Change Game Setup", async () => {
          await app.online?.seat?.leave();
          forgetSeat();
          renderOnlineMenu();
        }),
        actionButton(EXIT.back, async () => {
          await app.online?.seat?.leave();
          forgetSeat();
          backToGames();
        })
      ]),
      rematchText
    ], { labelledBy: "winner-title", className: `overlay-won won-${winner}` }) && updateRematchText(app.online?.seat?.state));
  });
}

function updateRematchText(state) {
  const text = root.querySelector(".rematch-status");
  if (!text || !state) return;
  const me = state.team;
  const opponent = otherTeam(me);
  if (state.rematch[me] && !state.rematch[opponent]) text.textContent = `Waiting for ${app.names[opponent]} to play again…`;
  else if (!state.rematch[me] && state.rematch[opponent]) text.textContent = `${app.names[opponent]} wants a rematch!`;
  else text.textContent = "";
}

function showOpponentAway(state) {
  const opponent = otherTeam(state.team);
  showOverlay([
    h("h2", { id: "away-title", class: "overlay-title", text: "Opponent disconnected" }),
    h("p", { class: "overlay-text", text: `${app.names[opponent]} lost their connection. The match is paused until they return.` }),
    h("div", { class: "overlay-actions" },
      actionButton("Wait", () => {
        app.online.opponentAwayDismissed = true;
        hideOverlay();
        const banner = root.querySelector(".game-banner");
        if (banner) banner.textContent = `Waiting for ${app.names[opponent]}…`;
        refreshOnlineInput();
      }, "primary", true),
      actionButton("Return to Math Games", async () => {
        await app.online?.seat?.leave();
        forgetSeat();
        backToGames();
      }))
  ], { labelledBy: "away-title", className: "overlay-away" });
  announce(`${app.names[opponent]} disconnected. The match is paused.`, true);
}

function showOnlineEnd(message) {
  if (!root.querySelector(".overlay-host")) {
    renderOnlineMenu(message);
    return;
  }
  showOverlay([
    h("h2", { id: "end-title", class: "overlay-title", text: "Match over" }),
    h("p", { class: "overlay-text", text: message }),
    h("div", { class: "overlay-actions" },
      actionButton("New Online Match", () => renderOnlineMenu(), "primary", true),
      actionButton(EXIT.back, backToGames))
  ], { labelledBy: "end-title", className: "overlay-end" });
  announce(message, true);
}

// ---------------------------------------------------------------------------
// Physical keyboard: one key event goes to exactly one team.

const KEY_ALIASES = Object.freeze({ Enter: "submit", Backspace: "backspace", Delete: "clear" });

document.addEventListener("keydown", event => {
  if (app.screen !== "game" || app.overlay || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  // A focused on-screen key handles Enter/Space itself (as a click).
  if ((event.key === "Enter" || event.key === " ") && target instanceof HTMLButtonElement) return;
  const key = KEY_ALIASES[event.key] ?? normalizeKey(event.key);
  if (!key) return;
  const team = app.mode === "teams" ? app.keyboardOwner : (app.mode === "online" ? app.online?.team : "turquoise");
  const panel = app.panels[team];
  if (!panel) return;
  if (key === "submit" && event.repeat) return;
  event.preventDefault();
  audio.activate();
  panel.press(key);
});

// Every gesture may unlock audio (Safari/iPad require a gesture).
document.addEventListener("pointerdown", () => audio.activate(), { capture: true });
document.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") audio.activate();
}, { capture: true });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audio.pauseMusic();
    app.robot?.pause();
  } else {
    app.robot?.resume();
    audio.syncMusic();
    app.online?.seat?.pollNow();
  }
});

window.addEventListener("pagehide", event => {
  if (event.persisted) {
    audio.pauseMusic();
    app.robot?.pause();
    return;
  }
  app.online?.seat?.stop();
  audio.dispose();
});

window.addEventListener("pageshow", event => {
  if (event.persisted) {
    app.robot?.resume();
    app.online?.seat?.pollNow();
  }
});

document.documentElement.classList.toggle("reduced-motion", prefersReducedMotion());
renderHome();
