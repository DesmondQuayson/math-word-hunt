// Polygon Showdown live room. One screen for everyone, the creator included:
// lobby, 3-2-1, then the player's own board in the same tab. The creator is
// player number one and differs from every other player only by a small
// "Showdown Controls" menu. The server's clock and replay decide the result.

import { announce, fill, h, icon } from "../../math-bingo-live/src/dom.js";
import { joinHostLabel, joinLink } from "../../math-bingo-live/src/join-link.js";
import { withEmoji } from "../../math-bingo-live/src/engine/emoji.js";
import { accountRequest, createServerClock, GameError, playRequest } from "./api.js";
import { BoardView } from "./board-view.js";
import { CONFIG } from "./engine/game.js";
import { LocalGame } from "./local-game.js";
import { brand, coinAmount, coinIcon, confirmDialog, formatClock, musicCredit, numberText, qrCode, setScreen, soundControls, toast } from "./ui.js";

export const SEAT_KEY = "mathnexa:polygon-showdown:seat";
export const RECENT_KEY = "mathnexa:polygon-showdown:recent";

const MEDALS = ["🥇", "🥈", "🥉"];
const POLL_LOBBY_MS = 1_500;
const POLL_ACTIVE_MS = 1_200;
const POLL_HIDDEN_MS = 2_500;

export function readSeat() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? "null");
    if (value && typeof value.token === "string" && typeof value.code === "string") return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSeat(seat) {
  try {
    if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* A reload will not restore without storage. */
  }
}

function rememberRecent(seat, me) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ token: seat.token, code: seat.code, name: me.name, emoji: me.emoji, at: Date.now() }));
  } catch {
    /* Only used to offer "Rejoin". */
  }
}

/** The countdown and the game are one screen: its board must never be redrawn mid-move. */
const screenFor = (phase) => (phase === "COUNTDOWN" || phase === "ACTIVE" ? "PLAY" : phase);

export function codeLabel(code) {
  return String(code).split("").join(" ");
}

export class ShowdownScreen {
  /**
   * @param seat  { token, code, hostToken? } — hostToken only on the creator's screen
   * @param room  the room payload to start from
   * @param onExit () => void — leave for the hub or the join page
   */
  constructor({ app, audio, seat, room, onExit, exitLabel }) {
    this.app = app;
    this.audio = audio;
    this.seat = seat;
    this.room = room;
    this.onExit = onExit;
    this.exitLabel = exitLabel;
    this.clock = createServerClock();
    this.clock.sample(room.nowMs, performance.now() - 50, performance.now());
    this.game = null;
    this.view = null;
    this.timer = null;
    this.tickTimer = null;
    this.failures = 0;
    this.renderedPhase = null;
    this.lastTickSecond = null;
    this.frozen = false;
    this.closed = false;
    this.isCreator = Boolean(seat.hostToken);
    window.__POLYGON_SHOWDOWN__.showdown = this;
    saveSeat(seat);
    if (room.me) rememberRecent(seat, room.me);
  }

  get me() {
    return this.room.me;
  }

  start() {
    this.renderPhase();
    this.schedule(0);
    document.addEventListener("visibilitychange", this.onVisibility = () => {
      if (!document.hidden) this.schedule(0);
    });
    this.tickTimer = setInterval(() => this.tick(), 200);
  }

  stop() {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.tickTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.view?.destroy();
    this.view = null;
  }

  // ---------------------------------------------------------------- network

