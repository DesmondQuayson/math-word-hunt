// Pieces shared by the host and player screens: wording, the timer, the
// win-rules strip, the leaderboard, the called-question list, the banner
// that announces Free Space and Bingo, and the tutorial (drawn with the real
// card cells, never mock-ups).

import { cellFace, fractionSvg, miniCell, winningStrip } from "./cells.js";
import { h, icon, prefersReducedMotion, s } from "./dom.js";
import { emojiName, isAllowedEmoji, withEmoji } from "./engine/emoji.js";
import { encodeQr, qrPath } from "./engine/qr.js";

const PLACE_WORDS = ["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH"];
const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

export function placeWord(n) {
  return PLACE_WORDS[n - 1] ?? ordinal(n).toUpperCase();
}

export function medal(n) {
  return MEDALS[n - 1] ?? "";
}

export const LINE_LABEL = Object.freeze({ row: "Row", column: "Column", diagonal: "Diagonal" });

export function upperName(name) {
  return name.toLocaleUpperCase();
}

/** "🦁 Ava" (or "Ava"): how a player is shown everywhere. */
export function playerName(player) {
  return withEmoji(player?.name ?? "", player?.emoji);
}

/** "🦁 AVA" for announcements; without an emoji the announcement keeps its 🎉. */
export function announcedName(player) {
  return `${isAllowedEmoji(player?.emoji) ? player.emoji : "🎉"} ${upperName(player?.name ?? "")}`;
}

/** Screen-reader form: "Ava (lion)"; emoji are decoration, the name is what is read. */
export function spokenName(player) {
  const name = player?.name ?? "";
  const label = emojiName(player?.emoji);
  return label ? `${name} (${label.toLowerCase()})` : name;
}

/**
 * A QR code drawn locally as SVG (dark modules on white with the standard
 * quiet zone). No QR service is contacted.
 */
export function qrCode(text, { label, className = "" } = {}) {
  const code = encodeQr(text);
  const size = code.size + 8;
  return s("svg", { viewBox: `0 0 ${size} ${size}`, class: `qr-code ${className}`.trim(), role: "img", "aria-label": label ?? "QR code", "shape-rendering": "crispEdges", focusable: "false" },
    s("rect", { width: String(size), height: String(size), class: "qr-light" }),
    s("path", { d: qrPath(code, 4), class: "qr-dark" }));
}

/** Remaining milliseconds of the current phase by the server clock. */
export function remainingMs(state, clock) {
  const timing = state?.timing;
  if (!timing) return null;
  if (state.phase === "PAUSED") return timing.pausedRemainingMs;
  if (typeof timing.phaseDeadline !== "number") return null;
  return Math.max(0, timing.phaseDeadline - clock.now());
}

export function phaseTotalMs(state) {
  const settings = state?.settings;
  const phase = state?.phase === "PAUSED" ? state.pausedPhase : state?.phase;
  if (!settings) return null;
  if (phase === "QUESTION_ACTIVE") return settings.questionSeconds > 0 ? settings.questionSeconds * 1000 : null;
  if (phase === "ANSWER_REVEAL") return settings.revealSeconds > 0 ? settings.revealSeconds * 1000 : null;
  if (phase === "COUNTDOWN" || phase === "LEADERBOARD_UPDATE") return 3000;
  if (phase === "WINNER_REVEAL") return 5000;
  return null;
}

