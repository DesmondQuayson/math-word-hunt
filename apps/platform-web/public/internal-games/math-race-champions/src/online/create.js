// Online Race, from the game menu: create a room (anyone signed in can, and the
// creator races too), come back to a room you created, or go and join one.

import { MESSAGES, accountRequest, createServerClock, playRequest } from "../api.js";
import { MIN_CORRECT, ONLINE_CAR, ONLINE_LENGTH_KM } from "../engine/race.js";
import { h, icon } from "../dom.js";
import { createSettingsChooser, readLastSettings, writeLastSettings } from "../setup.js";
import { createRacerFields, rememberRacer } from "./people.js";
import { clearSeat, readSeat, writeSeat } from "./seat.js";

export function mount(root, context) {
  let destroyed = false;
  const error = h("p", { class: "form-error", role: "alert" });
  const create = h("button", { type: "submit", class: "button button-primary button-large" }, icon("flag"), "Create room");
  const racer = createRacerFields({ idPrefix: "creator" });
  let chooser = null;
  chooser = createSettingsChooser(readLastSettings(), {
    idPrefix: "online",
    onChange: () => {
      if (chooser) create.disabled = chooser.value() === null;
    }
  });
  const resume = h("div", { class: "resume" });

  function enter(room, seat, clock) {
    writeSeat({ ...seat, code: room.code, name: room.me.name });
    context.navigate("online-lobby", { room, seat, clock });
  }

  const form = h(
    "form",
    {
      class: "panel setup",
      novalidate: true,
      onsubmit: async event => {
        event.preventDefault();
        const settings = chooser.value();
        const who = racer.value();
        if (!settings) return;
        if (!who.ok) {
          error.textContent = MESSAGES[who.error] ?? "Check your name.";
          racer.name.focus();
          return;
        }
        context.audio.button();
        create.disabled = true;
        error.textContent = "";
        const clock = createServerClock();
        const sentAt = performance.now();
        try {
          const reply = await accountRequest("create-room", { name: who.name, emoji: who.emoji, colour: who.colour, categories: settings.categories, difficulty: settings.difficulty });
          if (destroyed) return;
          clock.sample(reply.room.nowMs, sentAt, performance.now());
          writeLastSettings(settings);
          rememberRacer(who);
          enter(reply.room, { token: reply.token, hostToken: reply.hostToken }, clock);
        } catch (problem) {
          if (destroyed) return;
          error.textContent = problem?.message ?? "The room could not be created. Try again.";
          create.disabled = false;
        }
      }
    },
    h("h2", { text: "Create a room" }),
    h("p", { class: "field-hint", text: `Everyone drives the ${ONLINE_CAR.name}: same speed, same acceleration, for all. ${ONLINE_LENGTH_KM} km, and at least ${MIN_CORRECT} correct answers to finish. Garage cars are not used online.` }),
    racer.elements,
    chooser.elements,
    error,
    h("div", { class: "setup-actions" }, create)
  );

  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page" },
      h(
        "header",
        { class: "page-head" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to the game menu", onclick: () => context.navigate("hub") }, icon("back")),
        h("div", null, h("p", { class: "eyebrow", text: "Room code or QR · same car for everyone" }), h("h1", { text: "Online Race" }))
      ),
      resume,
      form,
      h(
        "section",
        { class: "panel join-other" },
        h("h2", { text: "Have a code?" }),
        h("p", { class: "field-hint", text: "Join a friend's race with their six-digit code. No account is needed to join." }),
        h("a", { class: "button", href: "/join" }, icon("users"), "Join a race")
      )
    )
  );

  // Back to a room this tab is already in (a refresh), or one this account created.
  const seat = readSeat();
  if (seat) {
    const clock = createServerClock();
    const sentAt = performance.now();
    playRequest("state", { token: seat.token })
      .then(reply => {
        if (destroyed || !reply.room) return;
        clock.sample(reply.room.nowMs, sentAt, performance.now());
        if (reply.room.phase === "COMPLETE" && reply.room.finalized) return clearSeat();
        resume.append(
          h(
            "p",
            { class: "notice notice-action" },
            icon("flag"),
            `You are in room ${reply.room.code}.`,
            h("button", { type: "button", class: "button button-small", onclick: () => enter(reply.room, seat, clock) }, "Go back in")
          )
        );
      })
      .catch(() => clearSeat());
  } else {
    resume.append(
      h(
        "p",
        { class: "resume-link" },
        h(
          "button",
          {
            type: "button",
            class: "link-button",
            onclick: async event => {
              const button = event.currentTarget;
              button.disabled = true;
              const clock = createServerClock();
              const sentAt = performance.now();
              try {
                const reply = await accountRequest("resume-room");
                if (destroyed) return;
                clock.sample(reply.room.nowMs, sentAt, performance.now());
                enter(reply.room, { token: reply.token, hostToken: reply.hostToken }, clock);
              } catch (problem) {
                if (destroyed) return;
                error.textContent = problem?.message ?? "No live room was found.";
                button.disabled = false;
              }
            }
          },
          "Created a room on another device? Take it over here"
        )
      )
    );
  }

  return {
    destroy() {
      destroyed = true;
    }
  };
}
