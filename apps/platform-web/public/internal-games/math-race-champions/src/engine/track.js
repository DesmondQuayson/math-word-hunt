// Winding-track geometry for Classroom Competition. Pure: no DOM.
//
// One team's track is a serpentine line: straight runs joined by half-circle
// turns, read from START (bottom left) up to FINISH. START, the numbered
// spaces 1..N and FINISH sit at equal distances ALONG the line, so a football
// that moves "one space" always travels the same distance, and it can be
// animated along the real curve instead of jumping across the board.
//
// The layout is solved for whatever box the Smart Board gives the track: the
// number of runs is the one that makes the numbered spaces as large as
// possible without any two touching.

export const TRACK_SPACES = 62;
export const PRACTICE_TRACK_SPACES = 30;
export const TRACK_LENGTHS = Object.freeze([TRACK_SPACES, PRACTICE_TRACK_SPACES]);

/** A space's diameter is at most this share of the gap to its nearest neighbour. */
const FILL = 0.9;
const MIN_ROWS = 2;
const MAX_ROWS = 16;
const GAP_STEPS = 90;

function centreline(width, height, rows, gap, tile) {
  const radius = gap / 2;
  const run = width - gap - tile;
  const left = tile / 2 + radius;
  const right = left + run;
  const turn = Math.PI * radius;
  const total = rows * run + (rows - 1) * turn;

  function pointAt(distance) {
    let remaining = Math.min(Math.max(distance, 0), total);
    for (let row = 0; row < rows; row += 1) {
      const y = height - tile / 2 - row * gap;
      const forward = row % 2 === 0;
      if (remaining <= run || row === rows - 1) {
        const along = Math.min(remaining, run);
        return { x: forward ? left + along : right - along, y, heading: forward ? 0 : Math.PI };
      }
      remaining -= run;
      if (remaining <= turn) {
        // Half circle from this run up to the next, bulging outwards.
        const angle = remaining / radius;
        const centreX = forward ? right : left;
        const centreY = y - radius;
        const side = forward ? 1 : -1;
        return {
          x: centreX + side * radius * Math.sin(angle),
          y: centreY + radius * Math.cos(angle),
          heading: forward ? -angle : Math.PI + angle
        };
      }
      remaining -= turn;
    }
    return { x: left, y: height - tile / 2, heading: 0 };
  }

  return { run, left, right, radius, turn, total, pointAt };
}

function nearestPair(points) {
  let nearest = Infinity;
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const distance = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
      if (distance < nearest) nearest = distance;
    }
  }
  return nearest;
}

function stationPoints(line, count) {
  const points = [];
  for (let index = 0; index < count; index += 1) points.push(line.pointAt((index * line.total) / (count - 1)));
  return points;
}

/**
 * Solve a track for a box of `width` × `height` with `spaces` numbered spaces.
 * Returns the stations (START, 1..spaces, FINISH), the SVG path of the line and
 * `pointAt(position)`, where position 0 is START and `spaces + 1` is FINISH.
 */
export function buildTrack({ width, height, spaces = TRACK_SPACES }) {
  if (!(width > 0) || !(height > 0)) throw new RangeError("A track needs a box with a size.");
  if (!Number.isInteger(spaces) || spaces < 2) throw new RangeError("A track needs at least two spaces.");
  const count = spaces + 2;
  let best = null;
  for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows += 1) {
    const maxGap = height / (rows - 1);
    for (let step = 1; step < GAP_STEPS; step += 1) {
      const gap = (maxGap * step) / GAP_STEPS;
      const tile = height - (rows - 1) * gap;
      if (tile <= 0 || width - gap - tile <= 0) continue;
      if (best && tile <= best.tile) continue;
      const line = centreline(width, height, rows, gap, tile);
      if (tile <= FILL * nearestPair(stationPoints(line, count))) best = { rows, gap, tile, line };
    }
  }
  if (!best) throw new RangeError("The box is too small for a track.");

  const { rows, gap, tile, line } = best;
  const spacing = line.total / (count - 1);
  const stations = stationPoints(line, count).map((point, index) =>
    Object.freeze({
      position: index,
      kind: index === 0 ? "start" : index === count - 1 ? "finish" : "space",
      number: index === 0 || index === count - 1 ? null : index,
      x: point.x,
      y: point.y
    })
  );

  const segments = [];
  for (let row = 0; row < rows; row += 1) {
    const y = height - tile / 2 - row * gap;
    const forward = row % 2 === 0;
    const from = forward ? line.left : line.right;
    const to = forward ? line.right : line.left;
    segments.push(row === 0 ? `M ${round(from)} ${round(y)}` : "", `L ${round(to)} ${round(y)}`);
    if (row < rows - 1) {
      // sweep 0 = counter-clockwise on screen for the right-hand turns.
      segments.push(`A ${round(line.radius)} ${round(line.radius)} 0 0 ${forward ? 0 : 1} ${round(to)} ${round(y - gap)}`);
    }
  }

  return Object.freeze({
    width,
    height,
    spaces,
    rows,
    gap,
    tile,
    spacing,
    length: line.total,
    stations: Object.freeze(stations),
    path: segments.filter(Boolean).join(" "),
    /** The point on the line at a (possibly fractional) position. */
    pointAt(position) {
      return line.pointAt(Math.min(Math.max(position, 0), count - 1) * spacing);
    }
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
