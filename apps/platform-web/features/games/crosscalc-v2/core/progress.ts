import type { CrossCalcPuzzle } from "./types";
import type { SessionState } from "./session";
import type { ReasoningScore } from "./reasoning";
export const SESSION_KEY = "mathnexa.crosscalc.v2.active";
export const RESULTS_KEY = "mathnexa.crosscalc.v2.results";
export type StoredResult = Readonly<{
  schema: "crosscalc-result/2";
  game: "crosscalc";
  gameVersion: "0.2.0";
  mechanic: "number-placement";
  version: 2;
  puzzleId: string;
  puzzleSignature: string;
  seed: string;
  mode: CrossCalcPuzzle["mode"];
  difficulty: CrossCalcPuzzle["difficulty"];
  completedAt: number;
  completionValid: true;
  reasoningIndex: number;
  components: ReasoningScore;
  attemptEvidence: SessionState["metrics"];
}>;
export function saveSession(storage: Storage, puzzle: CrossCalcPuzzle, session: SessionState): void { storage.setItem(SESSION_KEY, JSON.stringify({ version: 2, puzzle: { seed: puzzle.seed, mode: puzzle.mode, difficulty: puzzle.difficulty }, session })); }
export function loadSession(storage: Storage): { puzzle: { seed: string; mode: CrossCalcPuzzle["mode"]; difficulty: CrossCalcPuzzle["difficulty"] }; session: SessionState } | null { try { const parsed = JSON.parse(storage.getItem(SESSION_KEY) ?? "null"); return parsed?.version === 2 && parsed.session?.schemaVersion === 2 ? parsed : null; } catch { return null; } }
export function recordResult(storage: Storage, result: StoredResult): void { let results: StoredResult[] = []; try { const parsed = JSON.parse(storage.getItem(RESULTS_KEY) ?? "[]"); if (Array.isArray(parsed)) results = parsed; } catch { /* use empty history */ } if (!results.some((item) => item.puzzleId === result.puzzleId)) storage.setItem(RESULTS_KEY, JSON.stringify([...results, result])); }
export function createResultRecord(puzzle: CrossCalcPuzzle, session: SessionState, score: ReasoningScore): StoredResult {
  if (session.completedAt === null) throw new Error("Cannot record an incomplete CrossCalc result.");
  return Object.freeze({
    schema: "crosscalc-result/2",
    game: "crosscalc",
    gameVersion: "0.2.0",
    mechanic: "number-placement",
    version: 2,
    puzzleId: puzzle.id,
    puzzleSignature: puzzle.id,
    seed: puzzle.seed,
    mode: puzzle.mode,
    difficulty: puzzle.difficulty,
    completedAt: session.completedAt,
    completionValid: true,
    reasoningIndex: score.total,
    components: score,
    attemptEvidence: session.metrics
  });
}
