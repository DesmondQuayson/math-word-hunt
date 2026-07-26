# Puzzle Format

Puzzles live in `src/puzzles/library.ts` and implement:

```ts
type Puzzle = {
  id: string;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  nodes: PuzzleNode[];
  edges: PuzzleEdge[];
  validStartNodeIds: string[];
  recommendedTimeSeconds: number;
  hintPath?: string[];
  modeCompatibility:
    "hiddenStartChallenge" | "freeStart" | "guidedStart" | "both";
  complexity: {
    edgeCount: number;
    branchDecisions: number;
    revisitedNodes: number;
    routeLength: number;
    geometricComplexity: number;
  };
};
```

Coordinates are normalized between `0` and `1`. An edge contains its endpoint geometry and may contain intermediate bend or sampled-curve points.

`validatePuzzle` checks unique edge IDs, endpoint references, bounds, connectivity, Euler parity, mathematically valid start nodes, and mode compatibility. Hidden Start Challenge requires an Euler trail with exactly two odd nodes. `validatePuzzleLibrary` additionally checks duplicate topology, duplicate translation/scale/rotation/mirror-invariant geometry, and undeclared geometric intersections.

Run `npm test` after adding or editing puzzle data.
