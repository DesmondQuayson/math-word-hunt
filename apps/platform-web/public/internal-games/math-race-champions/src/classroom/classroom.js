// Classroom Competition screen: two teams on one Smart Board, both answering
// their own questions at the same time. The rules live in engine/classroom.js;
// this file draws them and passes presses in with the press's own timestamp.

import { TEAMS, TIE_WINDOW_MS, createClassroomMatch } from "../engine/classroom.js";
import { CATEGORIES, DIFFICULTIES } from "../engine/questions.js";
import { freshSeed } from "../engine/random.js";
import { announce, fill, formatDuration, h, icon, prefersReducedMotion, pressable, questionForm } from "../dom.js";
import { createTrackView } from "./track-view.js";

const KEYS = Object.freeze({ a: ["turquoise", 0], s: ["turquoise", 1], k: ["pink", 0], l: ["pink", 1] });
const KEY_HINTS = Object.freeze({ turquoise: ["A", "S"], pink: ["K", "L"] });
const COUNTDOWN = ["3", "2", "1", "GO!"];
const COUNTDOWN_STEP_MS = 800;

function settingsSummary(settings) {
  const difficulty = DIFFICULTIES.find(item => item.id === settings.difficulty)?.title ?? "";
  const skills = settings.categories.length === CATEGORIES.length
    ? "Mixed Skills"
    : settings.categories.length === 1
      ? CATEGORIES.find(item => item.id === settings.categories[0])?.title
      : `${settings.categories.length} skills`;
  return `${skills} · ${difficulty}`;
}

function createTeamPanel(team, match, onPress) {
  const view = match.team(team);
  const name = h("h2", { class: "cr-name", id: `cr-name-${team}`, text: view.name });
  const now = h("span", { class: "cr-count-now", text: "0" });
  const count = h("p", { class: "cr-count", "aria-label": `0 of ${match.length}` }, now, h("span", { class: "cr-count-of", text: ` / ${match.length}` }));
  const left = h("p", { class: "cr-left", text: `${match.length} STEPS LEFT` });
  const trackView = createTrackView({ team, spaces: match.length });
  const questionText = h("p", { class: "cr-question-text", id: `cr-question-${team}` });
  const feedback = h("p", { class: "cr-feedback", "aria-hidden": "true" });
  const buttons = [0, 1].map(index => {
    const label = h("span", { class: "cr-choice-label" });
    const hint = h("kbd", { class: "cr-key", "aria-hidden": "true", text: KEY_HINTS[team][index] });
    const button = h("button", { type: "button", class: "cr-choice", disabled: true, "aria-describedby": `cr-question-${team}`, dataset: { team, choice: String(index) } }, label, hint);
    pressable(button, event => onPress(team, index, event));
    return { button, label };
  });
  const element = h(
    "section",
    { class: `cr-team cr-team-${team}`, "aria-labelledby": `cr-name-${team}`, dataset: { team } },
    h("header", { class: "cr-head" }, name, h("div", { class: "cr-progress" }, count, left)),
    trackView.element,
    h("div", { class: "cr-answer" }, h("div", { class: "cr-question" }, questionText, feedback), h("div", { class: "cr-choices" }, buttons.map(item => item.button)))
  );
  let questionTimer = 0;

  function showQuestion(question) {
    questionText.textContent = question.text;
    questionText.dataset.form = questionForm(question.text);
    questionText.setAttribute("aria-label", question.spoken);
    buttons.forEach((item, index) => {
      item.label.textContent = question.choices[index];
      item.button.classList.remove("is-correct", "is-wrong");
    });
    feedback.textContent = "";
    element.dataset.feedback = "";
  }

  function setEnabled(enabled) {
    buttons.forEach(item => {
      item.button.disabled = !enabled;
    });
  }

  function showProgress() {
    const current = match.team(team);
    now.textContent = String(current.position);
    count.setAttribute("aria-label", `${current.position} of ${match.length}`);
    left.textContent = current.remaining === 0 ? "FINISHED!" : `${current.remaining} ${current.remaining === 1 ? "STEP" : "STEPS"} LEFT`;
    element.dataset.position = String(current.position);
  }

  return {
    team,
    element,
    trackView,
    showQuestion,
    setEnabled,
    showProgress,
    reset() {
      clearTimeout(questionTimer);
      name.textContent = match.team(team).name;
      trackView.set(0);
      showProgress();
      showQuestion(match.team(team).question);
      setEnabled(false);
      element.dataset.finished = "";
    },
    /** Show the result of one press, then the next question once the buttons have rested. */
    showResult(result, whenRested) {
      clearTimeout(questionTimer);
      setEnabled(false);
      buttons[result.choiceIndex].button.classList.add(result.correct ? "is-correct" : "is-wrong");
      element.dataset.feedback = result.correct ? "correct" : "wrong";
      feedback.textContent = result.correct ? "Correct! +1" : `Not this time: ${result.answered.answer}`;
      if (result.correct) {
        // Ball, glowing spaces, counter and steps-left all change together, on landing.
        trackView.hop(result.position, showProgress);
      }
      questionTimer = setTimeout(() => {
        if (result.finished) {
          element.dataset.finished = "true";
          return;
        }
        showQuestion(match.team(team).question);
        whenRested();
      }, result.lockMs);
    },
    destroy() {
      clearTimeout(questionTimer);
      trackView.destroy();
    }
  };
}

