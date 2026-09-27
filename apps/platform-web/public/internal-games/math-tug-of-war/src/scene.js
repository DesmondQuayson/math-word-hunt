// The tug-of-war scene: original MathNexa competitors, a real rope, a centre
// ribbon, a centre line and two victory lines. Pure SVG + Web Animations on
// transforms/opacity only. Nothing here decides game state; it animates the
// rope position it is given.

import { s } from "./dom.js";
import { TUG_LIMIT } from "./tug.js";

const STEP = 40; // world units per pull; 5 pulls = the ribbon reaches a victory line
const GROUND_Y = 330;
const ROPE_Y = 222;
const CENTER_X = 500;
const FRONT_OFFSET = 100;
const SPACING = 75;
const DEFAULT_ASPECT = 1000 / 310;
const MIN_ASPECT = 740 / 420;
const SKIN = ["#8d5a3b", "#f1c9a5", "#c58c62"];
const TEAM_STYLE = Object.freeze({
  turquoise: Object.freeze({ jersey: "#0fb5c6", dark: "#087f8c", band: "#06606a" }),
  pink: Object.freeze({ jersey: "#ff4f9a", dark: "#c01d67", band: "#8f0f4b" })
});

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function emblem(team) {
  // Team identity never relies on colour alone: wave vs star.
  return team === "turquoise"
    ? s("path", { d: "M-19,-30 q4,-4 8,0 t8,0 M-19,-22 q4,-4 8,0 t8,0", fill: "none", stroke: "#fff", "stroke-width": 2.6, "stroke-linecap": "round" })
    : s("path", { d: "M-11,-36 l2.6,5.4 6,.8 -4.4,4.1 1.1,5.9 -5.3,-2.8 -5.3,2.8 1.1,-5.9 -4.4,-4.1 6,-.8Z", fill: "#fff" });
}

