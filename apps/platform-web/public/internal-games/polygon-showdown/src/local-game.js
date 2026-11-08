// The player's side of one game: runs the shared engine so a swap answers at
// once, remembers which swaps the server has not confirmed yet, and accepts the
// server's word whenever the two disagree. The server's replay is the truth;
// everything on this side is a preview of it.

import { minGapAfter, TIMING } from "./engine/economy.js";
import { allLegalMoves, applySwap, createKnownRefills, CONFIG, decodeBoard, pentagonIsActive, stateHash } from "./engine/game.js";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Long enough to look for a match yourself; short enough that nobody stays stuck. */
export const HINT_AFTER_MS = 14_000;

export class LocalGame {
  /**
   * @param clockT  () => milliseconds on the server's timeline for this game
   * @param view    a BoardView
   * @param audio   a GameAudio
   * @param onStep  (step) => void — a cascade link just broke
   * @param onMoved (result, before) => void — a whole move has finished showing
   * @param refillAt optional fixed stream, for a practice run with no server
   */
  constructor({ state, windows, cursors, nextT, clockT, view, audio, onStep, onMoved, onStall, refillAt, onPentagon }) {
    this.state = state;
    this.nextT = nextT;
    this.clockT = clockT;
    this.view = view;
    this.audio = audio;
    this.onStep = onStep;
    this.onMoved = onMoved;
    this.onStall = onStall;
    this.onPentagon = onPentagon;
    this.pentagonAnnounced = pentagonIsActive(state, Math.round(clockT()));
    this.known = createKnownRefills(CONFIG);
    this.refillAt = refillAt ?? this.known.at;
    if (windows) this.known.merge(cursors ?? state.cursors, windows);
    this.pending = [];
    this.acked = state.moves;
    this.busy = false;
    this.frozen = false;
    this.deferredResync = null;
    this.hintTimer = null;
    this.restartHintClock();
  }

  /** The Pentagon's arrival, once. Called after a move and by the Showdown's clock. */
  checkPentagon(t = Math.round(this.clockT())) {
    if (this.pentagonAnnounced || !pentagonIsActive(this.state, t)) return;
    this.pentagonAnnounced = true;
    this.onPentagon?.();
  }

  restartHintClock() {
    clearTimeout(this.hintTimer);
    this.view.clearHint?.();
    this.hintTimer = setTimeout(() => this.offerHint(), HINT_AFTER_MS);
  }

  offerHint() {
    if (this.busy || this.frozen || !this.view.enabled) {
      this.restartHintClock();
      return;
    }
    const moves = allLegalMoves(decodeBoard(this.state.board), CONFIG.cols, CONFIG.rows);
    if (moves.length) this.view.showHint?.(...moves[this.state.moves % moves.length]);
  }

  stop() {
    clearTimeout(this.hintTimer);
  }

  async attempt(a, b) {
    if (this.busy || this.frozen) return;
    this.restartHintClock();
    const t = Math.max(Math.round(this.clockT()), this.nextT);
    const result = applySwap(this.state, a, b, this.refillAt, CONFIG, t);
    if (!result.ok) {
      if (result.reason === "no-match") {
        this.busy = true;
        this.audio.invalid();
        await this.view.playInvalid(a, b);
        this.busy = false;
        this.applyDeferred();
      } else if (result.reason === "need-refill") {
        this.onStall?.();
      }
      return;
    }
    this.busy = true;
    const startedAt = performance.now();
    this.audio.swap();
    this.nextT = t + minGapAfter(result.chain);
    this.pending.push({ move: [a, b, t], hash: stateHash(result.state) });
    const before = this.state;
    this.state = result.state;
    this.known.trim(this.state.cursors);
    try {
      await this.view.playMove(a, b, result, { onStep: (step) => this.onStep?.(step, result) });
    } catch {
      // The rules have already been applied; put the picture right.
      this.view.setBoard(this.state.board);
    }
    // Never faster than the rule the server enforces, whatever the animations did.
    const remaining = minGapAfter(result.chain) - (performance.now() - startedAt);
    if (remaining > 0) await sleep(remaining);
    this.busy = false;
    this.restartHintClock();
    this.onMoved?.(result, before);
    this.checkPentagon(t);
    this.applyDeferred();
  }

  /** The next batch of unconfirmed swaps, or null. */
  batch() {
    if (this.pending.length === 0) return null;
    const entries = this.pending.slice(0, TIMING.MAX_BATCH);
    return { from: this.acked, moves: entries.map((entry) => entry.move), h: entries[entries.length - 1].hash };
  }

  /** The server has applied everything up to `ack`. */
  acknowledge(ack, cursors, windows) {
    const applied = ack - this.acked;
    if (applied > 0) {
      this.pending.splice(0, applied);
      this.acked = ack;
    }
    if (cursors && windows) this.known.merge(cursors, windows);
  }

  /** Replace everything with the server's state (after the animation in progress). */
  resync(next) {
    this.deferredResync = next;
    this.applyDeferred();
  }

  applyDeferred() {
    if (this.busy || !this.deferredResync) return;
    const { state, windows, nextT } = this.deferredResync;
    this.deferredResync = null;
    this.state = state;
    this.pending = [];
    this.acked = state.moves;
    this.nextT = nextT;
    this.known.merge(state.cursors, windows);
    this.view.setBoard(state.board);
    this.onMoved?.(null, state);
  }
}
