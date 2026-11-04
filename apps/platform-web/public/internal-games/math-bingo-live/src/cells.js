// Card cells and fraction models, shared by the player card, the host's
// winner reveal, the tutorial and the catalog thumbnail. Fraction models are
// drawn from engine/fractions.js geometry: exact equal parts, the first n
// shaded, a dark outline on every part, and a text description for screen
// readers. A marked cell is shown three ways (colour, check mark, heavy
// border with stripes), never colour alone.

import { CENTER, HEADER, SIZE } from "./engine/board.js";
import { describeModel, fractionText, modelGeometry } from "./engine/fractions.js";
import { h, icon, s } from "./dom.js";

export function isFree(cell) {
  return Boolean(cell?.free);
}

export function cellText(cell) {
  if (!cell) return "";
  if (isFree(cell)) return "Free Space";
  return cell.d === 1 ? String(cell.n) : fractionText(cell);
}

export function cellDescription(cell) {
  if (!cell) return "";
  if (isFree(cell)) return "Free Space";
  if (cell.shape) return describeModel(cell);
  return cell.d === 1 ? String(cell.n) : `${cell.n} over ${cell.d}`;
}

/** An original SVG fraction model. Decorative when `label` is false. */
export function fractionSvg(model, { label = true, className = "" } = {}) {
  const geometry = modelGeometry(model);
  const attributes = label
    ? { viewBox: "0 0 100 100", role: "img", "aria-label": describeModel(model), class: `fraction-model shape-${geometry.shape} ${className}`.trim() }
    : { viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false", class: `fraction-model shape-${geometry.shape} ${className}`.trim() };
  const svg = s("svg", attributes);
  for (const part of geometry.parts) {
    const kind = part.shaded ? "part shaded" : "part";
    if (part.kind === "sector") svg.append(s("path", { d: part.path, class: kind }));
    else svg.append(s("rect", { x: part.x, y: part.y, width: part.width, height: part.height, class: kind }));
  }
  return svg;
}

/** The visible face of a cell (number, fraction model, or Free Space star). */
export function cellFace(cell, { modelLabel = false } = {}) {
  if (isFree(cell)) return h("span", { class: "cell-free" }, icon("star", "free-star"), h("span", { class: "free-label", text: "FREE" }));
  if (cell.shape) return fractionSvg(cell, { label: modelLabel });
  return h("span", { class: `cell-number digits-${String(cell.n).length}`, text: String(cell.n) });
}

/** A small read-only cell (tutorial, winner strip, thumbnail). */
export function miniCell(cell, { marked = false, glow = false, highlight = false } = {}) {
  return h("span", {
    class: `mini-cell${marked ? " is-marked" : ""}${glow ? " is-winning" : ""}${highlight ? " is-highlight" : ""}${isFree(cell) ? " is-free" : ""}`,
    role: "img",
    "aria-label": `${cellDescription(cell)}${marked ? ", marked" : ""}`
  }, cellFace(cell), marked ? h("span", { class: "mark-badge", "aria-hidden": "true" }, icon("check")) : null);
}

export function headerRow(className = "") {
  return h("div", { class: `card-header ${className}`.trim(), "aria-hidden": "true" },
    HEADER.map((letter, index) => h("span", { class: `letter letter-${index + 1}`, text: letter })));
}

/**
 * The interactive 5 x 5 card. Built once; `update` only changes attributes
 * (and faces when a new card is dealt), so keyboard focus survives every
 * poll. Arrow keys move between cells; Enter/Space press the cell.
 */
export function createCard({ onCell, onFree }) {
  const grid = h("div", { class: "card-grid", role: "group", "aria-label": "Your Bingo card. Use the arrow keys to move between squares." });
  const buttons = [];
  let focusIndex = 0;
  let cardKey = "";

  const focusCell = index => {
    focusIndex = index;
    buttons.forEach((button, other) => button.setAttribute("tabindex", other === index ? "0" : "-1"));
    buttons[index].focus();
  };

  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const button = h("button", {
      type: "button",
      class: "card-cell",
      tabindex: index === 0 ? "0" : "-1",
      dataset: { cell: String(index) },
      onclick: () => {
        focusIndex = index;
        if (button.dataset.free === "true") onFree?.(index);
        else onCell?.(index);
      },
      onkeydown: event => {
        const row = Math.floor(index / SIZE);
        const column = index % SIZE;
        const moves = {
          ArrowLeft: column > 0 ? index - 1 : index,
          ArrowRight: column < SIZE - 1 ? index + 1 : index,
          ArrowUp: row > 0 ? index - SIZE : index,
          ArrowDown: row < SIZE - 1 ? index + SIZE : index,
          Home: row * SIZE,
          End: row * SIZE + SIZE - 1
        };
        if (event.key in moves) {
          event.preventDefault();
          focusCell(moves[event.key]);
        }
      }
    });
    buttons.push(button);
    grid.append(button);
  }

  const element = h("div", { class: "card" }, headerRow(), grid);

  function update(card, { marks = 0, winMask = 0, pending = null, interactive = false, freeUsable = false, freeArmed = false, freeUsed = false, glow = false } = {}) {
    if (!card) return;
    const key = card.map(cell => (isFree(cell) ? "F" : `${cell.n}/${cell.d}/${cell.shape ?? ""}`)).join(",");
    const fresh = key !== cardKey;
    cardKey = key;
    buttons.forEach((button, index) => {
      const cell = card[index];
      const free = isFree(cell);
      const marked = ((marks >>> index) & 1) === 1;
      const row = Math.floor(index / SIZE) + 1;
      const letter = HEADER[index % SIZE];
      if (fresh) {
        button.replaceChildren(cellFace(cell), h("span", { class: "mark-badge", "aria-hidden": "true" }, icon("check")));
        button.dataset.free = free ? "true" : "false";
      }
      button.classList.toggle("is-marked", marked);
      button.classList.toggle("is-winning", glow && ((winMask >>> index) & 1) === 1);
      button.classList.toggle("is-pending", pending === index);
      button.classList.toggle("is-free", free);
      button.classList.toggle("is-armed", free && freeArmed && !freeUsed);
      const usable = free ? freeUsable && !marked : interactive && !marked;
      button.classList.toggle("is-interactive", usable);
      button.setAttribute("aria-disabled", usable ? "false" : "true");
      button.setAttribute("aria-pressed", marked ? "true" : "false");
      let state = marked ? " Marked." : "";
      if (free && !marked) state = freeArmed ? " Press again to use your Free Space." : " Not used yet.";
      button.setAttribute("aria-label", `Row ${row}, column ${letter}: ${cellDescription(cell)}.${state}`);
      if (free && index === CENTER) {
        const label = button.querySelector(".free-label");
        if (label) label.textContent = marked ? "USED" : freeArmed ? "TAP AGAIN" : "FREE";
      }
    });
  }

  return Object.freeze({ element, update, buttons, focus: () => focusCell(focusIndex) });
}

/** Five cells of a winning line, glowing. */
export function winningStrip(cells, lineType) {
  return h("div", { class: `winning-strip line-${lineType}`, role: "img", "aria-label": `Winning ${lineType}: ${cells.map(cellDescription).join(", ")}` },
    cells.map(cell => miniCell(cell, { marked: true, glow: true })));
}
