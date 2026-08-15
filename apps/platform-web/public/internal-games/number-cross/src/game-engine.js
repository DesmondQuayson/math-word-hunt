export const GENERATOR_VERSION = 1;

export const DIFFICULTIES = Object.freeze({
  beginner: { label: "Beginner", size: 3, maxAdd: 5, maxMultiply: 5, density: 0.58, multiplier: 1 },
  easy: { label: "Easy", size: 4, maxAdd: 8, maxMultiply: 6, density: 0.56, multiplier: 1.3 },
  medium: { label: "Medium", size: 5, maxAdd: 11, maxMultiply: 7, density: 0.53, multiplier: 1.7 },
  hard: { label: "Hard", size: 6, maxAdd: 15, maxMultiply: 7, density: 0.5, multiplier: 2.2 },
  expert: { label: "Expert", size: 6, maxAdd: 20, maxMultiply: 8, density: 0.46, multiplier: 2.8 }
});

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const combine = (values, mode) => mode === "addition"
  ? values.reduce((sum, value) => sum + value, 0)
  : values.reduce((product, value) => product * value, 1);

export function calculateTargets(grid, solution, mode) {
  const size = grid.length;
  const rows = grid.map((row, r) => combine(row.filter((_, c) => solution[r][c]), mode));
  const columns = Array.from({ length: size }, (_, c) => combine(
    grid.map((row, r) => row[c]).filter((_, r) => solution[r][c]),
    mode
  ));
  return { rows, columns };
}

export function calculatePlayerValues(grid, crossed, mode) {
  const size = grid.length;
  const isActive = (r, c) => !crossed.has(r * size + c);
  const rows = grid.map((row, r) => combine(row.filter((_, c) => isActive(r, c)), mode));
  const columns = Array.from({ length: size }, (_, c) => combine(
    grid.map((row, r) => row[c]).filter((_, r) => isActive(r, c)),
    mode
  ));
  return { rows, columns };
}

export function getLineStatus(value, target, mode) {
  if (value === target) return "correct";
  if (mode === "addition") return value < target ? "impossible" : "open";
  return value < target || value % target !== 0 ? "impossible" : "open";
}

function candidateMasks(row, target, mode) {
  const candidates = [];
  const limit = 1 << row.length;
  for (let mask = 1; mask < limit; mask += 1) {
    const values = row.filter((_, column) => mask & (1 << column));
    if (combine(values, mode) === target) candidates.push(mask);
  }
  return candidates;
}

function suffixOptions(grid, rowCandidates, mode, column, startRow, target) {
  let possibilities = new Set([mode === "addition" ? 0 : 1]);
  for (let row = startRow; row < grid.length; row += 1) {
    const canOff = rowCandidates[row].some(mask => !(mask & (1 << column)));
    const canOn = rowCandidates[row].some(mask => mask & (1 << column));
    const choices = [];
    if (canOff) choices.push(mode === "addition" ? 0 : 1);
    if (canOn) choices.push(grid[row][column]);
    const next = new Set();
    for (const base of possibilities) {
      for (const choice of choices) {
        const value = mode === "addition" ? base + choice : base * choice;
        if (value <= target && (mode === "addition" || target % value === 0)) next.add(value);
      }
    }
    possibilities = next;
  }
  return possibilities;
}

