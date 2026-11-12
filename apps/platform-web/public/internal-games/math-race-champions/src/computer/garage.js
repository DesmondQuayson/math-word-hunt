// The garage and car shop, for Computer Race only. Race Dollars are play
// money: earned by winning stages and by achievements, spent here, and nowhere
// else. The price shown comes from the server and the purchase is decided by
// the server; this screen only asks.

import { forgetAccount, loadAccount } from "../account.js";
import { accountRequest, formatRaceDollars, newPurchaseKey } from "../api.js";
import { CARS, MIN_CORRECT, getCar } from "../engine/race.js";
import { announce, fill, h, icon, prefersReducedMotion } from "../dom.js";
import { readLastSettings } from "../setup.js";
import { startStage } from "./start.js";

const TOP = Math.max(...CARS.map(car => car.topSpeed));
const BOOST = Math.max(...CARS.map(car => car.boost));
/** Handling as a person can read it: the share of speed above idle still held 5 seconds after an answer. */
const held = car => Math.round(Math.exp(-car.decay * 5) * 100);
const HELD = Math.max(...CARS.map(held));

function statBar(label, value, share, unit) {
  return h(
    "div",
    { class: "stat" },
    h("span", { class: "stat-label", text: label }),
    h("span", { class: "stat-bar", role: "img", "aria-label": `${label}: ${value}${unit}` }, h("span", { class: "stat-fill", style: `width:${Math.round(share * 100)}%` })),
    h("span", { class: "stat-value", text: `${value}${unit}` })
  );
}

