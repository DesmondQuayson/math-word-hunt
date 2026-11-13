// Math Race Champions — scripted races for the overtaking tests.
//
// This file is NOT part of the game. The browser tests (overtaking.spec.ts) and
// the frame-rate checks evaluate it inside the game's page. It builds a race
// whose racers answer at fixed moments, hands it to the game's own race screen
// (the same screen, 3D world, minimap, leaderboard and sound a real race uses),
// and records what that screen draws on every frame.
//
// Nothing here touches a server: a scripted race lives in the tab, like the
// game's own practice races, and earns nothing. The racing rules are the
// game's (engine/race.js), unchanged: a racer still needs 30 correct answers to
// finish, and a car is only ever where its answers put it.
(() => {
  const SRC = "/internal-games/math-race-champions/src/";
  const CAR_LENGTH = 4.7;
  const CAR_WIDTH = 2.0;
  const ROAD_HALF = 6.5;
  const QUESTION = Object.freeze({ index: 0, category: "multiplication", text: "7 × 8 = ?", spoken: "7 times 8", choices: ["56", "54"] });

  /** A small seeded generator, so a "random" room is the same room every run. */
  function seeded(seed) {
    let value = seed >>> 0;
    return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
  }

  const steady = (fromMs, toMs, everyMs) => {
    const out = [];
    for (let at = fromMs; at < toMs; at += everyMs) out.push([Math.round(at), 1]);
    return out;
  };

  /** A person: thinks about `intervalMs` per answer, right `accuracy` of the time. */
  function person(seed, intervalMs, accuracy, untilMs = 600_000) {
    const random = seeded(seed);
    const out = [];
    let at = 400 + random() * 1800;
    while (at < untilMs) {
      const correct = random() < accuracy;
      out.push([Math.round(at), correct ? 1 : 0]);
      at += Math.max(correct ? 350 : 2000, intervalMs * (0.5 + random()));
    }
    return out;
  }

  /** Mid-race, clear of the next limit: 1,000 m in, with the correct answers that takes. */
  const MID = { x: 1.0, v: 70, correct: 12 };
  const SCENARIOS = {
    // A: the player starts 60 m behind the computer and answers faster.
    A: () => ({ title: "A: player passes computer", seconds: 24, player: { seed: MID, answers: steady(300, 30_000, 900) }, rivals: [{ id: "cpu", name: "Computer", cpu: true, seed: { ...MID, x: 1.06 }, answers: steady(800, 30_000, 3200) }] }),
    // B: the computer starts 60 m behind the player and answers faster.
    B: () => ({ title: "B: computer passes player", seconds: 24, player: { seed: { ...MID, x: 1.06 }, answers: steady(800, 30_000, 3200) }, rivals: [{ id: "cpu", name: "Computer", cpu: true, seed: MID, answers: steady(300, 30_000, 900) }] }),
    // C: the player passes, then gets two answers wrong and goes quiet; the computer passes back.
    C: () => ({ title: "C: pass and re-pass", seconds: 26, player: { seed: MID, answers: [...steady(300, 7000, 800), [8000, 0], [10_500, 0], ...steady(24_000, 40_000, 2500)] }, rivals: [{ id: "cpu", name: "Computer", cpu: true, seed: { ...MID, x: 1.04 }, answers: steady(600, 40_000, 1700) }] }),
    // D: the lead changes hands four times.
    D: () => ({ title: "D: four lead changes", seconds: 30, player: { seed: MID, answers: [...steady(300, 5000, 800), ...steady(16_000, 21_000, 800), ...steady(32_000, 37_000, 800)] }, rivals: [{ id: "cpu", name: "Computer", cpu: true, seed: { ...MID, x: 1.03 }, answers: steady(500, 70_000, 2600) }] }),
    // E: 250 m to go, 29 correct answers each (one more is needed to cross), 7 m apart.
    E: lengthKm => ({ title: "E: near-simultaneous finish", seconds: 16, toFinish: true, player: { seed: { x: lengthKm - 0.25, v: 120, correct: 29 }, answers: [[500, 1]] }, rivals: [{ id: "cpu", name: "Computer", cpu: true, seed: { x: lengthKm - 0.243, v: 120, correct: 29 }, answers: [[500, 1]] }] }),
    // From the grid: lights out, the computer gets away first, the player catches it.
    GRID: () => ({ title: "Grid start", seconds: 26, countdownMs: 4000, player: { seed: {}, answers: steady(2600, 60_000, 1000) }, rivals: [{ id: "cpu", name: "Computer", cpu: true, seed: {}, answers: steady(700, 60_000, 2400) }] })
  };

  /**
   * An Online-style room of `racers` (the player included), mid-race and bunched
   * within ~80 m, each on its own pace. `poll` ms delivers rivals the way an
   * Online Race does: a standings row now and then, carried forward in between.
   */
  function room(racers, { poll = 1200, seconds = 40, fromGrid = false } = {}) {
    const random = seeded(racers * 7919 + (fromGrid ? 13 : 0));
    const colours = ["pink", "gold", "green", "red", "purple", "orange", "white", "turquoise"];
    const seedFor = () => (fromGrid ? {} : { x: 1.5 + (random() - 0.5) * 0.08, v: 60 + random() * 60, correct: 12 });
    return {
      title: `Online: ${racers} racers`,
      online: true,
      poll,
      seconds,
      countdownMs: fromGrid ? 4000 : 1500,
      player: { seed: fromGrid ? {} : { x: 1.5, v: 90, correct: 12 }, answers: person(4242 + racers, 1900, 0.88) },
      rivals: Array.from({ length: racers - 1 }, (_, index) => ({ id: `r${index + 1}`, name: `Racer ${index + 1}`, colour: colours[index % colours.length], seed: seedFor(), answers: person(1000 + racers * 31 + index * 97, 1500 + (index % 6) * 320, 0.74 + (index % 5) * 0.05) }))
    };
  }

  let active = null;

  async function start(config) {
    stop();
    const [race, circuits, palette] = await Promise.all([import(`${SRC}engine/race.js`), import(`${SRC}engine/circuit.js`), import(`${SRC}palette.js`)]);
    const stage = config.stage ?? 1;
    const lengthKm = config.online ? race.ONLINE_LENGTH_KM : race.getStage(stage).lengthKm;
    const scenario = typeof config.scenario === "string" ? SCENARIOS[config.scenario](lengthKm) : config.room ? room(config.room, config) : config;
    const online = scenario.online === true;
    const car = online ? race.ONLINE_CAR : race.getCar(scenario.player.car ?? "starter");
    const spec = race.raceSpec(car, lengthKm);
    const rivalSpec = race.raceSpec(online ? race.ONLINE_CAR : race.STARTER_CAR, lengthKm);
    const circuit = circuits.buildCircuit(lengthKm, online ? circuits.ONLINE_CIRCUIT_SEED : circuits.stageCircuitSeed(stage));

    const racer = (ownSpec, seed, answers) => {
      let state = { ...race.newRacerState(), ...seed, answered: seed.correct ?? 0 };
      let next = 0;
      return at => {
        while (next < answers.length && answers[next][0] <= at) {
          state = race.applyAnswer(state, ownSpec, answers[next][0], answers[next][1] === 1).state;
          next += 1;
        }
        return state;
      };
    };
    const mine = racer(spec, scenario.player.seed ?? {}, scenario.player.answers);
    const others = scenario.rivals.map(rival => ({ ...rival, stateAt: racer(rivalSpec, rival.seed ?? {}, rival.answers), row: null, rowAt: -Infinity }));
    // The clock starts when the race screen says its road is built, as a real Computer Race does.
    let startedAt = Infinity;
    // The clock can be held still (for a photograph of a pass) and let go again; the race is the same race.
    let heldAt = null;
    const raceMs = () => (startedAt === Infinity ? -60_000 : heldAt ?? performance.now() - startedAt);
    const clock = {
      hold() {
        if (heldAt === null && startedAt !== Infinity) heldAt = performance.now() - startedAt;
      },
      release() {
        if (heldAt === null) return;
        startedAt = performance.now() - heldAt;
        heldAt = null;
      },
      get held() {
        return heldAt !== null;
      }
    };

    function rivalView(other, index, at) {
      const clock = Math.max(0, at);
      let state;
      if (scenario.poll > 0) {
        // A new row for this racer every `poll` ms or so, each racer on its own beat.
        if (clock - other.rowAt >= scenario.poll + ((index * 137) % 400)) {
          other.row = other.stateAt(clock);
          other.rowAt = clock;
        }
        state = other.row;
      } else state = other.stateAt(clock);
      const view = race.viewAt(state, rivalSpec, clock);
      return {
        id: other.id,
        name: other.name,
        emoji: null,
        isCpu: other.cpu === true,
        colour: other.cpu ? "rival" : other.colour,
        model: online ? race.ONLINE_CAR.key : race.STARTER_CAR.key,
        paint: other.cpu ? palette.PAINTS.rival : palette.PAINTS[other.colour] ?? palette.PAINTS.white,
        distanceM: view.distanceKm * 1000,
        speed: view.speed,
        progress: view.progress,
        correct: view.correct,
        finished: view.finished,
        finishMs: view.finishMs,
        lengthKm
      };
    }

    const driver = {
      stage,
      lengthKm,
      minCorrect: race.MIN_CORRECT,
      car,
      spec,
      circuit,
      themeName: online ? palette.ONLINE_THEME : palette.themeForStage(stage),
      playerModel: car.key,
      playerPaint: online ? palette.PAINTS.turquoise : null,
      playerColour: "turquoise",
      playerName: "You",
      mode: online ? "online" : "practice",
      reason: "try",
      title: scenario.title,
      settings: {},
      raceMs,
      state: () => mine(Math.max(0, raceMs())),
      question: () => QUESTION,
      rivals: at => others.map((other, index) => rivalView(other, index, at)),
      result: () => null,
      answer: async () => ({ result: "stale" }),
      tick() {},
      quit: async () => {},
      dispose() {}
    };
    if (others.length > 1) {
      driver.leaderboard = (at, me) => {
        const rows = [{ id: "me", name: "You", emoji: null, colour: "turquoise", me: true, progress: me.progress, finished: me.finished, finishMs: me.finishMs }, ...driver.rivals(at).map(rival => ({ id: rival.id, name: rival.name, emoji: null, colour: rival.colour, me: false, progress: rival.progress, finished: rival.finished, finishMs: rival.finishMs }))];
        rows.sort((a, b) => (a.finished && b.finished ? a.finishMs - b.finishMs : a.finished ? -1 : b.finished ? 1 : b.progress - a.progress));
        rows.forEach((row, index) => {
          row.place = index + 1;
        });
        const top = rows.slice(0, 5);
        const own = rows.find(row => row.me);
        return top.includes(own) ? top : [...top.slice(0, 4), own];
      };
    }

    active = record(scenario, driver, lengthKm, clock, config.holds ?? []);
    window.__MATH_RACE__.context.navigate("race", {
      plan: driver,
      exit: "hub",
      start: async () => {
        startedAt = performance.now() + (scenario.countdownMs ?? 2000);
        return driver;
      }
    });
    return { title: scenario.title, seconds: scenario.seconds, racers: others.length + 1, lengthKm };
  }

  function record(scenario, driver, lengthKm, clock, holds) {
    const rec = {
      title: scenario.title,
      racers: scenario.rivals.length + 1,
      done: false,
      frames: 0,
      frameMs: [],
      overlaps: 0,
      offRoad: 0,
      backwards: 0,
      teleports: 0,
      sideJumps: 0,
      wrongSideMs: 0,
      longestWrongSideMs: 0,
      positionWrongMs: 0,
      longestPositionWrongMs: 0,
      minimapWrongMs: 0,
      longestMinimapWrongMs: 0,
      boardWrongMs: 0,
      longestBoardWrongMs: 0,
      truePasses: 0,
      passes: [],
      flashes: [],
      flashOverQuestion: 0,
      mirror: [],
      positions: [],
      mostCars: 0,
      mostOnScreen: 0,
      finishOrder: null,
      examples: [],
      // Photograph stops: the clock is held when the first rival is drawn this far from the player (metres).
      holdsLeft: [...holds],
      heldFor: null,
      heapStart: performance.memory?.usedJSHeapSize ?? null,
      heapEnd: null,
      requests: 0,
      graphics: null
    };
    const resourcesAtStart = performance.getEntriesByType("resource").length;
    const last = new Map();
    const trueSide = new Map();
    const drawnSide = new Map();
    const beside = new Map();
    const runs = { wrong: 0, position: 0, minimap: 0, board: 0 };
    let lastNow = 0;
    let lastMs = 0;
    let lastFlash = "";
    let lastMirror = "";
    let lastPosition = "";
    const note = (kind, detail) => {
      if (rec.examples.length < 12) rec.examples.push({ kind, at: Math.round(driver.raceMs()), ...detail });
    };
    const long = (key, total, longest, wrong, ms) => {
      runs[key] = wrong ? runs[key] + ms : 0;
      if (wrong) rec[total] += ms;
      rec[longest] = Math.max(rec[longest], runs[key]);
    };

    function frame(now) {
      if (rec.done) return;
      requestAnimationFrame(frame);
      const api = window.__MATH_RACE__?.race;
      if (!api || api.driver !== driver) return;
      const scene = api.scene();
      const view = api.view();
      const at = driver.raceMs();
      if (!scene || !view || at <= 0) {
        lastNow = now;
        return;
      }
      const ms = now - lastNow;
      lastNow = now;
      // After a gap of about a second the game puts the cars where the race has them (nobody saw the road in
      // between): such a frame is not compared with the one before it.
      if (!(ms > 0) || ms > 900) {
        last.clear();
        lastMs = 0;
        return;
      }
      // This callback and the game's own run in the same frame, in an order that differs between browsers:
      // what is read here may have been drawn one frame ago. So "how far can a car go in a frame" is judged
      // against the longer of the last two frames.
      const dt = Math.max(ms, lastMs) / 1000;
      lastMs = ms;
      rec.frames += 1;
      rec.frameMs.push(ms);
      rec.graphics = api.graphics();
      const shown = api.shown();
      if (shown) {
        rec.mostCars = Math.max(rec.mostCars, shown.cars + 1);
        rec.mostOnScreen = Math.max(rec.mostOnScreen, shown.onScreen + 1);
      }
      const me = view.distanceKm * 1000;
      const rivals = api.rivals();
      if (clock.held) return;
      const lead = scene.cars[0];
      if (lead && rec.holdsLeft.length && rec.lastLeadGap !== undefined && (rec.lastLeadGap - rec.holdsLeft[0]) * (lead.gapM - rec.holdsLeft[0]) <= 0) {
        rec.heldFor = rec.holdsLeft.shift();
        clock.hold();
      }
      if (lead) rec.lastLeadGap = lead.gapM;

      // Bodywork: nothing inside anything, nothing off the road.
      const all = [{ id: "me", distanceM: me, lane: 0 }, ...scene.cars];
      for (let a = 0; a < all.length; a += 1) {
        for (let b = a + 1; b < all.length; b += 1) {
          if (Math.abs(all[a].distanceM - all[b].distanceM) < CAR_LENGTH && Math.abs(all[a].lane - all[b].lane) < CAR_WIDTH) {
            rec.overlaps += 1;
            note("overlap", { a: all[a].id, b: all[b].id });
          }
        }
      }

      let wrong = false;
      const seen = new Set();
      for (const car of scene.cars) {
        seen.add(car.id);
        if (Math.abs(car.lane) + CAR_WIDTH / 2 > ROAD_HALF) rec.offRoad += 1;
        const before = last.get(car.id);
        if (before) {
          const moved = car.distanceM - before.distanceM;
          if (moved < -0.02) {
            rec.backwards += 1;
            note("backwards", { id: car.id, moved });
          }
          // As far as a car can drive in this frame: its speed, plus what it may use to close on its place.
          const most = (car.rival.speed / 3.6 + 46 + (before.gapM < -11 ? 56 : 0)) * dt * 1.3 + 1;
          if (moved > most) {
            rec.teleports += 1;
            note("teleport", { id: car.id, moved, most, ms });
          }
          if (Math.abs(car.lane - before.lane) > 3.4 * dt * 1.3 + 0.1) {
            rec.sideJumps += 1;
            note("sideways", { id: car.id, from: before.lane, to: car.lane, ms });
          }
        }
        last.set(car.id, { distanceM: car.distanceM, lane: car.lane, gapM: car.gapM });
        if (car.rival.finished) continue;
        if (Math.abs(car.trueGapM) > 1.5 && Math.sign(car.gapM) !== Math.sign(car.trueGapM)) wrong = true;

        // A pass, as the race has it and as it is drawn. While a car is within a car's length or so of
        // level, note whether it was in the picture and how far to the side it was.
        if (Math.abs(car.gapM) < 6) {
          const window = beside.get(car.id) ?? { frames: 0, onScreen: 0, nearest: Infinity };
          window.frames += 1;
          if (car.onScreen) window.onScreen += 1;
          if (Math.abs(car.gapM) < CAR_LENGTH) window.nearest = Math.min(window.nearest, Math.abs(car.lane));
          beside.set(car.id, window);
        } else if (Math.abs(car.gapM) > 14) beside.delete(car.id);
        if (Math.abs(car.trueGapM) >= 1) {
          const side = Math.sign(car.trueGapM);
          if (trueSide.has(car.id) && trueSide.get(car.id) !== side) rec.truePasses += 1;
          trueSide.set(car.id, side);
        }
        if (Math.abs(car.gapM) >= 1) {
          const side = Math.sign(car.gapM);
          if (drawnSide.has(car.id) && drawnSide.get(car.id) !== side) {
            const window = beside.get(car.id) ?? { frames: 0, onScreen: 0, nearest: Infinity };
            rec.passes.push({ at: Math.round(at), id: car.id, kind: side > 0 ? "rival passes player" : "player passes rival", lane: Number(car.lane.toFixed(2)), nearestLane: Number(window.nearest.toFixed(2)), onScreen: car.onScreen === true, besideFrames: window.frames, besideOnScreen: window.onScreen });
          }
          drawnSide.set(car.id, side);
        }
      }
      for (const id of [...last.keys()]) {
        if (seen.has(id)) continue;
        last.delete(id);
        trueSide.delete(id);
        drawnSide.delete(id);
        beside.delete(id);
      }
      long("wrong", "wrongSideMs", "longestWrongSideMs", wrong, ms);

      // The read-outs against the race itself. They are refreshed a few times a second, and this frame may be
      // a moment later than the one they were written in: two racers within a few metres of each other may be
      // shown either way round. Anything further apart than that must be shown in the order of the race.
      const near = Math.max(8, (view.speed / 3.6) * dt * 1.5 + 4) / (lengthKm * 1000);
      const ahead = margin => rivals.filter(rival => (rival.finished && !view.finished) || (rival.finished && view.finished && rival.finishMs < view.finishMs) || (!rival.finished && !view.finished && rival.progress > view.progress + margin)).length;
      const [fewest, most] = [ahead(near), ahead(-near)];
      const positionText = document.querySelector(".hud-position")?.textContent ?? "";
      if (positionText !== lastPosition) {
        lastPosition = positionText;
        rec.positions.push({ at: Math.round(at), text: positionText });
      }
      const place = Number.parseInt(positionText, 10);
      long("position", "positionWrongMs", "longestPositionWrongMs", !(place >= fewest + 1 && place <= most + 1), ms);
      const mapMe = Number(document.querySelector(".minimap-me")?.dataset.progress ?? "0");
      const mapAhead = [...document.querySelectorAll(".minimap-rival")].filter(marker => Number(marker.dataset.progress) > mapMe).length;
      long("minimap", "minimapWrongMs", "longestMinimapWrongMs", !(mapAhead >= rivals.filter(rival => rival.progress > view.progress + near).length && mapAhead <= rivals.filter(rival => rival.progress > view.progress - near).length), ms);
      const board = document.querySelector(".hud-board");
      if (board && !board.hidden) {
        const shownNames = [...board.querySelectorAll("li .name")].map(node => node.textContent.trim());
        const progress = new Map([["You", view.finished ? 2 : view.progress], ...rivals.map(rival => [rival.name, rival.finished ? 2 : rival.progress])]);
        // Every row above another is truly ahead of it (or level with it, to within the margin).
        let outOfOrder = false;
        for (let row = 1; row < shownNames.length; row += 1) if ((progress.get(shownNames[row]) ?? 0) > (progress.get(shownNames[row - 1]) ?? 0) + near * 2) outOfOrder = true;
        long("board", "boardWrongMs", "longestBoardWrongMs", outOfOrder, ms);
      }

      // What is said on the screen, and that it stays clear of the question.
      const flash = document.querySelector(".hud-flash");
      const flashText = flash && !flash.hidden ? flash.textContent : "";
      if (flashText && flashText !== lastFlash) {
        const box = flash.getBoundingClientRect();
        const panel = document.querySelector(".race-panel").getBoundingClientRect();
        const clear = box.bottom <= panel.top + 0.5 && box.left >= -0.5 && box.right <= window.innerWidth + 0.5;
        if (!clear) rec.flashOverQuestion += 1;
        rec.flashes.push({ at: Math.round(at), text: flashText, clear });
      }
      lastFlash = flashText;
      const mirror = document.querySelector(".hud-rear");
      const mirrorText = mirror && !mirror.hidden ? `${mirror.dataset.side}: ${mirror.textContent}` : "";
      if (mirrorText && mirrorText.split(" ").slice(0, 2).join(" ") !== lastMirror.split(" ").slice(0, 2).join(" ")) rec.mirror.push({ at: Math.round(at), text: mirrorText });
      lastMirror = mirrorText;

      if (view.finished && !rec.finishOrder && rivals.every(rival => rival.finished || !scenario.toFinish)) {
        rec.finishOrder = { player: view.finishMs, rivals: rivals.map(rival => ({ id: rival.id, finishMs: rival.finishMs })), drawn: scene.cars.map(car => ({ id: car.id, gapM: Number(car.gapM.toFixed(2)) })) };
      }
    }
    requestAnimationFrame(frame);
    rec.release = () => {
      rec.heldFor = null;
      lastNow = performance.now();
      clock.release();
    };
    rec.finish = () => {
      rec.done = true;
      rec.heapEnd = performance.memory?.usedJSHeapSize ?? null;
      rec.requests = performance.getEntriesByType("resource").length - resourcesAtStart;
    };
    return rec;
  }

  /** The numbers for the race so far (it keeps running until `stop`). */
  function report() {
    if (!active) return null;
    const rec = active;
    const sorted = [...rec.frameMs].sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
    const { frameMs: _frames, finish: _finish, release: _release, ...rest } = rec;
    return {
      ...rest,
      heapEnd: performance.memory?.usedJSHeapSize ?? null,
      requests: performance.getEntriesByType("resource").length,
      fps: sorted.length ? Number((1000 / mean).toFixed(1)) : 0,
      frameMsMean: Number(mean.toFixed(2)),
      frameMsP95: sorted.length ? Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)) : 0,
      frameMsWorst: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : 0,
      raceMs: Math.round(window.__MATH_RACE__?.race?.driver?.raceMs?.() ?? 0)
    };
  }

  function stop() {
    if (active) active.finish();
    active = null;
  }

  /** Let the clock go after a photograph stop. */
  const release = () => active?.release();

  window.__RACE_SCENARIO__ = { start, report, stop, release, scenarios: Object.keys(SCENARIOS) };
})();