function confetti(container, colours) {
  if (prefersReducedMotion()) return;
  const layer = h("div", { class: "confetti", "aria-hidden": "true" });
  for (let index = 0; index < 70; index += 1) {
    const piece = h("i");
    piece.style.left = `${(index * 37) % 100}%`;
    piece.style.background = colours[index % colours.length];
    piece.style.animationDelay = `${(index % 14) * 0.08}s`;
    piece.style.animationDuration = `${2.2 + (index % 5) * 0.35}s`;
    layer.append(piece);
  }
  container.append(layer);
  setTimeout(() => layer.remove(), 5200);
}

export function mount(root, context, params) {
  const { audio } = context;
  const match = createClassroomMatch({ settings: params.settings, names: params.names, length: params.length, seed: params.seed ?? freshSeed() });
  const timers = new Set();
  const later = (callback, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      callback();
    }, ms);
    timers.add(id);
    return id;
  };

  const overlay = h("div", { class: "cr-overlay" });
  const panels = {};

  function press(team, choiceIndex, event) {
    audio.activate();
    const at = typeof event?.timeStamp === "number" && event.timeStamp > 0 ? event.timeStamp : performance.now();
    const result = match.submit(team, choiceIndex, at);
    if (!result.accepted) return;
    const panel = panels[team];
    if (result.correct) {
      audio.correct();
      later(() => audio.hop(), 60);
    } else {
      audio.incorrect();
    }
    panel.showResult(result, () => {
      if (match.phase === "playing") panel.setEnabled(true);
    });
    announce(`${match.team(team).name}: ${result.correct ? `correct, ${result.position} of ${match.length}` : "not correct"}`);
    if (result.finished) later(finish, TIE_WINDOW_MS + 20);
  }

  for (const team of TEAMS) panels[team] = createTeamPanel(team, match, press);

  function finish() {
    const outcome = match.resolve(performance.now() + TIE_WINDOW_MS);
    if (!outcome) return later(finish, 30);
    for (const team of TEAMS) {
      panels[team].setEnabled(false);
      panels[team].showProgress();
    }
    audio.victory();
    const winners = outcome.result === "tie" ? TEAMS : [outcome.winner];
    main.dataset.phase = "finished";
    main.dataset.winner = outcome.result === "tie" ? "tie" : outcome.winner;
    confetti(main, outcome.result === "tie" ? ["#20cfe3", "#ff4f9a", "#ffd24a"] : outcome.winner === "turquoise" ? ["#20cfe3", "#ffffff", "#ffd24a"] : ["#ff4f9a", "#ffffff", "#ffd24a"]);
    const title = outcome.result === "tie" ? "It's a tie!" : `${outcome.teams[outcome.winner].name} wins!`;
    announce(`${title} Goal!`, { assertive: true });
    const row = team => {
      const stats = outcome.teams[team];
      return h(
        "tr",
        { class: `result-${team}${winners.includes(team) ? " is-winner" : ""}` },
        h("th", { scope: "row", text: stats.name }),
        h("td", { text: `${stats.position} / ${outcome.length}` }),
        h("td", { text: String(stats.correct) }),
        h("td", { text: String(stats.wrong) }),
        h("td", { text: `${stats.accuracy}%` }),
        h("td", { text: stats.timeMs === null ? "—" : formatDuration(stats.timeMs) })
      );
    };
    // The celebration plays over the board first; the results card follows.
    later(() => {
      const again = h("button", { type: "button", class: "button button-primary", onclick: () => restart() }, icon("refresh"), "Play again");
      fill(
        overlay,
        h(
          "div",
          { class: "cr-card cr-results", role: "dialog", "aria-modal": "true", "aria-labelledby": "cr-results-title" },
          h("div", { class: "cr-trophy", "aria-hidden": "true" }, icon("trophy")),
          h("p", { class: "cr-goal", text: "GOAL!" }),
          h("h2", { id: "cr-results-title", text: title }),
          h(
            "table",
            { class: "cr-table" },
            h("thead", null, h("tr", null, ["Team", "Steps", "Correct", "Incorrect", "Accuracy", "Time"].map(text => h("th", { scope: "col", text })))),
            h("tbody", null, TEAMS.map(row))
          ),
          h(
            "div",
            { class: "cr-actions" },
            again,
            h("button", { type: "button", class: "button", onclick: () => context.navigate("classroom-setup", params) }, "Change settings"),
            h("button", { type: "button", class: "button", onclick: () => context.navigate("hub") }, icon("home"), "Game menu")
          )
        )
      );
      overlay.hidden = false;
      again.focus();
    }, prefersReducedMotion() ? 300 : 1500);
  }

  function countdown() {
    main.dataset.phase = "countdown";
    const number = h("p", { class: "cr-countdown", "aria-live": "assertive" });
    fill(overlay, number);
    overlay.hidden = false;
    COUNTDOWN.forEach((text, index) => {
      later(() => {
        number.textContent = text;
        number.classList.remove("pop");
        void number.offsetWidth;
        number.classList.add("pop");
        if (index < COUNTDOWN.length - 1) audio.countdown();
        else audio.go();
      }, index * COUNTDOWN_STEP_MS);
    });
    later(() => {
      overlay.hidden = true;
      fill(overlay);
      main.dataset.phase = "playing";
      // Both teams are released by the same line of code, at the same instant.
      match.start(performance.now());
      for (const team of TEAMS) panels[team].setEnabled(true);
      announce("Go! Both teams are racing.");
    }, (COUNTDOWN.length - 1) * COUNTDOWN_STEP_MS + 500);
  }

  function ready() {
    main.dataset.phase = "ready";
    main.dataset.winner = "";
    const start = h("button", { type: "button", class: "button button-primary button-huge", onclick: () => { audio.activate(); audio.button(); countdown(); } }, icon("play"), "Start the race");
    fill(
      overlay,
      h(
        "div",
        { class: "cr-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "cr-ready-title" },
        h("h2", { id: "cr-ready-title", text: "Ready, teams?" }),
        h("p", { class: "cr-card-lead", text: `Both teams answer at the same time. A correct answer moves your football 1 space. First to ${match.length} wins.` }),
        h("p", { class: "cr-card-note", text: settingsSummary(match.settings) }),
        start
      )
    );
    overlay.hidden = false;
    start.focus();
  }

  function restart() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    main.querySelector(".confetti")?.remove();
    match.restart();
    for (const team of TEAMS) panels[team].reset();
    ready();
  }

  function onKey(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const mapped = KEYS[event.key.toLowerCase()];
    if (!mapped || main.dataset.phase !== "playing") return;
    event.preventDefault();
    main.classList.add("has-keyboard");
    press(mapped[0], mapped[1], event);
  }

  const musicButton = h("button", { type: "button", class: "icon-button", "aria-pressed": String(context.prefs.music), "aria-label": "Music", onclick: () => context.toggle("music", musicButton) }, icon("music"));
  const soundButton = h("button", { type: "button", class: "icon-button", "aria-pressed": String(context.prefs.sound), "aria-label": "Sound effects", onclick: () => context.toggle("sound", soundButton) }, icon("sound"));
  const fullscreenButton = h("button", { type: "button", class: "icon-button", "aria-label": "Full screen", onclick: () => context.fullscreen() }, icon("expand"));
  const main = h(
    "main",
    { id: "main", class: "classroom", dataset: { phase: "ready", length: String(match.length) } },
    h(
      "header",
      { class: "cr-bar" },
      h("button", { type: "button", class: "icon-button", "aria-label": "Back to the game menu", onclick: () => context.navigate("hub") }, icon("back")),
      h("h1", { class: "cr-title" }, "Classroom Competition", h("span", { class: "cr-subtitle", text: settingsSummary(match.settings) })),
      h(
        "div",
        { class: "cr-tools" },
        h("button", { type: "button", class: "button button-small", onclick: () => restart() }, icon("refresh"), "Restart"),
        musicButton,
        soundButton,
        fullscreenButton
      )
    ),
    h("div", { class: "cr-board" }, panels.turquoise.element, h("div", { class: "cr-divider", "aria-hidden": "true" }), panels.pink.element),
    overlay
  );

  root.replaceChildren(main);
  // Read by the browser tests. Classroom Competition has no account, no reward
  // and no server: there is nothing here to protect from the people at the board.
  window.__MATH_RACE__ = { ...(window.__MATH_RACE__ ?? {}), classroom: { match } };
  document.addEventListener("keydown", onKey);
  for (const team of TEAMS) {
    panels[team].reset();
    panels[team].trackView.measure();
  }
  ready();

  return {
    destroy() {
      document.removeEventListener("keydown", onKey);
      for (const id of timers) clearTimeout(id);
      for (const team of TEAMS) panels[team].destroy();
    }
  };
}
