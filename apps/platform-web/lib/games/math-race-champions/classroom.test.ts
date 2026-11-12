import { describe, expect, it } from "vitest";

import {
  CORRECT_LOCK_MS,
  TEAMS,
  TIE_WINDOW_MS,
  WRONG_LOCK_MS,
  createClassroomMatch,
  sanitizeTeamName,
  type ClassroomMatch,
  type ClassroomTeam
} from "@/public/internal-games/math-race-champions/src/engine/classroom.js";
import { createRandom } from "@/public/internal-games/math-race-champions/src/engine/random.js";
import { PRACTICE_TRACK_SPACES, TRACK_SPACES, buildTrack } from "@/public/internal-games/math-race-champions/src/engine/track.js";

const SETTINGS = { categories: "mixed", difficulty: "easy" } as const;

function newMatch(seed: string | number = "classroom", length = TRACK_SPACES): ClassroomMatch {
  const match = createClassroomMatch({ settings: SETTINGS, seed, length });
  match.start(0);
  return match;
}

const right = (match: ClassroomMatch, team: ClassroomTeam) => match.team(team).question.correctIndex;
const wrong = (match: ClassroomMatch, team: ClassroomTeam) => (match.team(team).question.correctIndex === 0 ? 1 : 0);

describe("the winding track", () => {
  const boxes = [
    ["1920x1080 Smart Board half", 900, 560],
    ["1366x768 half", 640, 380],
    ["1024x768 half", 480, 400],
    ["phone", 300, 260]
  ] as const;

  it.each(boxes)("%s: START, spaces 1 to 62 in order, FINISH", (_label, width, height) => {
    const track = buildTrack({ width, height });
    expect(track.stations).toHaveLength(64);
    expect(track.stations[0]!.kind).toBe("start");
    expect(track.stations[63]!.kind).toBe("finish");
    expect(track.stations.slice(1, 63).map(station => station.number)).toEqual(Array.from({ length: 62 }, (_, index) => index + 1));
  });

  it.each(boxes)("%s: every space is inside the box and none touches another", (_label, width, height) => {
    const track = buildTrack({ width, height });
    const half = track.tile / 2;
    for (const station of track.stations) {
      expect(station.x - half).toBeGreaterThanOrEqual(-0.01);
      expect(station.x + half).toBeLessThanOrEqual(width + 0.01);
      expect(station.y - half).toBeGreaterThanOrEqual(-0.01);
      expect(station.y + half).toBeLessThanOrEqual(height + 0.01);
    }
    for (let a = 0; a < track.stations.length; a += 1) {
      for (let b = a + 1; b < track.stations.length; b += 1) {
        const distance = Math.hypot(track.stations[a]!.x - track.stations[b]!.x, track.stations[a]!.y - track.stations[b]!.y);
        expect(distance).toBeGreaterThan(track.tile);
      }
    }
  });

  it("gives large spaces on a Smart Board", () => {
    // Half of a 1920x1080 board leaves the track about 900 x 560.
    expect(buildTrack({ width: 900, height: 560 }).tile).toBeGreaterThanOrEqual(56);
  });

  it("starts at the bottom and finishes at the top", () => {
    const track = buildTrack({ width: 900, height: 560 });
    expect(track.stations[0]!.y).toBeGreaterThan(track.stations[63]!.y);
    expect(track.stations[0]!.x).toBeLessThan(track.width / 2);
  });

  it("puts every space the same distance along the line, and the ball follows the line", () => {
    const track = buildTrack({ width: 900, height: 560 });
    for (const station of track.stations) {
      const point = track.pointAt(station.position);
      expect(point.x).toBeCloseTo(station.x, 6);
      expect(point.y).toBeCloseTo(station.y, 6);
    }
    // Walking the line in small steps never jumps: the ball cannot teleport.
    let previous = track.pointAt(0);
    let travelled = 0;
    for (let step = 1; step <= 6300; step += 1) {
      const point = track.pointAt(step / 100);
      const hop = Math.hypot(point.x - previous.x, point.y - previous.y);
      expect(hop).toBeLessThan(track.spacing / 100 + 0.01);
      travelled += hop;
      previous = point;
    }
    expect(travelled).toBeCloseTo(track.length, 0);
  });

  it("also builds the 30-space practice track", () => {
    const track = buildTrack({ width: 900, height: 560, spaces: PRACTICE_TRACK_SPACES });
    expect(track.stations).toHaveLength(32);
    expect(track.tile).toBeGreaterThan(buildTrack({ width: 900, height: 560 }).tile);
  });
});

