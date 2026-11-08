// Polygon Showdown Solo: an endless run. A signed-in player's run is saved on
// the server at meaningful moments (never per frame), and a later visit
// continues it. A school access session has no account, so its run is practice
// that lives in this tab and is gone when the tab is.

import { announce, fill, h, icon } from "../../math-bingo-live/src/dom.js";
import { accountRequest, GameError } from "./api.js";
import { BoardView } from "./board-view.js";
import { ACHIEVEMENTS, CURRENCY_NAME, milestonesCrossed } from "./engine/economy.js";
import { CONFIG, createRefillStream, encodeBoard, newGameState, startingBoard } from "./engine/game.js";
import { LocalGame } from "./local-game.js";
import { brand, coinAmount, coinIcon, confirmDialog, numberText, setScreen, soundControls, toast } from "./ui.js";

const AUTOSAVE_MS = 4_000;

/** Saves when something worth keeping happened; never more than one at a time. */
class Saver {
  constructor({ game, runId, epoch, onSaved, onLost }) {
    this.game = game;
    this.runId = runId;
    this.epoch = epoch;
    this.onSaved = onSaved;
    this.onLost = onLost;
    this.inFlight = null;
    this.lastSavedAt = performance.now();
    this.timer = setInterval(() => {
      if (this.game.pending.length && performance.now() - this.lastSavedAt >= AUTOSAVE_MS) this.flush();
    }, 1000);
  }

  stop() {
    clearInterval(this.timer);
  }

  async flush({ checkpoint = false, end = false, keepalive = false } = {}) {
    if (this.inFlight) {
      await this.inFlight.catch(() => undefined);
      if (!this.game.pending.length && !checkpoint && !end) return null;
    }
    const batch = this.game.batch();
    if (!batch && !checkpoint && !end) return null;
    const body = { run: this.runId, epoch: this.epoch, from: batch?.from ?? this.game.acked, moves: batch?.moves ?? [], h: batch?.h, checkpoint, end };
    this.lastSavedAt = performance.now();
    this.inFlight = accountRequest("solo-sync", body, { keepalive });
    try {
      const reply = await this.inFlight;
      this.apply(reply);
      this.onSaved?.(reply);
      // More swaps were waiting behind this batch.
      if (end && this.game.pending.length) return this.flush({ end: true });
      return reply;
    } catch (error) {
      if (error instanceof GameError && (error.code === "run-moved" || error.code === "run-ended" || error.code === "run-not-found")) this.onLost?.(error);
      return null;
    } finally {
      this.inFlight = null;
    }
  }

  apply(reply) {
    if (reply.result === "resync" && reply.run) {
      this.game.resync({ state: reply.run.state, windows: reply.run.windows, nextT: reply.run.nextT });
      return;
    }
    this.game.acknowledge(reply.ack, reply.cursors, reply.windows);
  }
}

export class SoloScreen {
  /** @param session the hub's account session */
  constructor({ app, session, audio, onExit }) {
    this.app = app;
    this.session = session;
    this.audio = audio;
    this.onExit = onExit;
    this.game = null;
    this.saver = null;
    this.view = null;
    this.leaveHandlers = [];
  }

  // --------------------------------------------------------------- opening

  /** mode: "continue" | "new" */
  async open(mode) {
    setScreen("loading");
    fill(this.app, h("main", { id: "main", class: "center-screen" }, brand(), h("p", { class: "status-text", role: "status", text: mode === "continue" ? "Restoring your run…" : "Dealing a new board…" })));
    if (this.session.guest) {
      this.openPractice();
      return;
    }
    let reply;
    try {
      reply = mode === "continue" ? await accountRequest("solo-open") : await accountRequest("solo-start", { replace: true });
    } catch (error) {
      if (error instanceof GameError && error.code === "no-active-run") {
        reply = await accountRequest("solo-start", { replace: true });
      } else {
        throw error;
      }
    }
    this.mount(reply.run);
  }

