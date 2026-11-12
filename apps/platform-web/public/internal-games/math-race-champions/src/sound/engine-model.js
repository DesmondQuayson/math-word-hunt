// What a car's engine is doing, worked out from the car's real race speed.
// Pure: no audio, no DOM, no timers, no randomness. The sound (race-sound.js)
// is drawn from this, so it can be tested without a loudspeaker.
//
// The race model (engine/race.js) changes speed in steps: a correct answer adds
// the car's boost at once, a wrong answer cuts the speed at once, and between
// answers the speed eases back towards a slow roll. An engine cannot do steps,
// so the model follows the race speed the way a drivetrain would:
//   * the engine speed climbs to a higher race speed over about half a second,
//     at full throttle, changing up through the gears;
//   * while the race speed eases back the engine holds a light cruising throttle;
//   * a wrong answer lifts the throttle completely: the revs fall, nothing rises.
// Nothing here feeds back into the race. It only describes it.

/**
 * One entry per car. Every number shapes the TONE of the engine, never its
 * loudness: `trim` levels the four cars to the same measured loudness, so a
 * dearer car is not simply a louder one.
 *
 *   pulses     firing pulses per crankshaft turn (cylinders / 2)
 *   idle       engine speed on the grid, rpm
 *   redline    engine speed at the top of a gear, rpm
 *   gears      number of gears across the car's speed range
 *   response   seconds for the revs to follow the throttle (smaller = sharper)
 *   shiftMs    how long the drive is cut during a gear change
 *   harmonics  strength of the first harmonics of the engine's note (its voice)
 *   tail       how quickly the harmonics above those die away (higher = more bite)
 *   body       high-pass cut-off: how much weight the note carries, Hz
 *   sub        level of the half-order rumble under the firing note
 *   subRatio   that rumble's pitch, as a share of the firing note
 *   grit       how hard the note is driven into soft clipping under load
 *   dark       low-pass cut-off off the throttle, Hz
 *   bright     how far the cut-off opens at full throttle and high revs, Hz
 *   formant    the exhaust's resonant peak, Hz
 *   intake     level of induction noise under throttle
 *   turbo      level of turbocharger whistle and blow-off (0 = none)
 *   crackle    level of overrun crackle when the throttle is lifted at high revs
 *   trim       loudness trim, set by scripts/math-race-champions-audio-audit.mjs
 */
export const ENGINE_PROFILES = Object.freeze({
  // Street Starter: a small four-cylinder. Light and simple.
  starter: Object.freeze({
    key: "starter", pulses: 2, idle: 850, redline: 6200, gears: 5, response: 0.11, shiftMs: 170,
    harmonics: Object.freeze([0.7, 1, 0.45, 0.3]), tail: 0.64, sub: 0.1, subRatio: 0.5, grit: 0.15,
    body: 110, dark: 700, bright: 2100, formant: 520, intake: 0.35, turbo: 0, crackle: 0, trim: 0.35
  }),
  // Circuit Standard: the one car of Online Race. Between the Starter and the Sprint.
  "circuit-standard": Object.freeze({
    key: "circuit-standard", pulses: 2, idle: 900, redline: 6600, gears: 5, response: 0.1, shiftMs: 150,
    harmonics: Object.freeze([0.8, 1, 0.5, 0.34, 0.2]), tail: 0.68, sub: 0.14, subRatio: 0.5, grit: 0.22,
    body: 95, dark: 720, bright: 2500, formant: 560, intake: 0.4, turbo: 0, crackle: 0, trim: 0.31
  }),
  // Turbo Sprint: a turbocharged four. Sportier and raspier, with a whistle and a blow-off.
  "turbo-sprint": Object.freeze({
    key: "turbo-sprint", pulses: 2, idle: 950, redline: 7200, gears: 6, response: 0.085, shiftMs: 120,
    harmonics: Object.freeze([1, 0.75, 0.5, 0.36, 0.26, 0.18]), tail: 0.72, sub: 0.14, subRatio: 0.5, grit: 0.4,
    body: 85, dark: 800, bright: 3400, formant: 700, intake: 0.5, turbo: 1, crackle: 0.25, trim: 0.24
  }),
  // Velocity GT: a big V8. Deep: the note sits an octave under its firing
  // pulses, the way a cross-plane V8's uneven exhaust does, with a heavy rumble under that.
  "velocity-gt": Object.freeze({
    key: "velocity-gt", pulses: 2, idle: 720, redline: 6400, gears: 6, response: 0.09, shiftMs: 130,
    harmonics: Object.freeze([0.85, 1, 0.5, 0.55, 0.3, 0.24]), tail: 0.68, sub: 0.6, subRatio: 0.5, grit: 0.45,
    body: 32, dark: 520, bright: 1750, formant: 210, intake: 0.4, turbo: 0, crackle: 0.45, trim: 0.29
  }),
  // Thunder X: a high-revving ten-cylinder. The sharpest, most urgent voice.
  "thunder-x": Object.freeze({
    key: "thunder-x", pulses: 5, idle: 1100, redline: 8600, gears: 7, response: 0.06, shiftMs: 80,
    harmonics: Object.freeze([1, 0.85, 0.7, 0.5, 0.36, 0.24]), tail: 0.8, sub: 0.4, subRatio: 0.5, grit: 0.6,
    body: 90, dark: 1000, bright: 5200, formant: 980, intake: 0.6, turbo: 0, crackle: 0.8, trim: 0.12
  })
});

