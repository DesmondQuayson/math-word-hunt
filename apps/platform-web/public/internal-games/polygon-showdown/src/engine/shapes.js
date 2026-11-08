// Polygon Showdown shape registry.
//
// One entry per shape, stable by position: a board stores the index of each
// shape, so an entry may be added at the end but never moved. The match engine
// only ever compares these indexes, which is why a future shape (Pentagon,
// Hexagon, Rhombus, Trapezoid, Octagon are already drawn here) is one line in
// ACTIVE_SHAPES and not a change to the engine.
//
// Geometry is primary: every shape is identified by its outline, in a 100 x 100
// box, and never by its colour alone. Original MathNexa artwork, drawn from
// these numbers by board-view.js.

const circle = (r) => Object.freeze({ type: "circle", cx: 50, cy: 50, r });
const rect = (width, height, rx) => Object.freeze({ type: "rect", x: 50 - width / 2, y: 50 - height / 2, width, height, rx });
const polygon = (...points) => Object.freeze({ type: "polygon", points: Object.freeze(points.map((point) => Object.freeze(point))) });

function shape(key, label, sides, geometry, colors) {
  return Object.freeze({ key, label, sides, geometry, colors: Object.freeze(colors) });
}

export const SHAPES = Object.freeze([
  shape("circle", "Circle", 0, circle(41), { face: "#7CEBF7", body: "#20CFE3", rim: "#0A6F80" }),
  shape("triangle", "Triangle", 3, polygon([50, 8], [94, 86], [6, 86]), { face: "#FFE08A", body: "#FFB627", rim: "#9A5A00" }),
  shape("square", "Square", 4, rect(70, 70, 9), { face: "#FF9CC6", body: "#FF4F9A", rim: "#99144F" }),
  // Unmistakably not a square: 90 wide and 44 tall, about two to one.
  shape("rectangle", "Rectangle", 4, rect(90, 44, 8), { face: "#C9B8FF", body: "#8F6BFF", rim: "#4A28B8" }),
  shape("pentagon", "Pentagon", 5, polygon([50, 7], [93, 39], [77, 90], [23, 90], [7, 39]), { face: "#A8F0C0", body: "#3DD979", rim: "#137A3C" }),
  shape("hexagon", "Hexagon", 6, polygon([27, 10], [73, 10], [96, 50], [73, 90], [27, 90], [4, 50]), { face: "#FFC3A8", body: "#FF7F50", rim: "#A23E13" }),
  shape("rhombus", "Rhombus", 4, polygon([50, 5], [90, 50], [50, 95], [10, 50]), { face: "#B9E2FF", body: "#4DA8FF", rim: "#14589E" }),
  shape("trapezoid", "Trapezoid", 4, polygon([26, 18], [74, 18], [96, 82], [4, 82]), { face: "#E9F7A2", body: "#BCE02F", rim: "#667C07" }),
  shape("octagon", "Octagon", 8, polygon([33, 7], [67, 7], [93, 33], [93, 67], [67, 93], [33, 93], [7, 67], [7, 33]), { face: "#F4B8FF", body: "#D66BEA", rim: "#7B2290" })
]);

export const SHAPE_INDEX = Object.freeze(Object.fromEntries(SHAPES.map((entry, index) => [entry.key, index])));

/** The shapes a V1 board deals, as registry indexes. */
export const ACTIVE_SHAPES = Object.freeze([SHAPE_INDEX.circle, SHAPE_INDEX.triangle, SHAPE_INDEX.square, SHAPE_INDEX.rectangle]);

export function shapeLabel(kind) {
  return SHAPES[kind]?.label ?? "Empty";
}

/** How much longer the long side is than the short side, 1 for a square. */
export function aspectRatio(geometry) {
  if (geometry.type !== "rect") return 1;
  return Math.max(geometry.width, geometry.height) / Math.min(geometry.width, geometry.height);
}

function polygonIsRegularQuadCorners(points) {
  const n = points.length;
  return points.every((point, index) => {
    const [ax, ay] = points[(index + n - 1) % n];
    const [bx, by] = point;
    const [cx, cy] = points[(index + 1) % n];
    const dot = (ax - bx) * (cx - bx) + (ay - by) * (cy - by);
    return Math.abs(dot) < 1e-6;
  });
}

/**
 * Names a shape from its outline alone (never from its key or colour), so a
 * test can prove that what is drawn is what the board says it is.
 */
export function classifyGeometry(geometry) {
  if (geometry.type === "circle") return "circle";
  if (geometry.type === "rect") return aspectRatio(geometry) === 1 ? "square" : aspectRatio(geometry) >= 1.6 ? "rectangle" : "ambiguous";
  const points = geometry.points;
  if (points.length === 3) return "triangle";
  if (points.length === 5) return "pentagon";
  if (points.length === 6) return "hexagon";
  if (points.length === 8) return "octagon";
  if (points.length === 4) {
    if (polygonIsRegularQuadCorners(points)) return "rectangle";
    const sides = points.map(([x, y], index) => {
      const [nx, ny] = points[(index + 1) % 4];
      return Math.hypot(nx - x, ny - y);
    });
    return Math.max(...sides) - Math.min(...sides) < 1e-6 ? "rhombus" : "trapezoid";
  }
  return "unknown";
}
