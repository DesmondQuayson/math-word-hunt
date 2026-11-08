import { describe, expect, it } from "vitest";

import { createRandom } from "@/public/internal-games/math-bingo-live/src/engine/random.js";
import { shapeSvg } from "@/public/internal-games/polygon-showdown/src/board-art.js";
import { findLegalMove as boardFindLegalMove, findMatches as boardFindMatches, generateBoard, reshuffleBoard } from "@/public/internal-games/polygon-showdown/src/engine/board.js";
import { coinsForMatch, milestonesCrossed, minGapAfter, showdownReward, TIMING } from "@/public/internal-games/polygon-showdown/src/engine/economy.js";
import {
  applySwap,
  CONFIG,
  createKnownRefills,
  createRefillStream,
  decodeBoard,
  encodeBoard,
  findLegalMove,
  isGameState,
  newGameState,
  refillWindow,
  replayMoves,
  startingBoard,
  stateHash,
  type GameConfig,
  type GameState,
  type Move
} from "@/public/internal-games/polygon-showdown/src/engine/game.js";
import { ACTIVE_SHAPES, aspectRatio, classifyGeometry, SHAPE_INDEX, SHAPES } from "@/public/internal-games/polygon-showdown/src/engine/shapes.js";

const { circle: O, triangle: T, square: S, rectangle: R } = SHAPE_INDEX as Record<string, number>;
const cols = CONFIG.cols;
const rows = CONFIG.rows;
const at = (row: number, col: number) => row * cols + col;

/** A background of alternating squares and rectangles, with no line anywhere. */
function background(): number[] {
  return Array.from({ length: cols * rows }, (_, cell) => (Math.floor(cell / cols) + (cell % cols)) % 2 ? R : S);
}

function stateFrom(board: number[]): GameState {
  return newGameState(encodeBoard(board));
}

/** A refill that never lines up: it cycles the two shapes the background lacks. */
const quietRefill = (col: number, index: number) => ((col + index) % 2 ? O : T);