export function solvePuzzle(puzzle, limit = 2) {
  const { grid, rowTargets, columnTargets, mode } = puzzle;
  const size = grid.length;
  const started = globalThis.performance?.now?.() ?? Date.now();
  const rowCandidates = grid.map((row, index) => candidateMasks(row, rowTargets[index], mode));
  if (rowCandidates.some(candidates => candidates.length === 0)) {
    return { count: 0, solutions: [], nodes: 0, rowCandidateCounts: rowCandidates.map(c => c.length), durationMs: 0 };
  }

  const suffix = Array.from({ length: size }, (_, column) =>
    Array.from({ length: size + 1 }, (_, row) => suffixOptions(grid, rowCandidates, mode, column, row, columnTargets[column]))
  );
  const identity = mode === "addition" ? 0 : 1;
  const columnValues = Array(size).fill(identity);
  const chosen = [];
  const solutions = [];
  let nodes = 0;

  const search = row => {
    if (solutions.length >= limit) return;
    if (row === size) {
      if (columnValues.every((value, column) => value === columnTargets[column])) {
        solutions.push(chosen.map(mask => Array.from({ length: size }, (_, c) => Boolean(mask & (1 << c)))));
      }
      return;
    }
    for (const mask of rowCandidates[row]) {
      nodes += 1;
      const previous = [...columnValues];
      let valid = true;
      for (let column = 0; column < size; column += 1) {
        if (mask & (1 << column)) {
          columnValues[column] = mode === "addition"
            ? columnValues[column] + grid[row][column]
            : columnValues[column] * grid[row][column];
        }
        const target = columnTargets[column];
        const current = columnValues[column];
        if (current > target || (mode === "multiplication" && target % current !== 0)) {
          valid = false;
          break;
        }
        const needed = mode === "addition" ? target - current : target / current;
        if (!suffix[column][row + 1].has(needed)) {
          valid = false;
          break;
        }
      }
      if (valid) {
        chosen.push(mask);
        search(row + 1);
        chosen.pop();
      }
      previous.forEach((value, column) => { columnValues[column] = value; });
      if (solutions.length >= limit) return;
    }
  };
  search(0);
  const ended = globalThis.performance?.now?.() ?? Date.now();
  return {
    count: solutions.length,
    solutions,
    nodes,
    rowCandidateCounts: rowCandidates.map(candidates => candidates.length),
    durationMs: Math.round((ended - started) * 100) / 100
  };
}

function makeSolutionMask(size, density, random) {
  const solution = Array.from({ length: size }, () => Array(size).fill(false));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) solution[row][column] = random() < density;
  }
  for (let row = 0; row < size; row += 1) {
    if (!solution[row].some(Boolean)) solution[row][Math.floor(random() * size)] = true;
  }
  for (let column = 0; column < size; column += 1) {
    if (!solution.some(row => row[column])) solution[Math.floor(random() * size)][column] = true;
  }
  return solution;
}

export function generatePuzzle({ mode = "addition", difficulty = "easy", seed = Date.now().toString() } = {}) {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.easy;
  const normalizedMode = mode === "multiplication" ? "multiplication" : "addition";
  const fullSeed = `${GENERATOR_VERSION}:${normalizedMode}:${difficulty}:${seed}`;
  const random = seededRandom(fullSeed);
  const max = normalizedMode === "addition" ? config.maxAdd : config.maxMultiply;
  const productCap = difficulty === "expert" ? 10080 : difficulty === "hard" ? 7560 : 2520;

  for (let attempt = 1; attempt <= 500; attempt += 1) {
    const grid = Array.from({ length: config.size }, () =>
      Array.from({ length: config.size }, () => normalizedMode === "multiplication"
        ? 2 + Math.floor(random() * (max - 1))
        : 1 + Math.floor(random() * max))
    );
    const solution = makeSolutionMask(config.size, config.density, random);
    const targets = calculateTargets(grid, solution, normalizedMode);
    if (normalizedMode === "multiplication" && [...targets.rows, ...targets.columns].some(value => value > productCap)) continue;
    const puzzle = {
      id: `${fullSeed}:${attempt}`,
      version: GENERATOR_VERSION,
      seed: String(seed),
      mode: normalizedMode,
      difficulty,
      grid,
      rowTargets: targets.rows,
      columnTargets: targets.columns,
      solution
    };
    const validation = solvePuzzle(puzzle, 2);
    if (validation.count === 1) {
      const { durationMs: _durationMs, solutions: _solutions, ...stableValidation } = validation;
      return { ...puzzle, metadata: { ...stableValidation, attempts: attempt } };
    }
  }
  throw new Error("A unique puzzle could not be generated. Try another seed.");
}

