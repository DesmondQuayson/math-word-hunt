// The player's saved avatar as a small picture. The 3D renderer is a separate
// download that the gameplay screens never touch: it loads here, on the hub
// and in the shop, only after the page is ready and only if WebGL works. Until
// then, and on devices without WebGL, a simple drawing stands in.

import { h, s } from "../../math-bingo-live/src/dom.js";
import { getItem, SKIN_TONES } from "./engine/catalog.js";

export function avatarDescription(avatar) {
  const parts = ["hair", "top", "bottom", "outfit", "jacket", "shoes", "hat", "glasses", "jewelry"]
    .map((slot) => getItem(avatar[slot])?.name)
    .filter(Boolean);
  return `Avatar wearing: ${parts.join(", ")}.`;
}

/** A flat drawing of the avatar, for no-WebGL devices and the first paint. */
export function flatAvatar(avatar) {
  const skin = SKIN_TONES.find((tone) => tone.id === avatar.skin)?.color ?? "#BC8158";
  const hair = getItem(avatar.hairColor)?.color ?? "#17120F";
  const outfit = getItem(avatar.outfit);
  const top = outfit ?? getItem(avatar.top);
  const bottom = outfit ?? getItem(avatar.bottom);
  const jacket = getItem(avatar.jacket);
  const shoes = getItem(avatar.shoes);
  const hat = getItem(avatar.hat);
  const hairModel = getItem(avatar.hair)?.model ?? "short";
  const long = ["long", "straight", "locs", "locslong", "braids", "waves"].includes(hairModel);
  const big = ["afro", "afrobig", "curly", "coils", "puff"].includes(hairModel);
  return s("svg", { viewBox: "0 0 120 180", class: "flat-avatar", "aria-hidden": "true", focusable: "false" },
    long ? s("rect", { x: "33", y: "28", width: "54", height: "66", rx: "22", fill: hair }) : null,
    s("rect", { x: "46", y: "120", width: "13", height: "42", rx: "6", fill: bottom?.color ?? "#37588C" }),
    s("rect", { x: "61", y: "120", width: "13", height: "42", rx: "6", fill: bottom?.color ?? "#37588C" }),
    s("rect", { x: "42", y: "158", width: "18", height: "10", rx: "5", fill: shoes?.color ?? "#F2F5F9" }),
    s("rect", { x: "60", y: "158", width: "18", height: "10", rx: "5", fill: shoes?.color ?? "#F2F5F9" }),
    s("rect", { x: "42", y: "76", width: "36", height: "50", rx: "13", fill: top?.color ?? "#20CFE3" }),
    s("rect", { x: "30", y: "78", width: "11", height: "38", rx: "5.5", fill: jacket?.color ?? top?.color ?? "#20CFE3" }),
    s("rect", { x: "79", y: "78", width: "11", height: "38", rx: "5.5", fill: jacket?.color ?? top?.color ?? "#20CFE3" }),
    jacket ? s("path", { d: "M42 88c0-8 7-12 13-12l-2 50H46c-3 0-4-2-4-5ZM78 88c0-8-7-12-13-12l2 50h7c3 0 4-2 4-5Z", fill: jacket.color }) : null,
    s("circle", { cx: "60", cy: "46", r: "27", fill: skin }),
    big ? s("circle", { cx: "60", cy: "34", r: "32", fill: hair }) : null,
    big ? s("circle", { cx: "60", cy: "48", r: "24", fill: skin }) : null,
    !big && hairModel !== "bald" ? s("path", { d: "M33 44C33 22 47 15 60 15s27 7 27 29c-8-9-16-13-27-13S41 35 33 44Z", fill: hair }) : null,
    s("circle", { cx: "51", cy: "49", r: "3.4", fill: "#1A1D2B" }),
    s("circle", { cx: "69", cy: "49", r: "3.4", fill: "#1A1D2B" }),
    s("path", { d: "M52 60q8 7 16 0", fill: "none", stroke: "#7A3B2E", "stroke-width": "2.6", "stroke-linecap": "round" }),
    hat ? s("path", { d: "M34 32c2-17 14-23 26-23s24 6 26 23Z", fill: hat.color }) : null);
}

/**
 * Mounts an avatar picture in `host`. Returns { setAvatar, dispose }.
 * `load3d: false` keeps it flat (the fast choice for a list or a small badge).
 */
export function mountAvatar(host, avatar, { load3d = true, interactive = false, framing = "full", autoRotate = false, defer = false } = {}) {
  let current = avatar;
  let stage = null;
  let disposed = false;
  const flat = h("div", { class: "avatar-flat" }, flatAvatar(avatar));
  host.replaceChildren(flat);
  host.setAttribute("role", "img");
  host.setAttribute("aria-label", avatarDescription(avatar));

  const saveData = (() => {
    try {
      return navigator.connection?.saveData === true;
    } catch {
      return false;
    }
  })();

  const load = () => {
    if (disposed) return;
    import("./avatar/stage.js").then(({ createAvatarStage }) => {
      if (disposed) return;
      const created = createAvatarStage(host, { interactive, autoRotate, framing });
      if (!created.available) return;
      stage = created;
      stage.setAvatar(current);
      flat.hidden = true;
      window.__POLYGON_SHOWDOWN__.avatarStageReady = true;
    }).catch(() => {
      /* The drawing stays. */
    });
  };

  if (load3d && !saveData) {
    // On the way to a game the big download waits until the page has nothing better to do.
    if (defer && typeof requestIdleCallback === "function") requestIdleCallback(load, { timeout: 2500 });
    else if (defer) setTimeout(load, 800);
    else load();
  }

  return {
    setAvatar(next) {
      current = next;
      host.setAttribute("aria-label", avatarDescription(next));
      if (stage) stage.setAvatar(next);
      else flat.replaceChildren(flatAvatar(next));
    },
    dispose() {
      disposed = true;
      stage?.dispose();
      stage = null;
    }
  };
}