/** A ring timer with the whole seconds in the middle. */
export function createTimer(className = "") {
  const circumference = 2 * Math.PI * 44;
  const progress = createSvgCircle("timer-progress", circumference);
  const number = h("span", { class: "timer-number", text: "" });
  const element = h("div", { class: `timer ${className}`.trim(), role: "timer", "aria-live": "off", "aria-label": "Time left" },
    svgRing(progress), number);
  let lastText = "";
  return Object.freeze({
    element,
    update(remaining, total, { paused = false, manual = false } = {}) {
      element.classList.toggle("is-paused", paused);
      element.classList.toggle("is-manual", manual);
      if (manual) {
        element.classList.remove("is-low");
        lastText = "";
        number.textContent = "∞";
        progress.style.strokeDashoffset = "0";
        element.setAttribute("aria-label", "No time limit");
        return;
      }
      if (remaining === null || !total) {
        element.classList.remove("is-low");
        lastText = "";
        number.textContent = "";
        progress.style.strokeDashoffset = String(circumference);
        return;
      }
      const seconds = Math.ceil(remaining / 1000);
      const text = String(seconds);
      if (text !== lastText) {
        number.textContent = text;
        element.setAttribute("aria-label", paused ? `Paused with ${seconds} seconds left` : `${seconds} seconds left`);
        lastText = text;
      }
      element.classList.toggle("is-low", seconds <= 5 && !paused);
      const fraction = Math.max(0, Math.min(1, remaining / total));
      progress.style.strokeDashoffset = String(circumference * (1 - fraction));
    }
  });
}

function createSvgCircle(className, circumference) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "50");
  circle.setAttribute("cy", "50");
  circle.setAttribute("r", "44");
  circle.setAttribute("class", className);
  circle.style.strokeDasharray = String(circumference);
  circle.style.strokeDashoffset = "0";
  return circle;
}

function svgRing(progress) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "timer-ring");
  const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  track.setAttribute("cx", "50");
  track.setAttribute("cy", "50");
  track.setAttribute("r", "44");
  track.setAttribute("class", "timer-track");
  svg.append(track, progress);
  return svg;
}

/**
 * WIN WITH ✓ Row ✓ Column ○ Diagonal — state shown by symbol and words, not
 * colour alone. Always drawn from the room's own settings (the server's
 * copy), never from what was picked on the setup form.
 */
export function rulesStrip(patterns, { compact = false, title = "WIN WITH", className = "" } = {}) {
  const items = [["rows", "Row"], ["columns", "Column"], ["diagonals", "Diagonal"]];
  return h("div", { class: `rules${compact ? " is-compact" : ""} ${className}`.trim(), role: "group", "aria-label": "Ways to win" },
    h("span", { class: "rules-title", "aria-hidden": "true", text: title }),
    h("ul", { class: "rules-list" }, items.map(([key, label]) => {
      const on = patterns?.[key] === true;
      return h("li", { class: `rule ${on ? "is-on" : "is-off"}`, dataset: { pattern: key }, "aria-label": `${label} wins ${on ? "enabled" : "disabled"}` },
        h("span", { class: "rule-mark", "aria-hidden": "true", text: on ? "✓" : "○" }),
        h("span", { class: "rule-label", "aria-hidden": "true", text: label }));
    })));
}

export function progressText(row) {
  if (row.won) return "BINGO";
  if (!row.type) return `${row.best}/5`;
  return `${row.best}/5 · ${LINE_LABEL[row.type] ?? ""}`;
}

/** The live leaderboard. Winners keep their medal and place. */
export function leaderboardList(rows, { limit = 10, highlightYou = false } = {}) {
  if (!rows.length) return h("p", { class: "leaderboard-empty", text: "Waiting for the first marks…" });
  return h("ol", { class: "leaderboard", "aria-label": "Leaderboard" }, rows.slice(0, limit).map(row => h("li", {
    class: `leader${row.won ? " is-winner" : ""}${highlightYou && row.you ? " is-you" : ""}${!row.won && row.best === 4 ? " is-close" : ""}`
  },
  h("span", { class: "leader-rank", "aria-hidden": "true", text: row.won && row.placement <= 3 ? medal(row.placement) : String(row.rank) }),
  h("span", { class: "leader-name", text: playerName(row) }),
  h("span", { class: "leader-progress", text: progressText(row) }),
  h("span", { class: "sr-only", text: row.won ? `, ${ordinal(row.placement)} Bingo` : `, rank ${row.rank}` }))));
}

