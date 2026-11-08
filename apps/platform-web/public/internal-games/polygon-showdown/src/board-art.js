// Polygon Showdown tile artwork: original MathNexa shapes drawn from the
// geometry in engine/shapes.js as small SVG images. Each one has a dark rim, a
// bevelled body and a bright face, so a shape reads by its outline first and
// its colour second. Decoded once per shape and then only moved around.

import { SHAPES } from "./engine/shapes.js";

const RIM_WIDTH = 5;

function outline(geometry, attributes) {
  if (geometry.type === "circle") return `<circle cx="${geometry.cx}" cy="${geometry.cy}" r="${geometry.r}" ${attributes}/>`;
  if (geometry.type === "rect") return `<rect x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" rx="${geometry.rx}" ${attributes}/>`;
  return `<polygon points="${geometry.points.map(([x, y]) => `${x},${y}`).join(" ")}" stroke-linejoin="round" ${attributes}/>`;
}

function centroid(geometry) {
  if (geometry.type !== "polygon") return [50, 50];
  const count = geometry.points.length;
  return [geometry.points.reduce((sum, [x]) => sum + x, 0) / count, geometry.points.reduce((sum, [, y]) => sum + y, 0) / count];
}

/** The same outline shrunk toward its centre: the raised face of the tile. */
function inset(geometry, factor) {
  if (geometry.type === "circle") return { ...geometry, r: geometry.r * factor };
  if (geometry.type === "rect") {
    const pad = Math.min(geometry.width, geometry.height) * (1 - factor) * 0.5;
    return { type: "rect", x: geometry.x + pad, y: geometry.y + pad, width: geometry.width - pad * 2, height: geometry.height - pad * 2, rx: Math.max(2, geometry.rx - pad * 0.45) };
  }
  const [cx, cy] = centroid(geometry);
  return { type: "polygon", points: geometry.points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]) };
}

/** A soft diagonal glint across the top of the face. */
function glint(geometry) {
  if (geometry.type === "circle") return `<ellipse cx="42" cy="33" rx="17" ry="10" transform="rotate(-24 42 33)" fill="#fff" opacity=".55"/>`;
  if (geometry.type === "rect") {
    const x = geometry.x + geometry.width * 0.16;
    const y = geometry.y + geometry.height * 0.15;
    return `<rect x="${x}" y="${y}" width="${geometry.width * 0.5}" height="${Math.max(5, geometry.height * 0.14)}" rx="3" fill="#fff" opacity=".55"/>`;
  }
  const [cx, cy] = centroid(geometry);
  return `<ellipse cx="${cx - 9}" cy="${cy - 15}" rx="11" ry="5" transform="rotate(-22 ${cx - 9} ${cy - 15})" fill="#fff" opacity=".5"/>`;
}

/** The whole tile as SVG text. Exported so tests can read what is drawn. */
export function shapeSvg(kind) {
  const entry = SHAPES[kind];
  const { geometry, colors, key } = entry;
  const face = inset(geometry, 0.78);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 108" data-shape="${key}"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors.body}"/><stop offset="1" stop-color="${colors.rim}"/></linearGradient><linearGradient id="f" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${colors.face}"/><stop offset="1" stop-color="${colors.body}"/></linearGradient></defs>${outline(geometry, `fill="#04101f" opacity=".42" transform="translate(0 4)"`)}${outline(geometry, `fill="url(#b)" stroke="${colors.rim}" stroke-width="${RIM_WIDTH}"`)}${outline(face, `fill="url(#f)"`)}${glint(face)}</svg>`;
}

const cache = new Map();

export function shapeImageUrl(kind) {
  if (!cache.has(kind)) cache.set(kind, `data:image/svg+xml,${encodeURIComponent(shapeSvg(kind))}`);
  return cache.get(kind);
}

/** The game's virtual coin, as markup-free SVG for <img>. */
export const COIN_IMAGE_URL = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset="1" stop-color="#F0A81E"/></linearGradient></defs><polygon points="24,2 43,13 43,35 24,46 5,35 5,13" fill="#A86A00"/><polygon points="24,6 39.5,15 39.5,33 24,42 8.5,33 8.5,15" fill="url(#c)"/><polygon points="24,14 33,30 15,30" fill="#B87800" opacity=".85"/></svg>`)}`;
