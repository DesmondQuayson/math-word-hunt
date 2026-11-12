// The game hub: three experiences, one front door.

import { MUSIC_CREDIT } from "./audio.js";
import { h, icon } from "./dom.js";

const MODES = Object.freeze([
  {
    screen: "classroom-setup",
    className: "mode-classroom",
    iconName: "board",
    title: "Classroom Competition",
    tag: "Two teams · one Smart Board",
    text: "Both teams answer at the same time. Every correct answer moves your football one space along a 62-space track."
  },
  {
    screen: "computer",
    className: "mode-computer",
    iconName: "car",
    title: "Race Computer",
    tag: "10 stages · 3D cars",
    text: "Answer to accelerate. Beat ten stages, earn Race Dollars and collect faster cars in the garage."
  },
  {
    screen: "online",
    className: "mode-online",
    iconName: "globe",
    title: "Online Race",
    tag: "Room code or QR · same car for everyone",
    text: "Create a room, share the code and race your friends. Everyone drives the same car, so the maths decides."
  }
]);

function soundDialog(context) {
  const dialog = h("dialog", { class: "dialog", "aria-labelledby": "sound-title" });
  const row = (kind, label) => {
    const key = kind === "music" ? "musicVolume" : "soundVolume";
    const max = kind === "music" ? 0.35 : 1;
    const toggle = h("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(context.prefs[kind]), "aria-label": label });
    toggle.addEventListener("click", () => toggle.setAttribute("aria-checked", String(context.toggle(kind))));
    const slider = h("input", { type: "range", min: "0", max: "100", step: "5", value: String(Math.round((context.prefs[key] / max) * 100)), "aria-label": `${label} volume` });
    slider.addEventListener("input", () => {
      context.setVolume(kind, (Number(slider.value) / 100) * max);
      if (kind === "sound") context.audio.button();
    });
    return h("div", { class: "sound-row" }, h("span", { class: "sound-label", text: label }), toggle, slider);
  };
  dialog.append(
    h("h2", { id: "sound-title", text: "Sound Settings" }),
    row("music", "Music"),
    row("sound", "Sound effects"),
    h("p", { class: "credit" }, "Music: ", MUSIC_CREDIT, " (CC BY 3.0)."),
    h("div", { class: "dialog-actions" }, h("button", { type: "button", class: "button button-primary", onclick: () => dialog.close() }, "Done"))
  );
  return dialog;
}

export function mount(root, context) {
  const dialog = soundDialog(context);
  const card = mode => {
    const available = context.hasScreen(mode.screen);
    return h(
      "button",
      {
        type: "button",
        class: `mode ${mode.className}`,
        disabled: !available,
        onclick: () => {
          context.audio.button();
          context.navigate(mode.screen);
        }
      },
      h("span", { class: "mode-icon" }, icon(mode.iconName)),
      h("span", { class: "mode-tag", text: mode.tag }),
      h("span", { class: "mode-title", text: mode.title }),
      h("span", { class: "mode-text", text: mode.text })
    );
  };

  const extra = (screen, iconName, label) =>
    context.hasScreen(screen)
      ? h("button", { type: "button", class: "button", onclick: () => context.navigate(screen) }, icon(iconName), label)
      : null;

  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "hub" },
      h(
        "header",
        { class: "hub-head" },
        h("a", { class: "hub-exit", href: context.exitHref }, icon("back"), context.exitLabel),
        h("p", { class: "eyebrow", text: "MathNexa" }),
        h("h1", { class: "hub-title" }, h("span", { text: "Math Race" }), " ", h("span", { class: "hub-title-accent", text: "Champions" })),
        h("p", { class: "hub-tagline", text: "Solve. Accelerate. Win." })
      ),
      h("div", { class: "modes" }, MODES.map(card)),
      h(
        "nav",
        { class: "hub-more", "aria-label": "More" },
        extra("progress", "chart", "My Progress"),
        extra("how-to", "info", "How to Play"),
        h("button", { type: "button", class: "button", onclick: () => dialog.showModal() }, icon("sound"), "Sound Settings")
      ),
      dialog
    )
  );
  return { destroy() { if (dialog.open) dialog.close(); } };
}
