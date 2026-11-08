/**
 * Polygon Showdown fairness simulation.
 *
 * Plays complete five-minute Showdowns through the real game engine. In every
 * room, seat 0 is the creator and the other seats are joiners. All seats play
 * the same strategy at the same skill, with their own independent luck. If the
 * creator, or any seat number, had a systematic edge it would show here as a
 * seat whose average is out of line with the rest.
 *
 *   node scripts/polygon-showdown-fairness-simulation.mjs [--rooms 400] [--seats 8]
 */
import { createRandom } from "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/random.js";
import { allLegalMoves, applySwap, createRefillStream, decodeBoard, encodeBoard, newGameState, startingBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const ROOMS = option("rooms", 400);
const SEATS = option("seats", 8);
const ROUND_MS = 5 * 60_000;

function playSeat(roomSeed, stream, luck) {
  const random = createRandom(luck);
  let state = newGameState(encodeBoard(startingBoard(roomSeed)));
  let clock = 0;
  while (clock < ROUND_MS) {
    clock += 2100 * (0.6 + random.next() * 0.8);
    const moves = allLegalMoves(decodeBoard(state.board), 8, 8);
    const [a, b] = moves[random.int(0, moves.length - 1)];
    const result = applySwap(state, a, b, stream.at);
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
    clock += 180 + result.chain * 470;
  }
  return state;
}

const totals = Array.from({ length: SEATS }, () => ({ coins: 0, squares: 0, wins: 0 }));
let ties = 0;
for (let room = 0; room < ROOMS; room += 1) {
  const seed = `fair-room-${room}`;
  const stream = createRefillStream(seed);
  const results = Array.from({ length: SEATS }, (_, seat) => playSeat(seed, stream, `fair-${room}-${seat}`));
  // The same decisions always give the same result, whoever makes them.
  const replayA = playSeat(seed, stream, "same-luck");
  const replayB = playSeat(seed, createRefillStream(seed), "same-luck");
  if (JSON.stringify(replayA) !== JSON.stringify(replayB)) throw new Error("Identical play gave different results.");
  const best = Math.max(...results.map((state) => state.coins));
  const winners = results.filter((state) => state.coins === best);
  if (winners.length > 1) ties += 1;
  results.forEach((state, seat) => {
    totals[seat].coins += state.coins;
    totals[seat].squares += state.coins * state.coins;
    if (state.coins === best) totals[seat].wins += 1 / winners.length;
  });
}

const means = totals.map((seat) => seat.coins / ROOMS);
const overall = means.reduce((sum, value) => sum + value, 0) / SEATS;
const variance = totals.reduce((sum, seat) => sum + (seat.squares / ROOMS - (seat.coins / ROOMS) ** 2), 0) / SEATS;
const standardError = Math.sqrt(variance / ROOMS);
const worst = Math.max(...means.map((value) => Math.abs(value - overall)));
const expectedWinShare = 1 / SEATS;
const winShares = totals.map((seat) => seat.wins / ROOMS);

console.log(`Rooms ${ROOMS}, seats ${SEATS}, overall mean coins ${overall.toFixed(1)}, standard error of a seat mean ${standardError.toFixed(2)}`);
means.forEach((value, seat) => {
  const z = (value - overall) / standardError;
  console.log(`${seat === 0 ? "creator" : `seat ${seat} `}  mean ${value.toFixed(1)}  (${z >= 0 ? "+" : ""}${z.toFixed(2)} SE)  win share ${(winShares[seat] * 100).toFixed(1)}%`);
});
console.log(`Largest seat deviation ${(worst / standardError).toFixed(2)} SE. Expected win share ${(expectedWinShare * 100).toFixed(1)}%. Tied rooms ${ties}.`);
const creatorZ = Math.abs(means[0] - overall) / standardError;
const creatorWinGap = Math.abs(winShares[0] - expectedWinShare);
const passed = worst / standardError < 3.5 && creatorZ < 3 && creatorWinGap < 0.06;
console.log(passed ? "PASS: no systematic creator or seat advantage." : "FAIL: a seat is out of line.");
process.exitCode = passed ? 0 : 1;
