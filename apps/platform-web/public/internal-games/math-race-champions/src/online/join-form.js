// A racer's way in at /join: the room code and a display name. No account, no
// sign-in, no cookie. A code that belongs to another MathNexa live game is
// handed to that game's own join screen with what was typed here.

import { codeFromSearch } from "../../../math-bingo-live/src/join-link.js";
import { MESSAGES, createServerClock, playRequest } from "../api.js";
import { h, icon } from "../dom.js";
import { createRacerFields, rememberRacer } from "./people.js";
import { clearSeat, readSeat, recentSeat, writeSeat } from "./seat.js";

const PREFILL_KEY = "mathnexa:live-join:prefill";

function readPrefill(code) {
  try {
    const value = JSON.parse(sessionStorage.getItem(PREFILL_KEY) ?? "null");
    sessionStorage.removeItem(PREFILL_KEY);
    if (value?.code === code && typeof value.name === "string") return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function mount(root, context, params = {}) {
  let destroyed = false;
  const urlCode = codeFromSearch(window.location.search);
  const prefill = urlCode ? readPrefill(urlCode) : null;
  const error = h("p", { class: "form-error", role: "alert", text: params.message ?? "" });
  const code = h("input", { type: "text", id: "code", class: "text-input code-input", inputmode: "numeric", autocomplete: "off", maxlength: "6", pattern: "[0-9]{6}", value: urlCode, "aria-describedby": "code-hint" });
  code.addEventListener("input", () => {
    code.value = code.value.replace(/\D/g, "").slice(0, 6);
  });
  const racer = createRacerFields({ idPrefix: "racer", initial: prefill ? { name: prefill.name, emoji: prefill.emoji } : {} });
  racer.name.id = "name";
  const join = h("button", { type: "submit", class: "button button-primary button-large", id: "join-game" }, icon("flag"), "Join race");
  const offer = h("div", { class: "resume" });

  function enter(room, seat, clock) {
    writeSeat({ ...seat, code: room.code, name: room.me.name });
    context.navigate("online-lobby", { room, seat, clock });
  }

  async function submit() {
    const who = racer.value();
    if (!/^[1-9]\d{5}$/.test(code.value)) {
      error.textContent = MESSAGES["invalid-code"];
      code.focus();
      return;
    }
    if (!who.ok) {
      error.textContent = MESSAGES[who.error] ?? "Check your name.";
      racer.name.focus();
      return;
    }
    context.audio.button();
    join.disabled = true;
    error.textContent = "";
    const clock = createServerClock();
    const sentAt = performance.now();
    try {
      const reply = await playRequest("join", { code: code.value, name: who.name, emoji: who.emoji, colour: who.colour });
      if (destroyed) return;
      if (reply.result === "other-game" && typeof reply.href === "string" && reply.href.startsWith("/join?code=")) {
        try {
          sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ code: code.value, name: who.name, emoji: who.emoji }));
        } catch {
          /* The next screen simply asks for the name again. */
        }
        window.location.assign(reply.href);
        return;
      }
      clock.sample(reply.room.nowMs, sentAt, performance.now());
      rememberRacer(who);
      enter(reply.room, { token: reply.token }, clock);
    } catch (problem) {
      if (destroyed) return;
      error.textContent = problem?.message ?? "Could not join. Try again.";
      join.disabled = false;
    }
  }

  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page page-narrow" },
      h(
        "header",
        { class: "page-head page-head-center" },
        h("div", null, h("p", { class: "eyebrow", text: "Math Race Champions" }), h("h1", { text: "Join an Online Race" }))
      ),
      offer,
      h(
        "form",
        { class: "panel setup", novalidate: true, onsubmit: event => { event.preventDefault(); submit(); } },
        h("div", { class: "field" }, h("label", { class: "field-label", for: "code", text: "Room code" }), code, h("p", { class: "field-hint", id: "code-hint", text: "The 6 numbers on the creator's screen." })),
        racer.elements,
        error,
        h("div", { class: "setup-actions" }, join)
      ),
      h("p", { class: "fine-print", text: "No account is needed. Your name is shown to the other racers in this room and is deleted with the room." })
    )
  );

  // Same tab, still seated (a refresh): straight back in. Same device, recently
  // seated: offered, never assumed.
  const seat = readSeat();
  if (seat && (!urlCode || seat.code === urlCode)) {
    const clock = createServerClock();
    const sentAt = performance.now();
    playRequest("state", { token: seat.token })
      .then(reply => {
        if (destroyed || !reply.room) return;
        clock.sample(reply.room.nowMs, sentAt, performance.now());
        if (reply.room.phase === "COMPLETE" && reply.room.finalized) return clearSeat();
        enter(reply.room, seat, clock);
      })
      .catch(() => clearSeat());
  } else if (urlCode) {
    const recent = recentSeat(urlCode);
    if (recent) {
      offer.append(
        h(
          "p",
          { class: "notice notice-action" },
          icon("flag"),
          `Were you ${recent.name || "in this race"}?`,
          h(
            "button",
            {
              type: "button",
              class: "button button-small",
              onclick: async () => {
                const clock = createServerClock();
                const sentAt = performance.now();
                try {
                  const reply = await playRequest("state", { token: recent.token });
                  if (destroyed || !reply.room) return;
                  clock.sample(reply.room.nowMs, sentAt, performance.now());
                  enter(reply.room, { token: recent.token }, clock);
                } catch (problem) {
                  clearSeat();
                  offer.replaceChildren();
                  error.textContent = problem?.message ?? "That seat is gone. Join again.";
                }
              }
            },
            "Rejoin"
          )
        )
      );
    }
  }
  if (prefill && urlCode) submit();

  return {
    destroy() {
      destroyed = true;
    }
  };
}