/** Questions called so far; the current one is marked and never answered early. */
export function calledList(called, current, { fractions = false } = {}) {
  return h("ol", { class: "called-list", "aria-label": fractions ? "Called fractions" : "Called questions" },
    called.map(item => {
      const isCurrent = current && item.number === current.number;
      return h("li", { class: `called-item${isCurrent ? " is-current" : ""}`, "aria-current": isCurrent ? "true" : null },
        h("span", { class: "called-text", text: item.reveal && !fractions ? item.reveal.text : item.text }),
        isCurrent ? h("span", { class: "sr-only", text: " (current)" }) : null);
    }));
}

/** The big question face; fractions render as a stacked fraction. */
export function questionFace(question, { className = "" } = {}) {
  if (!question) return h("div", { class: `question-face ${className}`.trim() });
  if (question.kind === "fraction") {
    const [n, d] = question.text.split("/");
    return h("div", { class: `question-face is-fraction ${className}`.trim(), role: "img", "aria-label": `${question.spoken} (${question.text})` },
      h("span", { class: "frac", "aria-hidden": "true" }, h("span", { class: "frac-n", text: n }), h("span", { class: "frac-bar" }), h("span", { class: "frac-d", text: d })));
  }
  return h("div", { class: `question-face ${className}`.trim(), "aria-label": `${question.spoken} equals what?` },
    h("span", { class: "question-text", "aria-hidden": "true", text: question.text }),
    h("span", { class: "question-equals", "aria-hidden": "true", text: "= ?" }));
}

/** The reveal: "9 + 9 = 18", or the fraction with an enlarged model. */
export function revealFace(question) {
  if (!question?.reveal) return null;
  if (question.kind === "fraction") {
    const { n, d } = question.reveal.answer;
    return h("div", { class: "reveal-face is-fraction" },
      questionFace(question, { className: "is-small" }),
      fractionSvg({ n, d, shape: d === 1 ? "bar" : "circle" }, { className: "reveal-model" }),
      h("p", { class: "reveal-caption", text: question.reveal.description }));
  }
  return h("div", { class: "reveal-face", role: "status" }, h("span", { class: "reveal-text", text: question.reveal.text }));
}

/**
 * Event banner (Free Space, Bingo, one away). Queued so two Bingos in one
 * second are both seen; brief, and still in reduced-motion mode.
 */
export function createBanner(root) {
  const element = h("div", { class: "banner", hidden: true });
  root.append(element);
  const queue = [];
  let showing = false;
  const showNext = () => {
    const next = queue.shift();
    if (!next) {
      showing = false;
      element.hidden = true;
      element.className = "banner";
      return;
    }
    showing = true;
    // Optional parts (the count, the winning cells) may be absent: skip them, never print "null".
    element.replaceChildren(...next.children.filter(Boolean));
    element.className = `banner tone-${next.tone}`;
    element.hidden = false;
    if (next.tone === "bingo" && !prefersReducedMotion()) confetti(element);
    window.setTimeout(showNext, next.duration);
  };
  return Object.freeze({
    show({ children, tone = "info", duration = 3200 }) {
      queue.push({ children, tone, duration });
      if (!showing) showNext();
    },
    clear() {
      queue.length = 0;
      showNext();
    },
    get element() {
      return element;
    }
  });
}

function confetti(container) {
  const burst = h("div", { class: "confetti", "aria-hidden": "true" });
  for (let index = 0; index < 28; index += 1) {
    const piece = h("i", { class: `confetti-piece c${index % 5}` });
    piece.style.setProperty("--x", `${(index * 37) % 100}%`);
    piece.style.setProperty("--delay", `${(index % 7) * 60}ms`);
    piece.style.setProperty("--spin", `${(index % 2 ? 1 : -1) * (180 + index * 23)}deg`);
    burst.append(piece);
  }
  container.append(burst);
  window.setTimeout(() => burst.remove(), 2400);
}