export const DEFAULT_ENGINE_PROFILE = "circuit-standard";

export function engineProfile(carKey) {
  return Object.prototype.hasOwnProperty.call(ENGINE_PROFILES, carKey) ? ENGINE_PROFILES[carKey] : ENGINE_PROFILES[DEFAULT_ENGINE_PROFILE];
}

/** Share of the redline at which a gear is changed up. */
export const SHIFT_POINT = 0.94;
/** A gear is changed down only once the speed is this far under the gear below's top. */
const DOWNSHIFT_MARGIN = 0.86;
/** Light throttle that holds a cruise while the race speed eases back. */
export const CRUISE_THROTTLE = 0.3;
/** Seconds of full throttle after a correct answer, even if the speed is already topped out. */
const BOOST_SECONDS = 0.8;
/** Seconds the throttle stays shut after a wrong answer. */
const LIFT_SECONDS = 1.3;

/** The top of each gear, as a share of the car's top speed. Closer together higher up, like a real gearbox. */
export function gearTops(profile) {
  return Array.from({ length: profile.gears }, (_, index) => ((index + 1) / profile.gears) ** 0.8);
}

/** Engine speed in a gear at a share of top speed: proportional to road speed, never under idle or over the redline. */
export function rpmInGear(profile, speedShare, gear) {
  const tops = gearTops(profile);
  const top = tops[Math.min(tops.length - 1, Math.max(0, gear))];
  return Math.min(profile.redline, Math.max(profile.idle, (profile.redline * SHIFT_POINT * Math.max(0, speedShare)) / top));
}

/** The firing note in hertz at an engine speed. */
export function firingFrequency(profile, rpm) {
  return (rpm / 60) * profile.pulses;
}

const ease = (current, target, seconds, tau) => current + (target - current) * (1 - Math.exp(-seconds / Math.max(0.001, tau)));

/**
 * The running state of one engine. `step` is called once a frame with the
 * car's real race speed; `boost` on a correct answer; `lift` on a wrong one.
 */
