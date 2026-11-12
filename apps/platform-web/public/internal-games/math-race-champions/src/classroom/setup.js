// Classroom Competition set-up: skills, difficulty, team names, track length.
// Both teams always get the same settings and the same track; there is no
// option here that could make the race uneven.

import { DEFAULT_TEAM_NAMES, TEAM_NAME_MAX, sanitizeTeamName } from "../engine/classroom.js";
import { PRACTICE_TRACK_SPACES, TRACK_SPACES } from "../engine/track.js";
import { h, icon } from "../dom.js";
import { createSettingsChooser, readLastSettings, writeLastSettings } from "../setup.js";

export function mount(root, context, params = {}) {
  const start = h("button", { type: "submit", class: "button button-primary button-large" }, icon("play"), "Continue to the board");
  // Declared first: the chooser reports its initial state while it is being built.
  let chooser = null;
  chooser = createSettingsChooser(params.settings ?? readLastSettings(), {
    idPrefix: "classroom",
    onChange: () => {
      if (chooser) start.disabled = chooser.value() === null;
    }
  });

  const nameInput = team =>
    h("input", {
      type: "text",
      id: `classroom-name-${team}`,
      class: `text-input text-input-${team}`,
      maxlength: TEAM_NAME_MAX,
      autocomplete: "off",
      spellcheck: "false",
      placeholder: DEFAULT_TEAM_NAMES[team],
      value: params.names?.[team] && params.names[team] !== DEFAULT_TEAM_NAMES[team] ? params.names[team] : ""
    });
  const turquoise = nameInput("turquoise");
  const pink = nameInput("pink");

  const lengthInputs = [TRACK_SPACES, PRACTICE_TRACK_SPACES].map(length => {
    const input = h("input", { type: "radio", name: "classroom-length", id: `classroom-length-${length}`, value: String(length) });
    input.checked = (params.length ?? TRACK_SPACES) === length;
    return { length, input };
  });

  const form = h(
    "form",
    {
      class: "panel setup",
      novalidate: true,
      onsubmit: event => {
        event.preventDefault();
        const settings = chooser.value();
        if (!settings) return;
        context.audio.activate();
        context.audio.button();
        writeLastSettings(settings);
        context.navigate("classroom", {
          settings,
          names: { turquoise: sanitizeTeamName(turquoise.value, "turquoise"), pink: sanitizeTeamName(pink.value, "pink") },
          length: lengthInputs.find(item => item.input.checked)?.length ?? TRACK_SPACES
        });
      }
    },
    chooser.elements,
    h(
      "fieldset",
      { class: "field teams" },
      h("legend", { text: "Team names" }),
      h(
        "div",
        { class: "team-names" },
        h("label", { class: "team-name team-name-turquoise", for: turquoise.id }, h("span", { text: "Left side" }), turquoise),
        h("label", { class: "team-name team-name-pink", for: pink.id }, h("span", { text: "Right side" }), pink)
      )
    ),
    h(
      "fieldset",
      { class: "field" },
      h("legend", { text: "Track" }),
      h(
        "div",
        { class: "segmented segmented-wide" },
        lengthInputs.map(({ length, input }) =>
          h("label", { class: "segment", for: input.id }, input, h("span", { text: length === TRACK_SPACES ? "62 spaces (full race)" : "30 spaces (practice)" }))
        )
      )
    ),
    h("div", { class: "setup-actions" }, start)
  );

  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page" },
      h(
        "header",
        { class: "page-head" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to the game menu", onclick: () => context.navigate("hub") }, icon("back")),
        h("div", null, h("p", { class: "eyebrow", text: "Two teams · one Smart Board" }), h("h1", { text: "Classroom Competition" }))
      ),
      h("p", { class: "page-lead", text: "Both teams play at the same time, each with its own questions. One correct answer moves that team's football one space. A wrong answer moves nothing." }),
      form
    )
  );
  return { destroy() {} };
}
