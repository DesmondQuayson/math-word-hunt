// How the cars near the player are placed on the road, frame by frame.
// Pure: no DOM, no three.js, no timers, no randomness.
//
// The race itself is decided elsewhere (engine/race.js, on the server's
// answers). This only DRAWS it: every car's place along the road comes from
// its authoritative race distance, and nothing here ever feeds back into the
// race, the score, the leaderboard or the network.
//
// What it adds to a bare "put each car at its distance":
//   * Real passes. The player holds the centre lane and rivals the lanes
//     beside it, so a car that gets ahead is seen coming up, drawing alongside
//     and going by. A rival that catches another rival pulls out one lane to
//     pass and drifts back to its own lane when it is clear.
//   * No teleporting. A rival's authoritative distance can step (an Online
//     Race update arrives a moment late). The drawn car closes the difference
//     at a bounded extra speed, so it is seen driving there. Lane changes are
//     driven sideways at a car's pace, never jumped.
//   * No two cars in the same place. Whatever the lanes decide, a last check
//     keeps every pair of cars that share road width a car's length apart: the
//     one that was behind waits behind. A car that is boxed in falls in behind
//     the car beside it and goes round, or crosses behind the player's car.
//   * Room to pass a standing car. A racer short of correct answers stands
//     still at its limit (the 30-answer rule), and before the first answer
//     everyone stands on the grid. Standing cars keep to the kerb lanes, so the
//     lanes beside the player stay open for cars that are moving.
//   * A camera hint: how close a car is behind the player, and on which side,
//     so the view can open up and the pass is seen.

/**
 * Lane centres, metres from the centre line along the road's sideways axis. The road is 6.5 m to each edge,
 * the rails 1 m beyond. (Looking down the road as the camera does, a positive lane is to the LEFT.)
 */
export const LANES = Object.freeze([-5.2, -2.6, 0, 2.6, 5.2]);
/** The player's lane. Rivals drive in it only well away from the player's car; near it they may only
 *  cross it, behind the player's car, to the lane on the other side. */
export const CENTRE = 2;
/** A rival's own lane is one of these, by its id. */
const HOME_LANES = Object.freeze([3, 1, 4, 0]);
/** The kerb lane on a side of the road (-1 or 1): where a car pulls over to stand. */
const kerb = side => (side < 0 ? 0 : LANES.length - 1);
export const CAR_LENGTH = 4.7;
export const CAR_WIDTH = 2.0;
/** Two cars sharing road width are never drawn closer than this, centre to centre along the road. */
export const SAFE_LONG = CAR_LENGTH + 1.1;
/** Two cars side by side are never drawn closer than this, centre to centre across the road. */
export const SAFE_LAT = CAR_WIDTH + 0.3;
/** Sideways speed of a lane change, m/s: one lane in under a second. */
export const LANE_SPEED = 3.4;
const LANE_ACCEL = 16;
/** Extra speed a drawn car may use to close on its authoritative place, m/s. */
export const CATCH_MAX = 34;
/** The same, for a car well behind the player's car, where the camera does not look. */
const CATCH_UNSEEN = 90;
const UNSEEN_BEHIND_M = 14;
/** The share of its real speed a car keeps while it drops back to its place. */
const EASE_OFF = 0.2;
/** How fast a car that finds itself too close behind another drops back to a car's length, m/s. */
const GIVE_WAY = 8;
/** How hard a car eases off to fall in behind a neighbour, m/s². */
const TUCK_DECEL = 14;
const CATCH_GAIN = 4;
/** How much faster than its reported speed a car may be seen to move before the rest counts as a step. */
const STEP_SLACK = 12;
/** The longest stretch of time walked in one go, and the longest gap between frames driven through, seconds. */
const SUB_STEP_S = 0.05;
const MAX_FRAME_S = 1;
/** Beyond this the car is placed outright (a long disconnection). */
const SNAP_M = 160;
/** Rivals do not drive in the centre lane within this distance of the player's car, ahead or behind. */
export const CENTRE_CLEAR_M = 45;
/** A rival may cross the centre lane this far behind the player's car, or further. */
const CENTRE_BEHIND_M = SAFE_LONG + 1;
/** A boxed-in car gives up falling in behind a neighbour after this long, seconds. */
const TUCK_S = 2.5;
/** A car drifts back towards its own lane when that lane is clear this far each way. */
const RETURN_CLEAR_M = 13;
/** Seconds a car stays in a lane before choosing another (leaving the player's lane is never delayed). */
const LANE_HOLD_S = 0.7;
/** How far behind the player a car starts to open the camera, and where it is fully open. */
const CAMERA_FAR_M = 26;
const CAMERA_NEAR_M = 9;
/** A car that has crossed the line rolls on and slows at this rate, m/s². */
const RUN_OFF_DECEL = 9;
/** A car this near its limit (or this many seconds from it) pulls over to the kerb lane. */
const PULL_OVER_M = 30;
const PULL_OVER_S = 1.5;
/** The starting grid: rows this far apart. */
const GRID_ROW_M = SAFE_LONG + 0.6;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Whether a car takes up road at lateral position `x`: where it is, or where it is heading. */
const covers = (car, x) => Math.abs(car.x - x) < SAFE_LAT || Math.abs(LANES[car.target] - x) < SAFE_LAT;
/** Whether two cars share road width: where they are now, or where either one is steering to. */
const abreast = (a, b) => Math.abs(a.x - b.x) < SAFE_LAT || Math.abs(LANES[a.target] - b.x) < SAFE_LAT || Math.abs(LANES[b.target] - a.x) < SAFE_LAT;

