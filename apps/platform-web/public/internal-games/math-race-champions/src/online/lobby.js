// The room before the start: the code, the QR code and the link to share, who
// is in, and (for the creator) Lock Join, Remove and Start Race. The creator is
// a racer like everyone else and starts on the same lights.

import { joinHostLabel, joinLink } from "../../../math-bingo-live/src/join-link.js";
import { encodeQr, qrPath } from "../../../math-bingo-live/src/engine/qr.js";
import { accountRequest, createServerClock, playRequest } from "../api.js";
import { CATEGORIES, DIFFICULTIES } from "../engine/questions.js";
import { MIN_CORRECT, ONLINE_CAR, ONLINE_LENGTH_KM, ROOM_CAPACITY } from "../engine/race.js";
import { announce, fill, h, icon, s } from "../dom.js";
import { cssColour } from "../palette.js";
import { onlineDriver } from "./online-driver.js";
import { clearSeat } from "./seat.js";

const POLL_MS = 1500;

function qrCode(text) {
  const code = encodeQr(text);
  const size = code.size + 8;
  return s(
    "svg",
    { viewBox: `0 0 ${size} ${size}`, class: "qr-code", role: "img", "aria-label": "QR code to join this race", "shape-rendering": "crispEdges", focusable: "false" },
    s("rect", { width: String(size), height: String(size), class: "qr-light" }),
    s("path", { d: qrPath(code, 4), class: "qr-dark" })
  );
}

function summary(settings) {
  const difficulty = DIFFICULTIES.find(item => item.id === settings.difficulty)?.title ?? "";
  const skills = settings.categories.length === CATEGORIES.length ? "Mixed Skills" : settings.categories.map(id => CATEGORIES.find(item => item.id === id)?.title).join(", ");
  return `${skills} · ${difficulty}`;
}