describe("swap, match, break, fall, refill", () => {
  it("a swap that makes a line of three is valid, and pays one coin", () => {
    const board = background();
    board[at(7, 0)] = O;
    board[at(7, 1)] = O;
    board[at(6, 2)] = O;
    board[at(7, 2)] = T;
    const result = applySwap(stateFrom(board), at(6, 2), at(7, 2), quietRefill);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].groups).toHaveLength(1);
    expect(result.steps[0].groups[0].size).toBe(3);
    expect(result.steps[0].groups[0].horizontal).toBe(true);
    expect(result.steps[0].groups[0].vertical).toBe(false);
    expect(result.coins).toBe(1);
    expect(result.state.coins).toBe(1);
    expect(result.state.matches).toBe(1);
    expect(result.state.moves).toBe(1);
  });

  it("a swap that makes no match is refused and changes nothing", () => {
    const state = stateFrom(background());
    const result = applySwap(state, at(0, 0), at(0, 1), quietRefill);
    expect(result).toEqual({ ok: false, reason: "no-match" });
    expect(state.moves).toBe(0);
  });

  it("only neighbours can swap", () => {
    const state = stateFrom(background());
    expect(applySwap(state, at(0, 0), at(0, 2), quietRefill)).toEqual({ ok: false, reason: "not-adjacent" });
    expect(applySwap(state, at(0, 0), at(1, 1), quietRefill)).toEqual({ ok: false, reason: "not-adjacent" });
    expect(applySwap(state, at(0, 7), at(1, 0), quietRefill)).toEqual({ ok: false, reason: "not-adjacent" });
    expect(applySwap(state, -1, 0, quietRefill)).toEqual({ ok: false, reason: "not-adjacent" });
    expect(applySwap(state, 63, 64, quietRefill)).toEqual({ ok: false, reason: "not-adjacent" });
  });

  it("a vertical line matches too", () => {
    const board = background();
    board[at(5, 0)] = T;
    board[at(6, 0)] = T;
    board[at(7, 1)] = T;
    const result = applySwap(stateFrom(board), at(7, 0), at(7, 1), quietRefill);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].groups[0].vertical).toBe(true);
    expect(result.steps[0].groups[0].horizontal).toBe(false);
    expect(result.steps[0].groups[0].cells).toEqual([at(5, 0), at(6, 0), at(7, 0)]);
  });

  it("four in a line pays the larger-match bonus", () => {
    const board = background();
    for (const col of [0, 1, 3]) board[at(7, col)] = O;
    board[at(6, 2)] = O;
    board[at(7, 2)] = T;
    const result = applySwap(stateFrom(board), at(6, 2), at(7, 2), quietRefill);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].groups[0].size).toBe(4);
    expect(result.steps[0].coins).toBe(2);
    expect(result.state.largestClear).toBe(4);
  });

  it("five or more in a line pays the top bonus", () => {
    const board = background();
    for (const col of [0, 1, 3, 4]) board[at(7, col)] = O;
    board[at(6, 2)] = O;
    board[at(7, 2)] = T;
    const result = applySwap(stateFrom(board), at(6, 2), at(7, 2), quietRefill);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].groups[0].size).toBe(5);
    expect(result.steps[0].coins).toBe(3);
  });

  it("an L of two lines through one cell is one match", () => {
    const board = background();
    board[at(7, 0)] = O;
    board[at(7, 1)] = O;
    board[at(6, 3)] = O; // moves into (7,3)? no: L corner is (7,2)
    board[at(5, 2)] = O;
    board[at(6, 2)] = O;
    board[at(7, 3)] = O;
    const result = applySwap(stateFrom(board), at(7, 2), at(7, 3), quietRefill);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].groups).toHaveLength(1);
    expect(result.steps[0].groups[0].size).toBe(5);
    expect(result.steps[0].groups[0].horizontal).toBe(true);
    expect(result.steps[0].groups[0].vertical).toBe(true);
  });

  it("what is above falls, and new shapes enter from the top", () => {
    const board = background();
    board[at(7, 0)] = O;
    board[at(7, 1)] = O;
    board[at(6, 2)] = O;
    board[at(7, 2)] = T;
    const before = board[at(5, 0)];
    const result = applySwap(stateFrom(board), at(6, 2), at(7, 2), quietRefill);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step = result.steps[0];
    expect(step.falls).toContainEqual({ from: at(5, 0), to: at(6, 0) });
    const after = decodeBoard(result.state.board);
    expect(after[at(6, 0)]).toBe(before);
    expect(step.spawns.map((spawn) => spawn.to).sort((a, b) => a - b)).toEqual([at(0, 0), at(0, 1), at(0, 2)]);
    expect(after.every((kind) => kind >= 0)).toBe(true);
    expect(result.state.cursors).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
  });

  it("a match made by falling shapes is a cascade: COMBO ×2 pays two", () => {
    const board = background();
    board[at(5, 0)] = O;
    board[at(6, 0)] = O;
    board[at(7, 1)] = O;
    board[at(7, 0)] = T; // swaps into (7,1)
    board[at(7, 2)] = T;
    board[at(4, 0)] = T; // lands at (7,0) once the column clears
    const result = applySwap(stateFrom(board), at(7, 0), at(7, 1), quietRefill);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chain).toBe(2);
    expect(result.steps[0].coins).toBe(1);
    expect(result.steps[1].coins).toBe(2);
    expect(result.state.coins).toBe(3);
    expect(result.state.bestCombo).toBe(2);
    expect(result.state.cascades).toBe(1);
  });

  it("the combo pays once per step and stops growing at the cap", () => {
    expect(coinsForMatch(3, 1)).toBe(1);
    expect(coinsForMatch(3, 2)).toBe(2);
    expect(coinsForMatch(3, 3)).toBe(3);
    expect(coinsForMatch(3, 3, false)).toBe(1);
    expect(coinsForMatch(3, 40)).toBe(5);
    expect(coinsForMatch(4, 1)).toBe(2);
    expect(coinsForMatch(5, 1)).toBe(3);
    expect(coinsForMatch(9, 1)).toBe(3);
    expect(coinsForMatch(5, 2)).toBe(2);
  });

  it("an entering shape never completes a line by itself", () => {
    const board = background();
    board[at(7, 0)] = O;
    board[at(7, 1)] = O;
    board[at(6, 2)] = O;
    board[at(7, 2)] = T;
    // After the fall, the top row of columns 0-2 is empty. Refill all circles.
    const result = applySwap(stateFrom(board), at(6, 2), at(7, 2), () => O);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = decodeBoard(result.state.board);
    expect(boardFindMatches(after, cols, rows)).toEqual([]);
  });

  it("a board at rest never holds a match", () => {
    for (let round = 0; round < 40; round += 1) {
      const seed = `rest-${round}`;
      let state = newGameState(encodeBoard(startingBoard(seed)));
      expect(boardFindMatches(decodeBoard(state.board), cols, rows)).toEqual([]);
      const stream = createRefillStream(seed);
      for (let move = 0; move < 40; move += 1) {
        const choice = findLegalMove(decodeBoard(state.board), cols, rows);
        expect(choice).not.toBeNull();
        const result = applySwap(state, choice![0], choice![1], stream.at);
        expect(result.ok).toBe(true);
        if (!result.ok) break;
        state = result.state;
        expect(boardFindMatches(decodeBoard(state.board), cols, rows)).toEqual([]);
        expect(findLegalMove(decodeBoard(state.board), cols, rows)).not.toBeNull();
      }
    }
  });
});