export function bingoBannerChildren(event, winner) {
  return [
    h("p", { class: "banner-title", text: `${announcedName(event)} — BINGO!` }),
    h("p", { class: "banner-subtitle", text: `${placeWord(event.placement)} BINGO` }),
    event.cap > 0 ? h("p", { class: "banner-count", text: `${event.placement} / ${event.cap}` }) : null,
    event.lineType ? h("p", { class: "banner-line", text: `${(LINE_LABEL[event.lineType] ?? "").toUpperCase()} BINGO` }) : null,
    winner?.cells?.length === 5 ? winningStrip(winner.cells, event.lineType) : null
  ];
}

/** "How to play" in four steps, drawn with real card cells. */
export function tutorial(mode) {
  const fractions = mode === "fractions";
  const steps = fractions
    ? [
        { title: "Read the fraction.", visual: questionFace({ kind: "fraction", text: "2/3", spoken: "two thirds" }, { className: "is-mini" }) },
        { title: "Find the model with that many equal parts shaded.", visual: h("div", { class: "mini-row" }, [{ n: 1, d: 3, shape: "bar" }, { n: 2, d: 3, shape: "circle" }, { n: 3, d: 4, shape: "grid" }].map((cell, index) => miniCell(cell, { highlight: index === 1 }))) },
        { title: "Two matches? Pick the one that helps your line.", visual: h("div", { class: "mini-row" }, [{ n: 2, d: 3, shape: "rect" }, { n: 2, d: 3, shape: "circle" }].map((cell, index) => miniCell(cell, { highlight: index === 0 }))) },
        { title: "Complete an allowed line to get Bingo!", visual: h("div", { class: "mini-row" }, [{ n: 1, d: 2, shape: "circle" }, { n: 3, d: 4, shape: "bar" }, { free: true }, { n: 1, d: 5, shape: "rect" }, { n: 5, d: 6, shape: "circle" }].map(cell => miniCell(cell, { marked: true, glow: true }))) }
      ]
    : [
        { title: "Solve the question.", visual: questionFace({ kind: "arithmetic", text: "9 + 9", spoken: "9 plus 9" }, { className: "is-mini" }) },
        { title: "Find the matching answer on your card.", visual: h("div", { class: "mini-row" }, [{ n: 16, d: 1 }, { n: 18, d: 1 }, { n: 21, d: 1 }].map((cell, index) => miniCell(cell, { highlight: index === 1 }))) },
        { title: "Two matches? Pick the one that helps your line.", visual: h("div", { class: "mini-row" }, [{ n: 18, d: 1 }, { n: 18, d: 1 }].map((cell, index) => miniCell(cell, { highlight: index === 0 }))) },
        { title: "Complete an allowed line to get Bingo!", visual: h("div", { class: "mini-row" }, [{ n: 7, d: 1 }, { n: 12, d: 1 }, { free: true }, { n: 18, d: 1 }, { n: 9, d: 1 }].map(cell => miniCell(cell, { marked: true, glow: true }))) }
      ];
  return h("section", { class: "tutorial", "aria-label": "How to play" },
    h("h2", { class: "tutorial-title", text: "How to play" }),
    h("ol", { class: "tutorial-steps" }, steps.map((step, index) => h("li", { class: "tutorial-step" },
      h("span", { class: "step-number", "aria-hidden": "true", text: String(index + 1) }),
      h("div", { class: "step-visual", "aria-hidden": "true" }, step.visual),
      h("p", { class: "step-title", text: step.title })))),
    h("p", { class: "tutorial-free" }, h("span", { class: "tutorial-free-icon", "aria-hidden": "true" }, cellFace({ free: true })),
      h("span", { text: "Free Space: tap the star once while a question is live, whenever it helps you most. One use per game." })));
}

export function brandMark() {
  return h("span", { class: "brand" }, h("img", { src: "/brand/mathnexa-mark.png", alt: "", class: "brand-mark", width: "28", height: "28" }), h("span", { class: "brand-name", text: "MathNexa" }));
}

export function iconButton(label, name, onClick, extra = {}) {
  return h("button", { type: "button", class: `icon-button ${extra.class ?? ""}`.trim(), "aria-label": label, title: label, onclick: onClick, ...extra.attributes },
    icon(name), extra.text ? h("span", { class: "icon-button-text", text: extra.text }) : null);
}
