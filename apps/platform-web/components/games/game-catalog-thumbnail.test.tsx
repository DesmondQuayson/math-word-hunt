import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GameCatalogThumbnail, resolveGameCatalogThumbnail } from "./game-catalog-thumbnail";

describe("game catalog thumbnails", () => {
  it("maps the three owner-supplied game artworks to same-origin optimized assets", () => {
    expect(resolveGameCatalogThumbnail("math-vocabulary-hunt", "builtin:math-vocabulary-hunt")).toEqual({
      webp: "/media/games/math-vocabulary-hunt.webp",
      avif: "/media/games/math-vocabulary-hunt.avif"
    });
    expect(resolveGameCatalogThumbnail("number-logic", "builtin:number-logic")).toEqual({
      webp: "/media/games/number-logic.webp",
      avif: "/media/games/number-logic.avif"
    });
    expect(resolveGameCatalogThumbnail("number-cross", "builtin:number-cross")).toEqual({
      webp: "/media/games/number-cross.webp",
      avif: "/media/games/number-cross.avif"
    });
  });

  it("preserves the approved CrossCalc V2 thumbnail and exposes useful alt text", () => {
    expect(resolveGameCatalogThumbnail("crosscalc", "builtin:crosscalc-v2")).toEqual({
      webp: "/media/games/crosscalc-v2-rc.webp"
    });
    render(<GameCatalogThumbnail stableKey="crosscalc" thumbnailReference="builtin:crosscalc-v2" title="CrossCalc" />);
    expect(screen.getByAltText("CrossCalc gameplay artwork").getAttribute("src")).toBe("/media/games/crosscalc-v2-rc.webp");
  });

  it("fails gracefully for future catalog games without a mapped asset", () => {
    render(<GameCatalogThumbnail stableKey="future-game" thumbnailReference="builtin:future-game" title="Future Game" />);
    expect(screen.getByRole("img", { name: "Future Game thumbnail" })).not.toBeNull();
  });
});