describe("Classroom Competition rules", () => {
  it("both teams start at 0 of 62 with their own, different questions of the same category", () => {
    const match = newMatch();
    for (const team of TEAMS) {
      expect(match.team(team).position).toBe(0);
      expect(match.team(team).remaining).toBe(62);
    }
    let different = 0;
    for (let turn = 0; turn < 40; turn += 1) {
      const turquoise = match.team("turquoise").question;
      const pink = match.team("pink").question;
      expect(turquoise.category).toBe(pink.category);
      if (turquoise.key !== pink.key) different += 1;
      match.submit("turquoise", wrong(match, "turquoise"), turn * 1000);
      match.submit("pink", wrong(match, "pink"), turn * 1000);
    }
    expect(different).toBeGreaterThan(35);
  });

  it("a correct answer is exactly +1 and a wrong answer is exactly 0", () => {
    const match = newMatch();
    let at = 0;
    for (let turn = 0; turn < 40; turn += 1) {
      const before = match.team("turquoise").position;
      const isRight = turn % 3 !== 0;
      const result = match.submit("turquoise", isRight ? right(match, "turquoise") : wrong(match, "turquoise"), at);
      expect(result.accepted).toBe(true);
      expect(match.team("turquoise").position).toBe(before + (isRight ? 1 : 0));
      expect(match.team("turquoise").remaining).toBe(62 - match.team("turquoise").position);
      at += 1000;
    }
  });

  it("one team's answer never moves or changes the other team", () => {
    const match = newMatch();
    const pinkBefore = match.team("pink");
    match.submit("turquoise", right(match, "turquoise"), 10);
    match.submit("turquoise", right(match, "turquoise"), 1000);
    match.submit("turquoise", wrong(match, "turquoise"), 2000);
    expect(match.team("pink")).toEqual(pinkBefore);
    expect(match.team("turquoise").position).toBe(2);
  });

  it("both teams can answer at the very same instant", () => {
    const match = newMatch();
    const a = match.submit("turquoise", right(match, "turquoise"), 500);
    const b = match.submit("pink", right(match, "pink"), 500);
    expect(a.accepted && b.accepted).toBe(true);
    expect(match.team("turquoise").position).toBe(1);
    expect(match.team("pink").position).toBe(1);
  });

  it("a double tap cannot move two spaces", () => {
    const match = newMatch();
    const side = right(match, "pink");
    expect(match.submit("pink", side, 100).accepted).toBe(true);
    for (const at of [100, 101, 150, 100 + CORRECT_LOCK_MS - 1]) {
      const repeat = match.submit("pink", side, at);
      expect(repeat).toEqual({ accepted: false, reason: "locked" });
    }
    expect(match.team("pink").position).toBe(1);
    expect(match.submit("pink", right(match, "pink"), 100 + CORRECT_LOCK_MS).accepted).toBe(true);
    expect(match.team("pink").position).toBe(2);
  });

  it("a wrong answer rests the buttons longer, shows a new question and takes nothing away", () => {
    const match = newMatch();
    match.submit("pink", right(match, "pink"), 0);
    const before = match.team("pink").question.key;
    match.submit("pink", wrong(match, "pink"), 1000);
    expect(match.team("pink").position).toBe(1);
    expect(match.team("pink").wrong).toBe(1);
    expect(match.team("pink").question.key).not.toBe(before);
    expect(match.submit("pink", right(match, "pink"), 1000 + WRONG_LOCK_MS - 1).accepted).toBe(false);
    expect(match.submit("pink", right(match, "pink"), 1000 + WRONG_LOCK_MS).accepted).toBe(true);
  });

  it("refuses presses before the start, for an unknown team or for a third button", () => {
    const match = createClassroomMatch({ settings: SETTINGS, seed: "early" });
    expect(match.submit("pink", 0, 0)).toEqual({ accepted: false, reason: "ready" });
    match.start(0);
    expect(match.submit("green" as ClassroomTeam, 0, 0)).toEqual({ accepted: false, reason: "unknown-team" });
    expect(match.submit("pink", 2, 0)).toEqual({ accepted: false, reason: "invalid-choice" });
  });

  function advance(match: ClassroomMatch, team: ClassroomTeam, to: number, from = 0): number {
    let at = from;
    while (match.team(team).position < to) {
      at += 1000;
      match.submit(team, right(match, team), at);
    }
    return at;
  }

  it("the first team to 62 wins, after exactly 62 correct answers", () => {
    const match = newMatch();
    advance(match, "pink", 40);
    const at = advance(match, "turquoise", 62);
    expect(match.team("turquoise").correct).toBe(62);
    expect(match.phase).toBe("resolving");
    expect(match.resolve(at + TIE_WINDOW_MS - 1)).toBeNull();
    const outcome = match.resolve(at + TIE_WINDOW_MS)!;
    expect(outcome.result).toBe("win");
    expect(outcome.winner).toBe("turquoise");
    expect(outcome.teams.pink.position).toBe(40);
    expect(match.submit("pink", 0, at + 5000)).toEqual({ accepted: false, reason: "finished" });
    expect(match.team("pink").position).toBe(40);
  });

  it.each([
    ["turquoise", "pink"],
    ["pink", "turquoise"]
  ] as const)("a finish inside the tie window is a tie, whichever side pressed first (%s first)", (first, second) => {
    const match = newMatch();
    advance(match, "turquoise", 61);
    advance(match, "pink", 61, 100_000);
    match.submit(first, right(match, first), 200_000);
    const late = match.submit(second, right(match, second), 200_000 + TIE_WINDOW_MS);
    expect(late.accepted).toBe(true);
    const outcome = match.resolve(200_000 + TIE_WINDOW_MS + 1)!;
    expect(outcome.result).toBe("tie");
    expect(outcome.winner).toBeNull();
    expect(outcome.teams.turquoise.position).toBe(62);
    expect(outcome.teams.pink.position).toBe(62);
  });

  it("a finish just outside the tie window loses", () => {
    const match = newMatch();
    advance(match, "turquoise", 61);
    advance(match, "pink", 61, 100_000);
    match.submit("pink", right(match, "pink"), 200_000);
    expect(match.submit("turquoise", right(match, "turquoise"), 200_000 + TIE_WINDOW_MS + 1)).toEqual({ accepted: false, reason: "finished" });
    const outcome = match.resolve(200_000 + TIE_WINDOW_MS + 1)!;
    expect(outcome.winner).toBe("pink");
    expect(outcome.teams.turquoise.position).toBe(61);
  });

  it("restart puts both footballs back at START with new questions", () => {
    const match = newMatch();
    const first = match.team("pink").question.key;
    const at = advance(match, "pink", 62);
    match.resolve(at + TIE_WINDOW_MS);
    match.restart();
    expect(match.phase).toBe("ready");
    for (const team of TEAMS) expect(match.team(team)).toMatchObject({ position: 0, remaining: 62, correct: 0, wrong: 0 });
    expect(match.round).toBe(1);
    expect(match.team("pink").question.key === first && match.team("turquoise").question.key === first).toBe(false);
  });

  it("the practice race is 30 spaces and nothing else is allowed", () => {
    const match = newMatch("practice", PRACTICE_TRACK_SPACES);
    expect(match.team("pink").remaining).toBe(30);
    expect(() => createClassroomMatch({ settings: SETTINGS, seed: "x", length: 10 })).toThrow(RangeError);
  });

  it("cleans team names", () => {
    expect(sanitizeTeamName("  The   <b>Lions</b>  ", "pink")).toBe("The bLions/b");
    expect(sanitizeTeamName("", "turquoise")).toBe("Team Turquoise");
    expect(sanitizeTeamName("x".repeat(60), "pink")).toHaveLength(18);
  });
});

