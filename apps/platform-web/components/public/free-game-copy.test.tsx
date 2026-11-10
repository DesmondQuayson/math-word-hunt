import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isFreeToPlayGame } from "@/lib/games/access-policy";
import type { GameCatalogSummary, GameSummary } from "@/lib/seo/catalog-summaries";

const mocks = vi.hoisted(() => ({ games: vi.fn(), context: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/seo/catalog-summaries", () => ({ loadGameCatalogSummary: mocks.games }));
vi.mock("@/lib/auth/consumer-context", () => ({ resolveConsumerContext: mocks.context }));
vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.access }));
vi.mock("@/lib/billing/consumer-config", () => ({ tryGetConsumerBillingConfiguration: () => null }));
vi.mock("@/lib/billing/consumer-service", () => ({ createConsumerBillingRepository: vi.fn() }));
vi.mock("@/lib/billing/config", () => ({ tryGetBillingConfiguration: () => null }));
vi.mock("@/lib/capabilities/server", () => ({ getCapabilityAccessView: vi.fn() }));
vi.mock("@/app/billing-actions", () => ({ startCheckoutAction: vi.fn() }));
vi.mock("@/components/consumer/commercial-consent-form", () => ({ CommercialConsentForm: () => null }));

import AboutPage from "@/app/about/page";
import HelpPage from "@/app/help/page";
import PricingPage from "@/app/pricing/page";

import { FreeGameNames } from "./free-game-names";

/** A published game as the catalog summaries give it: `freeToPlay` from the real access policy. */
function game(stableKey: string, title: string): GameSummary {
  return { stableKey, thumbnailReference: `builtin:${stableKey}`, title, description: `${title}.`, grades: null, skills: [], freeToPlay: isFreeToPlayGame(stableKey) };
}

// Production's published catalog on 2026-11-10, in display order.
const PRODUCTION_GAMES = [
  game("math-vocabulary-hunt", "Math Vocabulary Hunt"),
  game("number-cross", "Number Cross"),
  game("number-logic", "Number Logic"),
  game("crosscalc", "CrossCalc"),
  game("math-tug-of-war", "Math Tug of War"),
  game("math-bingo-live", "Math Bingo Live"),
  game("polygon-showdown", "Polygon Showdown")
];
const SUBSCRIPTION_TITLES = ["Math Vocabulary Hunt", "Number Cross", "Number Logic", "CrossCalc"];
const catalog = (games: readonly GameSummary[]): GameCatalogSummary => ({ available: true, games });
const without = (key: string) => PRODUCTION_GAMES.filter((entry) => entry.stableKey !== key);
const UNAVAILABLE: GameCatalogSummary = { available: false, games: [] };

const FREE_LINKS = [
  ["Math Tug of War", "/math-games/math-tug-of-war"],
  ["Math Bingo Live", "/games/math-bingo-live/host"],
  ["Polygon Showdown", "/games/polygon-showdown/play"]
];

const original = process.env.MVH_APP_ENVIRONMENT;

