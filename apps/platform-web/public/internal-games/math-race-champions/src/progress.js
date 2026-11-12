// My Progress: stage wins and best times, achievements, the wallet and the
// Online Race record, as the server holds them for this account.

import { loadAccount } from "./account.js";
import { formatRaceDollars } from "./api.js";
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, CARS, STAGES, TOTAL_EARNABLE } from "./engine/race.js";
import { fill, formatDuration, h, icon } from "./dom.js";
import { THEME_TITLES, themeForStage } from "./palette.js";

export function mount(root, context) {
  let destroyed = false;
  const body = h("div", { class: "progress-body" }, h("p", { class: "loading", role: "status", text: "Loading your progress…" }));
  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page page-wide" },
      h(
        "header",
        { class: "page-head" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to the game menu", onclick: () => context.navigate("hub") }, icon("back")),
        h("div", null, h("p", { class: "eyebrow", text: "Math Race Champions" }), h("h1", { text: "My Progress" }))
      ),
      body
    )
  );

  function render(account) {
    if (account.guest) {
      fill(
        body,
        h("p", { class: "notice" }, icon("info"), "You are in with a school access code, so there is no saved progress. Sign in with a MathNexa account to keep Race Dollars, cars and stage wins on every device."),
        h("button", { type: "button", class: "button button-primary", onclick: () => context.navigate("computer") }, icon("car"), "Practise against the computer")
      );
      return;
    }
    const records = new Map(account.stages.map(record => [record.stage, record]));
    const won = STAGES.filter(stage => (records.get(stage.stage)?.wins ?? 0) > 0).length;
    const earned = Object.keys(account.achievements ?? {});
    const stats = account.stats ?? {};
    const answered = Number(stats.correct ?? 0) + Number(stats.wrong ?? 0);
    fill(
      body,
      h(
        "section",
        { class: "tiles" },
        h("div", { class: "tile" }, h("span", { class: "tile-label", text: "Race Dollars" }), h("strong", { class: "tile-value", text: formatRaceDollars(account.balance) }), h("span", { class: "tile-note", text: `${formatRaceDollars(account.lifetimeEarned)} of ${formatRaceDollars(TOTAL_EARNABLE)} earned` })),
        h("div", { class: "tile" }, h("span", { class: "tile-label", text: "Stages won" }), h("strong", { class: "tile-value", text: `${won} / 10` }), h("span", { class: "tile-note", text: `Stage ${account.unlocked} is open` })),
        h("div", { class: "tile" }, h("span", { class: "tile-label", text: "Cars" }), h("strong", { class: "tile-value", text: `${1 + (account.owned?.length ?? 0)} / ${CARS.length}` }), h("span", { class: "tile-note", text: `Driving ${CARS.find(car => car.key === account.equipped)?.name ?? "Street Starter"}` })),
        h("div", { class: "tile" }, h("span", { class: "tile-label", text: "Accuracy" }), h("strong", { class: "tile-value", text: answered ? `${Math.round((Number(stats.correct) / answered) * 100)}%` : "—" }), h("span", { class: "tile-note", text: `${Number(stats.correct ?? 0).toLocaleString("en-US")} correct answers` })),
        h("div", { class: "tile" }, h("span", { class: "tile-label", text: "Online races" }), h("strong", { class: "tile-value", text: String(stats.onlinePlayed ?? 0) }), h("span", { class: "tile-note", text: `${stats.onlineWon ?? 0} won` }))
      ),
      h(
        "section",
        { class: "panel" },
        h("h2", { text: "Stages" }),
        h(
          "div",
          { class: "table-scroll" },
          h(
            "table",
            { class: "table" },
            h("thead", null, h("tr", null, ["Stage", "Road", "Races", "Wins", "Best time", "Best accuracy", "First-win reward"].map(text => h("th", { scope: "col", text })))),
            h(
              "tbody",
              null,
              STAGES.map(stage => {
                const record = records.get(stage.stage);
                const hasWon = (record?.wins ?? 0) > 0;
                return h(
                  "tr",
                  { class: hasWon ? "is-won" : stage.stage > account.unlocked ? "is-locked" : null },
                  h("th", { scope: "row", text: String(stage.stage) }),
                  h("td", { text: THEME_TITLES[themeForStage(stage.stage)] }),
                  h("td", { text: String(record?.plays ?? 0) }),
                  h("td", { text: String(record?.wins ?? 0) }),
                  h("td", { text: record?.bestTimeMs ? formatDuration(record.bestTimeMs) : "—" }),
                  h("td", { text: record?.bestAccuracy != null && hasWon ? `${record.bestAccuracy}%` : "—" }),
                  h("td", { text: hasWon ? `${formatRaceDollars(stage.reward)} collected` : stage.stage > account.unlocked ? "Locked" : formatRaceDollars(stage.reward) })
                );
              })
            )
          )
        )
      ),
      h(
        "section",
        { class: "panel" },
        h("h2", { text: `Achievements (${earned.length} / ${ACHIEVEMENTS.length})` }),
        h("p", { class: "field-hint", text: `Each pays ${formatRaceDollars(ACHIEVEMENT_REWARD)} Race Dollars, once.` }),
        h(
          "ul",
          { class: "achievements" },
          ACHIEVEMENTS.map(item =>
            h("li", { class: earned.includes(item.key) ? "is-earned" : null }, h("span", { class: "achievement-mark", "aria-hidden": "true" }, icon(earned.includes(item.key) ? "check" : "lock")), h("span", null, h("strong", { text: item.title }), h("small", { text: item.text })), h("span", { class: "sr-only", text: earned.includes(item.key) ? " (earned)" : " (not yet earned)" }))
          )
        )
      )
    );
  }

  loadAccount({ fresh: true })
    .then(account => {
      if (!destroyed) render(account);
    })
    .catch(problem => {
      if (!destroyed) fill(body, h("p", { class: "form-error", role: "alert", text: problem?.message ?? "Could not load. Try again." }));
    });

  return {
    destroy() {
      destroyed = true;
    }
  };
}