  openPractice() {
    const seed = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const stream = createRefillStream(seed);
    this.mount({
      id: null,
      epoch: 0,
      nextT: 0,
      nowT: 0,
      state: newGameState(encodeBoard(startingBoard(seed))),
      balance: 0
    }, stream.at);
  }

  mount(run, refillAt) {
    setScreen("solo");
    const openedAt = performance.now();
    const baseT = run.nowT;
    this.runId = run.id;
    this.bank = run.balance ?? 0;
    this.runCoinsAtOpen = run.state.coins;
    this.lastMilestoneCoins = run.state.coins;
    this.view = new BoardView({ config: CONFIG, motion: () => !this.reducedMotion(), onSwap: (a, b) => this.game.attempt(a, b) });
    this.game = new LocalGame({
      state: run.state,
      windows: run.windows,
      cursors: run.state.cursors,
      nextT: run.nextT,
      clockT: () => baseT + (performance.now() - openedAt),
      view: this.view,
      audio: this.audio,
      refillAt,
      onStep: (step, result) => this.showStep(step, result),
      onMoved: (result, before) => this.afterMove(result, before),
      onStall: () => this.saver?.flush()
    });
    this.renderScreen();
    this.view.setBoard(run.state.board);
    this.view.setEnabled(true);
    this.updateHud();
    if (run.id) {
      this.saver = new Saver({
        game: this.game,
        runId: run.id,
        epoch: run.epoch,
        onSaved: (reply) => this.saved(reply),
        onLost: (error) => this.lost(error)
      });
      this.watchLeaving();
    }
    window.__POLYGON_SHOWDOWN__.solo = this;
  }

  reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  renderScreen() {
    this.coinsValue = h("span", { class: "coin-number", id: "run-coins", text: "0" });
    this.scoreValue = h("span", { class: "hud-number", id: "run-score", text: "0" });
    this.walletValue = h("span", { class: "hud-number", id: "wallet-total", text: "0" });
    this.statValues = {
      matches: h("strong", { id: "stat-matches", text: "0" }),
      largest: h("strong", { id: "stat-largest", text: "0" }),
      combo: h("strong", { id: "stat-combo", text: "×0" }),
      cascades: h("strong", { id: "stat-cascades", text: "0" })
    };
    this.comboBanner = h("div", { class: "combo-banner", "aria-hidden": "true" });
    const stat = (label, value) => h("div", { class: "stat" }, h("span", { text: label }), value);
    const stats = h("section", { class: "stat-panel", "aria-label": "This run" },
      h("h2", { class: "panel-heading", text: "This Run" }),
      stat("Matches", this.statValues.matches),
      stat("Largest clear", this.statValues.largest),
      stat("Best combo", this.statValues.combo),
      stat("Cascades", this.statValues.cascades),
      this.milestoneBar());
    const guestNote = this.session.guest
      ? h("p", { class: "guest-note", id: "guest-note", text: "Practice run: progress here is not saved. Sign in to a MathNexa account before playing to save coins, purchases and avatar progress." })
      : null;
    fill(this.app,
      h("main", { id: "main", class: "play-screen" },
        h("header", { class: "hud" },
          h("button", { type: "button", class: "icon-button", "aria-label": "Back to Polygon Showdown home", title: "Home", onclick: () => this.exit() }, icon("home")),
          brand({ compact: true }),
          h("div", { class: "hud-values" },
            h("div", { class: "hud-value", title: `Coins this run` }, h("span", { class: "hud-label", text: "Run" }), h("span", { class: "coin-amount big" }, coinIcon(), this.coinsValue)),
            h("div", { class: "hud-value" }, h("span", { class: "hud-label", text: "Score" }), this.scoreValue),
            this.session.guest ? null : h("div", { class: "hud-value" }, h("span", { class: "hud-label", text: "Wallet" }), h("span", { class: "coin-amount" }, coinIcon(), this.walletValue))),
          soundControls(this.audio),
          h("button", { type: "button", class: "button small ghost end-run", id: "end-run", text: "END RUN", onclick: () => this.endRun() })),
        h("div", { class: "play-area" },
          h("div", { class: "board-wrap" }, this.view.root, this.comboBanner),
          stats),
        guestNote));
  }

