// Tiny DOM builders. Every piece of text goes through textContent / text
// nodes, so a name somebody typed can never become markup.

const SVG_NS = "http://www.w3.org/2000/svg";

function apply(element, attributes) {
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "class") element.setAttribute("class", value);
    else if (name === "text") element.textContent = value;
    else if (name === "dataset") Object.assign(element.dataset, value);
    else if (name.startsWith("on") && typeof value === "function") element.addEventListener(name.slice(2), value);
    else element.setAttribute(name, value === true ? "" : String(value));
  }
}

function append(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
}

export function h(tag, attributes, ...children) {
  const element = document.createElement(tag);
  apply(element, attributes);
  append(element, children);
  return element;
}

export function s(tag, attributes, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  apply(element, attributes);
  append(element, children);
  return element;
}

export function clear(element) {
  while (element.firstChild) element.firstChild.remove();
  return element;
}

/** Replace an element's children in one step. */
export function fill(element, ...children) {
  clear(element);
  append(element, children);
  return element;
}

const ICONS = Object.freeze({
  play: ["M8 5v14l11-7Z"],
  music: ["M9 18V6l10-2v12", "M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"],
  sound: ["M5 10v4h4l5 4V6l-5 4H5Z", "M17 9a4 4 0 0 1 0 6"],
  mute: ["M5 10v4h4l5 4V6l-5 4H5Z", "m17 9 4 6M21 9l-4 6"],
  users: ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M3 19c.6-3 2.6-5 5-5s4.4 2 5 5M11 19c.6-3 2.6-5 5-5s4.4 2 5 5"],
  lock: ["M7 11V8a5 5 0 0 1 10 0v3", "M5 11h14v9H5Z"],
  unlock: ["M7 11V8a5 5 0 0 1 9.6-2", "M5 11h14v9H5Z"],
  check: ["m5 12 5 5 9-10"],
  close: ["m6 6 12 12M18 6 6 18"],
  star: ["m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7Z"],
  refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 5v6h-6"],
  home: ["m3 11 9-8 9 8M5 10v10h14V10"],
  back: ["m14 6-6 6 6 6"],
  trophy: ["M8 4h8v5a4 4 0 0 1-8 0V4Z", "M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4", "M12 13v4M8 20h8"],
  expand: ["M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"],
  info: ["M12 8h.01M11 12h1v5h1", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"],
  board: ["M3 5h18v12H3Z", "M12 5v12M8 21h8M12 17v4"],
  car: ["M4 16v-3l2-5h12l2 5v3", "M4 16h16v2H4ZM7 13h.01M17 13h.01"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"],
  garage: ["M3 10 12 4l9 6v10H3Z", "M7 20v-7h10v7M7 16h10"],
  chart: ["M4 20V4M4 20h16", "M8 16v-4M12 16V8M16 16v-6"],
  flag: ["M5 21V4", "M5 4h13l-3 4 3 4H5"],
  coin: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6M12 6.5v11"],
  bolt: ["M13 3 5 14h6l-1 7 8-11h-6Z"]
});

/** Decorative inline icons (static geometry only). */
export function icon(name, extraClass = "") {
  const svg = s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", class: `icon icon-${name} ${extraClass}`.trim() });
  for (const d of ICONS[name] ?? []) svg.append(s("path", { d }));
  return svg;
}

export function announce(message, { assertive = false } = {}) {
  const region = document.getElementById(assertive ? "alert-announcer" : "announcer");
  if (!region) return;
  // Clearing first makes screen readers repeat an identical message.
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = message;
  }, 40);
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Activate on pointerdown, so two teams on one touchscreen can press at the
 * same instant (a second finger does not reliably produce "click"). Keyboard
 * activation still arrives as a click with no pointer before it.
 */
export function pressable(button, onPress) {
  let pointerAt = -Infinity;
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
    if (button.disabled) return;
    onPress(event);
  });
  return button;
}

/** Run `step(progress 0..1)` for `durationMs`; always ends, even in a background tab. */
export function animate(durationMs, step, done) {
  const startedAt = performance.now();
  let finished = false;
  let frame = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clearTimeout(guard);
    step(1);
    done?.();
  };
  // requestAnimationFrame stops in a hidden tab; the timer guarantees the end state.
  const guard = setTimeout(finish, durationMs + 80);
  const tick = now => {
    if (finished) return;
    const progress = Math.min(1, (now - startedAt) / durationMs);
    if (progress >= 1) return finish();
    step(progress);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return finish;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