  schedule(delay) {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), delay);
  }

  nextDelay() {
    if (this.room.phase === "COMPLETE") return this.room.finalized ? null : 800;
    if (document.hidden) return POLL_HIDDEN_MS;
    if (this.room.phase === "LOBBY") return POLL_LOBBY_MS;
    if (this.room.phase === "COUNTDOWN") return 500;
    return POLL_ACTIVE_MS + Math.random() * 200;
  }

  async poll() {
    if (this.closed || this.polling) return;
    this.polling = true;
    const batch = this.game?.batch() ?? null;
    const sentAt = performance.now();
    try {
      const reply = await playRequest("state", {
        token: this.seat.token,
        ...(this.room.phase === "LOBBY" ? { since: this.room.version } : {}),
        ...(batch ?? {})
      }, { timeoutMs: 10_000 });
      this.clock.sample(reply.result === "unchanged" ? reply.nowMs : reply.room.nowMs, sentAt, performance.now());
      this.setConnected(true);
      if (reply.result !== "unchanged") this.apply(reply);
    } catch (error) {
      if (error instanceof GameError && ["seat-not-found", "room-closed", "room-expired", "removed"].includes(error.code)) {
        this.polling = false;
        this.ended(error);
        return;
      }
      this.failures += 1;
      if (this.failures >= 3) this.setConnected(false);
    }
    this.polling = false;
    const delay = this.nextDelay();
    if (delay !== null) this.schedule(this.alignDelay(delay));
  }

  /** Poll at the moment the phase changes, so every screen flips together. */
  alignDelay(delay) {
    const now = this.clock.now();
    for (const edge of [this.room.startsAtMs, this.room.endsAtMs]) {
      if (typeof edge === "number" && edge > now && edge - now < delay) return Math.max(40, edge - now + 40);
    }
    return delay;
  }

  setConnected(connected) {
    if (connected) this.failures = 0;
    document.body.classList.toggle("offline", !connected);
  }

  apply(reply) {
    this.room = reply.room;
    const me = this.room.me;
    if (me) {
      if (this.game) {
        if (reply.resync) this.game.resync({ state: me.state, windows: me.windows, nextT: me.nextT });
        else this.game.acknowledge(me.state.moves, me.state.cursors, me.windows);
        this.updateMyNumbers();
      }
      if (this.seat.name !== me.name) {
        this.seat = { ...this.seat, name: me.name, emoji: me.emoji };
        saveSeat(this.seat);
        rememberRecent(this.seat, me);
      }
    }
    if (screenFor(this.room.phase) !== this.renderedPhase) this.renderPhase();
    else this.updatePhaseContent();
  }

  ended(error) {
    this.stop();
    saveSeat(null);
    setScreen("ended");
    fill(this.app, h("main", { id: "main", class: "center-screen" }, brand(),
      h("p", { class: "status-text", role: "status", text: error.message }),
      h("button", { type: "button", class: "button primary", text: this.exitLabel, onclick: () => this.onExit() })));
  }

  // ------------------------------------------------------------------ phases

  renderPhase() {
    const { phase } = this.room;
    this.renderedPhase = screenFor(phase);
    if (phase === "LOBBY") this.renderLobby();
    else if (this.renderedPhase === "PLAY") this.renderPlay();
    else this.renderComplete();
  }

  updatePhaseContent() {
    const { phase } = this.room;
    if (phase === "LOBBY") this.updateLobby();
    else if (this.renderedPhase === "PLAY") this.updateStandings();
    else this.renderComplete();
  }

  // ------------------------------------------------------------------- lobby

  joinPanel() {
    const location = window.location;
    const link = joinLink(this.room.code, location);
    return h("section", { class: "join-panel", "aria-label": "How to join" },
      h("h2", { class: "panel-heading", text: "JOIN THIS SHOWDOWN" }),
      this.room.locked
        ? h("p", { class: "join-locked", id: "join-locked", text: "JOINING LOCKED" })
        : [
            link ? h("div", { class: "qr-wrap" }, qrCode(link, `QR code to join this Showdown, code ${codeLabel(this.room.code)}`)) : null,
            h("p", { class: "join-url" }, h("span", { class: "muted", text: "JOIN:" }), " ", h("strong", { text: `${joinHostLabel(location)}/join` })),
            h("p", { class: "join-code-line" }, h("span", { class: "muted", text: "CODE:" }), " ", h("strong", { class: "join-code", id: "join-code", text: this.room.code, "aria-label": codeLabel(this.room.code) }))
          ]);
  }

  rosterItems() {
    return this.room.standings.rows.map((row) => h("li", { class: `roster-row${row.id === this.me?.id ? " me" : ""}` },
      h("span", { class: "roster-emoji", "aria-hidden": "true", text: row.emoji ?? "🔷" }),
      h("span", { class: "roster-name", text: row.name }),
      row.creator ? h("span", { class: "tag", text: "Creator" }) : null));
  }

  renderLobby() {
    setScreen("lobby");
    this.rosterList = h("ul", { class: "roster", id: "roster" }, this.rosterItems());
    this.playerCount = h("span", { id: "player-count", text: String(this.room.standings.total) });
    this.joinSlot = h("div", { id: "join-slot" }, this.joinPanel());
    const minutes = Math.round(this.room.durationSeconds / 60);
    const actions = this.isCreator
      ? h("div", { class: "lobby-actions" },
          h("button", { type: "button", class: "button primary huge", id: "start-showdown", text: "START SHOWDOWN", onclick: (event) => this.startShowdown(event.currentTarget) }),
          h("button", { type: "button", class: "button ghost", id: "lock-joining", text: this.room.locked ? "Unlock Joining" : "Lock Joining", onclick: () => this.toggleLock() }),
          h("button", { type: "button", class: "button ghost", text: "Cancel Showdown", onclick: () => this.endShowdown() }))
      : h("p", { class: "status-text", role: "status", id: "lobby-wait", text: "You're in! Waiting for the creator to start…" });
    fill(this.app, h("main", { id: "main", class: "lobby-screen" },
      h("header", { class: "lobby-header" }, brand(), soundControls(this.audio, { musicKey: this.isCreator ? "music" : "showdownMusic" })),
      h("div", { class: "lobby-grid" },
        this.joinSlot,
        h("section", { class: "roster-panel", "aria-label": "Players" },
          h("h2", { class: "panel-heading" }, "PLAYERS ", h("span", { class: "muted" }, "(", this.playerCount, ")")),
          this.rosterList,
          h("p", { class: "lobby-rule", text: `${minutes} minutes. Everyone starts from the same board. Most coins wins.` }))),
      actions,
      this.isCreator ? musicCredit() : null));
    this.audio.syncMusic();
  }

  updateLobby() {
    if (!this.rosterList) return;
    this.rosterList.replaceChildren(...this.rosterItems());
    this.playerCount.textContent = String(this.room.standings.total);
    this.joinSlot.replaceChildren(this.joinPanel());
    const lock = document.getElementById("lock-joining");
    if (lock) lock.textContent = this.room.locked ? "Unlock Joining" : "Lock Joining";
  }

  host(command, fields = {}) {
    return accountRequest("host", { hostToken: this.seat.hostToken, command, ...fields });
  }

  async startShowdown(button) {
    button.disabled = true;
    button.textContent = "Starting…";
    this.audio.activate();
    try {
      const reply = await this.host("start");
      this.room = { ...this.room, phase: reply.phase, startsAtMs: reply.startsAtMs, endsAtMs: reply.endsAtMs };
      this.clock.sample(reply.nowMs, performance.now() - 50, performance.now());
      this.renderPhase();
      this.schedule(100);
    } catch (error) {
      button.disabled = false;
      button.textContent = "START SHOWDOWN";
      toast(error.message);
    }
  }

  async toggleLock() {
    try {
      const reply = await this.host(this.room.locked ? "unlock" : "lock");
      this.room = { ...this.room, locked: reply.locked };
      if (this.room.phase === "LOBBY") this.updateLobby();
      this.renderControls?.();
    } catch (error) {
      toast(error.message);
    }
  }

  async endShowdown() {
    const inLobby = this.room.phase === "LOBBY";
    const confirmed = await confirmDialog({
      title: inLobby ? "Cancel this Showdown?" : "End this Showdown now?",
      body: inLobby ? "Everyone in the lobby will be sent back." : "The game stops for everyone and the standings become final.",
      confirm: inLobby ? "Cancel Showdown" : "End Showdown",
      danger: true
    });
    if (!confirmed) return;
    try {
      const reply = await this.host("end");
      if (reply.result === "closed") {
        this.stop();
        saveSeat(null);
        this.onExit();
        return;
      }
      this.controls?.close();
      this.schedule(0);
    } catch (error) {
      toast(error.message);
    }
  }

  // -------------------------------------------------------------------- play

  buildGame() {
    const me = this.me;
    this.view = new BoardView({ config: CONFIG, motion: () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches, onSwap: (a, b) => this.game.attempt(a, b) });
    this.game = new LocalGame({
      state: me.state,
      windows: me.windows,
      cursors: me.state.cursors,
      nextT: me.nextT,
      clockT: () => this.clock.now() - this.room.startsAtMs,
      view: this.view,
      audio: this.audio,
      onStep: (step) => this.showStep(step),
      onMoved: () => this.updateMyNumbers(),
      onStall: () => this.schedule(0)
    });
  }

  renderPlay() {
    setScreen("showdown");
    const firstTime = !this.game;
    if (firstTime) this.buildGame();
    this.timerValue = h("span", { class: "timer-value", id: "showdown-timer", role: "timer", text: formatClock(this.room.durationSeconds * 1000) });
    this.coinValue = h("span", { class: "coin-number", id: "showdown-coins", text: numberText(this.game.state.coins) });
    this.rankValue = h("span", { class: "hud-number", id: "showdown-rank", text: "–" });
    this.standingsList = h("ol", { class: "standings", id: "standings" });
    this.tickerList = h("ol", { class: "ticker", id: "ticker", "aria-hidden": "true" });
    this.comboBanner = h("div", { class: "combo-banner", "aria-hidden": "true" });
    this.countdown = h("div", { class: "countdown", id: "countdown", role: "status" });
    const controlsLabel = this.isCreator ? "⋯ Showdown Controls" : "⋯";
    fill(this.app, h("main", { id: "main", class: "play-screen showdown-screen" },
      h("header", { class: "hud" },
        brand({ compact: true }),
        h("div", { class: "hud-values" },
          h("div", { class: "hud-value" }, h("span", { class: "hud-label", text: "Time" }), this.timerValue),
          h("div", { class: "hud-value" }, h("span", { class: "hud-label", text: "Coins" }), h("span", { class: "coin-amount big" }, coinIcon(), this.coinValue)),
          h("div", { class: "hud-value" }, h("span", { class: "hud-label", text: "Place" }), this.rankValue)),
        h("button", { type: "button", class: "button small ghost controls-button", id: "showdown-controls", "aria-label": this.isCreator ? "Showdown Controls" : "Menu", "aria-haspopup": "dialog", onclick: () => this.openControls() }, h("span", { class: "controls-long", text: controlsLabel }), h("span", { class: "controls-short", text: "⋯" }))),
      this.tickerList,
      h("div", { class: "play-area" },
        h("div", { class: "board-wrap" }, this.view.root, this.comboBanner),
        h("section", { class: "standings-panel", "aria-label": "Standings" },
          h("h2", { class: "panel-heading", text: "STANDINGS" }),
          this.standingsList)),
      h("div", { class: "offline-note", role: "status", text: "Reconnecting… your moves are safe." })));
    this.view.root.append(this.countdown);
    this.view.setBoard(this.game.state.board);
    this.updateStandings();
    this.audio.syncMusic();
    this.tick();
    if (firstTime && this.room.phase === "ACTIVE" && this.game.state.moves === 0 && this.clock.now() - this.room.startsAtMs > 3000) {
      toast("You joined part way through: same board, same rules, time left on the clock.");
    }
  }

  showStep(step) {
    const multi = step.chain >= 2;
    this.audio.match(step.chain);
    this.audio.break();
    if (multi) this.audio.cascade(step.chain);
    if (step.chain >= 3) this.audio.combo(step.chain);
    this.audio.coin();
    setTimeout(() => this.audio.fall(), 200);
    for (const group of step.groups) this.view.floatCoins(group);
    this.bumped = (this.bumped ?? this.shownCoins ?? 0) + step.coins;
    this.coinValue.textContent = numberText(this.bumped);
    if (multi) {
      this.comboBanner.textContent = `COMBO ×${step.chain}`;
      this.comboBanner.classList.remove("show");
      void this.comboBanner.offsetWidth;
      this.comboBanner.classList.add("show");
    }
    announce(multi ? `Combo times ${step.chain}. Plus ${step.coins} coins.` : `Match. Plus ${step.coins} ${step.coins === 1 ? "coin" : "coins"}.`);
  }

  updateMyNumbers() {
    if (!this.game || !this.coinValue) return;
    this.shownCoins = this.game.state.coins;
    this.bumped = this.game.state.coins;
    this.coinValue.textContent = numberText(this.game.state.coins);
  }

  rankText(row) {
    return row.tied ? `T-${row.rank}` : `#${row.rank}`;
  }

  standingRow(row) {
    return h("li", { class: `standing-row${row.id === this.me?.id ? " me" : ""}` },
      h("span", { class: "standing-rank", text: this.rankText(row) }),
      h("span", { class: "standing-emoji", "aria-hidden": "true", text: row.emoji ?? "🔷" }),
      h("span", { class: "standing-name", text: row.name }),
      h("span", { class: "standing-coins", text: numberText(row.coins) }));
  }

  updateStandings() {
    if (!this.standingsList) return;
    const { rows, me, total } = this.room.standings;
    const myRow = me ?? rows.find((row) => row.id === this.me?.id);
    const shown = me ? [...rows, me] : rows;
    this.standingsList.replaceChildren(...shown.map((row) => this.standingRow(row)));
    this.tickerList.replaceChildren(...rows.slice(0, 3).map((row) => h("li", { class: row.id === this.me?.id ? "me" : "" }, h("span", { text: `${row.rank}.` }), h("span", { text: row.emoji ?? "🔷" }), h("span", { class: "ticker-name", text: row.name }), h("strong", { text: numberText(row.coins) }))));
    // Before anyone has scored, everyone is tied for first: that is not news.
    const anyScore = shown.some((row) => row.coins > 0);
    this.rankValue.textContent = myRow && anyScore ? `${this.rankText(myRow)}/${total}` : "–";
  }

  /** 3, 2, 1, GO!, the clock, and the buzzer: all from the server's time. */
  tick() {
    if (!this.timerValue || this.renderedPhase !== "PLAY") return;
    const now = this.clock.now();
    const untilStart = this.room.startsAtMs - now;
    const untilEnd = this.room.endsAtMs - now;
    if (untilStart > 0) {
      this.timerValue.textContent = formatClock(this.room.durationSeconds * 1000);
      const second = Math.ceil(untilStart / 1000);
      const label = second > 3 ? "GET READY" : String(second);
      if (this.countdown.textContent !== label) {
        this.countdown.textContent = label;
        this.countdown.classList.add("visible");
        if (second <= 3) this.audio.tick();
        announce(second > 3 ? "Get ready." : String(second));
      }
      this.view.setEnabled(false);
      return;
    }
    if (!this.started) {
      this.started = true;
      if (untilStart > -1500 && this.game.state.moves === 0) {
        this.countdown.textContent = "GO!";
        this.countdown.classList.add("visible", "go");
        this.audio.go();
        announce("Go!");
        setTimeout(() => this.countdown.classList.remove("visible", "go"), 650);
      } else {
        this.countdown.classList.remove("visible");
      }
      this.view.setEnabled(true);
      this.view.moveFocus(this.view.focusCell);
    }
    this.timerValue.textContent = formatClock(untilEnd);
    const second = Math.ceil(untilEnd / 1000);
    this.timerValue.classList.toggle("urgent", second <= 10);
    if (second <= 10 && second > 0 && second !== this.lastTickSecond) {
      this.lastTickSecond = second;
      this.audio.tick();
      if (second === 10 || second <= 5) announce(`${second} seconds left.`);
    }
    if (untilEnd <= 0 && !this.frozen) this.buzzer();
  }

  buzzer() {
    this.frozen = true;
    this.game.frozen = true;
    this.view.setEnabled(false);
    this.countdown.textContent = "TIME!";
    this.countdown.classList.add("visible", "go");
    this.audio.finish();
    announce("Time is up. Counting the scores.");
    this.schedule(60);
  }

  // ----------------------------------------------------------------- controls

  openControls() {
    if (this.controls?.open) return;
    this.controls = h("dialog", { class: "dialog controls-dialog", "aria-labelledby": "controls-title" });
    this.renderControls = () => this.fillControls();
    this.controls.addEventListener("close", () => {
      this.controls.remove();
      this.renderControls = null;
    });
    document.body.append(this.controls);
    this.fillControls();
    this.controls.showModal();
  }

  async fillControls() {
    const dialog = this.controls;
    const closeButton = h("button", { type: "button", class: "icon-button dialog-close", "aria-label": "Close", onclick: () => dialog.close() }, icon("close"));
    if (!this.isCreator) {
      fill(dialog, h("h2", { id: "controls-title", text: "Menu" }), closeButton,
        soundControls(this.audio, { musicKey: "showdownMusic" }),
        h("button", { type: "button", class: "button ghost", id: "leave-showdown", text: "Leave Showdown", onclick: () => this.leave() }));
      return;
    }
    const players = h("ul", { class: "control-players", id: "control-players" }, h("li", { class: "muted", text: "Loading players…" }));
    fill(dialog,
      h("h2", { id: "controls-title", text: "Showdown Controls" }), closeButton,
      h("div", { class: "control-row" },
        h("button", { type: "button", class: "button small ghost", id: "control-lock", text: this.room.locked ? "Unlock Joining" : "Lock Joining", onclick: () => this.toggleLock() }),
        soundControls(this.audio)),
      this.room.locked ? h("p", { class: "join-locked small", text: "JOINING LOCKED" }) : h("p", { class: "join-code-line small" }, h("span", { class: "muted", text: "Late players can join with code " }), h("strong", { text: this.room.code })),
      h("h3", { text: "Players" }),
      players,
      h("button", { type: "button", class: "button danger", id: "control-end", text: "End Showdown", onclick: () => this.endShowdown() }));
    try {
      const reply = await this.host("players");
      players.replaceChildren(...reply.players.map((player) => h("li", { class: "control-player" },
        h("span", { text: withEmoji(player.name, player.emoji) }),
        h("span", { class: `dot ${player.connected ? "on" : "off"}`, "aria-label": player.connected ? "Connected" : "Not connected" }),
        player.creator ? h("span", { class: "tag", text: "Creator" }) : h("button", { type: "button", class: "button tiny ghost", text: "Remove", "aria-label": `Remove ${player.name}`, onclick: () => this.removePlayer(player) }))));
    } catch (error) {
      players.replaceChildren(h("li", { class: "form-error", text: error.message }));
    }
  }

  async removePlayer(player) {
    const confirmed = await confirmDialog({ title: `Remove ${player.name}?`, body: "They leave this Showdown and their score is removed.", confirm: "Remove", danger: true });
    if (!confirmed) return;
    try {
      await this.host("remove", { participant: player.id });
      this.fillControls();
      this.schedule(0);
    } catch (error) {
      toast(error.message);
    }
  }

  async leave() {
    const confirmed = await confirmDialog({ title: "Leave this Showdown?", body: "Your score will be removed.", confirm: "Leave" });
    if (!confirmed) return;
    try {
      await playRequest("leave", { token: this.seat.token });
    } catch {
      /* Leaving anyway. */
    }
    this.controls?.close();
    this.stop();
    saveSeat(null);
    this.onExit();
  }

  // ----------------------------------------------------------------- results

  renderComplete() {
    if (this.game) {
      this.game.frozen = true;
      this.view?.setEnabled(false);
    }
    setScreen("complete");
    this.controls?.close();
    if (!this.room.finalized) {
      fill(this.app, h("main", { id: "main", class: "center-screen" }, brand(), h("p", { class: "status-text", role: "status", text: "Time! Counting the scores…" })));
      this.schedule(600);
      return;
    }
    if (this.resultsShown) return;
    this.resultsShown = true;
    this.view?.destroy();
    this.view = null;
    this.audio.finish();
    const { rows, total } = this.room.standings;
    const mine = rows.find((row) => row.id === this.me?.id);
    const list = rows.map((row) => h("li", { class: `result-row${row.id === this.me?.id ? " me" : ""}${row.rank === 1 ? " winner" : ""}` },
      h("span", { class: "result-place", text: row.rank <= 3 && !row.tied ? MEDALS[row.rank - 1] : row.tied ? `T-${row.rank}` : `${row.rank}` }),
      h("span", { class: "result-emoji", "aria-hidden": "true", text: row.emoji ?? "🔷" }),
      h("span", { class: "result-name", text: row.name }),
      row.creator ? h("span", { class: "tag", text: "Creator" }) : null,
      h("span", { class: "result-coins", text: numberText(row.coins) })));
    const reward = this.me?.signedIn
      ? h("p", { class: "reward-line", id: "showdown-reward" }, coinAmount(this.me.reward ?? 0), ` ${this.me.reward === 1 ? "Polygon Coin" : "Polygon Coins"} added to your wallet.`)
      : h("p", { class: "guest-note", id: "guest-note", text: "This score is for this Showdown only. Sign in to a MathNexa account before playing to save coins, purchases and avatar progress." });
    fill(this.app, h("main", { id: "main", class: "results-screen" },
      brand(),
      h("h1", { id: "results-title", text: "POLYGON SHOWDOWN COMPLETE" }),
      mine ? h("p", { class: "my-result", text: `You finished ${mine.tied ? "tied for " : ""}#${mine.rank} of ${total} with ${numberText(mine.coins)} coins.` }) : null,
      h("ol", { class: "results", id: "results" }, list),
      reward,
      h("div", { class: "button-row" }, h("button", { type: "button", class: "button primary", id: "after-showdown", text: this.exitLabel, onclick: () => { this.stop(); saveSeat(null); this.onExit(); } }))));
    announce(mine ? `Showdown complete. You finished number ${mine.rank} of ${total}.` : "Showdown complete.");
  }
}
