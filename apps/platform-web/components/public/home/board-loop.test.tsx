import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBoardLoop, HOLD_MS } from "./board-loop";
import { PrepBoard } from "./prep-board";

// Stands in for a CSS animation: a pass ends when the test calls complete().
class FakeAnimation {
  playState: AnimationPlayState = "running";
  currentTime: number | null = 0;
  plays = 0;
  finished!: Promise<FakeAnimation>;
  private resolve!: () => void;

  constructor() {
    this.renew();
  }

  private renew() {
    this.finished = new Promise((done) => {
      this.resolve = () => done(this);
    });
  }

  play() {
    this.plays += 1;
    if (this.playState === "finished") this.renew();
    this.playState = "running";
  }

  pause() {
    this.playState = "paused";
  }

  finish() {
    this.playState = "finished";
    this.resolve();
  }

  complete() {
    this.currentTime = 4_320;
    this.finish();
  }
}

const fakes = (count = 3) => Array.from({ length: count }, () => new FakeAnimation());
const asAnimations = (list: FakeAnimation[]) => list as unknown as Animation[];
const flush = () => vi.advanceTimersByTimeAsync(0);
const completeAll = async (list: FakeAnimation[]) => {
  for (const animation of list) animation.complete();
  await flush();
};

function setup({ onScreen = true, reduced = false } = {}) {
  const remount = vi.fn();
  const onPausedChange = vi.fn();
  const loop = createBoardLoop({ remount, onPausedChange, onScreen, reduced });
  const board = fakes();
  loop.track(asAnimations(board));
  return { loop, board, remount, onPausedChange };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("worked problem loop", () => {
  it("rests three seconds on the solved problem, then plays the same animations again, pass after pass", async () => {
    expect(HOLD_MS).toBe(3_000);
    const { loop, board, remount } = setup();
    for (let pass = 1; pass <= 6; pass += 1) {
      expect(board.every((animation) => animation.playState === "running")).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await completeAll(board);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(HOLD_MS - 1);
      expect(board.every((animation) => animation.playState === "finished")).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      // Rewound to the first frame and running: the next pass has begun.
      expect(board.every((animation) => animation.currentTime === 0 && animation.playState === "running" && animation.plays === pass)).toBe(true);
    }
    // The automatic cycle never rebuilds the board.
    expect(remount).not.toHaveBeenCalled();
    loop.dispose();
  });

  it("waits for the last animation of a pass before resting", async () => {
    const { loop, board } = setup();
    board[0].complete();
    board[1].complete();
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.getTimerCount()).toBe(0);
    board[2].complete();
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    loop.dispose();
  });

  it("keeps at most one timer however often its state changes, and Replay cancels the pending rest", async () => {
    const { loop, board, remount } = setup();
    await completeAll(board);
    for (let index = 0; index < 20; index += 1) {
      loop.setOnScreen(true);
      loop.setFocused(false);
      loop.setReduced(false);
      expect(vi.getTimerCount()).toBe(1);
    }
    for (let click = 0; click < 5; click += 1) loop.replay();
    expect(remount).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
    // The old board's animations are no longer followed or touched.
    await vi.advanceTimersByTimeAsync(HOLD_MS * 2);
    expect(board.every((animation) => animation.plays === 0)).toBe(true);
    const fresh = fakes();
    loop.track(asAnimations(fresh));
    await completeAll(fresh);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(HOLD_MS);
    expect(fresh.every((animation) => animation.plays === 1 && animation.playState === "running")).toBe(true);
    loop.dispose();
  });

  it("ignores a stale board's late finish after Replay", async () => {
    const { loop, board } = setup();
    loop.replay();
    const fresh = fakes();
    loop.track(asAnimations(fresh));
    await completeAll(board);
    expect(vi.getTimerCount()).toBe(0);
    loop.dispose();
  });

  it("holds its frame off screen or in a background tab, and resumes when seen again", async () => {
    const { loop, board } = setup();
    loop.setOnScreen(false);
    expect(board.every((animation) => animation.playState === "paused")).toBe(true);
    loop.setOnScreen(true);
    expect(board.every((animation) => animation.playState === "running")).toBe(true);
    await completeAll(board);
    // Leaving during the rest clears the timer; coming back starts a full rest.
    await vi.advanceTimersByTimeAsync(2_000);
    loop.setOnScreen(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(board.every((animation) => animation.plays === 1)).toBe(true);
    loop.setOnScreen(true);
    await vi.advanceTimersByTimeAsync(HOLD_MS - 1);
    expect(board.every((animation) => animation.playState === "finished")).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(board.every((animation) => animation.playState === "running" && animation.currentTime === 0)).toBe(true);
    loop.dispose();
  });

  it("starts held when the board begins off screen", async () => {
    const { loop, board } = setup({ onScreen: false });
    expect(board.every((animation) => animation.playState === "paused")).toBe(true);
    loop.setOnScreen(true);
    expect(board.every((animation) => animation.playState === "running")).toBe(true);
    loop.dispose();
  });

  it("waits while keyboard focus is inside the sheet", async () => {
    const { loop, board } = setup();
    loop.setFocused(true);
    await completeAll(board);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(board.every((animation) => animation.playState === "finished")).toBe(true);
    loop.setFocused(false);
    await vi.advanceTimersByTimeAsync(HOLD_MS);
    expect(board.every((animation) => animation.playState === "running")).toBe(true);
    loop.dispose();
  });

  it("Pause freezes the pass and stops the cycle; Play resumes it, or starts a fresh board at rest", async () => {
    const { loop, board, remount, onPausedChange } = setup();
    loop.togglePause();
    expect(onPausedChange).toHaveBeenLastCalledWith(true);
    expect(board.every((animation) => animation.playState === "paused")).toBe(true);
    loop.togglePause();
    expect(onPausedChange).toHaveBeenLastCalledWith(false);
    expect(board.every((animation) => animation.playState === "running")).toBe(true);
    await completeAll(board);
    loop.togglePause();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(board.every((animation) => animation.playState === "finished")).toBe(true);
    loop.togglePause();
    expect(remount).toHaveBeenCalledTimes(1);
    loop.dispose();
  });

  it("an answer to Your turn shows the solved problem and stops the cycle until Replay", async () => {
    const { loop, board, remount, onPausedChange } = setup();
    loop.answered();
    expect(board.every((animation) => animation.playState === "finished")).toBe(true);
    expect(onPausedChange).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(board.every((animation) => animation.plays === 0)).toBe(true);
    loop.replay();
    expect(onPausedChange).toHaveBeenLastCalledWith(false);
    expect(remount).toHaveBeenCalledTimes(1);
    loop.dispose();
  });

  it("never loops with reduced motion, and starts a fresh board if motion is allowed again", async () => {
    const remount = vi.fn();
    const loop = createBoardLoop({ remount, onPausedChange: vi.fn(), onScreen: true, reduced: true });
    // The stylesheet removes the animations: there is nothing to follow.
    loop.track([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.getTimerCount()).toBe(0);
    loop.setReduced(false);
    expect(remount).toHaveBeenCalledTimes(1);
    loop.dispose();
  });

  it("stops at once when reduced motion is turned on mid-cycle", async () => {
    const { loop, board } = setup();
    await completeAll(board);
    expect(vi.getTimerCount()).toBe(1);
    loop.setReduced(true);
    expect(vi.getTimerCount()).toBe(0);
    loop.dispose();
  });

  it("clears its timer when disposed and ignores later events", async () => {
    const { loop, board, remount } = setup();
    await completeAll(board);
    loop.dispose();
    expect(vi.getTimerCount()).toBe(0);
    loop.setOnScreen(true);
    loop.togglePause();
    loop.replay();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(remount).not.toHaveBeenCalled();
    expect(board.every((animation) => animation.plays === 0)).toBe(true);
  });
});

describe("worked problem controls", () => {
  type Observed = { callback: IntersectionObserverCallback; disconnected: boolean };
  let observers: Observed[];
  let boardAnimations: FakeAnimation[];

  beforeEach(() => {
    observers = [];
    boardAnimations = fakes(4);
    vi.stubGlobal("IntersectionObserver", class {
      private record: Observed;
      constructor(callback: IntersectionObserverCallback) {
        this.record = { callback, disconnected: false };
        observers.push(this.record);
      }
      observe() {}
      disconnect() {
        this.record.disconnected = true;
      }
    });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => boardAnimations });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
  });

  const seen = (isIntersecting: boolean) => act(() => {
    for (const observer of observers) observer.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });

  it("offers Pause beside Replay, and both work from the keyboard", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<PrepBoard />);
    const pause = screen.getByRole("button", { name: "Pause the worked example" });
    expect(screen.getByRole("button", { name: "Replay the worked example" })).toBeTruthy();
    pause.focus();
    await user.keyboard("{Enter}");
    expect(boardAnimations.every((animation) => animation.playState === "paused")).toBe(true);
    // Same button, new name: focus stays put.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Play the worked example" }));
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pause the worked example" })).toBe(document.activeElement);
    expect(boardAnimations.every((animation) => animation.playState === "running")).toBe(true);
  });

  it("holds the board while it is off screen or the tab is hidden", async () => {
    render(<PrepBoard />);
    seen(false);
    expect(boardAnimations.every((animation) => animation.playState === "paused")).toBe(true);
    seen(true);
    expect(boardAnimations.every((animation) => animation.playState === "running")).toBe(true);
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(boardAnimations.every((animation) => animation.playState === "paused")).toBe(true);
    hidden.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(boardAnimations.every((animation) => animation.playState === "running")).toBe(true);
    hidden.mockRestore();
  });

  it("an answer to Your turn stops the cycle; Replay rebuilds the board and clears the answer", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<PrepBoard />);
    const figure = screen.getByRole("figure");
    await user.click(screen.getByRole("button", { name: "7 cups" }));
    expect(screen.getByText("Yes: 7 cups × 4 = 28 bars.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play the worked example" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Replay the worked example" }));
    expect(screen.getByRole("figure")).not.toBe(figure);
    expect(screen.queryByText("Yes: 7 cups × 4 = 28 bars.")).toBeNull();
    expect(screen.getByRole("button", { name: "Pause the worked example" })).toBeTruthy();
  });

  it("waits while focus is on a Your turn answer, then carries on", async () => {
    // React keeps scheduler timers of its own here, so this checks behaviour, not the timer count.
    render(<PrepBoard />);
    for (const animation of boardAnimations) animation.complete();
    await flush();
    const answer = screen.getByRole("button", { name: "6 cups" });
    act(() => answer.focus());
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS * 10));
    expect(boardAnimations.every((animation) => animation.playState === "finished" && animation.plays === 0)).toBe(true);
    act(() => answer.blur());
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS - 1));
    expect(boardAnimations.every((animation) => animation.playState === "finished")).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(boardAnimations.every((animation) => animation.playState === "running" && animation.currentTime === 0)).toBe(true);
  });

  it("cleans up its observer, listeners and timer when the page leaves", async () => {
    const removed = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<PrepBoard />);
    for (const animation of boardAnimations) animation.complete();
    await flush();
    unmount();
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    expect(removed).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    // The pending rest was cleared: nothing is rewound after the board is gone.
    await vi.advanceTimersByTimeAsync(HOLD_MS * 10);
    expect(boardAnimations.every((animation) => animation.plays === 0 && animation.playState === "finished")).toBe(true);
    removed.mockRestore();
  });

  it("never touches an answer by clicking elsewhere on the sheet", () => {
    render(<PrepBoard />);
    fireEvent.click(screen.getByText("3 cups of oats make 12 granola bars. How many cups make 20 bars?"));
    expect(screen.getByRole("button", { name: "Pause the worked example" })).toBeTruthy();
    expect(boardAnimations.every((animation) => animation.playState === "running")).toBe(true);
  });
});