describe("no moves left", () => {
  // Every cell's possible partners differ from it: no swap can make a line.
  const dead = Array.from({ length: cols * rows }, (_, cell) => ((cell % cols) + 2 * Math.floor(cell / cols)) % 4);

  it("a board can have no legal move", () => {
    expect(boardFindMatches(dead, cols, rows)).toEqual([]);
    expect(boardFindLegalMove(dead.slice(), cols, rows)).toBeNull();
  });

  it("reshuffling keeps the same shapes, gives a playable board, and is repeatable", () => {
    const first = reshuffleBoard(dead, 0, CONFIG.kinds, cols, rows);
    expect(first.slice().sort()).toEqual(dead.slice().sort());
    expect(boardFindMatches(first, cols, rows)).toEqual([]);
    expect(boardFindLegalMove(first.slice(), cols, rows)).not.toBeNull();
    expect(reshuffleBoard(dead, 0, CONFIG.kinds, cols, rows)).toEqual(first);
    expect(reshuffleBoard(dead, 1, CONFIG.kinds, cols, rows)).not.toEqual(first);
  });

  it("running out of moves reshuffles for free and play continues", () => {
    const tiny: GameConfig = Object.freeze({ rules: 1, cols: 3, rows: 3, kinds: CONFIG.kinds });
    let found = 0;
    for (let round = 0; round < 2000 && found < 5; round += 1) {
      const random = createRandom(`tiny-${round}`);
      const board = generateBoard(random, tiny.kinds, tiny.cols, tiny.rows);
      const move = boardFindLegalMove(board.slice(), tiny.cols, tiny.rows);
      if (!move) continue;
      const stream = createRefillStream(`tiny-${round}`, tiny);
      const state = { ...newGameState(encodeBoard(board), tiny) };
      const result = applySwap(state, move[0], move[1], stream.at, tiny);
      if (!result.ok || result.reshuffled === null) continue;
      found += 1;
      expect(result.state.reshuffles).toBe(1);
      expect(result.state.coins).toBeGreaterThan(0);
      const after = decodeBoard(result.state.board);
      expect(boardFindLegalMove(after.slice(), tiny.cols, tiny.rows)).not.toBeNull();
      expect(boardFindMatches(after, tiny.cols, tiny.rows)).toEqual([]);
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe("the same seed gives the same game", () => {
  it("opening boards are playable, repeatable, and differ between seeds", () => {
    const boards = new Set<string>();
    for (let round = 0; round < 200; round += 1) {
      const board = startingBoard(`seed-${round}`);
      expect(boardFindMatches(board, cols, rows)).toEqual([]);
      expect(boardFindLegalMove(board.slice(), cols, rows)).not.toBeNull();
      expect(startingBoard(`seed-${round}`)).toEqual(board);
      boards.add(encodeBoard(board));
    }
    expect(boards.size).toBe(200);
  });

  it("each column has one fixed endless sequence, read at any position", () => {
    const stream = createRefillStream("seed-a");
    const again = createRefillStream("seed-a");
    const other = createRefillStream("seed-b");
    const sequence = Array.from({ length: 500 }, (_, index) => stream.at(3, index));
    expect(Array.from({ length: 500 }, (_, index) => again.at(3, index))).toEqual(sequence);
    expect([...sequence.keys()].reverse().map((index) => again.at(3, index))).toEqual([...sequence].reverse());
    expect(Array.from({ length: 500 }, (_, index) => other.at(3, index))).not.toEqual(sequence);
    expect(sequence.every((kind) => ACTIVE_SHAPES.includes(kind))).toBe(true);
    const counts = ACTIVE_SHAPES.map((kind) => sequence.filter((value) => value === kind).length);
    expect(Math.min(...counts)).toBeGreaterThan(85);
  });

  it("the same swaps from the same seed give exactly the same result", () => {
    const play = () => {
      const stream = createRefillStream("replay-seed");
      let state = newGameState(encodeBoard(startingBoard("replay-seed")));
      for (let move = 0; move < 300; move += 1) {
        const choice = findLegalMove(decodeBoard(state.board), cols, rows)!;
        const result = applySwap(state, choice[0], choice[1], stream.at);
        if (!result.ok) throw new Error(result.reason);
        state = result.state;
      }
      return state;
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(stateHash(play())).toBe(stateHash(first));
  });

  it("the browser's partial view of the refills matches the server's", () => {
    const seed = "window-seed";
    const stream = createRefillStream(seed);
    let server = newGameState(encodeBoard(startingBoard(seed)));
    let client = server;
    const known = createKnownRefills();
    known.merge(server.cursors, refillWindow(stream, server.cursors));
    for (let move = 0; move < 150; move += 1) {
      const choice = findLegalMove(decodeBoard(client.board), cols, rows)!;
      const fromClient = applySwap(client, choice[0], choice[1], known.at);
      expect(fromClient.ok).toBe(true);
      const fromServer = applySwap(server, choice[0], choice[1], stream.at);
      if (!fromClient.ok || !fromServer.ok) return;
      client = fromClient.state;
      server = fromServer.state;
      expect(client).toEqual(server);
      known.merge(server.cursors, refillWindow(stream, server.cursors));
      known.trim(client.cursors);
    }
  });

  it("a browser that has run out of known shapes waits instead of guessing", () => {
    const board = background();
    board[at(7, 0)] = O;
    board[at(7, 1)] = O;
    board[at(6, 2)] = O;
    board[at(7, 2)] = T;
    const known = createKnownRefills();
    const state = stateFrom(board);
    expect(applySwap(state, at(6, 2), at(7, 2), known.at)).toEqual({ ok: false, reason: "need-refill" });
    expect(state.moves).toBe(0);
  });
});

describe("server replay", () => {
  const seed = "replay-limits";
  const opening = newGameState(encodeBoard(startingBoard(seed)));
  const stream = createRefillStream(seed);

  function moves(count: number, startT = 0, spacing = 1500): Move[] {
    const list: Move[] = [];
    let state = opening;
    for (let index = 0; index < count; index += 1) {
      const choice = findLegalMove(decodeBoard(state.board), cols, rows)!;
      const result = applySwap(state, choice[0], choice[1], stream.at);
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
      list.push([choice[0], choice[1], startT + index * spacing]);
    }
    return list;
  }

  it("honest play is accepted in full", () => {
    const batch = moves(10);
    const outcome = replayMoves(opening, batch, stream.at, { nextT: 0, nowT: 20_000 });
    expect(outcome.accepted).toBe(10);
    expect(outcome.rejected).toBeNull();
    expect(outcome.state.moves).toBe(10);
  });

  it("the browser's numbers are never an input", () => {
    const batch = moves(3);
    const tampered = { ...opening };
    const outcome = replayMoves(tampered, batch, stream.at, { nextT: 0, nowT: 20_000 });
    const clean = replayMoves(opening, batch, stream.at, { nextT: 0, nowT: 20_000 });
    expect(outcome.state.coins).toBe(clean.state.coins);
    expect(outcome.state.coins).toBeLessThan(50);
  });

  it("swaps faster than the board can settle are refused", () => {
    const batch = moves(5, 0, 50);
    const outcome = replayMoves(opening, batch, stream.at, { nextT: 0, nowT: 20_000 });
    expect(outcome.accepted).toBe(1);
    expect(outcome.rejected?.reason).toBe("too-fast");
  });

  it("a swap stamped in the future is refused", () => {
    const batch = moves(2, 10_000);
    const outcome = replayMoves(opening, batch, stream.at, { nextT: 0, nowT: 5_000 });
    expect(outcome.accepted).toBe(0);
    expect(outcome.rejected?.reason).toBe("from-the-future");
  });

  it("swaps saved up and sent long afterwards are refused", () => {
    const batch = moves(2, 1_000);
    const outcome = replayMoves(opening, batch, stream.at, { nextT: 0, nowT: 1_000 + TIMING.MAX_BACKDATE_MS + 5_000 });
    expect(outcome.accepted).toBe(0);
    expect(outcome.rejected?.reason).toBe("too-old");
  });

  it("nothing counts after the buzzer", () => {
    const batch = moves(4, 0, 2_000);
    const outcome = replayMoves(opening, batch, stream.at, { nextT: 0, nowT: 7_000, maxT: 3_000 });
    expect(outcome.accepted).toBe(2);
    expect(outcome.rejected?.reason).toBe("after-buzzer");
  });

  it("a swap that makes no match is refused, and the moves before it stand", () => {
    const batch = moves(3);
    const after = replayMoves(opening, batch.slice(0, 2), stream.at, { nextT: 0, nowT: 20_000 });
    batch[2] = [0, 2, batch[2][2]];
    const outcome = replayMoves(opening, batch, stream.at, { nextT: 0, nowT: 20_000 });
    expect(outcome.accepted).toBe(2);
    expect(outcome.rejected?.reason).toBe("not-adjacent");
    expect(outcome.state).toEqual(after.state);
  });

  it("the next swap can never come sooner than the last one takes to resolve", () => {
    expect(minGapAfter(1)).toBe(TIMING.MIN_SWAP_MS + TIMING.MIN_STEP_MS);
    expect(minGapAfter(4)).toBeGreaterThan(minGapAfter(1));
  });

  it("recognises a stored state and refuses a malformed one", () => {
    expect(isGameState(opening)).toBe(true);
    expect(isGameState({ ...opening, board: "012" })).toBe(false);
    expect(isGameState({ ...opening, board: "9".repeat(64) })).toBe(false);
    expect(isGameState({ ...opening, coins: -1 })).toBe(false);
    expect(isGameState({ ...opening, cursors: [1] })).toBe(false);
    expect(isGameState(null)).toBe(false);
  });
});

describe("the four shapes", () => {
  it("V1 boards deal exactly circle, triangle, square and rectangle", () => {
    expect(ACTIVE_SHAPES.map((kind: number) => SHAPES[kind].key)).toEqual(["circle", "triangle", "square", "rectangle"]);
  });

  it("every shape is named correctly from its outline alone", () => {
    for (const entry of SHAPES) expect(classifyGeometry(entry.geometry)).toBe(entry.key);
  });

  it("a rectangle cannot be mistaken for a square", () => {
    expect(aspectRatio(SHAPES[S].geometry)).toBe(1);
    expect(aspectRatio(SHAPES[R].geometry)).toBeGreaterThanOrEqual(1.9);
    const drawn = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(shapeSvg(R));
    expect(drawn).not.toBeNull();
    expect(Number(drawn![3]) / Number(drawn![4])).toBeGreaterThanOrEqual(1.9);
  });

  it("each shape's drawing carries its own outline and is not told apart by colour alone", () => {
    expect(shapeSvg(O)).toContain("<circle");
    expect(shapeSvg(T)).toContain("<polygon");
    expect(shapeSvg(S)).toContain('width="70" height="70"');
    expect(shapeSvg(R)).toContain('width="90" height="44"');
    const svgs = ACTIVE_SHAPES.map((kind: number) => shapeSvg(kind));
    expect(new Set(svgs).size).toBe(4);
  });

  it("future shapes are drawn and need no engine change", () => {
    for (const key of ["pentagon", "hexagon", "rhombus", "trapezoid", "octagon"]) {
      const kind = (SHAPE_INDEX as Record<string, number>)[key];
      expect(shapeSvg(kind)).toContain("<polygon");
    }
    const wide: GameConfig = Object.freeze({ rules: 1, cols, rows, kinds: [O, T, S, R, (SHAPE_INDEX as Record<string, number>).hexagon] });
    const board = startingBoard("five-shapes", wide);
    expect(new Set(board).size).toBe(5);
    expect(boardFindMatches(board, cols, rows)).toEqual([]);
  });
});

describe("rewards and milestones", () => {
  it("a Showdown's coins convert at half, with a cap per minute", () => {
    expect(showdownReward(184, 300)).toBe(92);
    expect(showdownReward(1000, 300)).toBe(200);
    expect(showdownReward(1000, 1800)).toBe(500);
    expect(showdownReward(0, 300)).toBe(0);
    expect(showdownReward(-5, 300)).toBe(0);
  });

  it("milestones are crossed once", () => {
    expect(milestonesCrossed(20, 30)).toEqual([25]);
    expect(milestonesCrossed(30, 40)).toEqual([]);
    expect(milestonesCrossed(0, 120)).toEqual([25, 50, 100]);
  });
});