function competitor(team, index) {
  const style = TEAM_STYLE[team];
  const skin = SKIN[(index + (team === "pink" ? 1 : 0)) % SKIN.length];
  const direction = team === "turquoise" ? -1 : 1;
  const x = CENTER_X + direction * (FRONT_OFFSET + index * SPACING);
  const mirror = team === "pink" ? " scale(-1,1)" : "";
  const arms = s("g", { class: "arms" },
    s("path", { d: "M2,3 L20,11 L34,5", fill: "none", stroke: skin, "stroke-width": 8.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    s("path", { d: "M0,0 L26,6 L52,4", fill: "none", stroke: skin, "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    s("circle", { cx: 34, cy: 5, r: 6.4, fill: skin, stroke: "rgba(0,0,0,.25)", "stroke-width": 1.2 }),
    s("circle", { cx: 52, cy: 4, r: 6.6, fill: skin, stroke: "rgba(0,0,0,.25)", "stroke-width": 1.2 })
  );
  const upper = s("g", { class: "upper" },
    s("path", { d: "M0,0 L-20,-52", stroke: style.jersey, "stroke-width": 29, "stroke-linecap": "round" }),
    s("path", { d: "M2,-2 L-4,-18", stroke: style.dark, "stroke-width": 26, "stroke-linecap": "round", opacity: 0.9 }),
    emblem(team),
    s("circle", { cx: -28, cy: -79, r: 17, fill: skin }),
    s("path", { d: "M-45,-84 Q-28,-101 -11,-84", fill: "none", stroke: style.band, "stroke-width": 7, "stroke-linecap": "round" }),
    s("circle", { cx: -18.5, cy: -80, r: 2.3, fill: "#17223b" }),
    s("path", { class: "effort", d: "M-21,-70 L-13,-71.5", stroke: "#17223b", "stroke-width": 2.2, "stroke-linecap": "round" }),
    s("g", { transform: "translate(-20,-50)" }, arms)
  );
  return s("g", { class: `competitor team-${team}`, transform: `translate(${x},${GROUND_Y})${mirror}`, "data-index": index },
    s("g", { class: "body" },
      s("ellipse", { cx: -6, cy: 3, rx: 36, ry: 6, fill: "rgba(12,40,30,.22)" }),
      s("g", { class: "legs" },
        s("path", { d: "M-14,-62 L-26,-31 L-34,-3", fill: "none", stroke: "#1d2a4d", "stroke-width": 11.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
        s("path", { d: "M-11,-62 L6,-34 L20,-3", fill: "none", stroke: "#26345c", "stroke-width": 11.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
        s("ellipse", { cx: -38, cy: 0, rx: 12, ry: 5.2, fill: style.band }),
        s("ellipse", { cx: 24, cy: 0, rx: 12, ry: 5.2, fill: style.band })
      ),
      s("g", { transform: "translate(-13,-62)" }, upper)
    )
  );
}

function dust(team) {
  const direction = team === "turquoise" ? -1 : 1;
  const x = CENTER_X + direction * FRONT_OFFSET;
  return s("g", { class: `dust dust-${team}`, opacity: 0 },
    s("circle", { cx: x - 14, cy: GROUND_Y - 4, r: 7, fill: "#d9c9a3" }),
    s("circle", { cx: x - 2, cy: GROUND_Y - 9, r: 9, fill: "#e6d8b6" }),
    s("circle", { cx: x + 12, cy: GROUND_Y - 3, r: 6, fill: "#d9c9a3" })
  );
}

function effortLines(team) {
  const direction = team === "turquoise" ? -1 : 1;
  const x = CENTER_X + direction * (FRONT_OFFSET + 2 * SPACING + 70);
  const lines = [0, 1, 2].map(index => s("path", {
    d: `M${x},${ROPE_Y - 34 + index * 22} l${direction * 34},0`,
    stroke: "#ffffff", "stroke-width": 5, "stroke-linecap": "round"
  }));
  return s("g", { class: `effort-lines effort-${team}`, opacity: 0 }, lines);
}

function victoryLine(team) {
  const direction = team === "turquoise" ? -1 : 1;
  const x = CENTER_X + direction * TUG_LIMIT * STEP;
  const color = TEAM_STYLE[team].dark;
  // A ground flag at the foot of the line: team colour plus the team mark,
  // so the line is identifiable without colour.
  const flagX = x + direction * 4;
  const flag = s("path", {
    d: team === "turquoise" ? `M${flagX},372 l-40,11 l40,11Z` : `M${flagX},372 l40,11 l-40,11Z`,
    fill: color, stroke: "#fff", "stroke-width": 2
  });
  const markX = x + direction * 20;
  const mark = team === "turquoise"
    ? s("path", { d: `M${markX - 7},384 q3.5,-3 7,0 t7,0`, fill: "none", stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round" })
    : s("path", { d: `M${markX},377 l1.9,4 4.3,.5 -3.2,3 .8,4.2 -3.8,-2.1 -3.8,2.1 .8,-4.2 -3.2,-3 4.3,-.5Z`, fill: "#fff" });
  return s("g", { class: `victory-line line-${team}` },
    s("path", { d: `M${x},300 L${x},420`, stroke: color, "stroke-width": 6, "stroke-dasharray": "14 9" }),
    s("path", { d: `M${x},362 L${x},406`, stroke: "#2c3a52", "stroke-width": 3.5, "stroke-linecap": "round" }),
    flag,
    mark
  );
}

function backdrop() {
  const stripes = [];
  for (let x = -40; x < 1040; x += 80) stripes.push(s("rect", { x, y: 300, width: 40, height: 120, fill: "#ffffff", opacity: 0.07 }));
  const seats = [];
  for (let row = 0; row < 4; row += 1) {
    seats.push(s("rect", { x: 0, y: 150 + row * 26, width: 1000, height: 18, rx: 4, fill: row % 2 ? "#cfe3f6" : "#dbeafa" }));
  }
  const crowd = [];
  for (let index = 0; index < 34; index += 1) {
    const x = 18 + index * 29.5 + (index % 3) * 4;
    const y = 162 + (index % 4) * 26;
    const color = index % 2 ? "#9fd9e0" : "#f7b4d2";
    crowd.push(s("circle", { cx: x, cy: y - 6, r: 6.5, fill: color, opacity: 0.8 }));
  }
  return s("g", { class: "backdrop", "aria-hidden": "true" },
    s("rect", { x: 0, y: 0, width: 1000, height: 300, fill: "url(#tug-sky)" }),
    s("g", { opacity: 0.8 }, seats),
    s("g", {}, crowd),
    s("rect", { x: 0, y: 238, width: 1000, height: 62, fill: "#e9f3fc" }),
    s("rect", { x: 0, y: 296, width: 1000, height: 6, fill: "#3c8f45" }),
    s("rect", { x: 0, y: 300, width: 1000, height: 120, fill: "url(#tug-grass)" }),
    s("g", {}, stripes),
    s("path", { d: `M${CENTER_X},300 L${CENTER_X},420`, stroke: "#ffffff", "stroke-width": 6 }),
    s("circle", { cx: CENTER_X, cy: 306, r: 6, fill: "#ffffff" })
  );
}

function rope() {
  const slack = `M215,${ROPE_Y} Q500,${ROPE_Y + 16} 785,${ROPE_Y}`;
  const taut = `M215,${ROPE_Y} L785,${ROPE_Y}`;
  const strand = (d, cls) => s("g", { class: cls },
    s("path", { d, fill: "none", stroke: "#9c7443", "stroke-width": 11, "stroke-linecap": "round" }),
    s("path", { d, fill: "none", stroke: "#d6ae72", "stroke-width": 7, "stroke-linecap": "round" }),
    s("path", { d, fill: "none", stroke: "#a67c47", "stroke-width": 7, "stroke-dasharray": "3 7", "stroke-linecap": "butt" })
  );
  return s("g", { class: "rope" },
    s("path", { d: `M215,${ROPE_Y} Q188,${ROPE_Y + 12} 194,${ROPE_Y + 76}`, fill: "none", stroke: "#b58b54", "stroke-width": 9, "stroke-linecap": "round" }),
    s("path", { d: `M785,${ROPE_Y} Q812,${ROPE_Y + 12} 806,${ROPE_Y + 76}`, fill: "none", stroke: "#b58b54", "stroke-width": 9, "stroke-linecap": "round" }),
    strand(slack, "rope-slack"),
    strand(taut, "rope-taut")
  );
}

function ribbon() {
  return s("g", { class: "ribbon" },
    s("path", { d: `M${CENTER_X},${ROPE_Y} l-11,40 l11,-9 l11,9Z`, fill: "#f3a712", stroke: "#b87605", "stroke-width": 2, "stroke-linejoin": "round" }),
    s("circle", { cx: CENTER_X, cy: ROPE_Y, r: 8.5, fill: "#f3a712", stroke: "#b87605", "stroke-width": 2.5 })
  );
}

function confettiLayer() {
  const pieces = [];
  const colors = ["#0fb5c6", "#ff4f9a", "#f3a712", "#5b6cff", "#ffffff"];
  for (let index = 0; index < 28; index += 1) {
    const x = 60 + ((index * 331) % 880);
    pieces.push(s("rect", {
      class: "confetti-piece",
      x, y: 90 - (index % 5) * 14, width: 9, height: 15, rx: 2,
      fill: colors[index % colors.length], opacity: 0
    }));
  }
  return s("g", { class: "confetti", "aria-hidden": "true" }, pieces);
}

export function createScene() {
  const world = s("g", { class: "world" },
    rope(),
    [0, 1, 2].map(index => competitor("turquoise", index)),
    [0, 1, 2].map(index => competitor("pink", index)),
    ribbon(),
    dust("turquoise"), dust("pink"),
    effortLines("turquoise"), effortLines("pink")
  );
  const title = s("title", { id: "tug-scene-title" });
  const svg = s("svg", {
    class: "tug-scene-svg",
    viewBox: "0 110 1000 310",
    role: "img",
    "aria-labelledby": "tug-scene-title",
    preserveAspectRatio: "xMidYMid meet"
  },
  title,
  s("defs", {},
    s("linearGradient", { id: "tug-sky", x1: 0, y1: 0, x2: 0, y2: 1 },
      s("stop", { offset: "0", "stop-color": "#bfe6ff" }),
      s("stop", { offset: "1", "stop-color": "#eef8ff" })),
    s("linearGradient", { id: "tug-grass", x1: 0, y1: 0, x2: 0, y2: 1 },
      s("stop", { offset: "0", "stop-color": "#6cc35e" }),
      s("stop", { offset: "1", "stop-color": "#3f9a47" }))
  ),
  backdrop(),
  victoryLine("turquoise"),
  victoryLine("pink"),
  world,
  confettiLayer());

  let position = 0;
  let queue = Promise.resolve();
  let pending = 0;
  const animations = new Set();

  const track = animation => {
    if (!animation) return null;
    animations.add(animation);
    const done = () => animations.delete(animation);
    animation.finished.then(done, done);
    return animation;
  };
  const animate = (element, keyframes, options) => {
    if (typeof element.animate !== "function") return null;
    try {
      return track(element.animate(keyframes, options));
    } catch {
      return null;
    }
  };
  const team = name => [...world.querySelectorAll(`.team-${name}`)];

  const place = value => {
    world.style.transform = `translate(${value * STEP}px, 0px)`;
    svg.dataset.position = String(value);
  };

  const setTaut = taut => {
    svg.classList.toggle("is-taut", taut);
  };

  const describe = text => {
    title.textContent = text;
  };

  function runPull(pullingTeam, nextPosition, fast) {
    const previous = position;
    position = nextPosition;
    svg.dataset.lastPull = pullingTeam;
    const reduced = prefersReducedMotion();
    if (reduced || typeof world.animate !== "function") {
      place(nextPosition);
      svg.classList.remove("pulled-turquoise", "pulled-pink");
      void svg.getBoundingClientRect();
      svg.classList.add(`pulled-${pullingTeam}`);
      return Promise.resolve();
    }
    const duration = fast ? 360 : 680;
    const losingTeam = pullingTeam === "turquoise" ? "pink" : "turquoise";
    setTaut(true);
    // 1-2. Winners brace and lean back; 3-4. rope tightens and they pull.
    team(pullingTeam).forEach((figure, index) => {
      animate(figure.querySelector(".upper"), [
        { transform: "rotate(0deg)" },
        { transform: "rotate(-11deg)", offset: 0.35 },
        { transform: "rotate(-7deg)", offset: 0.7 },
        { transform: "rotate(0deg)" }
      ], { duration, delay: index * 30, easing: "ease-out" });
      animate(figure.querySelector(".legs"), [
        { transform: "translate(0px,0px)" },
        { transform: "translate(-9px,0px)", offset: 0.45 },
        { transform: "translate(0px,0px)" }
      ], { duration, delay: index * 30, easing: "ease-in-out" });
    });
    // 5. The losing side jerks forward and its feet slide.
    team(losingTeam).forEach((figure, index) => {
      animate(figure.querySelector(".upper"), [
        { transform: "rotate(0deg)" },
        { transform: "rotate(12deg)", offset: 0.4 },
        { transform: "rotate(4deg)", offset: 0.75 },
        { transform: "rotate(0deg)" }
      ], { duration, delay: 60 + index * 30, easing: "ease-out" });
    });
    animate(world.querySelector(`.dust-${losingTeam}`), [
      { opacity: 0, transform: "translate(0px,0px) scale(.6)" },
      { opacity: 0.9, transform: `translate(${pullingTeam === "turquoise" ? -6 : 6}px,-6px) scale(1)`, offset: 0.4 },
      { opacity: 0, transform: `translate(${pullingTeam === "turquoise" ? -14 : 14}px,-10px) scale(1.2)` }
    ], { duration: duration + 120, delay: 120, easing: "ease-out" });
    animate(world.querySelector(`.effort-${pullingTeam}`), [
      { opacity: 0 }, { opacity: 0.85, offset: 0.3 }, { opacity: 0 }
    ], { duration, easing: "ease-out" });
    // 6-7. Marker and whole tug move, with a small recoil before settling.
    const from = previous * STEP;
    const to = nextPosition * STEP;
    const overshoot = to + (to - from) * 0.12;
    place(nextPosition);
    const moving = animate(world, [
      { transform: `translate(${from}px, 0px)` },
      { transform: `translate(${from + (to - from) * 0.15}px, 0px)`, offset: 0.25 },
      { transform: `translate(${overshoot}px, 0px)`, offset: 0.72 },
      { transform: `translate(${to}px, 0px)` }
    ], { duration, easing: "cubic-bezier(.3,.1,.3,1)" });
    const settle = moving ? moving.finished.catch(() => undefined) : Promise.resolve();
    return settle.then(() => setTaut(false));
  }

  function celebrate(winner) {
    svg.classList.add("is-won", `won-${winner}`);
    const loser = winner === "turquoise" ? "pink" : "turquoise";
    team(loser).forEach(figure => figure.classList.add("is-down"));
    team(winner).forEach(figure => figure.classList.add("is-cheering"));
    if (prefersReducedMotion()) return;
    [...svg.querySelectorAll(".confetti-piece")].forEach((piece, index) => {
      const drift = (index % 2 ? 1 : -1) * (18 + (index % 7) * 6);
      animate(piece, [
        { opacity: 0, transform: "translate(0px,0px) rotate(0deg)" },
        { opacity: 1, transform: `translate(${drift * 0.3}px,80px) rotate(90deg)`, offset: 0.15 },
        { opacity: 1, transform: `translate(${drift}px,250px) rotate(260deg)`, offset: 0.85 },
        { opacity: 0, transform: `translate(${drift * 1.1}px,300px) rotate(300deg)` }
      ], { duration: 2200 + (index % 6) * 160, delay: (index % 9) * 70, easing: "ease-in", fill: "forwards" });
    });
  }

  function reset() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    queue = Promise.resolve();
    pending = 0;
    position = 0;
    svg.classList.remove("is-won", "won-turquoise", "won-pink", "pulled-turquoise", "pulled-pink", "is-taut");
    world.querySelectorAll(".competitor").forEach(figure => figure.classList.remove("is-down", "is-cheering"));
    place(0);
  }

  place(0);

  /**
   * Frame the scene for the space it has. Wide/short boxes show the whole
   * field; taller boxes zoom in on the rope (x 130-870 keeps both victory
   * lines in view) so the competitors grow on classroom boards.
   */
  function fit(availableWidth, availableHeight) {
    let aspect = availableHeight > 0 ? availableWidth / availableHeight : DEFAULT_ASPECT;
    aspect = Math.max(MIN_ASPECT, Math.min(DEFAULT_ASPECT, aspect));
    let width = 1000;
    let height = 1000 / aspect;
    if (height > 420) {
      height = 420;
      width = 420 * aspect;
    }
    const x = 500 - width / 2;
    svg.setAttribute("viewBox", `${x.toFixed(1)} ${(420 - height).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`);
    svg.style.aspectRatio = `${width.toFixed(1)} / ${height.toFixed(1)}`;
  }

  return Object.freeze({
    element: svg,
    describe,
    fit,
    get position() {
      return position;
    },
    /** Jump without animation (joining a match in progress, reconnecting). */
    set(value) {
      position = Math.max(-TUG_LIMIT, Math.min(TUG_LIMIT, value));
      place(position);
    },
    /** Queue one pull; rapid pulls animate faster so play never waits. */
    pull(pullingTeam, nextPosition) {
      pending += 1;
      const fast = pending > 1;
      queue = queue.then(() => runPull(pullingTeam, nextPosition, fast)).finally(() => { pending -= 1; });
      return queue;
    },
    settled() {
      return queue;
    },
    celebrate,
    reset
  });
}
