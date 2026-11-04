// Tiny DOM builders. Every piece of text goes through textContent / text
// nodes, so a display name a student typed can never become markup.

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
  pause: ["M8 5v14M16 5v14"],
  next: ["M5 5v14l9-7Z", "M18 5v14"],
  stop: ["M6 6h12v12H6Z"],
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
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"],
  chevron: ["m6 9 6 6 6-6"],
  home: ["m3 11 9-8 9 8M5 10v10h14V10"],
  trophy: ["M8 4h8v5a4 4 0 0 1-8 0V4Z", "M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4", "M12 13v4M8 20h8"],
  expand: ["M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"],
  info: ["M12 8h.01M11 12h1v5h1", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"],
  wifi: ["M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0", "M12 19.5h.01"]
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