beforeEach(() => {
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  mocks.games.mockResolvedValue(catalog(PRODUCTION_GAMES));
  mocks.context.mockResolvedValue({ status: "active", userId: "00000000-0000-4000-8000-000000000001" });
  mocks.access.mockResolvedValue({ source: "account", decision: { allowed: true, reason: "entitled", nextAction: "play" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
  else process.env.MVH_APP_ENVIRONMENT = original;
});

function links(container: HTMLElement): string[][] {
  return within(container).queryAllByRole("link").map((link) => [link.textContent ?? "", link.getAttribute("href") ?? ""]);
}

describe("FreeGameNames", () => {
  it("lists the names in words and links each to its public page or its free play route", () => {
    const { container } = render(<p><FreeGameNames games={PRODUCTION_GAMES.filter((entry) => entry.freeToPlay)} /></p>);
    expect(container.textContent).toBe("Math Tug of War, Math Bingo Live and Polygon Showdown");
    expect(links(container)).toEqual(FREE_LINKS);
  });

  it("names a game with neither a public page nor a free play route without a link", () => {
    const { container } = render(<p><FreeGameNames games={[game("math-tug-of-war", "Math Tug of War"), { ...game("fraction-frenzy", "Fraction Frenzy"), freeToPlay: true }]} /></p>);
    expect(container.textContent).toBe("Math Tug of War and Fraction Frenzy");
    expect(links(container)).toEqual([["Math Tug of War", "/math-games/math-tug-of-war"]]);
  });
});

describe("Help", () => {
  const freeSection = () => screen.queryByRole("region", { name: "Play a game for free" });

  it("names every free game the catalog publishes, with a link to each, and no subscription game", async () => {
    render(await HelpPage());
    const section = freeSection() as HTMLElement;
    expect(section.querySelector("p")?.textContent).toBe("Math Tug of War, Math Bingo Live and Polygon Showdown are free with any MathNexa account. You do not need a trial or subscription to play them.");
    expect(links(section)).toEqual(FREE_LINKS);
    for (const title of SUBSCRIPTION_TITLES) expect(section.textContent, title).not.toContain(title);
  });

  it("leaves out a free game that is not published (a draft)", async () => {
    mocks.games.mockResolvedValue(catalog(without("math-bingo-live")));
    render(await HelpPage());
    expect((freeSection() as HTMLElement).querySelector("p")?.textContent).toBe("Math Tug of War and Polygon Showdown are free with any MathNexa account. You do not need a trial or subscription to play them.");
  });

  it("says \"is\" and \"it\" for one free game", async () => {
    mocks.games.mockResolvedValue(catalog([PRODUCTION_GAMES[0], game("math-tug-of-war", "Math Tug of War")]));
    render(await HelpPage());
    expect((freeSection() as HTMLElement).querySelector("p")?.textContent).toBe("Math Tug of War is free with any MathNexa account. You do not need a trial or subscription to play it.");
  });

  it("drops the section when no published game is free, and keeps the rest of the page", async () => {
    mocks.games.mockResolvedValue(catalog(PRODUCTION_GAMES.filter((entry) => !entry.freeToPlay)));
    render(await HelpPage());
    expect(freeSection()).toBeNull();
    expect(screen.getByRole("region", { name: "Get access" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Use a school access code" })).toBeTruthy();
  });

  it("names Math Tug of War when the catalog cannot be read", async () => {
    mocks.games.mockResolvedValue(UNAVAILABLE);
    render(await HelpPage());
    const section = freeSection() as HTMLElement;
    expect(section.querySelector("p")?.textContent).toBe("Math Tug of War is free with any MathNexa account. You do not need a trial or subscription to play it.");
    expect(links(section)).toEqual([FREE_LINKS[0]]);
  });

  it("does not read the catalog outside the production platform", async () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    render(await HelpPage());
    expect(screen.getByRole("heading", { level: 1, name: "Start a Math Vocabulary Hunt" })).toBeTruthy();
    expect(mocks.games).not.toHaveBeenCalled();
  });
});

describe("About", () => {
  /** The "What one subscription includes" entry for Math Games: its title link, then its sentence. */
  const mathGamesEntry = () => screen.getByRole("link", { name: "Math Games" }).closest("li") as HTMLElement;

  it("names every free game the catalog publishes, with a link to each", async () => {
    render(await AboutPage());
    const entry = mathGamesEntry();
    expect(entry.querySelector("span")?.textContent).toBe("Math games for whole-class play and quick practice. Math Tug of War, Math Bingo Live and Polygon Showdown are free with any MathNexa account.");
    expect(links(entry)).toEqual([["Math Games", "/math-games"], ...FREE_LINKS]);
  });

  it("names no game when no published game is free, and Math Tug of War when the catalog cannot be read", async () => {
    mocks.games.mockResolvedValue(catalog(PRODUCTION_GAMES.filter((entry) => !entry.freeToPlay)));
    render(await AboutPage());
    expect(mathGamesEntry().querySelector("span")?.textContent).toBe("Math games for whole-class play and quick practice.");
    cleanup();

    mocks.games.mockResolvedValue(UNAVAILABLE);
    render(await AboutPage());
    expect(mathGamesEntry().querySelector("span")?.textContent).toBe("Math games for whole-class play and quick practice. Math Tug of War is free with any MathNexa account.");
  });

  it("does not read the catalog outside the production platform", async () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    render(await AboutPage());
    expect(screen.getByRole("heading", { level: 1, name: "Language practice for mathematical thinking" })).toBeTruthy();
    expect(mocks.games).not.toHaveBeenCalled();
  });
});

describe("Pricing (signed in)", () => {
  /** The production page returns an async server component; call it, as the server would, so it can be rendered here. */
  async function renderPricing() {
    const element = await PricingPage({ searchParams: Promise.resolve({}) }) as ReactElement<Record<string, unknown>>;
    const component = element.type as (props: Record<string, unknown>) => Promise<ReactElement>;
    return render(await component(element.props));
  }
  const lede = (container: HTMLElement) => container.querySelector("header.page-header p.lede")?.textContent;

  it("names every free game the catalog publishes", async () => {
    const { container } = await renderPricing();
    expect(lede(container)).toBe("One monthly subscription for every MathNexa resource. No annual plan. Math Tug of War, Math Bingo Live and Polygon Showdown are free with any MathNexa account.");
  });

  it("names Math Tug of War when the catalog cannot be read, and no game when none is free", async () => {
    mocks.games.mockResolvedValue(UNAVAILABLE);
    let rendered = await renderPricing();
    expect(lede(rendered.container)).toBe("One monthly subscription for every MathNexa resource. No annual plan. Math Tug of War is free with any MathNexa account.");
    cleanup();

    mocks.games.mockResolvedValue(catalog(PRODUCTION_GAMES.filter((entry) => !entry.freeToPlay)));
    rendered = await renderPricing();
    expect(lede(rendered.container)).toBe("One monthly subscription for every MathNexa resource. No annual plan.");
  });

  it("still sends a signed-out visitor to sign in first", async () => {
    mocks.context.mockResolvedValue({ status: "anonymous", userId: null });
    mocks.access.mockResolvedValue({ source: "none", decision: { allowed: false, reason: "anonymous", nextAction: "sign-in" } });
    await expect(renderPricing()).rejects.toMatchObject({ digest: expect.stringContaining("/access?next=/subscription") });
  });
});
