// Tiny DOM builders. Every piece of text goes through textContent / text
// nodes, so player-typed names can never become markup.

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

/** Decorative inline icons (static geometry only). */
export function icon(name) {
  const svg = s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", class: `icon icon-${name}` });
  const paths = {
    back: ["M15 5 8 12l7 7"],
    robot: ["M8 4h8M12 4v3", "M6 8h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z", "M9 13h.01M15 13h.01M9.5 16.5h5"],
    teams: ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M3 19c.6-3 2.6-5 5-5s4.4 2 5 5M11 19c.6-3 2.6-5 5-5s4.4 2 5 5"],
    online: ["M7 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M10 18h.01", "M18 8a4 4 0 0 1 0 6M20.5 5.5a8 8 0 0 1 0 11"],
    music: ["M9 18V6l10-2v12", "M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"],
    sound: ["M5 10v4h4l5 4V6l-5 4H5Z", "M17 9a4 4 0 0 1 0 6"],
    expand: ["M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"],
    backspace: ["M9 5h11v14H9l-6-7 6-7Z", "m12 9 5 6M17 9l-5 6"],
    check: ["m5 12 5 5 9-10"],
    wave: ["M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0", "M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"],
    star: ["m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7Z"],
    signal: ["M4 18h.01M8 18v-3M12 18v-6M16 18V9M20 18V6"],
    home: ["m3 11 9-8 9 8M5 10v10h14V10"]
  }[name] ?? [];
  for (const d of paths) svg.append(s("path", { d }));
  return svg;
}