export function mount(root, context, params = {}) {
  let destroyed = false;
  let showroom = null;
  let account = null;
  let selected = params.car ?? null;
  let purchaseKey = null;
  let busy = false;

  const canvas = h("canvas", { class: "showroom-canvas", tabindex: "0", role: "img", "aria-label": "3D view of the car. Drag to turn it, scroll or pinch to zoom." });
  const fallback = h("p", { class: "showroom-fallback", hidden: true, text: "This device cannot show the 3D preview. The cars and their statistics are the same." });
  const viewButtons = [["front", "Front"], ["side", "Side"], ["rear", "Rear"]].map(([view, label]) =>
    h("button", { type: "button", class: "button button-small", dataset: { view }, onclick: () => showroom?.setView(view) }, label)
  );
  const tabs = h("div", { class: "car-tabs", role: "tablist", "aria-label": "Cars" });
  const detail = h("div", { class: "car-detail", role: "tabpanel" });
  const wallet = h("p", { class: "wallet" });
  const overlay = h("div", { class: "race-overlay", hidden: true });

  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page page-wide garage" },
      h(
        "header",
        { class: "page-head" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to the stages", onclick: () => context.navigate("computer") }, icon("back")),
        h("div", null, h("p", { class: "eyebrow", text: "Race Computer" }), h("h1", { text: "Garage" })),
        wallet
      ),
      h(
        "div",
        { class: "garage-grid" },
        h(
          "section",
          { class: "showroom", "aria-label": "Car preview" },
          canvas,
          fallback,
          h(
            "div",
            { class: "showroom-tools" },
            viewButtons,
            h("button", { type: "button", class: "button button-small", onclick: () => showroom?.spin() }, icon("refresh"), "Spin"),
            h("button", { type: "button", class: "icon-button", "aria-label": "Zoom in", onclick: () => showroom?.zoomBy(1.15) }, "+"),
            h("button", { type: "button", class: "icon-button", "aria-label": "Zoom out", onclick: () => showroom?.zoomBy(1 / 1.15) }, "−")
          )
        ),
        h("section", { class: "panel car-panel" }, tabs, detail)
      ),
      h("p", { class: "fine-print", text: "Race Dollars are play money inside Math Race Champions. They are earned by racing, cannot be bought with real money, and have no cash value. Garage cars are for Race Computer only: every Online Race uses the same car for everyone." }),
      overlay
    )
  );

  import("../scene3d/quality.js")
    .then(async quality => {
      if (destroyed) return;
      if (!quality.canRender3D()) throw new Error("no-webgl");
      const { createShowroom } = await import("../scene3d/showroom.js");
      if (destroyed) return;
      showroom = createShowroom(canvas, { reducedMotion: prefersReducedMotion() });
      if (selected) showroom.setCar(selected);
    })
    .catch(() => {
      canvas.hidden = true;
      fallback.hidden = false;
    });

  const owns = key => key === "starter" || (account?.owned ?? []).includes(key);

  function closeOverlay() {
    overlay.hidden = true;
    fill(overlay);
  }

  async function buy(car) {
    if (busy) return;
    busy = true;
    // One key per attempt: pressing twice, or a retry after a dropped reply,
    // can never charge twice.
    purchaseKey ??= newPurchaseKey();
    try {
      const reply = await accountRequest("purchase", { car: car.key, key: purchaseKey });
      purchaseKey = null;
      forgetAccount();
      account = await loadAccount({ fresh: true });
      if (destroyed) return;
      closeOverlay();
      if (reply.result === "ok" || reply.result === "owned") {
        context.audio.purchase();
        announce(`${car.name} is yours.`);
      } else if (reply.result === "insufficient") {
        announce(`Not enough Race Dollars for ${car.name}.`, { assertive: true });
      }
      render();
    } catch (problem) {
      if (destroyed) return;
      const message = overlay.querySelector(".form-error");
      if (message) message.textContent = problem?.message ?? "The purchase did not go through. Nothing was charged. Try again.";
    } finally {
      busy = false;
    }
  }

  function confirmBuy(car) {
    purchaseKey = null;
    const yes = h("button", { type: "button", class: "button button-primary", onclick: () => buy(car) }, icon("coin"), `Buy for ${formatRaceDollars(car.price)}`);
    fill(
      overlay,
      h(
        "div",
        { class: "result-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "buy-title" },
        h("h2", { id: "buy-title", text: `Buy ${car.name}?` }),
        h("p", { class: "result-note", text: `${formatRaceDollars(car.price)} Race Dollars will be taken from your ${formatRaceDollars(account.balance)}. You will have ${formatRaceDollars(account.balance - car.price)} left.` }),
        h("p", { class: "form-error", role: "alert" }),
        h("div", { class: "result-actions" }, yes, h("button", { type: "button", class: "button", onclick: closeOverlay }, "Cancel"))
      )
    );
    overlay.hidden = false;
    yes.focus();
  }

  async function equip(car) {
    if (busy) return;
    busy = true;
    try {
      await accountRequest("equip", { car: car.key });
      forgetAccount();
      account = await loadAccount({ fresh: true });
      if (destroyed) return;
      context.audio.equip();
      announce(`${car.name} equipped.`);
      render();
    } catch (problem) {
      announce(problem?.message ?? "Could not equip that car.", { assertive: true });
    } finally {
      busy = false;
    }
  }

  function render() {
    const guest = account.guest === true;
    const equipped = guest ? "starter" : account.equipped;
    selected ??= equipped;
    const car = getCar(selected) ?? CARS[0];
    if (showroom && showroom.model !== car.key) showroom.setCar(car.key);
    fill(wallet, guest ? null : [icon("coin"), h("strong", { text: formatRaceDollars(account.balance) }), h("span", { text: "Race Dollars" })]);
    if (!guest) wallet.setAttribute("aria-label", `${account.balance} Race Dollars`);

    fill(
      tabs,
      CARS.map(item =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            class: "car-tab",
            "aria-selected": String(item.key === car.key),
            dataset: { car: item.key },
            onclick: () => {
              selected = item.key;
              context.audio.button();
              render();
            }
          },
          h("span", { class: "car-tab-name", text: item.name }),
          h("span", { class: "car-tab-state", text: item.key === equipped ? "Equipped" : owns(item.key) ? "Owned" : formatRaceDollars(item.price) })
        )
      )
    );

    const owned = owns(car.key);
    const isEquipped = car.key === equipped;
    const short = guest ? 0 : Math.max(0, car.price - account.balance);
    const status = isEquipped ? "EQUIPPED" : owned ? "OWNED" : car.price === 0 ? "FREE" : formatRaceDollars(car.price);
    const actions = [
      h("button", { type: "button", class: "button", dataset: { action: "try" }, onclick: () => startStage(context, { stage: 1, settings: readLastSettings(), carKey: car.key, reason: "try", exit: "garage", exitLabel: "Garage" }) }, icon("play"), "TRY CAR")
    ];
    if (guest) {
      /* A school session has no wallet: nothing to buy or equip. */
    } else if (isEquipped) {
      actions.push(h("button", { type: "button", class: "button button-primary", dataset: { action: "equipped" }, disabled: true }, icon("check"), "EQUIPPED"));
    } else if (owned) {
      actions.push(h("button", { type: "button", class: "button button-primary", dataset: { action: "equip" }, onclick: () => equip(car) }, "EQUIP"));
    } else {
      actions.push(h("button", { type: "button", class: "button button-primary", dataset: { action: "buy" }, disabled: short > 0, onclick: () => confirmBuy(car) }, icon("coin"), `BUY ${formatRaceDollars(car.price)}`));
    }

    fill(
      detail,
      h("div", { class: "car-head" }, h("h2", { text: car.name }), h("p", { class: `car-status${isEquipped ? " is-equipped" : owned ? " is-owned" : ""}`, text: status })),
      h("p", { class: "car-blurb", text: car.blurb }),
      h(
        "div",
        { class: "stats" },
        statBar("Speed", car.topSpeed, car.topSpeed / TOP, " km/h"),
        statBar("Acceleration", `+${car.boost}`, car.boost / BOOST, " km/h per correct answer"),
        statBar("Handling", held(car), held(car) / HELD, "% of speed held after 5 s")
      ),
      h(
        "dl",
        { class: "car-facts" },
        h("div", null, h("dt", { text: "Price" }), h("dd", { text: car.price === 0 ? "Free" : `${formatRaceDollars(car.price)} Race Dollars` })),
        h("div", null, h("dt", { text: "Recommended" }), h("dd", { text: `Stages ${car.recommended[0]}–${car.recommended[1]}` })),
        h("div", null, h("dt", { text: "To finish a race" }), h("dd", { text: `${MIN_CORRECT} correct answers, like every car` }))
      ),
      !guest && !owned && short > 0 ? h("p", { class: "car-short", text: `You need ${formatRaceDollars(short)} more Race Dollars. Win stages and earn achievements to get there.` }) : null,
      guest ? h("p", { class: "notice" }, icon("info"), "You can try every car. Buying and keeping cars needs a MathNexa account.") : null,
      h("div", { class: "car-actions" }, actions)
    );
  }

  loadAccount({ fresh: true })
    .then(loaded => {
      if (destroyed) return;
      account = loaded;
      render();
    })
    .catch(problem => {
      if (destroyed) return;
      fill(detail, h("p", { class: "form-error", role: "alert", text: problem?.message ?? "Could not load the garage. Try again." }));
    });

  return {
    destroy() {
      destroyed = true;
      showroom?.dispose();
      showroom = null;
    }
  };
}
