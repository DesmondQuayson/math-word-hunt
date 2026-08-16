import type { CrossCalcPuzzle } from "./types";
import type { SessionMetrics } from "./session";
export type ReasoningScore = Readonly<{ complexity: number; accuracy: number; efficiency: number; independence: number; pace: number; total: number }>;
export function calculateReasoningIndex(puzzle: CrossCalcPuzzle, metrics: SessionMetrics): ReasoningScore {
  const complexity = 25;
  const accuracy = Math.max(0, 25 - metrics.incorrectChecks * 5);
  const efficiency = Math.max(0, 20 - Math.max(0, metrics.moves - puzzle.metrics.blankCount) * 0.8 - metrics.swaps * 0.4 - metrics.undos * 0.3 - metrics.restarts * 3 - metrics.checks * 0.35);
  const independence = Math.max(0, 20 - metrics.hintsUsed * 2 - metrics.maxHintTier * 2.5);
  const target = ({ beginner: 90, easy: 150, medium: 260, hard: 420, expert: 650 } as const)[puzzle.difficulty];
  const pace = Math.max(2, Math.min(10, 10 * target / Math.max(target, metrics.elapsedSeconds || target)));
  const total = Math.round(complexity + accuracy + efficiency + independence + pace);
  return Object.freeze({ complexity, accuracy, efficiency, independence, pace, total: Math.max(0, Math.min(100, total)) });
}