export function mount(root, context, params) {
  let room = params.room;
  const seat = params.seat;
  const clock = params.clock ?? createServerClock();
  const creator = room.me.isCreator === true && Boolean(seat.hostToken);
  let destroyed = false;
  let timer = 0;
  let busy = false;

  const exitScreen = context.role === "join" ? "join" : "online";
  const players = h("ul", { class: "players", "aria-label": "Racers in this room" });
  const count = h("h2", { class: "players-count" });
  const status = h("p", { class: "lobby-status", role: "status" });
  const error = h("p", { class: "form-error", role: "alert" });
  const lock = h("button", { type: "button", class: "button", onclick: () => host(room.locked ? "unlock" : "lock") });
  const start = h("button", { type: "button", class: "button button-primary button-large", onclick: () => host("start") }, icon("flag"), "Start race");
  const link = joinLink(room.code, window.location);

  function goRace() {
    if (destroyed) return;
    stop();
    context.navigate("race", {
      driver: onlineDriver({ room, seat, clock }),
      exit: exitScreen,
      exitLabel: context.role === "join" ? "Join another race" : "Online Race",
      again: creator ? () => { clearSeat(); context.navigate("online"); } : null,
      againLabel: "Create a new race",
      onResult: () => clearSeat()
    });
  }

  function leave(message) {
    stop();
    clearSeat();
    context.navigate(exitScreen, message ? { message } : {});
  }

  function render() {
    count.textContent = `Racers (${room.standings.length} of ${ROOM_CAPACITY})`;
    fill(
      players,
      room.standings.map(row =>
        h(
          "li",
          { class: `player${row.id === room.me.id ? " is-me" : ""}${row.connected ? "" : " is-away"}`, dataset: { racer: row.id } },
          h("span", { class: "swatch", style: `background:${cssColour(row.colour)}` }),
          h("span", { class: "player-name", text: `${row.emoji ? `${row.emoji} ` : ""}${row.name}` }),
          row.creator ? h("span", { class: "tag", text: "Creator" }) : null,
          row.id === room.me.id ? h("span", { class: "tag tag-me", text: "You" }) : null,
          row.connected ? null : h("span", { class: "tag tag-away", text: "Away" }),
          creator && !row.creator ? h("button", { type: "button", class: "icon-button player-remove", "aria-label": `Remove ${row.name}`, onclick: () => host("remove", row.id) }, icon("close")) : null
        )
      )
    );
    fill(lock, icon(room.locked ? "unlock" : "lock"), room.locked ? "Unlock joining" : "Lock joining");
    status.textContent = creator
      ? room.locked
        ? "Joining is locked. Press Start race when everyone is ready."
        : "Share the code. Press Start race when everyone is in."
      : `Waiting for ${room.standings.find(row => row.creator)?.name ?? "the creator"} to start the race…`;
  }

  async function host(command, participant) {
    if (busy) return;
    busy = true;
    error.textContent = "";
    context.audio.button();
    const sentAt = performance.now();
    try {
      const reply = await accountRequest("host", { hostToken: seat.hostToken, command, ...(participant ? { participant } : {}) });
      if (destroyed) return;
      if (reply.result === "closed") return leave("The room was closed.");
      if (Number.isFinite(reply.nowMs)) clock.sample(reply.nowMs, sentAt, performance.now());
      if (command === "remove") announce("Racer removed.");
      await poll(true);
    } catch (problem) {
      if (!destroyed) error.textContent = problem?.message ?? "That did not work. Try again.";
    } finally {
      busy = false;
    }
  }

  async function poll(once = false) {
    if (destroyed) return;
    const sentAt = performance.now();
    try {
      const reply = await playRequest("state", { token: seat.token, since: room.version });
      if (destroyed) return;
      if (reply.room) {
        clock.sample(reply.room.nowMs, sentAt, performance.now());
        room = reply.room;
        if (room.phase !== "LOBBY") return goRace();
        render();
      }
    } catch (problem) {
      if (destroyed) return;
      if (["seat-not-found", "room-closed", "room-expired", "removed"].includes(problem?.code)) return leave(problem.message);
    }
    if (!once && !destroyed) timer = setTimeout(poll, POLL_MS + (document.hidden ? 1500 : 0));
  }

  function stop() {
    destroyed = true;
    clearTimeout(timer);
  }

  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page page-wide lobby" },
      h(
        "header",
        { class: "page-head" },
        h("div", null, h("p", { class: "eyebrow", text: "Online Race" }), h("h1", { text: creator ? "Your room is open" : "You are in!" }))
      ),
      h(
        "div",
        { class: "lobby-grid" },
        h(
          "section",
          { class: "panel share", "aria-label": "How to join" },
          h("p", { class: "share-label", text: "Room code" }),
          h("p", { class: "share-code", id: "join-code", text: room.code }),
          h("p", { class: "share-how" }, "Go to ", h("strong", { text: `${joinHostLabel(window.location)}/join` }), " and type the code, or scan:"),
          link ? qrCode(link) : null,
          link ? h("p", { class: "share-link" }, h("label", { class: "sr-only", for: "join-link", text: "Link to share" }), h("input", { type: "text", id: "join-link", class: "text-input", readonly: true, value: link, onfocus: event => event.currentTarget.select() })) : null
        ),
        h(
          "section",
          { class: "panel lobby-people" },
          count,
          players,
          h("p", { class: "field-hint", text: `${summary(room.settings)}. Everyone drives the ${ONLINE_CAR.name}. ${ONLINE_LENGTH_KM} km, at least ${MIN_CORRECT} correct answers to finish.` }),
          status,
          error,
          h(
            "div",
            { class: "lobby-actions" },
            creator ? [start, lock, h("button", { type: "button", class: "button", onclick: () => host("close") }, "Close room")] : h("button", { type: "button", class: "button", onclick: async () => { try { await playRequest("leave", { token: seat.token }); } catch { /* leaving anyway */ } leave(); } }, "Leave room")
          )
        )
      )
    )
  );
  render();
  // Everyone shares one start, so the 3D code is fetched now, while waiting,
  // rather than during the countdown. Failing to fetch it changes nothing.
  import("../scene3d/world.js").catch(() => {});
  if (room.phase !== "LOBBY") goRace();
  else timer = setTimeout(poll, 600);

  return { destroy: stop };
}