export function isSolved(puzzle, crossed) {
  const values = calculatePlayerValues(puzzle.grid, crossed, puzzle.mode);
  return values.rows.every((value, index) => value === puzzle.rowTargets[index])
    && values.columns.every((value, index) => value === puzzle.columnTargets[index]);
}

export function solutionCrossedSet(puzzle) {
  const result = new Set();
  puzzle.solution.forEach((row, r) => row.forEach((active, c) => {
    if (!active) result.add(r * puzzle.grid.length + c);
  }));
  return result;
}

export function scoreGame({ difficulty, elapsedSeconds, hintsUsed, impossibleEvents, moves }) {
  const config = DIFFICULTIES[difficulty];
  const base = 1000 * config.multiplier;
  const careBonus = Math.max(0, 350 - impossibleEvents * 35);
  const hintBonus = Math.max(0, 300 - hintsUsed * 75);
  const timeBonus = Math.max(0, 450 - elapsedSeconds * 2);
  const efficiency = Math.max(0, 250 - Math.max(0, moves - config.size ** 2) * 8);
  return Math.round(base + careBonus + hintBonus + timeBonus + efficiency);
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finiteNonNegative = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export const REASONING_BANDS = Object.freeze([
  { minimum: 95, label: "Elite Reasoner", key: "elite" },
  { minimum: 85, label: "Master Reasoner", key: "master" },
  { minimum: 70, label: "Advanced Reasoner", key: "advanced" },
  { minimum: 55, label: "Skilled Thinker", key: "skilled" },
  { minimum: 40, label: "Rising Thinker", key: "rising" },
  { minimum: 0, label: "Developing Reasoner", key: "developing" }
]);

export function getReasoningBand(score) {
  const safeScore = clamp(Math.round(finiteNonNegative(score)), 0, 100);
  return REASONING_BANDS.find(band => safeScore >= band.minimum);
}

export function calculatePuzzleComplexity(puzzle) {
  const tiers = { beginner: 10, easy: 13, medium: 16, hard: 20, expert: 23 };
  const baseline = tiers[puzzle?.difficulty] ?? tiers.easy;
  const candidateCounts = Array.isArray(puzzle?.metadata?.rowCandidateCounts)
    ? puzzle.metadata.rowCandidateCounts.map(finiteNonNegative)
    : [];
  const averageCandidates = candidateCounts.length
    ? candidateCounts.reduce((total, count) => total + count, 0) / candidateCounts.length
    : 1;
  const ambiguityBonus = clamp((averageCandidates - 1) / 8, 0, 1) * 1.5;
  const searchBonus = clamp(Math.log2(finiteNonNegative(puzzle?.metadata?.nodes) + 1) / 10, 0, 1);
  const multiplicationBonus = puzzle?.mode === "multiplication" ? 0.5 : 0;
  return Math.round(clamp(baseline + ambiguityBonus + searchBonus + multiplicationBonus, 0, 25) * 100) / 100;
}

export function calculateReasoningIndex({
  puzzle,
  elapsedSeconds = 0,
  decisions = 0,
  corrections = 0,
  impossibleEvents = 0,
  hintLevels = [],
  reveals = 0
} = {}) {
  const safeDecisions = finiteNonNegative(decisions);
  const safeCorrections = finiteNonNegative(corrections);
  const safeImpossible = finiteNonNegative(impossibleEvents);
  const safeElapsed = finiteNonNegative(elapsedSeconds);
  const safeReveals = finiteNonNegative(reveals);
  const complexity = calculatePuzzleComplexity(puzzle || {});
  const expectedDecisions = Math.max(1, Array.isArray(puzzle?.solution)
    ? puzzle.solution.flat().filter(active => !active).length
    : 1);
  const excessDecisions = Math.max(0, safeDecisions + safeReveals - expectedDecisions);

  const accuracyPenalty = Math.min(18, safeImpossible * 2 + safeCorrections * 0.75 + excessDecisions * 0.2);
  const accuracy = clamp(25 - accuracyPenalty, 0, 25);

  const effectiveDecisions = Math.max(expectedDecisions, safeDecisions + safeReveals);
  const efficiency = clamp(20 * (expectedDecisions / effectiveDecisions), 0, 20);

  const hintCosts = [1.5, 2.5, 4, 6];
  const independencePenalty = Array.isArray(hintLevels)
    ? hintLevels.reduce((total, level) => total + (hintCosts[clamp(Math.floor(finiteNonNegative(level)), 0, 3)] || 0), 0)
    : 0;
  const independence = clamp(20 - independencePenalty, 0, 20);

  const size = clamp(finiteNonNegative(puzzle?.grid?.length) || 4, 3, 6);
  const tierPace = { beginner: 0.9, easy: 1, medium: 1.15, hard: 1.3, expert: 1.45 }[puzzle?.difficulty] || 1;
  const modePace = puzzle?.mode === "multiplication" ? 1.2 : 1;
  const complexityPace = 0.8 + (complexity / 25) * 0.4;
  const expectedSeconds = Math.max(30, size * size * 7.5 * tierPace * modePace * complexityPace);
  const paceRatio = safeElapsed / expectedSeconds;
  const pace = safeElapsed === 0
    ? 10
    : clamp(10 * (paceRatio <= 1 ? 1 : 1 - (paceRatio - 1) * 0.18), 4, 10);

  const raw = complexity + accuracy + efficiency + independence + pace;
  const score = clamp(Math.round(Number.isFinite(raw) ? raw : 0), 0, 100);
  const roundComponent = value => Math.round(value * 10) / 10;
  return {
    score,
    label: getReasoningBand(score).label,
    band: getReasoningBand(score).key,
    components: {
      complexity: roundComponent(complexity),
      accuracy: roundComponent(accuracy),
      efficiency: roundComponent(efficiency),
      independence: roundComponent(independence),
      pace: roundComponent(pace)
    },
    telemetry: {
      expectedDecisions,
      effectiveDecisions: roundComponent(effectiveDecisions),
      expectedSeconds: Math.round(expectedSeconds),
      hintPenalty: roundComponent(independencePenalty)
    }
  };
}

export function getReasoningRevealFrames(score, reducedMotion = false) {
  const finalScore = clamp(Math.round(finiteNonNegative(score)), 0, 100);
  if (reducedMotion) return [finalScore];
  return Array.from({ length: 8 }, (_, index) => Math.round(finalScore * index / 7));
}

export function migrateReasoningHistory(rawHistory) {
  const source = Array.isArray(rawHistory) ? rawHistory : Array.isArray(rawHistory?.records) ? rawHistory.records : [];
  return source.filter(record => {
    const score = Number(record?.score);
    return Number.isFinite(score) && score >= 0 && score <= 100;
  }).map(record => ({
    version: 2,
    score: Math.round(Number(record.score)),
    mode: record.mode === "multiplication" ? "multiplication" : "addition",
    difficulty: DIFFICULTIES[record.difficulty] ? record.difficulty : "easy",
    completedAt: typeof record.completedAt === "string" ? record.completedAt : new Date(0).toISOString(),
    components: record.components && typeof record.components === "object" ? record.components : undefined
  })).slice(-100);
}

export function summarizeReasoningHistory(rawHistory) {
  const records = migrateReasoningHistory(rawHistory);
  const scores = records.map(record => record.score);
  const bestFor = predicate => {
    const matches = records.filter(predicate).map(record => record.score);
    return matches.length ? Math.max(...matches) : null;
  };
  return {
    latest: scores.length ? scores[scores.length - 1] : null,
    best: scores.length ? Math.max(...scores) : null,
    average: scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null,
    bestAddition: bestFor(record => record.mode === "addition"),
    bestMultiplication: bestFor(record => record.mode === "multiplication"),
    bestByDifficulty: Object.fromEntries(Object.keys(DIFFICULTIES).map(difficulty => [difficulty, bestFor(record => record.difficulty === difficulty)])),
    completedPuzzles: records.length
  };
}