/**
 * `createTraffic().step(dt, player, rivals, limit)` once a frame.
 *   player  { distanceM, speed, finished? }      speed in km/h
 *   rivals  [{ id, distanceM, speed, finished, limitM? }] any number; limitM is how far the
 *           racer's correct answers let it go (omit, or Infinity, when nothing holds it)
 *   limit   how many rivals may be drawn (the picture's quality)
 * Returns { cars, camera, behind }:
 *   cars    the drawn rivals, nearest first:
 *           { id, rival, distanceM, lane, lateralSpeed, speedMs, gapM, trueGapM, held }
 *           distanceM and lane (metres from the centre line) are where to draw it;
 *           trueGapM is its authoritative gap to the player, gapM the drawn one.
 *   camera  { pull 0..1, side -1|0|1 }  open the view for a car close behind
 *   behind  the closest drawn rival behind the player { id, gapM, side, closing }, or null
 */
export function createTraffic() {
  const tracked = new Map();
  let lastPlayer = null;

  /**
   * A slow device draws few frames, and each one covers a lot of road. The road
   * between two frames is walked in short steps, so the cars behave the same at
   * 12 frames a second as at 60.
   */
  function step(dtSeconds, player, rivals, limit = 6) {
    // The picture stood still for longer than that (a hidden tab, a stalled device): nobody saw the road in
    // between, so the cars are put where the race has them now and driven on from there.
    if (dtSeconds > MAX_FRAME_S) {
      tracked.clear();
      lastPlayer = null;
      return advance(0, player, rivals, limit);
    }
    const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, MAX_FRAME_S);
    const parts = Math.max(1, Math.ceil(dt / SUB_STEP_S - 1e-9));
    if (parts === 1) return advance(dt, player, rivals, limit);
    const fromPlayer = lastPlayer ?? player.distanceM;
    const from = rivals.map(rival => tracked.get(String(rival.id))?.truth ?? rival.distanceM);
    let frame = null;
    for (let part = 1; part <= parts; part += 1) {
      const share = part / parts;
      frame = advance(
        dt / parts,
        part === parts ? player : { ...player, distanceM: fromPlayer + (player.distanceM - fromPlayer) * share },
        part === parts ? rivals : rivals.map((rival, index) => ({ ...rival, distanceM: from[index] + (rival.distanceM - from[index]) * share })),
        limit
      );
    }
    return frame;
  }

  function advance(dt, player, rivals, limit) {
    const me = player.distanceM;
    const before = lastPlayer ?? me;
    const self = { key: "", player: true, x: 0, target: CENTRE, drawn: me, was: before, v: (player.speed ?? 0) / 3.6 };

    // The nearest rivals, by where they really are. Ties (the starting grid) go by id, so the choice is stable.
    const chosen = rivals
      .map(rival => ({ rival, away: Math.abs(rival.distanceM - me), key: String(rival.id) }))
      .sort((a, b) => a.away - b.away || byKey(a, b))
      .slice(0, Math.max(0, limit));
    const keep = new Set(chosen.map(item => item.key));
    for (const key of tracked.keys()) if (!keep.has(key)) tracked.delete(key);

    // New cars. On the grid they line up beside and behind the player; anywhere else they appear where they are,
    // in their own lane if it is empty there.
    // Two rivals stand beside the player. More than two stand in two files along the kerbs,
    // so a car at the back that answers first has a clear lane to drive off in.
    const few = rivals.length <= 2;
    const gridLanes = few ? [CENTRE + 1, CENTRE - 1] : [kerb(1), kerb(-1)];
    const clearAt = (lane, at) => ![...tracked.values()].some(other => covers(other, LANES[lane]) && Math.abs(other.drawn - at) < SAFE_LONG);
    for (const item of chosen) {
      if (tracked.has(item.key)) continue;
      // A rival's own lane. With one or two rivals it is a lane beside the player, where a pass is best seen.
      const pick = hash(item.key);
      const home = few ? (pick % 2 === 0 ? CENTRE + 1 : CENTRE - 1) : HOME_LANES[pick % HOME_LANES.length];
      const car = { key: item.key, home, target: home, gridBack: 0, held: false, since: LANE_HOLD_S, vx: 0, v: (item.rival.speed ?? 0) / 3.6, tuck: null, tuckLane: 0, tuckFor: 0, pace: 0 };
      if (me < 1 && item.rival.distanceM < 1) {
        // The first place on the grid with nobody standing in it or driving through it.
        for (let slot = 0; ; slot += 1) {
          const lane = gridLanes[slot % gridLanes.length];
          const back = Math.floor(slot / gridLanes.length) * GRID_ROW_M;
          if (!clearAt(lane, -back)) continue;
          car.target = lane;
          car.gridBack = back;
          // Its own lane is on the side of the road it starts on: no car crosses in front of the player to get home.
          car.home = few ? lane : Math.sign(LANES[lane]) === Math.sign(LANES[home]) ? home : LANES.length - 1 - home;
          break;
        }
      } else {
        // Already home before the player: parked beyond the line.
        if (item.rival.finished && !player.finished) {
          car.runOff = 60;
          car.rollsOn = true;
        }
        // Where it really is, in its own lane or any side lane that is empty there; failing that, the first
        // empty place behind. A car coming into the picture never lands on one that is already in it.
        let at = item.rival.distanceM + (car.runOff ?? 0);
        const lanes = [home, ...HOME_LANES];
        let lane = lanes.find(option => clearAt(option, at));
        for (let tries = 0; lane === undefined && tries < 24; tries += 1) {
          at -= SAFE_LONG;
          lane = lanes.find(option => clearAt(option, at));
        }
        car.target = lane ?? home;
        car.gridBack = item.rival.distanceM + (car.runOff ?? 0) - at;
      }
      car.x = LANES[car.target];
      car.drawn = item.rival.distanceM - car.gridBack + (car.runOff ?? 0);
      car.was = car.drawn;
      car.goal = car.drawn;
      tracked.set(item.key, car);
    }

    // Along the road: do what the car really did this frame, and close any difference left at a bounded extra speed.
    for (const item of chosen) {
      const car = tracked.get(item.key);
      car.rival = item.rival;
      car.truth = item.rival.distanceM;
      car.was = car.drawn;
      const own = item.rival.finished ? 0 : (item.rival.speed ?? 0) / 3.6;
      const limit = item.rival.finished || !Number.isFinite(item.rival.limitM) ? Infinity : item.rival.limitM;
      car.standing = !item.rival.finished && own < 0.2;
      car.stopping = car.standing || limit - item.rival.distanceM < Math.max(PULL_OVER_M, own * PULL_OVER_S);
      if (item.rival.finished) {
        // Over the line before the player: the race is done for this car. It rolls on and slows; it does not
        // stop dead on the line. A car that crosses after the player's car has stopped on the line stops there
        // too, so it is never drawn ahead of a car that beat it.
        if (!player.finished) car.rollsOn = true;
        car.v = Math.max(0, car.v - RUN_OFF_DECEL * dt);
        const reach = Math.min(item.rival.distanceM, car.drawn + CATCH_MAX * dt);
        car.drawn = car.rollsOn ? Math.max(car.drawn + car.v * dt, reach) : Math.max(car.drawn, reach);
        car.goal = car.drawn;
        car.wants = car.rollsOn && car.v > 0.5;
        continue;
      }
      // On the grid a car stands in its row. Once it is away, the row is just a gap for it to close.
      const goal = item.rival.distanceM < 0.5 ? Math.min(item.rival.distanceM, car.drawn) : item.rival.distanceM;
      car.wants = goal - car.drawn > 0.3;
      car.tuckFor = car.tuck ? car.tuckFor + dt : 0;
      if (car.tuck && (!tracked.has(car.tuck) || car.tuckFor > TUCK_S)) car.tuck = null;
      const real = clamp(goal - car.goal, 0, (own + STEP_SLACK) * dt);
      let move = real;
      car.goal = goal;
      const error = goal - (car.drawn + move);
      if (Math.abs(error) > SNAP_M) {
        car.drawn = goal;
        car.was = goal;
      } else {
        const most = car.drawn - me < -UNSEEN_BEHIND_M ? CATCH_UNSEEN : CATCH_MAX;
        move += clamp(error * (1 - Math.exp(-CATCH_GAIN * dt)), -most * dt, most * dt);
        // A drawn car never reverses. One that is ahead of its place (word of a wrong answer came late) is
        // seen braking hard, not stopping dead in the road: it keeps a part of the speed it is really doing.
        car.drawn += Math.max(0, Math.min(real, own * dt) * EASE_OFF, move);
      }
      // Falling in behind a neighbour: ease off until there is a car's length to it.
      if (car.tuck) {
        car.pace = Math.max(0, car.pace - TUCK_DECEL * dt);
        car.drawn = Math.max(car.was + car.pace * dt, Math.min(car.drawn, tracked.get(car.tuck).drawn - SAFE_LONG - 0.6));
      }
    }

    const cars = chosen.map(item => tracked.get(item.key));
    const everyone = [self, ...cars];
    /** The centre lane is the player's for a good way ahead of the player's car and behind it. */
    const centreClosed = car => Math.abs(car.drawn - me) < CENTRE_CLEAR_M;

    // Lanes, front car first, so a car sees what the cars ahead of it have just decided.
    const free = (car, lane, ahead, behind, crossing = false) => {
      if (lane < 0 || lane >= LANES.length) return false;
      if (lane === CENTRE && centreClosed(car) && !crossing) return false;
      for (const other of everyone) {
        if (other === car || !covers(other, LANES[lane])) continue;
        const gap = other.drawn - car.drawn;
        if (gap >= 0 ? gap < ahead + Math.max(0, car.v - other.v) * 0.8 : -gap < behind + Math.max(0, other.v - car.v) * 0.8) return false;
      }
      return true;
    };
    const blocked = car =>
      everyone.some(other => {
        if (other === car || !covers(other, LANES[car.target])) return false;
        const gap = other.drawn - car.drawn;
        const closing = car.v - other.v;
        // A car about to stand at its own limit queues behind a car already standing there.
        if (car.stopping && other.standing) return false;
        return gap >= 0 && gap < SAFE_LONG + 0.5 + Math.max(0, closing) * 1.1 && (closing > 0.3 || (car.held && car.wants));
      });
    const change = (car, lane) => {
      car.target = lane;
      car.since = 0;
    };
    for (const car of [...cars].sort((a, b) => b.drawn - a.drawn || byKey(a, b))) {
      car.since += dt;
      const side = Math.sign(LANES[car.home]);
      // Where the car would like to be: its own lane, or the kerb lane when it is about to stand.
      const wish = car.stopping ? kerb(Math.sign(car.x) || side) : car.home;
      const leaving = car.target === CENTRE && centreClosed(car);
      if (car.tuck) {
        // There is room behind the neighbour now: move across.
        if (free(car, car.tuckLane, SAFE_LONG + 0.5, SAFE_LONG + 0.5)) {
          change(car, car.tuckLane);
          car.tuck = null;
        }
      } else if (leaving) {
        // The player is near: out of the player's lane, to the car's own side if there is room.
        const way = [CENTRE + side, CENTRE - side].find(lane => free(car, lane, SAFE_LONG, SAFE_LONG));
        if (way !== undefined) change(car, way);
      } else if (car.since >= LANE_HOLD_S && Math.abs(LANES[car.target] - car.x) < 0.3) {
        // (One lane change at a time: the next is chosen only once the car is in the lane it was heading for.)
        if (blocked(car)) {
          // Pull out one lane to pass: a side lane before the centre, the car's own side first.
          const options = [car.target - 1, car.target + 1].sort((a, b) => (a === CENTRE) - (b === CENTRE) || Math.abs(a - car.home) - Math.abs(b - car.home));
          const way = options.find(lane => free(car, lane, SAFE_LONG + 0.5, SAFE_LONG + 0.5));
          const across = LANES.length - 1 - car.target;
          if (way !== undefined) change(car, way);
          else if (Math.abs(car.target - CENTRE) === 1 && car.drawn - me < -CENTRE_BEHIND_M && free(car, CENTRE, SAFE_LONG + 0.5, SAFE_LONG + 0.5, true) && free(car, across, SAFE_LONG + 0.5, SAFE_LONG + 0.5)) {
            // Boxed in on this side, behind the player's car: cross behind it to the open lane on the other side.
            change(car, across);
            car.home = Math.sign(LANES[car.home]) === Math.sign(LANES[across]) ? car.home : LANES.length - 1 - car.home;
          } else if (car.held && car.wants) {
            // Boxed in: a car ahead and a car alongside. Fall in behind the one alongside when the lane
            // beyond it is open, and go round from there.
            for (const lane of options) {
              const beyond = lane + (lane - car.target);
              if (lane < 0 || lane >= LANES.length || beyond < 0 || beyond >= LANES.length) continue;
              if ((lane === CENTRE || beyond === CENTRE) && centreClosed(car)) continue;
              if (covers(self, LANES[lane])) continue;
              const inLane = cars.filter(other => other !== car && covers(other, LANES[lane])).sort((a, b) => a.drawn - b.drawn);
              // The rearmost neighbour that is in the way, with a car's length of clear road behind it.
              const front = inLane.find(other => other.drawn > car.drawn - SAFE_LONG - 0.5);
              if (!front || front.drawn - car.drawn > SAFE_LONG + 8) continue;
              if (inLane.some(other => other !== front && other.drawn < front.drawn && front.drawn - other.drawn < 2 * SAFE_LONG + 1.5)) continue;
              if (everyone.some(other => other !== car && covers(other, LANES[beyond]) && Math.abs(other.drawn - (front.drawn - SAFE_LONG - 0.6)) < SAFE_LONG + 0.5)) continue;
              car.tuck = front.key;
              car.tuckLane = lane;
              car.tuckFor = 0;
              car.pace = car.v;
              break;
            }
          }
        } else if (car.target !== wish) {
          const back = car.target + Math.sign(wish - car.target);
          const room = car.stopping ? SAFE_LONG + 0.5 : RETURN_CLEAR_M;
          if (free(car, back, room, room)) change(car, back);
        }
      }
      // Across the road at a car's pace: ease in, ease out.
      // A car that is standing does not slide sideways: it steers across only while it drives (or is trying to).
      // A change already under way is finished, so a car never comes to rest across two lanes.
      const between = Math.abs(LANES[car.target] - car.x);
      const rolling = car.v > 2 || car.wants || leaving || (between > 0.02 && between < LANES[1] - LANES[0] - 0.05 && Math.abs(car.vx) > 0.05);
      const want = rolling ? clamp((LANES[car.target] - car.x) * 4, -LANE_SPEED, LANE_SPEED) : 0;
      car.vx += clamp(want - car.vx, -LANE_ACCEL * dt, LANE_ACCEL * dt);
      const next = car.x + car.vx * dt;
      // Never past the lane it is heading for.
      if (rolling && (LANES[car.target] - car.x) * (LANES[car.target] - next) <= 0) {
        car.x = LANES[car.target];
        car.vx = 0;
      } else car.x = next;
    }

    // The last word: no two cars that share road width are closer than a car's length. Who was in front
    // a frame ago stays in front; the car behind waits behind. The player's car is never moved.
    // Waiting means driving no faster than the car in front: a car is never pulled back to make the gap.
    // Only bodywork that would otherwise touch is ever moved apart.
    const touching = (a, b) => Math.abs(a.x - b.x) < CAR_WIDTH + 0.1;
    for (const car of cars) car.held = false;
    const order = (a, b) => b.was - a.was || byKey(a, b);
    const ahead = cars.filter(car => car.was >= before).sort(order);
    const behind = cars.filter(car => car.was < before).sort(order);
    const holdBehind = (car, fronts) => {
      for (const front of fronts) {
        if (abreast(car, front) && front.drawn - car.drawn < SAFE_LONG - 1e-6) {
          // Already nearer than that (it was alongside, in another lane): it eases back to the gap at a few
          // metres a second while both drive on. It does not stop dead, and it is not pulled back.
          const lead = Math.max(0, front.drawn - front.was);
          car.drawn = Math.max(front.drawn - SAFE_LONG, Math.min(car.drawn, car.was + Math.max(0, lead - GIVE_WAY * dt)));
          if (touching(car, front)) car.drawn = Math.min(car.drawn, front.drawn - CAR_LENGTH - 0.2);
          car.held = true;
        }
      }
    };
    ahead.forEach((car, index) => holdBehind(car, ahead.slice(0, index)));
    // A car in front that shares road width with the player (or with a car just moved up) keeps a length ahead.
    const movedUp = [self];
    for (let index = ahead.length - 1; index >= 0; index -= 1) {
      const car = ahead[index];
      for (const rear of movedUp) {
        if (abreast(car, rear) && car.drawn - rear.drawn < SAFE_LONG - 1e-6) {
          car.drawn = Math.max(car.drawn, Math.min(rear.drawn + SAFE_LONG, car.drawn + CATCH_MAX * dt));
          if (touching(car, rear)) car.drawn = Math.max(car.drawn, rear.drawn + CAR_LENGTH + 0.2);
          car.held = true;
          if (!movedUp.includes(car)) movedUp.push(car);
        }
      }
    }
    behind.forEach((car, index) => holdBehind(car, [self, ...ahead, ...behind.slice(0, index)]));

    // Each car's speed as drawn, for next frame's lane choices.
    for (const car of cars) {
      const seen = dt > 0 ? (car.drawn - car.was) / dt : car.v;
      car.v += (clamp(seen, 0, 140) - car.v) * Math.min(1, dt * 6);
    }
    lastPlayer = me;

    // The camera opens up for the closest car coming up behind the player; the closest car behind is also reported.
    let pull = 0;
    let side = 0;
    let rear = null;
    for (const car of cars) {
      const gap = car.drawn - me;
      if (gap >= 1.5) continue;
      if (!rear || gap > rear.gapM) rear = { id: car.rival.id, gapM: gap, side: Math.sign(car.x), closing: car.v - self.v };
      if (gap < -CAMERA_FAR_M) continue;
      const closeness = 1 - clamp((-gap - CAMERA_NEAR_M) / (CAMERA_FAR_M - CAMERA_NEAR_M), 0, 1);
      if (closeness > pull) {
        pull = closeness;
        side = Math.sign(car.x);
      }
    }

    return {
      cars: cars
        .map(car => ({
          id: car.rival.id,
          rival: car.rival,
          distanceM: car.drawn,
          lane: car.x,
          targetLane: LANES[car.target],
          standing: car.standing === true,
          tucking: car.tuck !== null,
          lateralSpeed: car.vx,
          speedMs: car.v,
          gapM: car.drawn - me,
          trueGapM: car.rival.distanceM - me,
          held: car.held
        }))
        .sort((a, b) => Math.abs(a.gapM) - Math.abs(b.gapM)),
      camera: { pull, side },
      behind: rear
    };
  }

  return {
    step,
    /** Forget every car (a new race). */
    reset() {
      tracked.clear();
      lastPlayer = null;
    }
  };
}

/** Whether two drawn cars' bodies overlap. Each is { distanceM, lane }; the player is { distanceM, lane: 0 }. */
export function overlapping(a, b) {
  return Math.abs(a.distanceM - b.distanceM) < CAR_LENGTH && Math.abs(a.lane - b.lane) < CAR_WIDTH;
}
