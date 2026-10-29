/**
 * The worked problem's automatic replay, kept apart from React so its timing
 * can be tested with fake timers and stand-in animations.
 *
 * A pass is the board's CSS animations playing once. When every one of them
 * has finished, the solved problem rests for HOLD_MS, then the same
 * animations are rewound and played again: no new elements, so nothing
 * reflows and nothing is painted for the first time. The cycle runs only
 * while the board can be seen. Off screen or in a background tab the
 * animations hold their current frame and the rest timer is cleared, so
 * nothing ticks in the background; coming back resumes the pass, or starts a
 * fresh rest if it had finished.
 *
 * The cycle waits while keyboard focus is inside the sheet ("Your turn"), and
 * stops for good when the visitor answers "Your turn", so their answer stays
 * on screen. With reduced motion the stylesheet removes the animations, so
 * there is nothing to loop.
 */

/** The rest on the solved problem between passes. */
export const HOLD_MS = 3_000;

export type BoardLoopOptions = {
  /** Replace the board with a fresh copy: a full reset, "Your turn" included. */
  remount: () => void;
  onScreen: boolean;
  reduced: boolean;
};

export type BoardLoop = {
  /** Follow a board's animations: the first board, or a fresh one after remount. */
  track: (animations: readonly Animation[]) => void;
  setOnScreen: (onScreen: boolean) => void;
  setFocused: (focused: boolean) => void;
  setReduced: (reduced: boolean) => void;
  /** The visitor answered "Your turn": show the solved problem and stop. */
  answered: () => void;
  dispose: () => void;
};

export function createBoardLoop(options: BoardLoopOptions): BoardLoop {
  let animations: readonly Animation[] = [];
  let pass = 0;
  let settled = false;
  let onScreen = options.onScreen;
  let reduced = options.reduced;
  let focused = false;
  let stopped = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const moving = () => onScreen && !stopped && !reduced;

  const clearTimer = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  // Brings the animations and the rest timer in line with the current state.
  // There is never more than one timer.
  const sync = () => {
    if (disposed) return;
    const move = moving();
    for (const animation of animations) {
      if (move && animation.playState === "paused") animation.play();
      else if (!move && animation.playState === "running") animation.pause();
    }
    const due = settled && animations.length > 0 && move && !focused;
    if (!due) clearTimer();
    else if (timer === undefined) timer = setTimeout(rewind, HOLD_MS);
  };

  const follow = (list: readonly Animation[]) => {
    const current = ++pass;
    animations = list;
    settled = false;
    sync();
    void Promise.allSettled(list.map((animation) => animation.finished)).then(() => {
      if (current !== pass || disposed) return;
      settled = true;
      sync();
    });
  };

  function rewind() {
    timer = undefined;
    for (const animation of animations) {
      animation.currentTime = 0;
      animation.play();
    }
    follow(animations);
  }

  const remount = () => {
    clearTimer();
    pass += 1;
    animations = [];
    settled = false;
    focused = false;
    options.remount();
  };

  return {
    track(list) {
      if (!disposed) follow(list);
    },
    setOnScreen(value) {
      onScreen = value;
      sync();
    },
    setFocused(value) {
      focused = value;
      sync();
    },
    setReduced(value) {
      const was = reduced;
      reduced = value;
      // Motion allowed again: the stylesheet has just recreated the animations,
      // so start from a fresh board rather than follow stale ones.
      if (was && !value && !disposed) remount();
      else sync();
    },
    answered() {
      if (disposed) return;
      for (const animation of animations) {
        if (animation.playState === "running" || animation.playState === "paused") animation.finish();
      }
      stopped = true;
      sync();
    },
    dispose() {
      disposed = true;
      pass += 1;
      clearTimer();
    }
  };
}
