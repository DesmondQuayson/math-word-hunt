// Starting a race against the computer, from the stage screen, from "Race
// again", from "Next stage" and from the garage's "Try car".
//
// The race screen is opened with a plan (which road, which car) and a `start`
// function. It builds the road first and calls `start` only when the picture
// is ready, so the countdown the server starts is never spent on loading.

import { forgetAccount, loadAccount, patchAccount, unlockPractice } from "../account.js";
import { accountRequest } from "../api.js";
import { buildCircuit, stageCircuitSeed } from "../engine/circuit.js";
import { MIN_CORRECT, STARTER_CAR, getCar, getStage } from "../engine/race.js";
import { themeForStage } from "../palette.js";
import { writeLastSettings } from "../setup.js";
import { computerDriver, practiceDriver } from "../race/drivers.js";

function planFor(stage, car, mode, title) {
  const info = getStage(stage);
  return {
    mode,
    title,
    stage,
    car,
    lengthKm: info.lengthKm,
    minCorrect: MIN_CORRECT,
    circuit: buildCircuit(info.lengthKm, stageCircuitSeed(stage)),
    themeName: themeForStage(stage),
    playerModel: car.key,
    playerPaint: null
  };
}

/**
 * Start `stage` with `settings`. A signed-in account races on the server (and
 * can earn); a school session, or a test drive (`reason: "try"`), races in the
 * tab and earns nothing.
 */
export async function startStage(context, { stage, settings, exit = "computer", exitLabel = "Stages", carKey, reason }) {
  writeLastSettings(settings);
  const account = await loadAccount();
  const practice = reason === "try" || account.guest === true;
  const why = reason === "try" ? "try" : "guest";
  const car = practice ? getCar(carKey ?? STARTER_CAR.key) ?? STARTER_CAR : getCar(account.equipped) ?? STARTER_CAR;
  const title = !practice ? `Stage ${stage}` : why === "try" ? `Trying ${car.name}` : `Stage ${stage} practice`;

  return context.navigate("race", {
    plan: planFor(stage, car, practice ? "practice" : "computer", title),
    async start() {
      if (practice) return practiceDriver({ stage, carKey: car.key, settings, reason: why });
      const payload = await accountRequest("race-start", { stage, categories: settings.categories, difficulty: settings.difficulty });
      forgetAccount();
      return computerDriver(payload.run);
    },
    exit,
    exitLabel,
    again: () => startStage(context, { stage, settings, exit, exitLabel, carKey, reason }),
    // A test drive is one race; stages move on only in a real or a practice campaign.
    nextStage: reason === "try" ? null : next => startStage(context, { stage: next, settings, exit, exitLabel }),
    onResult(result) {
      if (result.mode === "computer") {
        // The wallet and the unlocks changed on the server; show the server's numbers.
        if (result.balance !== undefined) patchAccount({ balance: result.balance, unlocked: result.unlocked });
        forgetAccount();
      } else if (result.reason === "guest" && result.outcome?.won) {
        unlockPractice(stage + 1);
      }
    }
  });
}

/** Back into a race the account left open (a refresh, a closed tab). The clock has been running all along. */
export async function resumeRun(context, runId) {
  const payload = await accountRequest("race-sync", { run: runId });
  if (!payload.run) return false;
  const run = payload.run;
  const settings = run.settings;
  context.navigate("race", {
    driver: computerDriver(run),
    exit: "computer",
    exitLabel: "Stages",
    again: () => startStage(context, { stage: run.stage, settings }),
    nextStage: next => startStage(context, { stage: next, settings }),
    onResult(result) {
      if (result.balance !== undefined) patchAccount({ balance: result.balance, unlocked: result.unlocked });
      forgetAccount();
    }
  });
  return true;
}
