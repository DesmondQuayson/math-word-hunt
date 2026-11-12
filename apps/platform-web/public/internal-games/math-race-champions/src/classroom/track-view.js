// One team's winding track, drawn as SVG: the pitch-green ribbon, the glowing
// completed stretch, START, the numbered spaces, FINISH and the football.
//
// The football only ever moves along the track's own line (track.pointAt), one
// space at a time. Everything the track shows about progress (ball, glowing
// spaces, the number badge on the ball) is set together in `land()`.

import { buildTrack } from "../engine/track.js";
import { animate, prefersReducedMotion, s } from "../dom.js";

const HOP_MS = 380;

function football(radius) {
  // An original, simple ball: white with a centre pentagon and five seams.
  const group = s("g", { class: "ball-art" });
  group.append(s("circle", { r: radius, class: "ball-skin" }));
  const points = [];
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
    points.push([Math.cos(angle) * radius * 0.42, Math.sin(angle) * radius * 0.42]);
  }
  group.append(s("polygon", { class: "ball-patch", points: points.map(point => point.map(value => value.toFixed(2)).join(",")).join(" ") }));
  for (const [x, y] of points) {
    const scale = radius / Math.hypot(x, y);
    group.append(s("line", { class: "ball-seam", x1: x.toFixed(2), y1: y.toFixed(2), x2: (x * scale * 0.98).toFixed(2), y2: (y * scale * 0.98).toFixed(2) }));
  }
  return group;
}

export function createTrackView({ team, spaces }) {
  const host = document.createElement("div");
  host.className = "cr-track";
  let track = null;
  let measured = null;
  let svg = null;
  let ball = null;
  let ballSpin = null;
  let badge = null;
  let badgeText = null;
  let progressLine = null;
  let tiles = [];
  let position = 0;
  let stopHop = null;
  let frame = 0;

  function placeBall(at, lift = 0, spin = 0) {
    if (!track || !ball) return;
    const point = track.pointAt(at);
    ball.setAttribute("transform", `translate(${point.x.toFixed(2)} ${(point.y - track.tile * 0.16 - lift).toFixed(2)})`);
    ballSpin.setAttribute("transform", `rotate(${spin.toFixed(1)})`);
  }

  function paint() {
    if (!track) return;
    for (const tile of tiles) {
      const state = tile.position < position ? "done" : tile.position === position ? "here" : "ahead";
      if (tile.element.dataset.state !== state) tile.element.dataset.state = state;
    }
    progressLine.setAttribute("stroke-dasharray", `${(position * track.spacing).toFixed(2)} ${(track.length + 10).toFixed(2)}`);
    const onSpace = position >= 1 && position <= spaces;
    badge.setAttribute("visibility", onSpace ? "visible" : "hidden");
    badgeText.textContent = onSpace ? String(position) : "";
    host.dataset.position = String(position);
    placeBall(position);
  }

  function draw(width, height) {
    // The green ribbon is a little wider than the spaces; the margin keeps its
    // edge inside the picture on every side.
    const margin = Math.max(6, Math.round(Math.min(width, height) * 0.022));
    track = buildTrack({ width: width - margin * 2, height: height - margin * 2, spaces });
    const tile = track.tile;
    const radius = tile / 2;
    svg = s("svg", {
      class: `track track-${team}`,
      viewBox: `${-margin} ${-margin} ${width} ${height}`,
      width,
      height,
      role: "img",
      "aria-label": `Winding track with ${spaces} numbered spaces`
    });
    measured = { width, height };
    svg.append(s("path", { class: "track-edge", d: track.path, "stroke-width": (tile * 1.16).toFixed(2) }));
    svg.append(s("path", { class: "track-lane", d: track.path, "stroke-width": (tile * 1.04).toFixed(2) }));
    progressLine = s("path", { class: "track-progress", d: track.path, "stroke-width": (tile * 1.04).toFixed(2) });
    svg.append(progressLine);

    tiles = track.stations.map(station => {
      const group = s("g", { class: `tile tile-${station.kind}`, transform: `translate(${station.x.toFixed(2)} ${station.y.toFixed(2)})` });
      group.dataset.position = String(station.position);
      group.append(s("circle", { class: "tile-disc", r: (radius * 0.93).toFixed(2) }));
      const label = station.kind === "start" ? "START" : station.kind === "finish" ? "FINISH" : String(station.number);
      const size = station.kind === "space" ? tile * (station.number >= 10 ? 0.5 : 0.56) : tile * (station.kind === "start" ? 0.25 : 0.215);
      group.append(s("text", { class: "tile-label", "font-size": size.toFixed(2), "text-anchor": "middle", "dominant-baseline": "central", text: label }));
      svg.append(group);
      return { position: station.position, element: group };
    });

    ball = s("g", { class: "ball" });
    ball.append(s("ellipse", { class: "ball-shadow", cx: 0, cy: (tile * 0.34).toFixed(2), rx: (tile * 0.3).toFixed(2), ry: (tile * 0.09).toFixed(2) }));
    ballSpin = s("g");
    ballSpin.append(football(tile * 0.4));
    ball.append(ballSpin);
    // The number of the space the ball is on stays readable on the ball itself.
    badge = s("g", { class: "ball-badge", transform: `translate(${(tile * 0.36).toFixed(2)} ${(tile * 0.36).toFixed(2)})` });
    badge.append(s("circle", { r: (tile * 0.3).toFixed(2) }));
    badgeText = s("text", { "font-size": (tile * 0.32).toFixed(2), "text-anchor": "middle", "dominant-baseline": "central" });
    badge.append(badgeText);
    ball.append(badge);
    svg.append(ball);

    host.replaceChildren(svg);
    host.dataset.tile = tile.toFixed(1);
    host.dataset.rows = String(track.rows);
    paint();
  }

  function measure() {
    const box = host.getBoundingClientRect();
    const width = Math.floor(box.width);
    const height = Math.floor(box.height);
    if (width < 120 || height < 90) return;
    if (measured && measured.width === width && measured.height === height) return;
    stopHop?.();
    draw(width, height);
  }

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }) : null;
  observer?.observe(host);

  return {
    element: host,
    measure,
    get position() {
      return position;
    },
    get tile() {
      return track?.tile ?? 0;
    },
    /** Put the ball on a space with no animation (start, restart, resize). */
    set(next) {
      stopHop?.();
      position = next;
      paint();
    },
    /** Hop exactly one space along the line, then call `onLand`. */
    hop(next, onLand) {
      stopHop?.();
      const from = position;
      const land = () => {
        stopHop = null;
        position = next;
        paint();
        onLand?.();
      };
      if (!track || prefersReducedMotion()) return land();
      svg.classList.add("is-hopping");
      stopHop = animate(
        HOP_MS,
        progress => {
          const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
          placeBall(from + (next - from) * eased, Math.sin(Math.PI * progress) * track.tile * 0.42, eased * 300);
        },
        () => {
          svg.classList.remove("is-hopping");
          land();
        }
      );
    },
    destroy() {
      stopHop?.();
      observer?.disconnect();
      cancelAnimationFrame(frame);
    }
  };
}