  milestoneBar() {
    this.milestoneText = h("span", { id: "milestone-text" });
    this.milestoneFill = h("span", { class: "milestone-fill" });
    return h("div", { class: "milestone" }, h("div", { class: "milestone-track", "aria-hidden": "true" }, this.milestoneFill), this.milestoneText);
  }

  // ------------------------------------------------------------- during play

  showStep(step) {
    const multi = step.chain >= 2;
    this.audio.match(step.chain);
    this.audio.break();
    if (multi) this.audio.cascade(step.chain);
    if (step.chain >= 3) this.audio.combo(step.chain);
    this.audio.coin();
    setTimeout(() => this.audio.fall(), 200);
    for (const group of step.groups) this.view.floatCoins(group);
    this.bumpCoins(step.coins);
    if (multi) this.flashCombo(step.chain);
    const shapes = step.groups.map((group) => `${group.size} ${["circles", "triangles", "squares", "rectangles"][group.kind] ?? "shapes"}`).join(", ");
    announce(`${multi ? `Combo times ${step.chain}. ` : "Match. "}${shapes}. Plus ${step.coins} ${step.coins === 1 ? "coin" : "coins"}.`);
  }

  bumpCoins(amount) {
    this.shownCoins = (this.shownCoins ?? this.game.state.coins - amount) + amount;
    this.coinsValue.textContent = numberText(this.shownCoins);
  }

  flashCombo(chain) {
    this.comboBanner.textContent = `COMBO ×${chain}`;
    this.comboBanner.classList.remove("show");
    void this.comboBanner.offsetWidth;
    this.comboBanner.classList.add("show");
  }

  afterMove(result, before) {
    this.updateHud();
    if (!result) return;
    if (result.reshuffled) {
      this.audio.reshuffle();
      toast("No moves left. Fresh shuffle, on the house!");
      announce("No moves left. The board was reshuffled for free.");
      this.saver?.flush({ checkpoint: true });
    }
    const crossed = milestonesCrossed(before.coins, this.game.state.coins);
    if (crossed.length) {
      toast(`Milestone: ${numberText(crossed[crossed.length - 1])} coins this run!`, { tone: "gold" });
      this.saver?.flush({ checkpoint: true });
    }
  }

  updateHud() {
    const state = this.game.state;
    this.shownCoins = state.coins;
    this.coinsValue.textContent = numberText(state.coins);
    this.scoreValue.textContent = numberText(state.score);
    this.statValues.matches.textContent = numberText(state.matches);
    this.statValues.largest.textContent = numberText(state.largestClear);
    this.statValues.combo.textContent = `×${state.bestCombo}`;
    this.statValues.cascades.textContent = numberText(state.cascades);
    this.walletValue.textContent = numberText(this.bank + (state.coins - this.bankedRunCoins()));
    this.updateMilestone(state.coins);
  }

  bankedRunCoins() {
    return this.bankBase ?? this.runCoinsAtOpen;
  }

  updateMilestone(coins) {
    const next = [25, 50, 100, 250, 500, 1000, 2500, 5000].find((value) => value > coins);
    if (!next) {
      this.milestoneText.textContent = "Every milestone reached!";
      this.milestoneFill.style.width = "100%";
      return;
    }
    this.milestoneText.textContent = `Next milestone: ${numberText(next)}`;
    this.milestoneFill.style.width = `${Math.round((coins / next) * 100)}%`;
  }