describe("fairness over 2,000 simulated races", () => {
  it("equally skilled teams win equally often, and progress is always correct answers and nothing else", () => {
    const random = createRandom("fairness");
    const wins = { turquoise: 0, pink: 0, tie: 0 };
    for (let race = 0; race < 2000; race += 1) {
      const match = newMatch(`race-${race}`);
      const clock = { turquoise: 0, pink: 0 };
      let outcome = null;
      while (!outcome) {
        // The team whose next press is earlier goes next; ties broken by coin.
        const team: ClassroomTeam =
          clock.turquoise === clock.pink ? (random.next() < 0.5 ? "turquoise" : "pink") : clock.turquoise < clock.pink ? "turquoise" : "pink";
        clock[team] += 1500 + random.int(0, 3000);
        const isRight = random.next() < 0.85;
        const result = match.submit(team, isRight ? right(match, team) : wrong(match, team), clock[team]);
        if (result.accepted && match.team(team).position !== match.team(team).correct) throw new Error("progress is not the number of correct answers");
        outcome = match.resolve(Math.min(clock.turquoise, clock.pink) + TIE_WINDOW_MS + 1);
      }
      if (outcome.result === "tie") wins.tie += 1;
      else wins[outcome.winner!] += 1;
      const winner = outcome.winner ?? "turquoise";
      expect(outcome.teams[winner].correct).toBe(62);
    }
    const share = wins.turquoise / (wins.turquoise + wins.pink);
    expect(share).toBeGreaterThan(0.46);
    expect(share).toBeLessThan(0.54);
  }, 60_000);
});
