// Fraction Bingo: exact rational values and original visual fraction models.
//
// A card cell holds a value {n, d} (never reduced: 2/4 stays 2/4) plus a
// shape. The shape is decoration for the eye only. Every comparison is
// integer arithmetic on numerators and denominators, never floating point,
// and never the shape, an SVG id or a file name.

export const SHAPES = Object.freeze(["circle", "bar", "rect", "grid"]);

/** Grid layouts (rows x columns) that split a square into equal cells. */
export const GRID_LAYOUTS = Object.freeze({
  4: Object.freeze([2, 2]),
  6: Object.freeze([2, 3]),
  8: Object.freeze([2, 4]),
  9: Object.freeze([3, 3]),
  10: Object.freeze([2, 5]),
  12: Object.freeze([3, 4])
});

export function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function isFraction(value) {
  return Boolean(value) && Number.isInteger(value.n) && Number.isInteger(value.d) && value.d > 0 && value.n >= 0;
}

export function reduceFraction(value) {
  const divisor = gcd(value.n, value.d) || 1;
  return Object.freeze({ n: value.n / divisor, d: value.d / divisor });
}

/** Same written fraction: 2/4 is NOT 1/2 here. */
export function sameFraction(a, b) {
  return a.n === b.n && a.d === b.d;
}

/** Same rational value, by cross-multiplication: 2/4 equals 1/2. */
export function equalValue(a, b) {
  return a.n * b.d === b.n * a.d;
}

/** Proper fractions n/d (1 <= n < d) for the given denominators. */
export function properFractions(denominators) {
  const list = [];
  for (const d of denominators) for (let n = 1; n < d; n += 1) list.push(Object.freeze({ n, d }));
  return list;
}

/** Every fraction with an allowed denominator equal in value to `value`. */
export function equivalentsOf(value, denominators) {
  return properFractions(denominators).filter(candidate => equalValue(candidate, value));
}

export function allowedShapes(denominator) {
  return Object.prototype.hasOwnProperty.call(GRID_LAYOUTS, denominator)
    ? SHAPES
    : SHAPES.filter(shape => shape !== "grid");
}

export function fractionText(value) {
  return `${value.n}/${value.d}`;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const ORDINALS = { 2: ["half", "halves"], 3: ["third", "thirds"], 4: ["fourth", "fourths"], 5: ["fifth", "fifths"], 6: ["sixth", "sixths"], 7: ["seventh", "sevenths"], 8: ["eighth", "eighths"], 9: ["ninth", "ninths"], 10: ["tenth", "tenths"], 11: ["eleventh", "elevenths"], 12: ["twelfth", "twelfths"] };

export function fractionSpoken(value) {
  const names = ORDINALS[value.d];
  if (!names || value.n > 12) return `${value.n} over ${value.d}`;
  return `${ONES[value.n]} ${value.n === 1 ? names[0] : names[1]}`;
}

/** The screen-reader description of a visual model (never the shape alone). */
export function describeModel(value) {
  return `Fraction model: ${value.n} of ${value.d} equal parts shaded.`;
}

const round = number => Math.round(number * 1000) / 1000;

function polar(cx, cy, radius, angle) {
  return [round(cx + radius * Math.cos(angle)), round(cy + radius * Math.sin(angle))];
}

/**
 * Geometry of a model in a 100 x 100 view box. Parts are listed in reading
 * order (clockwise from 12 o'clock for circles, left-to-right then
 * top-to-bottom for the rest); the first `n` are shaded, so the shaded region
 * is always one connected run of whole parts.
 */
export function modelGeometry(model) {
  const { n, d, shape } = model;
  if (!isFraction(model) || n > d || d < 1) throw new Error("Invalid fraction model.");
  const parts = [];
  if (shape === "circle") {
    const cx = 50;
    const cy = 50;
    const radius = 44;
    for (let index = 0; index < d; index += 1) {
      const start = -Math.PI / 2 + (index * 2 * Math.PI) / d;
      const end = -Math.PI / 2 + ((index + 1) * 2 * Math.PI) / d;
      const [x0, y0] = polar(cx, cy, radius, start);
      const [x1, y1] = polar(cx, cy, radius, end);
      const path = d === 1
        ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.001} ${cy - radius} Z`
        : `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`;
      parts.push(Object.freeze({ kind: "sector", path, start, end, cx, cy, radius, shaded: index < n }));
    }
  } else if (shape === "bar" || shape === "rect" || shape === "grid") {
    let x;
    let y;
    let width;
    let height;
    let rows;
    let columns;
    if (shape === "bar") {
      [x, y, width, height, rows, columns] = [6, 30, 88, 40, 1, d];
    } else if (shape === "rect") {
      [x, y, width, height, rows, columns] = [22, 6, 56, 88, d, 1];
    } else {
      const layout = GRID_LAYOUTS[d];
      if (!layout) throw new Error(`No equal grid for ${d} parts.`);
      [rows, columns] = layout;
      const size = 84;
      const cell = Math.min(size / columns, size / rows);
      width = cell * columns;
      height = cell * rows;
      x = (100 - width) / 2;
      y = (100 - height) / 2;
    }
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        parts.push(Object.freeze({
          kind: "rect",
          x: round(x + column * cellWidth),
          y: round(y + row * cellHeight),
          width: round(cellWidth),
          height: round(cellHeight),
          shaded: index < n
        }));
      }
    }
  } else {
    throw new Error(`Unknown fraction shape: ${shape}`);
  }
  return Object.freeze({ shape, n, d, parts: Object.freeze(parts) });
}

/** Area of each part; used by the audits to prove partitions are equal. */
export function partAreas(geometry) {
  return geometry.parts.map(part => part.kind === "rect"
    ? part.width * part.height
    : 0.5 * part.radius * part.radius * (part.end - part.start));
}
