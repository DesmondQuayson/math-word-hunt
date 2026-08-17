export const GAME_SUITE_THUMBNAIL_CONTENT = Object.freeze({
  policy: Object.freeze({
    mathematics: Object.freeze([
      "Every visible completed equation is true.",
      "Operators are rendered with their real mathematical meaning.",
      "Partial notation is allowed only when it is emitted by the authentic game UI.",
      "The depicted state must remain feasible under the production game engine."
    ]),
    vocabulary: Object.freeze([
      "Every visible term is present in the canonical vocabulary.",
      "Every readable clue or definition matches the canonical vocabulary.",
      "Spelling and gameplay structure match the current product."
    ])
  }),
  mathVocabularyHunt: Object.freeze({
    representation: "connected word-grid gameplay",
    visibleTerms: Object.freeze(["Fraction", "Integer", "Ratio", "Area", "Equation"]),
    canonicalDefinitions: Object.freeze({
      Fraction: "A number showing part of a whole, written as one number over another.",
      Integer: "A whole number, its opposite, or zero — never a fraction.",
      Ratio: "A comparison of two quantities using division.",
      Area: "The amount of surface inside a flat shape.",
      Equation: "A math sentence stating two expressions are equal."
    }),
    readableClues: Object.freeze([]),
    sourceKind: "owner artwork validated against canonical v7 vocabulary",
    assets: Object.freeze({
      webp: Object.freeze({ bytes: 104_550, sha256: "2b731f5f46a7cbe72b10fb9f54345957ea6c90ca3cfdf9640ed9e2b33e3a3991" }),
      avif: Object.freeze({ bytes: 50_653, sha256: "8aed591e1643875ac15e02911473e3854e39077961d0c7dd66b8cd6ad4141021" })
    })
  }),
  numberLogic: Object.freeze({
    sourceKind: "deterministic production UI capture",
    route: "/games/number-logic/play",
    mode: "Lines of 3",
    difficulty: "BEGINNER",
    fixedEpochMs: 1_786_899_600_000,
    seed: "play-BEGINNER-msw1vvk0-1",
    puzzleId: "lines-of-3.beginner.8798so",
    generatorVersion: "lines-of-3-generator/1.0.0",
    target: 21,
    inventory: Object.freeze([4, 5, 6, 7, 8, 9, 10]),
    fixedPlacements: Object.freeze({ ML: 5, MC: 6, BL: 9 }),
    solverBackedMoves: Object.freeze([
      Object.freeze({ value: 7, position: "T", message: "Place 7 at T." }),
      Object.freeze({ value: 10, position: "MR", message: "Place 10 at MR." })
    ]),
    uniqueSolution: Object.freeze({ T: 7, ML: 5, MC: 6, MR: 10, BL: 9, BC: 8, BR: 4 }),
    visibleRoutes: Object.freeze([
      Object.freeze({ name: "Left line", expression: "7 + 5 + 9 = 21", state: "SATISFIED" }),
      Object.freeze({ name: "Center line", expression: "7 + 6 + ?", state: "FEASIBLE" }),
      Object.freeze({ name: "Right line", expression: "7 + 10 + ?", state: "FEASIBLE" }),
      Object.freeze({ name: "Middle row", expression: "5 + 6 + 10 = 21", state: "SATISFIED" }),
      Object.freeze({ name: "Bottom row", expression: "9 + ? + ?", state: "FEASIBLE" })
    ]),
    feasibility: "PROVEN_POSSIBLE",
    assets: Object.freeze({
      webp: Object.freeze({ bytes: 29_582, sha256: "740f5321b17afea9d2240f032d83f9f85b56b3e0dcd21d29fb0184640335995e" }),
      avif: Object.freeze({ bytes: 18_208, sha256: "2c1285d2703de0cbb013dc59e14aa4a9afbc0ae3d746226baef776759c8f7d74" })
    })
  }),
  numberCross: Object.freeze({
    sourceKind: "deterministic production UI capture",
    route: "/games/number-cross/play",
    mode: "addition",
    difficulty: "easy",
    fixedEpochMs: 1_786_899_600_000,
    fixedRandom: 0.3141592653589793,
    seed: "1786899600000-0.3141592653589793",
    puzzleId: "1:addition:easy:1786899600000-0.3141592653589793:1",
    grid: Object.freeze([
      Object.freeze([3, 1, 8, 3]),
      Object.freeze([2, 7, 6, 3]),
      Object.freeze([8, 6, 4, 5]),
      Object.freeze([6, 2, 1, 7])
    ]),
    rowTargets: Object.freeze([11, 16, 10, 16]),
    columnTargets: Object.freeze([6, 15, 19, 13]),
    solution: Object.freeze([
      Object.freeze([false, false, true, true]),
      Object.freeze([false, true, true, true]),
      Object.freeze([false, true, true, false]),
      Object.freeze([true, true, true, true])
    ]),
    captureCrossedIndices: Object.freeze([0, 1, 4]),
    capturePlayerRows: Object.freeze([11, 16, 23, 16]),
    capturePlayerColumns: Object.freeze([14, 15, 19, 18]),
    captureCorrectLineCount: 5,
    uniqueSolutionCount: 1,
    assets: Object.freeze({
      webp: Object.freeze({ bytes: 28_066, sha256: "90dc23fc0d10efe209f67c8c56cd704bfb1b7c557ac8255c33104134a440b489" }),
      avif: Object.freeze({ bytes: 18_194, sha256: "54674951a8f3b738597e45feeda71a6b7b98454d83c5cb330bb4171e4d971067" })
    })
  }),
  crossCalc: Object.freeze({
    sourceKind: "approved real-game capture",
    webp: Object.freeze({
      bytes: 82_090,
      sha256: "6b55119f38b1445941c5470ddad34f17276f06ab72502b01ae666bdf1558377d"
    })
  })
});