  saved(reply) {
    if (typeof reply.balance === "number" && typeof reply.banked === "number") {
      this.bank = reply.balance;
      this.bankBase = reply.banked;
    }
    if (reply.capped) toast("That is the most coins you can bank today. Keep playing for fun, and come back tomorrow!");
    for (const key of reply.achievements ?? []) {
      const achievement = ACHIEVEMENTS.find((item) => item.key === key);
      if (achievement) toast(`Achievement: ${achievement.title}`, { tone: "gold" });
    }
    this.updateHud();
  }

  lost(error) {
    this.saver?.stop();
    this.view.setEnabled(false);
    this.game.frozen = true;
    fill(this.app, h("main", { id: "main", class: "center-screen" }, brand(),
      h("p", { class: "status-text", text: error.message }),
      h("div", { class: "button-row" },
        h("button", { type: "button", class: "button primary", text: "Continue Here", onclick: () => this.reopen() }),
        h("button", { type: "button", class: "button ghost", text: "Back", onclick: () => this.onExit() }))));
  }

  async reopen() {
    this.cleanup();
    await this.open("continue");
  }

  // --------------------------------------------------------------- leaving

  watchLeaving() {
    const save = () => {
      if (document.visibilityState === "hidden") this.saver?.flush({ checkpoint: true, keepalive: true });
    };
    const leave = () => this.saver?.flush({ checkpoint: true, keepalive: true });
    document.addEventListener("visibilitychange", save);
    window.addEventListener("pagehide", leave);
    this.leaveHandlers.push(() => document.removeEventListener("visibilitychange", save), () => window.removeEventListener("pagehide", leave));
  }

  cleanup() {
    this.saver?.stop();
    this.saver = null;
    for (const undo of this.leaveHandlers.splice(0)) undo();
    this.view?.destroy();
    this.view = null;
  }

  async exit() {
    this.game.frozen = true;
    await this.saver?.flush({ checkpoint: true });
    this.cleanup();
    this.onExit();
  }

  async endRun() {
    const confirmed = await confirmDialog({
      title: "End this run?",
      body: this.session.guest ? "This practice run will end." : `Your coins are safe in your wallet. A new run starts from a fresh board.`,
      confirm: "End Run"
    });
    if (!confirmed) return;
    this.game.frozen = true;
    while (this.game.busy) await new Promise((resolve) => setTimeout(resolve, 40));
    const state = this.game.state;
    let balance = null;
    if (this.saver) {
      const reply = await this.saver.flush({ end: true });
      balance = reply?.balance ?? null;
    }
    this.cleanup();
    this.summary(state, balance);
  }

  summary(state, balance) {
    setScreen("run-summary");
    this.audio.finish();
    const row = (label, value) => h("div", { class: "summary-row" }, h("span", { text: label }), h("strong", { text: value }));
    fill(this.app, h("main", { id: "main", class: "center-screen" }, brand(),
      h("section", { class: "card summary", "aria-labelledby": "summary-title" },
        h("h1", { id: "summary-title", text: "RUN COMPLETE" }),
        h("div", { class: "summary-coins" }, coinAmount(state.coins, "huge"), h("span", { text: CURRENCY_NAME })),
        row("Score", numberText(state.score)),
        row("Matches", numberText(state.matches)),
        row("Largest clear", numberText(state.largestClear)),
        row("Best combo", `×${state.bestCombo}`),
        row("Cascades", numberText(state.cascades)),
        balance === null ? h("p", { class: "guest-note", text: "Practice run: nothing was saved. Sign in to a MathNexa account before playing to save coins, purchases and avatar progress." })
          : h("p", { class: "summary-wallet", id: "summary-wallet" }, "Wallet: ", coinAmount(balance))),
      h("div", { class: "button-row" },
        h("button", { type: "button", class: "button primary", id: "new-run", text: "NEW RUN", onclick: () => this.open("new") }),
        h("button", { type: "button", class: "button ghost", text: "HOME", onclick: () => this.onExit() }))));
  }
}
