import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicGame } from "@/lib/games/catalog";
import type { PublicResource, PublicResourceLibraryData } from "@/lib/resources/catalog";

const mocks = vi.hoisted(() => ({ loadPublicGameCatalog: vi.fn(), loadPublicResourceLibrary: vi.fn() }));
vi.mock("@/lib/games/catalog", () => ({ loadPublicGameCatalog: mocks.loadPublicGameCatalog }));
vi.mock("@/lib/resources/catalog", () => ({ loadPublicResourceLibrary: mocks.loadPublicResourceLibrary }));

/** A fresh module per test: the summaries are cached at module level. */
async function summaries() {
  vi.resetModules();
  return import("./catalog-summaries");
}

const UUID = "0b7f3c1e-4d2a-4f6b-9c8d-1e2f3a4b5c6d";
const FILE_UUID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function game(overrides: Partial<PublicGame>): PublicGame {
  return {
    id: UUID,
    resourceId: UUID,
    packageId: null,
    stableKey: "number-cross",
    slug: "number-cross",
    title: "Number Cross",
    description: "Cross out numbers until every row and column reaches its target.",
    launch: { type: "internal", key: "number-cross" },
    thumbnailReference: "builtin:number-cross",
    recommendedGradeMin: 3,
    recommendedGradeMax: 9,
    skills: ["mental-math", "addition", "mental-math"],
    topics: ["arithmetic"],
    tags: ["puzzle"],
    difficulty: "medium",
    version: "1.0.0",
    ...overrides
  } as PublicGame;
}

const games = [
  game({}),
  game({
    id: "1b7f3c1e-4d2a-4f6b-9c8d-1e2f3a4b5c6d",
    stableKey: "math-tug-of-war",
    slug: "math-tug-of-war",
    title: "Math Tug of War",
    description: "Solve the math. Pull the rope. Beat the other side!",
    recommendedGradeMin: 1,
    recommendedGradeMax: 7,
    skills: ["absolute-value", "opposites"]
  }),
  game({
    id: "2b7f3c1e-4d2a-4f6b-9c8d-1e2f3a4b5c6d",
    stableKey: "partner-game",
    slug: "partner-game",
    title: "Partner Game",
    launch: { type: "external_https", url: "https://games.partner.example/play?token=abc", host: "games.partner.example" } as PublicGame["launch"],
    recommendedGradeMin: 6,
    recommendedGradeMax: 6,
    skills: []
  }),
  game({ id: "3b7f3c1e-4d2a-4f6b-9c8d-1e2f3a4b5c6d", stableKey: "no-grades", slug: "no-grades", title: "No Grades", recommendedGradeMin: null, recommendedGradeMax: 8 })
];

function resource(overrides: Partial<PublicResource>): PublicResource {
  return {
    id: UUID,
    title: "Topic quiz",
    description: "",
    resourceType: "quiz_pdf",
    gradeId: "grade-6",
    topicId: "topic-1",
    lessonId: null,
    grade: "Grade 6",
    topic: "Use Positive Rational Numbers",
    topicNumber: 1,
    lesson: null,
    difficulty: null,
    minutes: null,
    tags: [],
    previewFileIds: [FILE_UUID],
    downloadable: true,
    isAnswerKey: false,
    answerKeyIncluded: true,
    answerKeyResourceId: null,
    ...overrides
  };
}

const library: PublicResourceLibraryData = {
  taxonomy: {
    grades: [{ id: "grade-7", title: "Grade 7", sortOrder: 2 }, { id: "grade-6", title: "Grade 6", sortOrder: 1 }],
    topics: [],
    lessons: []
  },
  resources: [
    resource({ topicId: "topic-2", topic: "Ratios and Rates", topicNumber: 2 }),
    resource({}),
    resource({ id: "4b7f3c1e-4d2a-4f6b-9c8d-1e2f3a4b5c6d", topicId: "topic-1" }),
    resource({ gradeId: "grade-7", grade: "Grade 7", topicId: "topic-9", topic: "Proportional Relationships", answerKeyIncluded: false, answerKeyResourceId: FILE_UUID }),
    // Listed on their own, these would add topics that have no downloadable quiz.
    resource({ resourceType: "quiz_answer_key", isAnswerKey: true, topicId: "topic-8", topic: "Answer key only" }),
    resource({ downloadable: false, topicId: "topic-7", topic: "Not downloadable" })
  ]
};

