// The name, emoji and car colour pickers used by the creator and by everyone
// who joins. The emoji choices and the name rules are MathNexa's shared ones.

import { EMOJI_CHOICES } from "../../../math-bingo-live/src/engine/emoji.js";
import { NAME_MAX, sanitizeDisplayName } from "../../../math-bingo-live/src/engine/settings.js";
import { RACER_COLOURS } from "../engine/race.js";
import { h } from "../dom.js";
import { COLOUR_NAMES, cssColour } from "../palette.js";

const NAME_KEY = "mathnexa:math-race-champions:racer";

function remembered() {
  try {
    const value = JSON.parse(localStorage.getItem(NAME_KEY) ?? "null");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function rememberRacer(racer) {
  try {
    localStorage.setItem(NAME_KEY, JSON.stringify(racer));
  } catch {
    /* Asked again next time. */
  }
}

/** Fields for a racer. `value()` returns { ok, name, emoji, colour } or { ok: false, error }. */
export function createRacerFields({ idPrefix, initial = {} } = {}) {
  const saved = { ...remembered(), ...initial };
  let emoji = EMOJI_CHOICES.some(choice => choice.emoji === saved.emoji) ? saved.emoji : null;
  let colour = RACER_COLOURS.includes(saved.colour) ? saved.colour : RACER_COLOURS[0];

  const name = h("input", { type: "text", id: `${idPrefix}-name`, class: "text-input", maxlength: NAME_MAX, autocomplete: "nickname", spellcheck: "false", autocapitalize: "words", value: typeof saved.name === "string" ? saved.name : "" });

  const emojiButtons = [null, ...EMOJI_CHOICES.map(choice => choice.emoji)].map(value => {
    const choice = EMOJI_CHOICES.find(item => item.emoji === value);
    const button = h("button", { type: "button", class: "pick pick-emoji", "aria-pressed": String(value === emoji), "aria-label": choice ? choice.name : "No emoji" }, value ?? "—");
    button.addEventListener("click", () => {
      emoji = value;
      for (const item of emojiButtons) item.button.setAttribute("aria-pressed", String(item.value === emoji));
    });
    return { value, button };
  });

  const colourButtons = RACER_COLOURS.map(value => {
    const button = h("button", { type: "button", class: "pick pick-colour", "aria-pressed": String(value === colour), "aria-label": COLOUR_NAMES[value], style: `--swatch:${cssColour(value)}`, dataset: { colour: value } });
    button.addEventListener("click", () => {
      colour = value;
      for (const item of colourButtons) item.button.setAttribute("aria-pressed", String(item.value === colour));
    });
    return { value, button };
  });

  return {
    name,
    elements: [
      h("div", { class: "field" }, h("label", { class: "field-label", for: name.id, text: "Your name" }), name),
      h("fieldset", { class: "field" }, h("legend", { text: "Emoji (optional)" }), h("div", { class: "pick-row" }, emojiButtons.map(item => item.button))),
      h(
        "fieldset",
        { class: "field" },
        h("legend", { text: "Car colour" }),
        h("div", { class: "pick-row" }, colourButtons.map(item => item.button)),
        h("p", { class: "field-hint", text: "Colour is paint only. Every car in an Online Race performs exactly the same." })
      )
    ],
    value() {
      const parsed = sanitizeDisplayName(name.value);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return { ok: true, name: parsed.name, emoji, colour };
    }
  };
}
