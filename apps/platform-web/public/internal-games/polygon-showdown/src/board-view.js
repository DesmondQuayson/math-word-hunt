// Polygon Showdown board: 64 real buttons for input and assistive technology,
// and a separate layer of tiles that only ever move with CSS transforms, so a
// whole cascade is compositor work on school hardware. The engine decides what
// happens; this file only shows it.

import { h } from "../../math-bingo-live/src/dom.js";
import { shapeImageUrl } from "./board-art.js";
import { SHAPES, shapeLabel } from "./engine/shapes.js";

const SWAP_MS = 170;
const BREAK_MS = 210;
const FALL_BASE_MS = 150;
const FALL_PER_ROW_MS = 36;
const MAX_PARTICLES = 90;
const SHARDS_PER_TILE = 5;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const nextFrame = () => Promise.race([new Promise((resolve) => requestAnimationFrame(resolve)), sleep(60)]);

/** A hidden tab paints no frames: an animation's end must never hold up the game. */
function finished(animation) {
  const end = Number(animation.effect?.getComputedTiming?.().endTime) || 400;
  return Promise.race([animation.finished.catch(() => undefined), sleep(end + 150)]);
}

export class BoardView {
  /**
   * @param config   { cols, rows }
   * @param onSwap   (a, b) => void — the player asked to swap two cells
   * @param motion   () => boolean — false when animation should be minimal
   */
  constructor({ config, onSwap, motion }) {
    this.config = config;
    this.onSwap = onSwap;
    this.motion = motion;
    this.tiles = new Array(config.cols * config.rows).fill(null);
    this.kinds = new Array(config.cols * config.rows).fill(-1);
    this.enabled = false;
    this.selected = null;
    this.focusCell = 0;
    this.cellSize = 0;
    this.drag = null;
    this.particles = [];
    this.particleLoop = 0;

    this.cells = [];
    for (let cell = 0; cell < this.tiles.length; cell += 1) {
      const button = h("button", { type: "button", class: `cell${(Math.floor(cell / config.cols) + cell) % 2 ? " alt" : ""}`, tabindex: cell === 0 ? "0" : "-1", dataset: { cell: String(cell) } });
      this.cells.push(button);
    }
    this.cellLayer = h("div", { class: "cell-layer" }, this.cells);
    this.tileLayer = h("div", { class: "tile-layer", "aria-hidden": "true" });
    this.fxCanvas = h("canvas", { class: "fx-layer", "aria-hidden": "true" });
    this.floatLayer = h("div", { class: "float-layer", "aria-hidden": "true" });
    this.root = h("div", {
      class: "board locked",
      role: "group",
      "aria-label": `Game board, ${config.rows} rows by ${config.cols} columns. Arrow keys move between shapes. Enter picks a shape up, then an arrow key swaps it with its neighbour.`
    }, this.cellLayer, this.tileLayer, this.fxCanvas, this.floatLayer);

    this.root.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.root.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.root.addEventListener("pointerup", (event) => this.pointerUp(event));
    this.root.addEventListener("pointercancel", () => { this.drag = null; });
    this.root.addEventListener("keydown", (event) => this.keyDown(event));
    // Enter, Space and assistive technology arrive as a click with no pointer.
    this.root.addEventListener("click", (event) => {
      const cell = this.cellFromTarget(event.target);
      if (cell !== null && event.detail === 0) this.tap(cell);
    });
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.root);
  }

  destroy() {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.particleLoop);
    this.root.remove();
  }

  // ---------------------------------------------------------------- layout

  layout() {
    const size = this.root.clientWidth / this.config.cols;
    if (!size || size === this.cellSize) return;
    this.cellSize = size;
    this.tileLayer.style.setProperty("--cell", `${size}px`);
    this.tiles.forEach((tile, cell) => {
      if (tile) tile.style.transform = this.transformFor(cell);
    });
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.fxRatio = ratio;
    this.fxCanvas.width = Math.round(this.root.clientWidth * ratio);
    this.fxCanvas.height = Math.round(this.root.clientHeight * ratio);
  }

  point(cell) {
    return [(cell % this.config.cols) * this.cellSize, Math.floor(cell / this.config.cols) * this.cellSize];
  }

  transformFor(cell) {
    const [x, y] = this.point(cell);
    return `translate3d(${x}px, ${y}px, 0)`;
  }

  // ------------------------------------------------------------------ state

  makeTile(kind) {
    const tile = h("div", { class: `tile tile-${SHAPES[kind].key}` });
    tile.append(h("img", { src: shapeImageUrl(kind), alt: "", draggable: "false", decoding: "async" }));
    tile.dataset.kind = String(kind);
    this.tileLayer.append(tile);
    return tile;
  }

  /** Draws a board at once, with no animation. */
  setBoard(text) {
    this.layout();
    for (const tile of this.tiles) tile?.remove();
    for (let cell = 0; cell < text.length; cell += 1) {
      const kind = Number(text[cell]);
      const tile = this.makeTile(kind);
      tile.style.transform = this.transformFor(cell);
      this.tiles[cell] = tile;
      this.kinds[cell] = kind;
    }
    this.refreshLabels();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.root.classList.toggle("locked", !enabled);
    if (!enabled) this.select(null);
  }

  labelFor(cell) {
    const { cols } = this.config;
    const selected = this.selected === cell ? " Picked up." : "";
    return `Row ${Math.floor(cell / cols) + 1}, column ${(cell % cols) + 1}: ${shapeLabel(this.kinds[cell])}.${selected}`;
  }

  refreshLabels() {
    this.cells.forEach((button, cell) => {
      const label = this.labelFor(cell);
      if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    });
  }

  select(cell) {
    const before = this.selected;
    this.selected = cell;
    if (before !== null) {
      this.cells[before].classList.remove("selected");
      this.cells[before].setAttribute("aria-label", this.labelFor(before));
    }
    if (cell !== null) {
      this.cells[cell].classList.add("selected");
      this.cells[cell].setAttribute("aria-label", this.labelFor(cell));
    }
  }

  moveFocus(cell) {
    this.cells[this.focusCell].setAttribute("tabindex", "-1");
    this.focusCell = cell;
    this.cells[cell].setAttribute("tabindex", "0");
    this.cells[cell].focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ input

  cellFromTarget(target) {
    const button = target instanceof Element ? target.closest(".cell") : null;
    return button ? Number(button.dataset.cell) : null;
  }

  cellFromPoint(event) {
    const box = this.root.getBoundingClientRect();
    const col = Math.floor((event.clientX - box.left) / this.cellSize);
    const row = Math.floor((event.clientY - box.top) / this.cellSize);
    if (col < 0 || row < 0 || col >= this.config.cols || row >= this.config.rows) return null;
    return row * this.config.cols + col;
  }

  neighbour(cell, dx, dy) {
    const { cols, rows } = this.config;
    const col = (cell % cols) + dx;
    const row = Math.floor(cell / cols) + dy;
    return col < 0 || row < 0 || col >= cols || row >= rows ? null : row * cols + col;
  }

  adjacent(a, b) {
    const { cols } = this.config;
    return Math.abs((a % cols) - (b % cols)) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) === 1;
  }

  pointerDown(event) {
    if (!this.enabled || event.button > 0) return;
    const cell = this.cellFromPoint(event);
    if (cell === null) return;
    this.drag = { cell, x: event.clientX, y: event.clientY, moved: false };
    try {
      this.root.setPointerCapture(event.pointerId);
    } catch {
      /* A drag still works without capture while the pointer stays on the board. */
    }
  }

  pointerMove(event) {
    if (!this.drag || !this.enabled) return;
    const dx = event.clientX - this.drag.x;
    const dy = event.clientY - this.drag.y;
    const reach = this.cellSize * 0.34;
    if (Math.abs(dx) < reach && Math.abs(dy) < reach) return;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const target = this.neighbour(this.drag.cell, horizontal ? Math.sign(dx) : 0, horizontal ? 0 : Math.sign(dy));
    const from = this.drag.cell;
    this.drag = null;
    this.select(null);
    if (target !== null) this.onSwap(from, target);
  }

  pointerUp(event) {
    if (!this.drag) return;
    const cell = this.cellFromPoint(event) ?? this.drag.cell;
    this.drag = null;
    this.tap(cell);
  }

  tap(cell) {
    if (!this.enabled) return;
    if (this.selected === null) {
      this.select(cell);
    } else if (this.selected === cell) {
      this.select(null);
    } else if (this.adjacent(this.selected, cell)) {
      const from = this.selected;
      this.select(null);
      this.onSwap(from, cell);
    } else {
      this.select(cell);
    }
  }

  keyDown(event) {
    const cell = this.cellFromTarget(event.target);
    if (cell === null) return;
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (steps) {
      event.preventDefault();
      const target = this.neighbour(cell, steps[0], steps[1]);
      if (target === null) return;
      if (this.selected === cell && this.enabled) {
        this.select(null);
        this.moveFocus(target);
        this.onSwap(cell, target);
      } else {
        this.moveFocus(target);
      }
    } else if (event.key === "Escape") {
      this.select(null);
    }
  }

  // -------------------------------------------------------------- animation

  async animateSwap(a, b) {
    const first = this.tiles[a];
    const second = this.tiles[b];
    this.tiles[a] = second;
    this.tiles[b] = first;
    [this.kinds[a], this.kinds[b]] = [this.kinds[b], this.kinds[a]];
    const fromFirst = this.transformFor(a);
    const fromSecond = this.transformFor(b);
    first.style.transform = fromSecond;
    second.style.transform = fromFirst;
    if (!this.motion()) return;
    first.style.zIndex = "2";
    await Promise.all([
      finished(first.animate([{ transform: fromFirst }, { transform: fromSecond }], { duration: SWAP_MS, easing: "cubic-bezier(.3,.7,.3,1)" })),
      finished(second.animate([{ transform: fromSecond }, { transform: fromFirst }], { duration: SWAP_MS, easing: "cubic-bezier(.3,.7,.3,1)" }))
    ]);
    first.style.zIndex = "";
  }

  /** The two shapes try, find no match, and go back. */
  async playInvalid(a, b) {
    await this.animateSwap(a, b);
    await this.animateSwap(a, b);
    if (this.motion()) {
      this.tiles[a].animate([{ translate: "0 0" }, { translate: "3px 0" }, { translate: "-3px 0" }, { translate: "0 0" }], { duration: 150 });
    }
  }

  async animateBreak(step) {
    const motion = this.motion();
    const jobs = [];
    for (const cell of step.cleared) {
      const tile = this.tiles[cell];
      this.tiles[cell] = null;
      this.kinds[cell] = -1;
      if (!tile) continue;
      if (motion) {
        const base = tile.style.transform;
        this.burst(cell, SHAPES[Number(tile.dataset.kind)].colors.body);
        jobs.push(finished(tile.animate([
          { transform: `${base} scale(1)`, opacity: 1, filter: "brightness(1)" },
          { transform: `${base} scale(1.22)`, opacity: 1, filter: "brightness(1.7)", offset: 0.35 },
          { transform: `${base} scale(.12) rotate(24deg)`, opacity: 0, filter: "brightness(2)" }
        ], { duration: BREAK_MS, easing: "ease-in" })).then(() => tile.remove()));
      } else {
        jobs.push(finished(tile.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110 })).then(() => tile.remove()));
      }
    }
    await Promise.all(jobs);
  }

  async animateFall(step) {
    const motion = this.motion();
    const jobs = [];
    const drop = (tile, from, to, rows) => {
      tile.style.transform = to;
      if (!motion) return;
      const duration = FALL_BASE_MS + rows * FALL_PER_ROW_MS;
      jobs.push(finished(tile.animate([
        { transform: from, easing: "cubic-bezier(.42,0,.9,.55)" },
        { transform: to, offset: 0.82, easing: "ease-out" },
        { transform: `${to} translateY(-3.5%)`, offset: 0.91, easing: "ease-in" },
        { transform: to }
      ], { duration })));
    };
    // Lowest first, so a tile never lands on a slot before it has been vacated.
    for (const { from, to } of [...step.falls].sort((x, y) => y.to - x.to)) {
      const tile = this.tiles[from];
      this.tiles[to] = tile;
      this.tiles[from] = null;
      this.kinds[to] = this.kinds[from];
      this.kinds[from] = -1;
      drop(tile, this.transformFor(from), this.transformFor(to), Math.round((to - from) / this.config.cols));
    }
    for (const { to, kind, drop: rows } of step.spawns) {
      const tile = this.makeTile(kind);
      this.tiles[to] = tile;
      this.kinds[to] = kind;
      const [x, y] = this.point(to);
      const from = `translate3d(${x}px, ${y - rows * this.cellSize}px, 0)`;
      if (!motion) tile.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      drop(tile, from, this.transformFor(to), rows);
    }
    await Promise.all(jobs);
  }

  async animateReshuffle(boardText) {
    if (this.motion()) {
      await Promise.all(this.tiles.map((tile) => tile && finished(tile.animate([
        { transform: tile.style.transform, opacity: 1 },
        { transform: `${tile.style.transform} scale(.2) rotate(-90deg)`, opacity: 0 }
      ], { duration: 240, easing: "ease-in", fill: "forwards" }))));
    }
    this.setBoard(boardText);
    if (this.motion()) {
      await Promise.all(this.tiles.map((tile, cell) => finished(tile.animate([
        { transform: `${tile.style.transform} scale(.2) rotate(90deg)`, opacity: 0 },
        { transform: tile.style.transform, opacity: 1 }
      ], { duration: 240, delay: (cell % this.config.cols) * 12, easing: "ease-out", fill: "backwards" }))));
    }
  }

  /** The whole move, step by step. `onStep` fires as each step breaks. */
  async playMove(a, b, result, { onStep } = {}) {
    await this.animateSwap(a, b);
    for (const step of result.steps) {
      onStep?.(step);
      await this.animateBreak(step);
      await this.animateFall(step);
      await nextFrame();
    }
    if (result.reshuffled) await this.animateReshuffle(result.reshuffled);
    this.refreshLabels();
  }

  /** "+3" rising from where a match happened. */
  floatCoins(group) {
    if (!this.motion()) return;
    const count = group.cells.length;
    const x = group.cells.reduce((sum, cell) => sum + this.point(cell)[0], 0) / count + this.cellSize / 2;
    const y = group.cells.reduce((sum, cell) => sum + this.point(cell)[1], 0) / count + this.cellSize / 2;
    const note = h("div", { class: "float-coins", text: `+${group.coins}` });
    note.style.transform = `translate(${x}px, ${y}px)`;
    this.floatLayer.append(note);
    note.animate([
      { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(.7)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - this.cellSize * 0.3}px) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${x}px, ${y - this.cellSize * 1.1}px) translate(-50%, -50%) scale(1)`, opacity: 0 }
    ], { duration: 620, easing: "ease-out" });
    setTimeout(() => note.remove(), 700);
  }

  // -------------------------------------------------------------- particles

  burst(cell, color) {
    if (this.particles.length >= MAX_PARTICLES) return;
    const [x, y] = this.point(cell);
    const cx = (x + this.cellSize / 2) * this.fxRatio;
    const cy = (y + this.cellSize / 2) * this.fxRatio;
    for (let index = 0; index < SHARDS_PER_TILE; index += 1) {
      const angle = (index / SHARDS_PER_TILE) * Math.PI * 2 + Math.random() * 0.8;
      const speed = (1.7 + Math.random() * 2.2) * this.fxRatio;
      this.particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.2, life: 1, size: (3 + Math.random() * 3.5) * this.fxRatio, color });
    }
    if (!this.particleLoop) this.particleLoop = requestAnimationFrame(() => this.drawParticles());
  }

  drawParticles() {
    const context = this.fxCanvas.getContext("2d");
    context.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const particle of this.particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.16 * this.fxRatio;
      particle.life -= 0.05;
      context.globalAlpha = Math.max(particle.life, 0);
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;
    this.particleLoop = this.particles.length ? requestAnimationFrame(() => this.drawParticles()) : 0;
    if (!this.particles.length) context.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
  }
}