beforeEach(() => {
  mocks.loadPublicGameCatalog.mockReset();
  mocks.loadPublicResourceLibrary.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("game summaries", () => {
  it("keeps catalog order and shows grades, skills in words, and the free game", async () => {
    const { summarizeGames } = await summaries();
    expect(summarizeGames(games).map(({ title, grades, skills, freeToPlay }) => ({ title, grades, skills, freeToPlay }))).toEqual([
      { title: "Number Cross", grades: "Grades 3–9", skills: ["mental math", "addition"], freeToPlay: false },
      { title: "Math Tug of War", grades: "Grades 1–7", skills: ["absolute value", "opposites"], freeToPlay: true },
      { title: "Partner Game", grades: "Grade 6", skills: [], freeToPlay: false },
      { title: "No Grades", grades: null, skills: ["mental math", "addition"], freeToPlay: false }
    ]);
  });

  it("carries no id, launch address or route", async () => {
    const { summarizeGames } = await summaries();
    const text = JSON.stringify(summarizeGames(games));
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(text).not.toContain("http");
    expect(text).not.toContain("token");
    expect(text).not.toContain("/games/");
  });
});

describe("PDF library summaries", () => {
  it("lists each grade's topics in catalog order, without answer-key-only or undownloadable entries", async () => {
    const { summarizePdfLibrary } = await summaries();
    expect(summarizePdfLibrary(library)).toEqual({
      grades: [
        { grade: "Grade 6", topics: ["Use Positive Rational Numbers", "Ratios and Rates"] },
        { grade: "Grade 7", topics: ["Proportional Relationships"] }
      ],
      everyItemHasAnswerKey: true
    });
  });

  it("claims answer keys only when every listed PDF has one", async () => {
    const { summarizePdfLibrary } = await summaries();
    const missing = { ...library, resources: [...library.resources, resource({ topicId: "topic-3", topic: "Integers", topicNumber: 3, answerKeyIncluded: false })] };
    expect(summarizePdfLibrary(missing).everyItemHasAnswerKey).toBe(false);
    expect(summarizePdfLibrary({ ...library, resources: [] })).toEqual({ grades: [], everyItemHasAnswerKey: false });
  });

  it("carries no resource or file id", async () => {
    const { summarizePdfLibrary } = await summaries();
    const text = JSON.stringify(summarizePdfLibrary(library));
    expect(text).not.toContain(UUID);
    expect(text).not.toContain(FILE_UUID);
    expect(text).not.toMatch(/resources\/|download|preview/i);
  });
});

describe("live catalog reads", () => {
  it("reads the game catalog without the reconcile write, and holds a good read for five minutes", async () => {
    mocks.loadPublicGameCatalog.mockResolvedValue({ state: "ready", games });
    const { loadGameCatalogSummary } = await summaries();
    const first = await loadGameCatalogSummary();
    expect(first.available).toBe(true);
    expect(first.games.map((entry) => entry.title)).toEqual(["Number Cross", "Math Tug of War", "Partner Game", "No Grades"]);
    await loadGameCatalogSummary();
    expect(mocks.loadPublicGameCatalog).toHaveBeenCalledTimes(1);
    expect(mocks.loadPublicGameCatalog).toHaveBeenCalledWith(false);
  });

  it("still lists games when only the canonical entry is missing", async () => {
    mocks.loadPublicGameCatalog.mockResolvedValue({ state: "canonical-entry-missing", games: games.slice(1, 2) });
    const { loadGameCatalogSummary } = await summaries();
    expect((await loadGameCatalogSummary()).games.map((entry) => entry.title)).toEqual(["Math Tug of War"]);
  });

  it("reports an unreadable catalog as unavailable and retries on the next visit", async () => {
    mocks.loadPublicGameCatalog.mockResolvedValueOnce({ state: "unavailable", games: [] }).mockRejectedValueOnce(new Error("boom"));
    const { loadGameCatalogSummary } = await summaries();
    expect(await loadGameCatalogSummary()).toEqual({ available: false, games: [] });
    expect(await loadGameCatalogSummary()).toEqual({ available: false, games: [] });
    expect(mocks.loadPublicGameCatalog).toHaveBeenCalledTimes(2);
  });

  it("gives up on a slow catalog after four seconds", async () => {
    vi.useFakeTimers();
    mocks.loadPublicGameCatalog.mockReturnValue(new Promise(() => {}));
    mocks.loadPublicResourceLibrary.mockReturnValue(new Promise(() => {}));
    const { loadGameCatalogSummary, loadPdfLibrarySummary } = await summaries();
    const pending = Promise.all([loadGameCatalogSummary(), loadPdfLibrarySummary("quizzes")]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toEqual([
      { available: false, games: [] },
      { available: false, grades: [], everyItemHasAnswerKey: false }
    ]);
  });

  it("reads each PDF library separately, and never holds an empty read", async () => {
    mocks.loadPublicResourceLibrary.mockImplementation(async (kind: string) => kind === "quizzes" ? library : { taxonomy: library.taxonomy, resources: [] });
    const { loadPdfLibrarySummary } = await summaries();
    const quizzes = await loadPdfLibrarySummary("quizzes");
    expect(quizzes.available).toBe(true);
    expect(quizzes.grades.map((grade) => grade.grade)).toEqual(["Grade 6", "Grade 7"]);
    expect(await loadPdfLibrarySummary("homework")).toEqual({ available: false, grades: [], everyItemHasAnswerKey: false });
    await loadPdfLibrarySummary("quizzes");
    await loadPdfLibrarySummary("homework");
    expect(mocks.loadPublicResourceLibrary.mock.calls.map(([kind]) => kind)).toEqual(["quizzes", "homework", "homework"]);
  });
});
