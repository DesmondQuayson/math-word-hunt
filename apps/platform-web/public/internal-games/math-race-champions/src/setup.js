// The skills and difficulty chooser shared by all three modes, so a host,
// a solo racer and a room creator all pick from the same seven categories
// and five difficulties, in the same words.

import { CATEGORIES, CATEGORY_IDS, DIFFICULTIES, normalizeSettings } from "./engine/questions.js";
import { h } from "./dom.js";

const SETTINGS_KEY = "mathnexa:math-race-champions:last-settings";

export function readLastSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") ?? {});
  } catch {
    return normalizeSettings({});
  }
}

export function writeLastSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ categories: settings.categories, difficulty: settings.difficulty }));
  } catch {
    /* The choice still applies to this game. */
  }
}

/**
 * A fieldset pair: skills (one, several, or Mixed Skills = all seven) and
 * difficulty. `value()` returns normalised settings, or null when no skill is
 * ticked (the caller keeps its Start button disabled).
 */
export function createSettingsChooser(initial, { onChange, idPrefix = "setup", allowDifficulty = true } = {}) {
  const selected = new Set(initial.categories);
  let difficulty = initial.difficulty;
  const hint = h("p", { class: "field-hint", id: `${idPrefix}-skills-hint`, role: "status" });

  const mixed = h("input", { type: "checkbox", id: `${idPrefix}-mixed` });
  const boxes = CATEGORIES.map(category => {
    const input = h("input", { type: "checkbox", id: `${idPrefix}-skill-${category.id}`, value: category.id });
    return { category, input };
  });

  function sync() {
    for (const { category, input } of boxes) input.checked = selected.has(category.id);
    mixed.checked = selected.size === CATEGORY_IDS.length;
    // The chosen look is also a class: older browsers have no :has().
    for (const input of [mixed, ...boxes.map(box => box.input)]) input.closest("label")?.classList.toggle("is-checked", input.checked);
    hint.textContent = selected.size === 0 ? "Choose at least one skill." : selected.size === CATEGORY_IDS.length ? "Mixed Skills: all seven." : `${selected.size} of 7 skills.`;
    hint.dataset.empty = selected.size === 0 ? "true" : "";
    onChange?.();
  }

  mixed.addEventListener("change", () => {
    selected.clear();
    if (mixed.checked) for (const id of CATEGORY_IDS) selected.add(id);
    sync();
  });
  for (const { category, input } of boxes) {
    input.addEventListener("change", () => {
      if (input.checked) selected.add(category.id);
      else selected.delete(category.id);
      sync();
    });
  }

  const skills = h(
    "fieldset",
    { class: "field skills", "aria-describedby": `${idPrefix}-skills-hint` },
    h("legend", { text: "Skills" }),
    h("label", { class: "check check-mixed", for: `${idPrefix}-mixed` }, mixed, h("span", { class: "check-text" }, h("strong", { text: "Mixed Skills" }), h("small", { text: "All seven" }))),
    h(
      "div",
      { class: "check-grid" },
      boxes.map(({ category, input }) =>
        h("label", { class: "check", for: input.id }, input, h("span", { class: "check-text" }, h("strong", { text: category.title }), h("small", { text: category.example })))
      )
    ),
    hint
  );

  const levels = h(
    "fieldset",
    { class: "field levels" },
    h("legend", { text: "Difficulty" }),
    h(
      "div",
      { class: "segmented" },
      DIFFICULTIES.map(level => {
        const input = h("input", { type: "radio", name: `${idPrefix}-difficulty`, id: `${idPrefix}-difficulty-${level.id}`, value: level.id });
        input.checked = level.id === difficulty;
        input.addEventListener("change", () => {
          if (input.checked) difficulty = level.id;
          onChange?.();
        });
        return h("label", { class: "segment", for: input.id }, input, h("span", { text: level.title }));
      })
    )
  );

  sync();
  return {
    elements: allowDifficulty ? [skills, levels] : [skills],
    value() {
      if (selected.size === 0) return null;
      return normalizeSettings({ categories: [...selected], difficulty });
    }
  };
}
