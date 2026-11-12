// The racing screen shared by Computer Race, practice races and Online Race:
// the 3D road above, the question and its two answers below, and over the road
// the speedometer, the progress read-outs and the road minimap.
//
// Everything shown is computed from the driver's state with engine/race.js at
// the driver's clock. The 3D world, the progress bar and the minimap are all
// given the SAME progress number each frame.

import { formatRaceDollars } from "../api.js";
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, viewAt } from "../engine/race.js";
import { announce, fill, formatDuration, h, icon, pressable, prefersReducedMotion, questionForm, s } from "../dom.js";
import { PAINTS, cssColour } from "../palette.js";
import { createMinimap } from "./minimap.js";

const ORDINALS = ["th", "st", "nd", "rd"];
export function ordinal(value) {
  const tail = value % 100;
  return `${value}${ORDINALS[(tail - 20) % 10] ?? ORDINALS[tail] ?? ORDINALS[0]}`;
}

function createSpeedometer(topSpeed) {
  const max = Math.ceil((topSpeed + 10) / 20) * 20;
  const svg = s("svg", { class: "speedo-dial", viewBox: "0 0 120 120", "aria-hidden": "true" });
  // A 240° sweep, open at the bottom.
  const arc = (from, to, radius) => {
    const point = angle => {
      const radians = ((angle - 90) * Math.PI) / 180;
      return `${(60 + radius * Math.cos(radians)).toFixed(2)} ${(60 + radius * Math.sin(radians)).toFixed(2)}`;
    };
    return `M ${point(from)} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;
  };
  svg.append(s("path", { class: "speedo-track", d: arc(-120, 120, 50) }));
  const value = s("path", { class: "speedo-value", d: arc(-120, 120, 50), pathLength: "1", "stroke-dasharray": "0 1" });
  const needle = s("line", { class: "speedo-needle", x1: 60, y1: 60, x2: 60, y2: 18 });
  svg.append(value, needle, s("circle", { class: "speedo-hub", cx: 60, cy: 60, r: 5 }));
  const number = h("span", { class: "speedo-number", text: "0" });
  const element = h("div", { class: "speedo", role: "img", "aria-label": "Speed" }, svg, h("div", { class: "speedo-read" }, number, h("span", { class: "speedo-unit", text: "km/h" })));
  return {
    element,
    set(speed) {
      const share = Math.min(1, Math.max(0, speed / max));
      needle.setAttribute("transform", `rotate(${(-120 + share * 240).toFixed(1)} 60 60)`);
      value.setAttribute("stroke-dasharray", `${share.toFixed(3)} 1`);
      const shown = String(Math.round(speed));
      if (number.textContent !== shown) number.textContent = shown;
      element.setAttribute("aria-label", `Speed ${shown} kilometres per hour`);
    }
  };
}

function statRow(label, value) {
  return h("div", { class: "result-stat" }, h("dt", { text: label }), h("dd", { text: value }));
}

function soloResult(result, context, params) {
  const outcome = result.outcome ?? {};
  const finished = outcome.finished === true;
  const won = outcome.won === true;
  const title = won ? "Victory!" : finished ? "The computer won this one" : "Race ended";
  const rewards = result.rewards;
  const earned = [];
  if (rewards?.stageReward > 0) earned.push(h("li", null, h("strong", { text: `+${formatRaceDollars(rewards.stageReward)}` }), ` first win of Stage ${result.stage}`));
  for (const key of rewards?.achievements ?? []) {
    const item = ACHIEVEMENTS.find(entry => entry.key === key);
    earned.push(h("li", null, h("strong", { text: `+${formatRaceDollars(ACHIEVEMENT_REWARD)}` }), ` ${item?.title ?? key}: ${item?.text ?? ""}`));
  }
  const note =
    result.mode === "practice"
      ? result.reason === "try"
        ? "This was a test drive. Test drives earn nothing."
        : "Practice race. Sign in with a MathNexa account to earn Race Dollars and keep your wins."
      : won && earned.length === 0
        ? "You have already collected this stage's first-win reward."
        : !finished
          ? "A race pays only when you cross the finish line."
          : null;
  const next = won && result.stage < 10 && params.nextStage;
  const buttons = [
    next ? h("button", { type: "button", class: "button button-primary", onclick: () => params.nextStage(result.stage + 1) }, icon("flag"), `Stage ${result.stage + 1}`) : null,
    params.again ? h("button", { type: "button", class: next ? "button" : "button button-primary", onclick: () => params.again() }, icon("refresh"), "Race again") : null,
    h("button", { type: "button", class: "button", onclick: () => context.navigate(params.exit ?? "hub", params.exitParams) }, icon("back"), params.exitLabel ?? "Game menu")
  ];
  return h(
    "div",
    { class: `result-card ${won ? "is-win" : "is-loss"}`, role: "dialog", "aria-modal": "true", "aria-labelledby": "result-title" },
    h("div", { class: "result-badge", "aria-hidden": "true" }, icon(won ? "trophy" : "flag")),
    h("h2", { id: "result-title", text: title }),
    h(
      "dl",
      { class: "result-stats" },
      statRow("Stage", String(result.stage)),
      statRow("Car", result.car.name),
      statRow("Correct", String(outcome.correct ?? 0)),
      statRow("Incorrect", String(outcome.wrong ?? 0)),
      statRow("Accuracy", `${outcome.accuracy ?? 0}%`),
      statRow("Your time", outcome.timeMs ? formatDuration(outcome.timeMs) : "—"),
      statRow("Computer's time", outcome.cpuTimeMs ? formatDuration(outcome.cpuTimeMs) : "—"),
      statRow("Top speed", `${outcome.maxSpeed ?? 0} km/h`)
    ),
    earned.length ? h("div", { class: "result-earned" }, h("h3", { text: "Earned" }), h("ul", null, earned)) : null,
    result.balance !== undefined ? h("p", { class: "result-balance" }, icon("coin"), `Balance: ${formatRaceDollars(result.balance)} Race Dollars`) : null,
    note ? h("p", { class: "result-note", text: note }) : null,
    h("div", { class: "result-actions" }, buttons)
  );
}

function onlineResult(result, context, params) {
  const mine = result.standings.find(row => row.id === result.me.id);
  const title = mine?.f != null ? (mine.rank === 1 ? "You won the race!" : `You finished ${ordinal(mine.rank)}`) : "Race over";
  return h(
    "div",
    { class: `result-card ${mine?.rank === 1 && mine?.f != null ? "is-win" : "is-loss"}`, role: "dialog", "aria-modal": "true", "aria-labelledby": "result-title" },
    h("div", { class: "result-badge", "aria-hidden": "true" }, icon(mine?.rank === 1 ? "trophy" : "flag")),
    h("h2", { id: "result-title", text: title }),
    h(
      "ol",
      { class: "result-ranking" },
      result.standings.map(row =>
        h(
          "li",
          { class: row.id === result.me.id ? "is-me" : null },
          h("span", { class: "rank", text: row.f != null ? ordinal(row.rank) : "—" }),
          h("span", { class: "swatch", style: `background:${cssColour(row.colour)}` }),
          h("span", { class: "name", text: `${row.emoji ? `${row.emoji} ` : ""}${row.name}` }),
          h("span", { class: "time", text: row.f != null ? formatDuration(row.f) : `${Math.round((row.d / (result.lengthKm * 1000)) * 100)}%` }),
          h("span", { class: "score", text: `${row.correct} correct` })
        )
      )
    ),
    h("p", { class: "result-note", text: "Everyone drove the same car. Finishing order is the moment each racer crossed the line." }),
    h(
      "div",
      { class: "result-actions" },
      params.again ? h("button", { type: "button", class: "button button-primary", onclick: () => params.again() }, icon("refresh"), params.againLabel ?? "New race") : null,
      h("button", { type: "button", class: "button", onclick: () => context.navigate(params.exit ?? "hub", params.exitParams) }, icon("back"), params.exitLabel ?? "Game menu")
    )
  );
}

export function mount(root, context, params) {
  const { audio } = context;
  // An Online Race hands over a driver that is already running (everyone shares
  // one start). A race against the computer hands over a plan and a `start`:
  // the road is built first, and only then is the server asked to start the
  // clock, so a slow device never loses its countdown to loading.
  let driver = params.driver ?? null;
  const plan = params.plan ?? driver;
  const reduced = prefersReducedMotion();
  let world = null;
  let frame = 0;
  let lastFrame = performance.now();
  let lastSlow = 0;
  let pending = false;
  let shownIndex = -1;
  let shownResult = false;
  let lastRank = 0;
  let lastView = null;
  let lastRivals = [];
  let destroyed = false;
  let feedbackUntilLock = false;
  let lastCountdown = null;
  let confirming = false;
  let crossedLine = false;

  const canvas = h("canvas", { class: "race-canvas", "aria-hidden": "true" });
  const flat = h("div", { class: "race-flat", hidden: true });
  const minimap = createMinimap(plan.circuit);
  const speedo = createSpeedometer(plan.car.topSpeed);
  const position = h("p", { class: "hud-position" });
  const progressBar = h("span", { class: "hud-bar-fill" });
  const progressText = h("span", { class: "hud-chip-value", text: "0%" });
  const correctText = h("span", { class: "hud-chip-value" });
  const waiting = h("p", { class: "hud-waiting", hidden: true, text: "Answer correctly to drive on!" });
  const banner = h("p", { class: "hud-banner", hidden: true });
  const board = h("ol", { class: "hud-board", hidden: true, "aria-label": "Leaderboard" });
  const countdown = h("p", { class: "race-countdown", hidden: true, "aria-live": "assertive" });
  const overlay = h("div", { class: "race-overlay", hidden: true });
  const questionText = h("p", { class: "race-question", id: "race-question" });
  const feedback = h("p", { class: "race-feedback", role: "status" });
  const buttons = [0, 1].map(index => {
    const label = h("span", { class: "race-choice-label" });
    const button = h("button", { type: "button", class: `race-choice race-choice-${index === 0 ? "left" : "right"}`, disabled: true, "aria-describedby": "race-question", dataset: { choice: String(index) } }, label);
    pressable(button, () => press(index));
    return { button, label };
  });

  const stage = h(
    "div",
    { class: "race-stage" },
    canvas,
    flat,
    h(
      "div",
      { class: "hud" },
      h(
        "div",
        { class: "hud-top" },
        h("button", { type: "button", class: "icon-button hud-quit", "aria-label": "Leave the race", onclick: () => confirmQuit() }, icon("back")),
        h("div", { class: "hud-title" }, h("p", { class: "hud-mode", text: plan.title }), position),
        h(
          "div",
          { class: "hud-chips" },
          h("div", { class: "hud-chip hud-chip-race" }, h("span", { class: "hud-chip-label", text: "Race" }), progressText, h("span", { class: "hud-bar" }, progressBar)),
          h("div", { class: "hud-chip hud-chip-correct" }, h("span", { class: "hud-chip-label", text: "Correct" }), correctText)
        )
      ),
      h("div", { class: "hud-side" }, minimap.element, board),
      speedo.element,
      waiting,
      banner,
      countdown
    )
  );
  const panel = h("div", { class: "race-panel" }, buttons[0].button, h("div", { class: "race-ask" }, questionText, feedback), buttons[1].button);
  const main = h("main", { id: "main", class: "race", dataset: { mode: plan.mode, phase: driver ? "countdown" : "loading" } }, stage, panel, overlay);
  root.replaceChildren(main);

  // The 3D world is the heavy part: loaded on demand, and the race works without it.
  const worldReady = import("../scene3d/quality.js")
    .then(async quality => {
      if (destroyed) return;
      if (!quality.canRender3D()) throw new Error("no-webgl");
      const { createWorld } = await import("../scene3d/world.js");
      if (destroyed) return;
      world = createWorld({ canvas, circuit: plan.circuit, themeName: plan.themeName, tier: quality.detectTier(context.prefs.graphics), seed: plan.title });
      world.setPlayer(plan.playerModel, plan.playerPaint);
      // One frame now, so shaders and textures are ready before the lights.
      world.render({ distanceM: 0, speed: 0 }, [], 16);
      main.dataset.graphics = world.tier;
    })
    .catch(() => {
      // No WebGL: the big road map stands in for the 3D view. Same race.
      main.dataset.graphics = "map";
      canvas.hidden = true;
      flat.hidden = false;
      flat.append(minimap.element);
    });

  function setChoicesEnabled(enabled) {
    for (const item of buttons) if (item.button.disabled === enabled) item.button.disabled = !enabled;
  }

  function showQuestion(question) {
    shownIndex = question?.index ?? -1;
    questionText.textContent = question?.text ?? "";
    questionText.dataset.form = questionForm(question?.text);
    if (question) questionText.setAttribute("aria-label", question.spoken);
    buttons.forEach((item, index) => {
      item.label.textContent = question?.choices[index] ?? "";
      item.button.classList.remove("is-correct", "is-wrong");
    });
  }

  async function press(index) {
    audio.activate();
    if (!driver) return;
    const question = driver.question();
    if (pending || !question || question.index !== shownIndex) return;
    pending = true;
    setChoicesEnabled(false);
    try {
      const outcome = await driver.answer(question.index, index);
      if (destroyed) return;
      if (outcome.result === "ok") {
        buttons[index].button.classList.add(outcome.correct ? "is-correct" : "is-wrong");
        main.dataset.feedback = outcome.correct ? "correct" : "wrong";
        feedback.textContent = outcome.correct ? "Correct! Accelerating" : `Not this time: ${outcome.answer}`;
        feedbackUntilLock = true;
        if (outcome.correct) {
          audio.correct();
          // The throttle opens; the engine then follows the car's new speed.
          audio.raceBoost();
          world?.pulse("boost");
        } else {
          audio.incorrect();
          // The throttle shuts: revs fall and the tyres scrub. Nothing accelerates.
          audio.raceLift();
          world?.pulse("brake");
        }
      }
    } catch (error) {
      if (destroyed) return;
      main.dataset.feedback = "error";
      feedback.textContent = error?.message ?? "Connection problem. Try again.";
      feedbackUntilLock = false;
    } finally {
      pending = false;
    }
  }

  function showResult(result) {
    shownResult = true;
    params.onResult?.(result);
    // Across the line the engine runs down by itself; a race that ended any other way just fades.
    if (!crossedLine) audio.stopRace(0.6);
    main.dataset.phase = "finished";
    setChoicesEnabled(false);
    const online = result.mode === "online";
    const won = online ? result.standings.find(row => row.id === result.me.id)?.rank === 1 && result.standings.find(row => row.id === result.me.id)?.f != null : result.outcome?.won === true;
    if (won) audio.victory();
    else if (online || result.outcome?.finished) audio.finish();
    else audio.defeat();
    fill(overlay, online ? onlineResult(result, context, params) : soloResult(result, context, params));
    overlay.hidden = false;
    overlay.querySelector("button")?.focus();
    announce(overlay.querySelector("h2")?.textContent ?? "Race over", { assertive: true });
  }

  function confirmQuit() {
    if (shownResult || !driver) return context.navigate(params.exit ?? "hub", params.exitParams);
    if (confirming) return;
    confirming = true;
    const stay = h("button", { type: "button", class: "button button-primary", onclick: () => { confirming = false; overlay.hidden = true; fill(overlay); } }, "Keep racing");
    fill(
      overlay,
      h(
        "div",
        { class: "result-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "quit-title" },
        h("h2", { id: "quit-title", text: "Leave the race?" }),
        h("p", { class: "result-note", text: driver.mode === "online" ? "Your car stays where it is and the others race on." : "This race will end here. Nothing is earned for an unfinished race." }),
        h(
          "div",
          { class: "result-actions" },
          stay,
          driver.hostEnd
            ? h("button", { type: "button", class: "button button-pink", onclick: async () => { try { await driver.hostEnd(); } catch { /* the race goes on */ } confirming = false; overlay.hidden = true; fill(overlay); } }, "End the race for everyone")
            : null,
          h("button", { type: "button", class: "button", onclick: async () => { await driver.quit(); context.navigate(params.exit ?? "hub", params.exitParams); } }, "Leave")
        )
      )
    );
    overlay.hidden = false;
    stay.focus();
  }

  function onKey(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !overlay.hidden) return;
    const key = event.key.toLowerCase();
    const index = key === "arrowleft" || key === "a" ? 0 : key === "arrowright" || key === "d" ? 1 : -1;
    if (index < 0 || !driver || buttons[index].button.disabled) return;
    event.preventDefault();
    press(index);
  }

  function slowUpdate(at, view, rivals) {
    // Place: racers ahead of me are those further along, or already home.
    const ahead = rivals.filter(rival => (rival.finished && !view.finished) || (rival.finished && view.finished && rival.finishMs < view.finishMs) || (!rival.finished && !view.finished && rival.progress > view.progress)).length;
    const rank = ahead + 1;
    position.textContent = `${ordinal(rank)} of ${rivals.length + 1}`;
    if (lastRank && at > 0 && !view.finished) {
      // A car going past, on alternate sides so a busy race does not pile up on one ear.
      if (rank !== lastRank) audio.racePass(rank < lastRank, rank % 2 === 0 ? 1 : -1);
    }
    lastRank = rank;
    const percent = Math.floor(view.progress * 100);
    progressText.textContent = `${percent}%`;
    progressBar.style.width = `${(view.progress * 100).toFixed(1)}%`;
    main.dataset.progress = view.progress.toFixed(4);
    correctText.textContent = view.correct >= driver.minCorrect ? `${view.correct} ✓` : `${view.correct}/${driver.minCorrect} minimum`;
    correctText.dataset.met = String(view.correct >= driver.minCorrect);
    waiting.hidden = !(view.waiting && at > 0 && view.correct > 0);
    minimap.update({ progress: view.progress, colour: driver.playerColour ?? "turquoise" }, rivals, driver.lengthKm);

    const cpu = rivals.find(rival => rival.isCpu);
    const bannerText = cpu?.finished && !view.finished ? "The computer has finished. Keep going to complete your race!" : driver.bannerText?.(at, view) ?? "";
    banner.hidden = !bannerText;
    if (banner.textContent !== bannerText) banner.textContent = bannerText;

    const rows = driver.leaderboard?.(at, view);
    if (rows) {
      board.hidden = false;
      fill(
        board,
        rows.map(row =>
          h(
            "li",
            { class: row.me ? "is-me" : null },
            h("span", { class: "rank", text: String(row.place) }),
            h("span", { class: "swatch", style: `background:${cssColour(row.colour)}` }),
            h("span", { class: "name", text: `${row.emoji ? `${row.emoji} ` : ""}${row.name}` }),
            h("span", { class: "score", text: row.finished ? "⚑" : `${Math.round(row.progress * 100)}%` })
          )
        )
      );
    }
  }

  function tick(now) {
    if (destroyed) return;
    frame = requestAnimationFrame(tick);
    const frameMs = now - lastFrame;
    lastFrame = now;
    const at = driver.raceMs();
    driver.tick?.(at);
    const state = driver.state();
    const view = viewAt(state, driver.spec, Math.max(0, at));
    const rivals = driver.rivals(at);
    lastView = view;
    lastRivals = rivals;

    world?.render({ distanceM: view.distanceKm * 1000, speed: view.speed }, rivals.map(rival => ({ id: rival.id, distanceM: rival.distanceM, speed: rival.speed, model: rival.model, paint: rival.paint ?? PAINTS[rival.colour] ?? PAINTS.rival })), frameMs);
    speedo.set(view.speed);
    // The car's sound is drawn from the same speed as the picture: idle on the
    // grid, then whatever the race model says. Only the two nearest rivals are heard.
    if (view.finished && !crossedLine) {
      crossedLine = true;
      audio.endRace();
    }
    audio.updateRace(
      frameMs / 1000,
      { speed: at > 0 ? view.speed : 0, topSpeed: driver.car.topSpeed, distanceM: view.distanceKm * 1000 },
      rivals.map((rival, index) => ({ id: rival.id, distanceM: rival.distanceM, speed: rival.speed, finished: rival.finished, side: index % 2 === 0 ? 1 : -1 }))
    );

    // Lights out.
    if (at < 0) {
      const seconds = Math.ceil(-at / 1000);
      const text = seconds > 3 ? "Get ready" : String(seconds);
      if (text !== lastCountdown) {
        lastCountdown = text;
        countdown.hidden = false;
        countdown.textContent = text;
        countdown.classList.remove("pop");
        if (!reduced) {
          void countdown.offsetWidth;
          countdown.classList.add("pop");
        }
        if (seconds <= 3) audio.countdown();
      }
    } else if (lastCountdown !== "GO!" && lastCountdown !== "done") {
      lastCountdown = "GO!";
      countdown.textContent = "GO!";
      countdown.hidden = false;
      main.dataset.phase = "racing";
      audio.go();
      announce("Go!");
      setTimeout(() => {
        countdown.hidden = true;
        lastCountdown = "done";
      }, 900);
    }

    const question = driver.question();
    if (question && question.index !== shownIndex && !feedbackUntilLock) showQuestion(question);
    const rested = at >= state.lockedUntil;
    if (feedbackUntilLock && rested && !pending) {
      feedbackUntilLock = false;
      feedback.textContent = "";
      main.dataset.feedback = "";
      if (question) showQuestion(question);
    }
    setChoicesEnabled(Boolean(question) && at >= 0 && rested && !pending && !view.finished && !shownResult && question.index === shownIndex);

    if (now - lastSlow > 120) {
      lastSlow = now;
      slowUpdate(at, view, rivals);
    }

    const result = driver.result();
    if (result && !shownResult) {
      slowUpdate(at, view, rivals);
      showResult(result);
    }
  }

  function begin() {
    main.dataset.phase = "countdown";
    if (world && driver.playerModel !== plan.playerModel) world.setPlayer(driver.playerModel, driver.playerPaint);
    showQuestion(driver.question());
    audio.startRace(driver.car.key);
    // Read by the browser tests: what the screen is drawing right now.
    window.__MATH_RACE__ = { ...(window.__MATH_RACE__ ?? {}), race: { driver, view: () => lastView, rivals: () => lastRivals, graphics: () => main.dataset.graphics ?? "loading" } };
    lastFrame = performance.now();
    frame = requestAnimationFrame(tick);
  }

  document.addEventListener("keydown", onKey);
  if (driver) {
    begin();
  } else {
    countdown.hidden = false;
    countdown.textContent = "Getting the track ready\u2026";
    countdown.classList.add("is-loading");
    worldReady
      .then(() => (destroyed ? null : params.start()))
      .then(started => {
        if (!started) return;
        if (destroyed) return void started.quit?.();
        driver = started;
        countdown.classList.remove("is-loading");
        begin();
      })
      .catch(problem => {
        if (destroyed) return;
        countdown.hidden = true;
        fill(
          overlay,
          h(
            "div",
            { class: "result-card", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "start-problem" },
            h("h2", { id: "start-problem", text: "The race could not start" }),
            h("p", { class: "result-note", text: problem?.message ?? "Check the connection and try again." }),
            h("div", { class: "result-actions" }, h("button", { type: "button", class: "button button-primary", onclick: () => context.navigate(params.exit ?? "hub", params.exitParams) }, "Back"))
          )
        );
        overlay.hidden = false;
        overlay.querySelector("button")?.focus();
      });
  }

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      audio.stopRace();
      driver?.dispose?.();
      world?.dispose();
      world = null;
    }
  };
}