export function createEngineModel(profileInput) {
  const profile = typeof profileInput === "string" ? engineProfile(profileInput) : profileInput;
  const tops = gearTops(profile);
  let speed = 0; // km/h as the drivetrain follows it
  let rpm = profile.idle;
  let gear = 0;
  let throttle = 0;
  let boostLeft = 0;
  let liftLeft = 0;
  let shiftLeft = 0;
  let turbo = 0;

  return {
    profile,
    /** A correct answer: open the throttle. */
    boost() {
      boostLeft = BOOST_SECONDS;
      liftLeft = 0;
    },
    /** A wrong answer: shut the throttle. Never raises anything. */
    lift() {
      liftLeft = LIFT_SECONDS;
      boostLeft = 0;
    },
    /**
     * Advance by `seconds` towards the car's race speed. Returns what the
     * engine is doing now, plus the one-off events of this step.
     */
    step(seconds, raceSpeed, topSpeed) {
      const dt = Math.min(0.1, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
      const target = Math.max(0, Number.isFinite(raceSpeed) ? raceSpeed : 0);
      const top = Math.max(1, topSpeed);
      const before = { throttle, turbo, rpm };

      // The drivetrain climbs to a higher speed at a real car's pace, and falls with the race speed.
      const lifted = liftLeft > 0;
      if (target > speed && !lifted) speed = Math.min(target, speed + top * 0.3 * dt);
      else if (target < speed) speed = Math.max(target, speed - top * 0.55 * dt);
      const climbing = target - speed > 0.5 && !lifted;
      const rolling = speed > 1;

      // Gears.
      const share = speed / top;
      let shifted = 0;
      if (gear < tops.length - 1 && share > tops[gear]) {
        gear += 1;
        shifted = 1;
      } else if (gear > 0 && share < tops[gear - 1] * DOWNSHIFT_MARGIN) {
        gear -= 1;
        shifted = -1;
      }
      if (shifted !== 0) shiftLeft = profile.shiftMs / 1000;

      // Throttle: shut on a lift or during a gear change, open while climbing
      // or just after a correct answer, light on a cruise, shut on the grid.
      let wanted;
      if (lifted || shiftLeft > 0) wanted = 0;
      else if (climbing || (boostLeft > 0 && rolling)) wanted = 1;
      else if (rolling) wanted = CRUISE_THROTTLE;
      else wanted = 0;
      throttle = ease(throttle, wanted, dt, wanted > throttle ? 0.045 : 0.075);

      // Revs follow the road speed in this gear.
      const wantedRpm = rolling ? rpmInGear(profile, share, gear) : profile.idle;
      rpm = ease(rpm, wantedRpm, dt, wantedRpm > rpm ? profile.response : profile.response * 1.6);

      const rpmShare = Math.min(1, Math.max(0, (rpm - profile.idle) / (profile.redline - profile.idle)));
      const load = throttle * (0.35 + 0.65 * rpmShare);
      turbo = profile.turbo > 0 ? ease(turbo, load, dt, load > turbo ? 0.4 : 0.1) : 0;

      boostLeft = Math.max(0, boostLeft - dt);
      liftLeft = Math.max(0, liftLeft - dt);
      shiftLeft = Math.max(0, shiftLeft - dt);

      const closed = before.throttle > 0.6 && throttle <= 0.6 && wanted === 0;
      return {
        rpm,
        rpmShare,
        gear,
        throttle,
        load,
        turbo,
        speed,
        speedShare: Math.min(1.1, share),
        firing: firingFrequency(profile, rpm),
        climbing,
        lifted,
        shifted,
        /** The turbo dumps its pressure when the throttle shuts on boost. */
        blowOff: profile.turbo > 0 && closed && before.turbo > 0.4,
        /** Unburnt fuel popping in the exhaust when the throttle shuts at high revs. */
        crackle: profile.crackle > 0 && closed && shifted === 0 && rpmShare > 0.5
      };
    }
  };
}

/**
 * How loud and how far to one side a rival's engine is heard, from where it is
 * relative to the player. Only cars within `RIVAL_EARSHOT_M` are heard at all;
 * the level falls with the square of the distance, and the pan stays well
 * inside the stereo field so a pack never becomes a wall of sound.
 */
export const RIVAL_EARSHOT_M = 45;
export const RIVAL_VOICES = 2;
export const RIVAL_MAX_LEVEL = 0.3;
export const RIVAL_MAX_PAN = 0.45;

export function rivalMix(player, rivals) {
  const heard = [];
  for (const rival of rivals) {
    if (rival.finished) continue;
    const gap = rival.distanceM - player.distanceM;
    const distance = Math.abs(gap);
    if (!(distance < RIVAL_EARSHOT_M)) continue;
    const closeness = 1 - distance / RIVAL_EARSHOT_M;
    heard.push({
      id: rival.id,
      gap,
      level: RIVAL_MAX_LEVEL * closeness * closeness,
      pan: (rival.side ?? 1) * RIVAL_MAX_PAN * (0.4 + 0.6 * closeness),
      speed: rival.speed,
      // Closing cars sound higher, parting cars lower (a gentle Doppler shift).
      doppler: 1 + Math.max(-0.08, Math.min(0.08, ((player.speed - rival.speed) * Math.sign(gap || 1)) / 900))
    });
  }
  heard.sort((a, b) => b.level - a.level);
  return heard.slice(0, RIVAL_VOICES);
}
