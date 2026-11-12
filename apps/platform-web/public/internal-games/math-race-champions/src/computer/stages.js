// Race Computer: pick a stage, pick the skills, race. The garage is one press
// away from here, and only from here.

import { loadAccount, practiceUnlocked } from "../account.js";
import { formatRaceDollars } from "../api.js";
import { CARS, MIN_CORRECT, STAGES, getCar } from "../engine/race.js";
import { fill, formatDuration, h, icon } from "../dom.js";
import { THEME_TITLES, themeForStage } from "../palette.js";
import { createSettingsChooser, readLastSettings } from "../setup.js";
import { resumeRun, startStage } from "./start.js";

export function mount(root, context, params = {}) {
  let destroyed = false;
  const body = h("div", { class: "stages-body" }, h("p", { class: "loading", role: "status", text: "Loading your garage and stages…" }));
  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page page-wide" },
      h(
        "header",
        { class: "page-head" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to the game menu", onclick: () => context.navigate("hub") }, icon("back")),
        h("div", null, h("p", { class: "eyebrow", text: "10 stages · 3D cars" }), h("h1", { text: "Race Computer" }))
      ),
      body
    )
  );

  function render(account) {
    const guest = account.guest === true;
    const unlocked = guest ? practiceUnlocked() : account.unlocked;
    const records = new Map((account.stages ?? []).map(record => [record.stage, record]));
    const equipped = getCar(guest ? "starter" : account.equipped) ?? CARS[0];
    let selected = Math.min(params.stage ?? unlocked, unlocked);
    const error = h("p", { class: "form-error", role: "alert" });
    const start = h("button", { type: "button", class: "button button-primary button-large" }, icon("flag"), "Start race");
    const heading = h("h2", { id: "stage-heading" });
    const facts = h("p", { class: "stage-facts" });
    let chooser = null;
    chooser = createSettingsChooser({ ...readLastSettings(), difficulty: STAGES[selected - 1].suggested }, {
      idPrefix: "race",
      onChange: () => {
        if (chooser) start.disabled = chooser.value() === null;
      }
    });

    const cards = STAGES.map(stage => {
      const record = records.get(stage.stage);
      const won = (record?.wins ?? 0) > 0;
      const locked = stage.stage > unlocked;
      const card = h(
        "button",
        {
          type: "button",
          class: `stage-card${won ? " is-won" : ""}${locked ? " is-locked" : ""}`,
          disabled: locked,
          "aria-pressed": "false",
          "aria-label": `Stage ${stage.stage}, ${THEME_TITLES[themeForStage(stage.stage)]}${locked ? ", locked" : won ? ", won" : ""}`,
          onclick: () => select(stage.stage)
        },
        h("span", { class: "stage-number", text: String(stage.stage) }),
        h("span", { class: "stage-theme", text: THEME_TITLES[themeForStage(stage.stage)] }),
        h(
          "span",
          { class: "stage-state" },
          locked ? [icon("lock"), "Locked"] : won ? [icon("check"), record.bestTimeMs ? `Best ${formatDuration(record.bestTimeMs)}` : "Won"] : guest ? "Practice" : [icon("coin"), formatRaceDollars(stage.reward)]
        )
      );
      return { stage: stage.stage, card };
    });

    function select(stage) {
      selected = stage;
      for (const item of cards) item.card.setAttribute("aria-pressed", String(item.stage === stage));
      const info = STAGES[stage - 1];
      const record = records.get(stage);
      heading.textContent = `Stage ${stage}: ${THEME_TITLES[themeForStage(stage)]}`;
      const reward = guest ? "Practice race: nothing is earned." : (record?.wins ?? 0) > 0 ? "First-win reward already collected. Race again for a better time." : `First win pays ${formatRaceDollars(info.reward)} Race Dollars.`;
      facts.textContent = `${info.lengthKm.toFixed(1)} km. At least ${MIN_CORRECT} correct answers to finish. ${reward}`;
      const suggested = document.getElementById(`race-difficulty-${info.suggested}`);
      if (suggested && !suggested.checked) suggested.click();
    }

    start.addEventListener("click", async () => {
      const settings = chooser.value();
      if (!settings) return;
      context.audio.button();
      start.disabled = true;
      error.textContent = "";
      try {
        await startStage(context, { stage: selected, settings });
      } catch (problem) {
        if (destroyed) return;
        error.textContent = problem?.message ?? "The race could not start. Try again.";
        start.disabled = false;
      }
    });

    fill(
      body,
      guest
        ? h("p", { class: "notice" }, icon("info"), "Practice mode. You are in with a school access code, so nothing is saved. Sign in with a MathNexa account to earn Race Dollars, buy cars and keep your wins.")
        : null,
      !guest && account.activeRun
        ? h(
            "p",
            { class: "notice notice-action" },
            icon("flag"),
            `You have a Stage ${account.activeRun.stage} race still running.`,
            h("button", { type: "button", class: "button button-small", onclick: () => resumeRun(context, account.activeRun.id).catch(() => {}) }, "Resume")
          )
        : null,
      h(
        "section",
        { class: "panel car-strip", "aria-label": "Your car" },
        h("div", { class: "car-strip-main" }, h("p", { class: "eyebrow", text: "Your car" }), h("p", { class: "car-strip-name", text: equipped.name }), h("p", { class: "car-strip-stats", text: `Top speed ${equipped.topSpeed} km/h · +${equipped.boost} km/h per correct answer` })),
        guest ? null : h("p", { class: "wallet", "aria-label": `${account.balance} Race Dollars` }, icon("coin"), h("strong", { text: formatRaceDollars(account.balance) }), h("span", { text: "Race Dollars" })),
        h("button", { type: "button", class: "button button-pink", onclick: () => context.navigate("garage") }, icon("garage"), "Garage")
      ),
      h("div", { class: "stage-grid", role: "group", "aria-label": "Stages" }, cards.map(item => item.card)),
      h(
        "section",
        { class: "panel setup", "aria-labelledby": "stage-heading" },
        heading,
        facts,
        chooser.elements,
        error,
        h("div", { class: "setup-actions" }, start)
      )
    );
    select(selected);
  }

  loadAccount({ fresh: true })
    .then(account => {
      if (!destroyed) render(account);
    })
    .catch(problem => {
      if (destroyed) return;
      fill(body, h("p", { class: "form-error", role: "alert", text: problem?.message ?? "Could not load. Try again." }), h("button", { type: "button", class: "button", onclick: () => context.navigate("computer") }, "Try again"));
    });

  return {
    destroy() {
      destroyed = true;
    }
  };
}
