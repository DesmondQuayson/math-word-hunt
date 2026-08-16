import { equationIsValid } from "./arithmetic";
import type { CrossCalcPuzzle, PuzzleEquation, SolverMetrics } from "./types";
export type SolverResult = Readonly<{ solutionCount: number; canonicalSolution: Readonly<Record<string, number>> | null; metrics: SolverMetrics }>;
function consume(counts: Map<number, number>, value: number, delta: number): boolean { const next = (counts.get(value) ?? 0) + delta; if (next < 0) return false; if (next === 0) counts.delete(value); else counts.set(value, next); return true; }
function completeValues(equation: PuzzleEquation, values: ReadonlyMap<string, number>): number[] | null { const operands = equation.operandCellIds.map((id) => values.get(id)); const result = values.get(equation.resultCellId); if (result === undefined || operands.some((value) => value === undefined)) return null; return [...operands as number[], result]; }
function locallyPossible(equation: PuzzleEquation, values: Map<string, number>, counts: Map<number, number>): boolean {
  const ids = [...equation.operandCellIds, equation.resultCellId];
  const missing = ids.filter((id) => !values.has(id));
  if (!missing.length) { const complete = completeValues(equation, values)!; return equationIsValid(complete.slice(0, -1), equation.operators, complete.at(-1)!); }
  if (missing.length > 2) return true;
  const choices = [...counts.keys()];
  const visit = (index: number): boolean => {
    if (index === missing.length) { const complete = completeValues(equation, values)!; return equationIsValid(complete.slice(0, -1), equation.operators, complete.at(-1)!); }
    const id = missing[index]!;
    for (const value of choices) { if (!consume(counts, value, -1)) continue; values.set(id, value); const works = visit(index + 1); values.delete(id); consume(counts, value, 1); if (works) return true; }
    return false;
  };
  return visit(0);
}
export function solvePuzzle(puzzle: Pick<CrossCalcPuzzle, "cells" | "equations" | "tiles">, limit = 2): SolverResult {
  const values = new Map<string, number>(); for (const cell of puzzle.cells) if (cell.given) values.set(cell.id, cell.solution);
  const counts = new Map<number, number>(); for (const tile of puzzle.tiles) counts.set(tile.value, (counts.get(tile.value) ?? 0) + 1);
  const byCell = new Map<string, PuzzleEquation[]>();
  for (const equation of puzzle.equations) for (const id of [...equation.operandCellIds, equation.resultCellId]) { const list = byCell.get(id) ?? []; list.push(equation); byCell.set(id, list); }
  const hidden = puzzle.cells.filter((cell) => !cell.given).map((cell) => cell.id);
  let solutions = 0, nodes = 0, forced = 0, branches = 0, maxDomain = 0, domainTotal = 0, domainSamples = 0, maxDepth = 0; let canonical: Record<string, number> | null = null;
  const candidateValues = (id: string): number[] => { const candidates: number[] = []; for (const value of [...counts.keys()]) { consume(counts, value, -1); values.set(id, value); const possible = (byCell.get(id) ?? []).every((equation) => locallyPossible(equation, values, counts)); values.delete(id); consume(counts, value, 1); if (possible) candidates.push(value); } maxDomain = Math.max(maxDomain, candidates.length); domainTotal += candidates.length; domainSamples += 1; return candidates; };
  const search = (depth: number): void => {
    if (solutions >= limit) return; nodes += 1; maxDepth = Math.max(maxDepth, depth);
    if (values.size === puzzle.cells.length) { if (puzzle.equations.every((equation) => locallyPossible(equation, values, counts))) { solutions += 1; canonical ??= Object.fromEntries(hidden.map((id) => [id, values.get(id)!])); } return; }
    let chosen = ""; let domain: number[] | null = null;
    for (const id of hidden) { if (values.has(id)) continue; const candidates = candidateValues(id); if (!candidates.length) return; if (!domain || candidates.length < domain.length) { chosen = id; domain = candidates; if (candidates.length === 1) break; } }
    if (!domain) return; if (domain.length === 1) forced += 1; else branches += 1;
    for (const value of domain) { if (!consume(counts, value, -1)) continue; values.set(chosen, value); search(depth + 1); values.delete(chosen); consume(counts, value, 1); if (solutions >= limit) break; }
  };
  search(0);
  return Object.freeze({ solutionCount: solutions, canonicalSolution: canonical ? Object.freeze(canonical) : null, metrics: Object.freeze({ nodesExplored: nodes, forcedDeductions: forced, branchCount: branches, maximumCandidateDomain: maxDomain, averageCandidateDomain: domainSamples ? domainTotal / domainSamples : 0, dependencyDepth: maxDepth }) });
}
