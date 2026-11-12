// The road minimap: the track from above (the same line the 3D road is built
// from), with START, FINISH and a marker for every racer. A marker's place is
// its racer's progress along that line, the very number the 3D car is placed by.

import { h, s } from "../dom.js";

const SIZE = 200;
const MARGIN = 18;
const COLOURS = Object.freeze({
  turquoise: "#20cfe3",
  pink: "#ff4f9a",
  gold: "#ffc93c",
  green: "#35d07f",
  red: "#f2463d",
  purple: "#8b5cf6",
  orange: "#ff8a2a",
  white: "#f2f5f9",
  rival: "#9aa6b2"
});

export function colourOf(name) {
  return COLOURS[name] ?? COLOURS.turquoise;
}

export function createMinimap(circuit) {
  const svg = s("svg", { class: "minimap-svg", viewBox: `0 0 ${SIZE} ${SIZE}`, role: "img", "aria-label": "Road map" });
  const path = circuit.mapPath(SIZE, SIZE, MARGIN);
  svg.append(s("path", { class: "minimap-road-edge", d: path }), s("path", { class: "minimap-road", d: path }));
  const done = s("path", { class: "minimap-done", d: path, pathLength: "1", "stroke-dasharray": "0 1" });
  svg.append(done);
  const start = circuit.mapPoint(0, SIZE, SIZE, MARGIN);
  const finish = circuit.mapPoint(1, SIZE, SIZE, MARGIN);
  svg.append(
    s("circle", { class: "minimap-start", cx: start.x.toFixed(1), cy: start.y.toFixed(1), r: 5 }),
    s("text", { class: "minimap-label", x: start.x.toFixed(1), y: (start.y + 15).toFixed(1), "text-anchor": "middle", text: "START" }),
    s("rect", { class: "minimap-finish", x: (finish.x - 5).toFixed(1), y: (finish.y - 5).toFixed(1), width: 10, height: 10 }),
    s("text", { class: "minimap-label", x: finish.x.toFixed(1), y: (finish.y - 9).toFixed(1), "text-anchor": "middle", text: "FINISH" })
  );
  const others = s("g", { class: "minimap-others" });
  const me = s("circle", { class: "minimap-me", r: 6.5 });
  svg.append(others, me);
  const distance = h("p", { class: "minimap-distance" });
  const element = h("div", { class: "minimap" }, svg, distance);
  const markers = new Map();

  return {
    element,
    /**
     * `mine` and each of `rivals` carry { progress, colour }. Called a few times
     * a second; reuses one circle per racer.
     */
    update(mine, rivals, lengthKm) {
      const seen = new Set();
      for (const rival of rivals) {
        seen.add(rival.id);
        let marker = markers.get(rival.id);
        if (!marker) {
          marker = s("circle", { class: `minimap-rival${rival.isCpu ? " minimap-cpu" : ""}`, r: rival.isCpu ? 5.5 : 4 });
          marker.style.fill = colourOf(rival.colour);
          markers.set(rival.id, marker);
          others.append(marker);
        }
        const point = circuit.mapPoint(rival.progress, SIZE, SIZE, MARGIN);
        marker.setAttribute("cx", point.x.toFixed(1));
        marker.setAttribute("cy", point.y.toFixed(1));
        marker.dataset.progress = rival.progress.toFixed(4);
      }
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
      const point = circuit.mapPoint(mine.progress, SIZE, SIZE, MARGIN);
      me.setAttribute("cx", point.x.toFixed(1));
      me.setAttribute("cy", point.y.toFixed(1));
      me.dataset.progress = mine.progress.toFixed(4);
      me.style.fill = colourOf(mine.colour);
      done.setAttribute("stroke-dasharray", `${mine.progress.toFixed(4)} 1`);
      distance.textContent = `${(mine.progress * lengthKm).toFixed(1)} / ${lengthKm.toFixed(1)} km`;
    }
  };
}
