// One team's side of the board: name, question, answer display and a large
// custom keypad. A panel only ever changes its own team's entry.

import { applyKey, displayBuffer } from "./answer.js";
import { h, icon } from "./dom.js";

export const TEAM_LABEL = Object.freeze({ turquoise: "Turquoise Team", pink: "Pink Team" });

const DIGIT_ROWS = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
const KEY_LABELS = Object.freeze({
  "-": "Negative sign",
  "+": "Positive sign",
  backspace: "Delete last digit",
  clear: "Clear answer",
  submit: "Submit answer"
});
const MINUS = String.fromCharCode(0x2212);

export function teamBadge(team) {
  return h("span", { class: `team-badge team-badge-${team}` }, icon(team === "turquoise" ? "wave" : "star"), h("span", { text: TEAM_LABEL[team] }));
}

/**
 * Activate on pointerdown so two players on one touchscreen can press keys at
 * the same instant (a second finger does not reliably produce "click").
 * Keyboard activation still arrives as a detail-0 click.
 */
function pressable(button, onPress) {
  let pointerAt = 0;
  button.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (button.disabled) return;
    event.preventDefault();
    pointerAt = performance.now();
    button.classList.add("is-pressed");
    onPress(event);
  });
  const release = () => button.classList.remove("is-pressed");
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("click", event => {
    if (performance.now() - pointerAt < 700) return;
    onPress(event);
  });
  return button;
}

export function createPanel({ team, name, signed, onSubmit, onActivate, onInteract, compact = false }) {
  let buffer = "";
  let locked = false;
  let busy = false;
  let enabled = true;
  let feedbackTimer = null;
  let question = null;

  const nameElement = h("h2", { class: "panel-name", id: `panel-name-${team}`, text: name });
  const pullsElement = h("p", { class: "panel-pulls", "aria-live": "off" });
  const questionText = h("span", { class: "question-text" });
  const questionSuffix = h("span", { class: "question-suffix", "aria-hidden": "true", text: " = ?" });
  const questionElement = h("p", { class: "question", id: `question-${team}` }, questionText, questionSuffix);
  const answerValue = h("span", { class: "answer-value", "aria-hidden": "true" });
  const answerLabel = h("span", { class: "sr-only" });
  const feedbackElement = h("p", { class: "panel-feedback", "aria-hidden": "true" });
  const answerElement = h("div", { class: "answer-display", role: "group", "aria-label": `${TEAM_LABEL[team]} answer` }, answerLabel, answerValue, feedbackElement);
  const keyboardChip = h("span", { class: "keyboard-chip", "aria-hidden": "true", text: "Keyboard" });
  const keys = [];

  const press = key => {
    onActivate?.(team);
    if (!enabled || locked || busy) return;
    if (key === "submit") {
      if (buffer === "" || buffer === "-" || buffer === "+") {
        flash("Type an answer", "hint", 900);
        return;
      }
      const entry = buffer;
      onSubmit(team, entry);
      return;
    }
    const next = applyKey(buffer, key, { signed });
    if (next !== buffer) {
      buffer = next;
      renderBuffer();
    }
    onInteract?.(team, key);
  };

  const keyButton = (key, label, extraClass = "") => {
    const button = h("button", {
      type: "button",
      class: `key ${extraClass}`.trim(),
      "data-key": key,
      "aria-label": KEY_LABELS[key] ?? key,
      "aria-controls": `answer-${team}`
    }, label);
    keys.push(button);
    return pressable(button, () => press(key));
  };

  // Keys are direct grid children; CSS places them (3 columns normally, 4
  // columns on short landscape screens) via grid areas named per key.
  const keypadKeys = [];
  if (signed) {
    keypadKeys.push(keyButton("-", MINUS, "key-sign"), keyButton("+", "+", "key-sign"), keyButton("backspace", icon("backspace"), "key-tool"));
  }
  for (const row of DIGIT_ROWS) keypadKeys.push(...row.map(digit => keyButton(digit, digit)));
  keypadKeys.push(keyButton("clear", "C", "key-tool"), keyButton("0", "0"), keyButton("submit", "OK", "key-submit"));
  const keypad = h("div", { class: `keypad ${signed ? "keypad-signed" : "keypad-unsigned"}`, role: "group", "aria-label": `${TEAM_LABEL[team]} keypad` }, keypadKeys);
  answerElement.id = `answer-${team}`;

  const element = h("section", {
    class: `team-panel team-${team} ${compact ? "is-compact" : ""}`,
    "data-team": team,
    "aria-labelledby": `panel-name-${team}`
  },
  h("header", { class: "panel-header" }, teamBadge(team), keyboardChip, nameElement, pullsElement),
  h("div", { class: "panel-question" }, questionElement, answerElement),
  keypad);

  element.addEventListener("pointerdown", () => onActivate?.(team));
  element.addEventListener("focusin", () => onActivate?.(team));

  function renderBuffer() {
    const shown = displayBuffer(buffer);
    answerValue.textContent = shown === "" ? "?" : shown;
    answerElement.classList.toggle("is-empty", shown === "");
    answerLabel.textContent = shown === "" ? "Answer: empty" : `Answer: ${shown.replace(MINUS, "negative ")}`;
  }

  function flash(text, kind, duration) {
    clearTimeout(feedbackTimer);
    feedbackElement.textContent = text;
    element.dataset.feedback = kind;
    feedbackTimer = setTimeout(() => {
      feedbackElement.textContent = "";
      delete element.dataset.feedback;
    }, duration);
  }

  function setQuestion(next) {
    question = next;
    buffer = "";
    renderBuffer();
    if (!next) {
      questionText.textContent = "";
      questionElement.removeAttribute("aria-label");
      return;
    }
    questionText.textContent = next.text;
    questionSuffix.hidden = next.kind === "sentence";
    questionElement.classList.toggle("is-sentence", next.kind === "sentence");
    questionElement.setAttribute("aria-label", next.kind === "sentence" ? next.spoken : `${next.spoken} equals what?`);
  }

  function refreshDisabled() {
    const off = !enabled || busy;
    for (const key of keys) {
      key.disabled = off;
    }
    element.classList.toggle("is-disabled", !enabled);
    element.classList.toggle("is-busy", busy);
  }

  renderBuffer();

  return Object.freeze({
    team,
    element,
    press,
    get buffer() {
      return buffer;
    },
    get question() {
      return question;
    },
    setName(value) {
      nameElement.textContent = value;
    },
    setPulls(count) {
      pullsElement.textContent = `Pulls: ${count}`;
    },
    setQuestion,
    /**
     * Show the result of this team's answer, keep the panel briefly locked,
     * then show the next question. The opposing panel is never touched.
     */
    showResult(kind, text, nextQuestion, holdMs) {
      locked = true;
      element.dataset.result = kind;
      feedbackElement.textContent = text;
      answerValue.textContent = kind === "correct" ? "" : answerValue.textContent;
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        locked = false;
        delete element.dataset.result;
        feedbackElement.textContent = "";
        setQuestion(nextQuestion ?? question);
      }, holdMs);
    },
    flash,
    setEnabled(value) {
      enabled = value;
      refreshDisabled();
    },
    setBusy(value) {
      busy = value;
      refreshDisabled();
    },
    setKeyboardOwner(owner) {
      element.classList.toggle("has-keyboard", owner);
    },
    focusFirstKey() {
      keys.find(key => key.dataset.key === "1")?.focus();
    },
    destroy() {
      clearTimeout(feedbackTimer);
    }
  });
}
