import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CATEGORY_IDS,
  DIFFICULTY_IDS,
  DIVIDE,
  MAX_SAME_SIDE_RUN,
  MINUS,
  SUPERSCRIPTS,
  TIMES,
  conversionQuestion,
  conversionText,
  createQuestionStream,
  decimal,
  decimalsEqual,
  drawQuestion,
  formatDecimal,
  formatPercent,
  isCorrectChoice,
  normalizeSettings,
  parseConversion,
  parseDecimal,
  publicQuestion,
  questionAt,
  shiftDecimal,
  validateQuestion,
  type RaceCategoryId,
  type RaceDifficultyId,
  type RaceQuestion
} from "@/public/internal-games/math-race-champions/src/engine/questions.js";
import { createRandom } from "@/public/internal-games/math-race-champions/src/engine/random.js";

const PER_CELL = 10_000;
const STREAMS = 20;

type Audit = { generated: number; problems: Map<string, number>; left: number; keys: Set<string>; questions: RaceQuestion[] };

function auditCell(category: RaceCategoryId, difficulty: RaceDifficultyId): Audit {
  const record: Audit = { generated: 0, problems: new Map(), left: 0, keys: new Set(), questions: [] };
  const note = (problem: string) => record.problems.set(problem, (record.problems.get(problem) ?? 0) + 1);
  for (let seed = 0; seed < STREAMS; seed += 1) {
    const stream = createQuestionStream({ categories: [category], difficulty }, `audit-${category}-${difficulty}-${seed}`);
    let previous: string | null = null;
    let run = 0;
    let lastSide = -1;
    for (let index = 0; index < PER_CELL / STREAMS; index += 1) {
      const question = stream.next();
      record.generated += 1;
      for (const problem of validateQuestion(question)) note(problem);
      if (question.key === previous) note("immediate-repeat");
      previous = question.key;
      run = question.correctIndex === lastSide ? run + 1 : 1;
      lastSide = question.correctIndex;
      if (run > MAX_SAME_SIDE_RUN) note("side-run-too-long");
      if (question.correctIndex === 0) record.left += 1;
      record.keys.add(question.key);
      if (record.questions.length < 400) record.questions.push(question);
    }
  }
  return record;
}

const audits = new Map<string, Audit>();
for (const category of CATEGORY_IDS) {
  for (const difficulty of DIFFICULTY_IDS) audits.set(`${category}/${difficulty}`, auditCell(category, difficulty));
}
const cells = CATEGORY_IDS.flatMap(category => DIFFICULTY_IDS.map(difficulty => [category, difficulty] as const));

describe("Math Race Champions categories", () => {
  it("offers exactly the seven categories, in order, and no Decimal to Fraction", () => {
    expect(CATEGORIES.map(category => category.title)).toEqual([
      "Missing Addend",
      "Missing Subtrahend",
      "Missing Multiplier",
      "Missing Divisor",
      "Percentage to Decimal",
      "Decimal to Percentage",
      "Evaluating Powers"
    ]);
    expect(CATEGORIES.some(category => /fraction/i.test(category.title + category.id))).toBe(false);
  });

  it("offers five difficulties", () => {
    expect(DIFFICULTY_IDS).toEqual(["beginner", "easy", "medium", "hard", "expert"]);
  });

  it("shows the owner's example shapes", () => {
    expect(CATEGORIES.map(category => category.example)).toEqual([
      "14 + ? = 23",
      `25 ${MINUS} ? = 17`,
      `7 ${TIMES} ? = 42`,
      `48 ${DIVIDE} ? = 8`,
      "Convert 35% to a decimal.",
      "Convert 0.72 to a percent.",
      `6${SUPERSCRIPTS[2]} = ?`
    ]);
  });
});

describe("question audit (10,000 per category per difficulty)", () => {
  it.each(cells)("%s / %s: two choices, exactly one correct, nothing ambiguous or malformed", (category, difficulty) => {
    const record = audits.get(`${category}/${difficulty}`)!;
    expect(record.generated).toBe(PER_CELL);
    expect(Object.fromEntries(record.problems)).toEqual({});
  });

  it.each(cells)("%s / %s: the correct answer sits on each side about half the time", (category, difficulty) => {
    const share = audits.get(`${category}/${difficulty}`)!.left / PER_CELL;
    expect(share).toBeGreaterThan(0.46);
    expect(share).toBeLessThan(0.54);
  });

  it.each(cells)("%s / %s: generated, not a small repeating bank", (category, difficulty) => {
    const distinct = audits.get(`${category}/${difficulty}`)!.keys.size;
    // The two beginner conversions have 11 friendly percentages by design.
    // Easy powers are bases 1 to 10 with exponents 0 to 2: 30 questions in all.
    const floor = difficulty === "beginner" ? 9 : category === "powers" && difficulty === "easy" ? 30 : 40;
    expect(distinct).toBeGreaterThanOrEqual(floor);
  });
});

describe("powers", () => {
  const all = DIFFICULTY_IDS.flatMap(difficulty => audits.get(`powers/${difficulty}`)!.questions);

  it("uses exponents 0 to 3 only, and all four of them", () => {
    const exponents = new Set(all.map(question => question.operands[1]));
    expect([...exponents].sort()).toEqual([0, 1, 2, 3]);
  });

  it("never uses base 0, so 0 to the power 0 is never asked", () => {
    expect(all.every(question => (question.operands[0] as number) >= 1)).toBe(true);
  });

  it("anything to the power 0 is 1, to the power 1 is itself", () => {
    for (const question of all) {
      const [base, exponent] = question.operands as number[];
      if (exponent === 0) expect(question.answer).toBe("1");
      if (exponent === 1) expect(question.answer).toBe(String(base));
      if (exponent === 2) expect(question.answer).toBe(String(base * base));
      if (exponent === 3) expect(question.answer).toBe(String(base * base * base));
    }
  });

  it("writes the exponent as a superscript", () => {
    const random = createRandom("superscript");
    for (let index = 0; index < 200; index += 1) {
      expect(drawQuestion("powers", "medium", random).text).toMatch(/^\d+[⁰¹²³] = \?$/);
    }
  });
});

describe("conversions use exact decimals", () => {
  it("formats without floating-point noise", () => {
    expect(formatDecimal(shiftDecimal(decimal(35), -2))).toBe("0.35");
    expect(formatDecimal(shiftDecimal(decimal(7), -2))).toBe("0.07");
    expect(formatDecimal(shiftDecimal(decimal(125, 1), -2))).toBe("0.125");
    expect(formatDecimal(shiftDecimal(decimal(150), -2))).toBe("1.5");
    expect(formatDecimal(shiftDecimal(decimal(29), -2))).toBe("0.29"); // 29 / 100 is 0.29000000000000004 in floating point
    expect(formatPercent(shiftDecimal(decimal(72, 2), 2))).toBe("72%");
    expect(formatPercent(shiftDecimal(decimal(5, 3), 2))).toBe("0.5%");
    expect(formatDecimal(decimal(350, 2))).toBe("3.5");
  });

  it("round-trips every percentage it can ask", () => {
    for (const difficulty of DIFFICULTY_IDS) {
      for (const question of audits.get(`percent-to-decimal/${difficulty}`)!.questions) {
        const percent = parseDecimal(question.operands[0] as string)!;
        const answer = parseDecimal(question.answer)!;
        expect(decimalsEqual(shiftDecimal(answer, 2), percent)).toBe(true);
      }
      for (const question of audits.get(`decimal-to-percent/${difficulty}`)!.questions) {
        const shown = parseDecimal(question.operands[1] as string)!;
        const answer = parseDecimal(question.answer)!;
        expect(question.answer.endsWith("%")).toBe(true);
        expect(decimalsEqual(shiftDecimal(shown, 2), answer)).toBe(true);
      }
    }
  });

  it("treats 0.5 and 0.50 as the same number", () => {
    expect(decimalsEqual(parseDecimal("0.5")!, parseDecimal("0.50")!)).toBe(true);
    expect(decimalsEqual(parseDecimal("50%")!, parseDecimal("5%")!)).toBe(false);
  });
});

describe("conversion wording (owner, 2026-11-12)", () => {
  // One percentage, asked both ways, with the distractor drawn many times over.
  function ask(category: RaceCategoryId, difficulty: RaceDifficultyId, percent: string) {
    const questions = Array.from({ length: 60 }, (_, seed) => conversionQuestion(category, difficulty, parseDecimal(percent)!, createRandom(`wording-${percent}-${seed}`)));
    for (const question of questions) expect(validateQuestion(question)).toEqual([]);
    return { text: questions[0].text, answers: new Set(questions.map(question => question.answer)), wrong: new Set(questions.map(question => question.choices[question.correctIndex === 0 ? 1 : 0])), questions };
  }

  it.each([
    ["0.58", "58%", "58%", ["5.8%", "580%"]],
    ["0.4", "40%", "40%", ["4%", "400%"]],
    ["0.07", "7%", "7%", ["0.7%", "70%"]],
    ["1.2", "120%", "120%", ["12%", "1200%"]]
  ])("Convert %s to a percent. is answered %s", (shown, percent, answer, distractors) => {
    const asked = ask("decimal-to-percent", "easy", percent);
    expect(asked.text).toBe(`Convert ${shown} to a percent.`);
    expect([...asked.answers]).toEqual([answer]);
    expect([...asked.wrong].sort()).toEqual([...distractors].sort());
  });

  it.each([
    ["28%", "0.28", ["0.028", "2.8"]],
    ["65%", "0.65", ["0.065", "6.5"]],
    ["5%", "0.05", ["0.005", "0.5"]],
    ["125%", "1.25", ["0.125", "12.5"]]
  ])("Convert %s to a decimal. is answered %s", (percent, answer, distractors) => {
    const asked = ask("percent-to-decimal", "easy", percent);
    expect(asked.text).toBe(`Convert ${percent} to a decimal.`);
    expect([...asked.answers]).toEqual([answer]);
    expect([...asked.wrong].sort()).toEqual([...distractors].sort());
  });

  it("the owner's own distractors are among the ones offered", () => {
    expect(ask("decimal-to-percent", "easy", "58%").wrong.has("5.8%")).toBe(true);
    expect(ask("decimal-to-percent", "easy", "40%").wrong.has("4%")).toBe(true);
    expect(ask("percent-to-decimal", "easy", "28%").wrong.has("2.8")).toBe(true);
    expect(ask("percent-to-decimal", "easy", "65%").wrong.has("6.5")).toBe(true);
  });

  it("every generated conversion uses one of the two fixed sentences and nothing else", () => {
    for (const difficulty of DIFFICULTY_IDS) {
      for (const question of audits.get(`percent-to-decimal/${difficulty}`)!.questions) {
        expect(question.text).toMatch(/^Convert \d+(\.\d+)?% to a decimal\.$/);
        expect(question.text).toBe(conversionText("percent-to-decimal", question.operands[0] as string, question.operands[1] as string));
        expect(question.choices.every(choice => /^\d+(\.\d+)?$/.test(choice))).toBe(true);
        expect(question.spoken).toMatch(/^Convert .+ percent to a decimal: .+ or .+\?$/);
      }
      for (const question of audits.get(`decimal-to-percent/${difficulty}`)!.questions) {
        expect(question.text).toMatch(/^Convert \d+(\.\d+)? to a percent\.$/);
        expect(question.text).toBe(conversionText("decimal-to-percent", question.operands[0] as string, question.operands[1] as string));
        expect(question.choices.every(choice => /^\d+(\.\d+)?%$/.test(choice))).toBe(true);
      }
    }
  });

  it("no conversion is ever shown as a bare equation", () => {
    for (const category of ["percent-to-decimal", "decimal-to-percent"] as const) {
      for (const difficulty of DIFFICULTY_IDS) {
        expect(audits.get(`${category}/${difficulty}`)!.questions.some(question => question.text.includes("="))).toBe(false);
      }
    }
  });

  it("values above 1 and below 0.1 are asked at the difficulties that reach them", () => {
    const above = audits.get("decimal-to-percent/medium")!.questions.filter(question => Number((question.operands[1] as string)) > 1);
    expect(above.length).toBeGreaterThan(20);
    for (const question of above) expect(Number(question.answer.replace("%", ""))).toBeGreaterThan(100);
    const small = audits.get("percent-to-decimal/easy")!.questions.filter(question => /^Convert \d% /.test(question.text));
    expect(small.length).toBeGreaterThan(5);
    for (const question of small) expect(question.answer).toMatch(/^0\.0\d$/);
  });

  it("reads the sentence back, and refuses anything else", () => {
    expect(parseConversion("Convert 0.58 to a percent.")).toEqual({ value: parseDecimal("0.58"), fromPercent: false });
    expect(parseConversion("Convert 28% to a decimal.")).toEqual({ value: parseDecimal("28"), fromPercent: true });
    expect(parseConversion("Convert 28% to a percent.")).toBeNull();
    expect(parseConversion("Convert 0.28 to a decimal.")).toBeNull();
    expect(parseConversion("28% = ?")).toBeNull();
    expect(parseConversion("14 + ? = 23")).toBeNull();
  });

  it("rejects the old bare wording and a mismatched direction", () => {
    const base = { difficulty: "easy", key: "k", spoken: "s", operands: [] } as const;
    expect(validateQuestion({ ...base, category: "percent-to-decimal", text: "28% = ?", choices: ["0.28", "2.8"], correctIndex: 0, answer: "0.28" })).toEqual(expect.arrayContaining(["wrong-shape"]));
    expect(validateQuestion({ ...base, category: "decimal-to-percent", text: "0.58 = ?", choices: ["58%", "5.8%"], correctIndex: 0, answer: "58%" })).toEqual(expect.arrayContaining(["wrong-shape"]));
    expect(validateQuestion({ ...base, category: "decimal-to-percent", text: "Convert 0.58 to a percent.", choices: ["58%", "5.8%"], correctIndex: 0, answer: "58%" })).toEqual([]);
    expect(validateQuestion({ ...base, category: "decimal-to-percent", text: "Convert 0.58 to a percent.", choices: ["58%", "58.0%"], correctIndex: 0, answer: "58%" })).toEqual(
      expect.arrayContaining(["distractor-also-correct", "equivalent-choices"])
    );
  });

  it("only the two conversion categories changed wording; the other five still show an equation", () => {
    for (const category of CATEGORY_IDS) {
      const sample = audits.get(`${category}/medium`)!.questions;
      const conversion = category === "percent-to-decimal" || category === "decimal-to-percent";
      expect(sample.every(question => question.text.startsWith("Convert ") === conversion)).toBe(true);
      expect(sample.every(question => question.text.includes("?") !== conversion)).toBe(true);
    }
  });
});

describe("the validator catches bad questions", () => {
  const good = questionAt({ categories: ["missing-divisor"], difficulty: "easy" }, "validator", 0);

  it("accepts a generated question", () => {
    expect(validateQuestion(good)).toEqual([]);
  });

  it("rejects two correct choices, equivalent choices, a wrong key and a third choice", () => {
    const base = { category: "percent-to-decimal", difficulty: "easy", key: "k", spoken: "s", operands: [] } as const;
    expect(validateQuestion({ ...base, text: "Convert 50% to a decimal.", choices: ["0.5", "0.50"], correctIndex: 0, answer: "0.5" })).toEqual(
      expect.arrayContaining(["distractor-also-correct", "equivalent-choices", "trailing-zero"])
    );
    expect(validateQuestion({ ...base, text: "Convert 50% to a decimal.", choices: ["5", "0.5"], correctIndex: 0, answer: "5" })).toEqual(
      expect.arrayContaining(["wrong-answer-marked-correct"])
    );
    expect(
      validateQuestion({ ...base, text: "Convert 50% to a decimal.", choices: ["0.5", "5", "50"] as unknown as [string, string], correctIndex: 0, answer: "0.5" })
    ).toEqual(["choice-count"]);
    expect(
      validateQuestion({ ...base, category: "missing-divisor", text: `0 ${DIVIDE} ? = 0`, choices: ["0", "3"], correctIndex: 1, answer: "3" })
    ).toEqual(expect.arrayContaining(["zero-divisor"]));
  });
});

describe("settings and streams", () => {
  it("accepts one category, several, or mixed", () => {
    expect(normalizeSettings({ categories: ["powers"] }).categories).toEqual(["powers"]);
    expect(normalizeSettings({ categories: ["powers", "missing-addend", "powers"] }).categories).toEqual(["missing-addend", "powers"]);
    expect(normalizeSettings({ categories: "mixed", difficulty: "hard" })).toEqual({ categories: CATEGORY_IDS, difficulty: "hard" });
    expect(normalizeSettings().categories).toHaveLength(7);
  });

  it("refuses unknown or empty settings", () => {
    expect(() => normalizeSettings({ categories: [] })).toThrow(RangeError);
    expect(() => normalizeSettings({ categories: ["decimal-to-fraction"] })).toThrow(RangeError);
    expect(() => normalizeSettings({ difficulty: "impossible" })).toThrow(RangeError);
  });

  it("is reproducible from the seed", () => {
    const a = createQuestionStream({ categories: "mixed", difficulty: "medium" }, "same");
    const b = createQuestionStream({ categories: "mixed", difficulty: "medium" }, "same");
    for (let index = 0; index < 300; index += 1) expect(a.next()).toEqual(b.next());
  });

  it("questionAt replays the stream exactly (what the server relies on)", () => {
    const settings = { categories: ["missing-addend", "powers", "decimal-to-percent"], difficulty: "hard" } as const;
    const stream = createQuestionStream(settings, "replay", { orderSeed: "room" });
    for (let index = 0; index < 60; index += 1) {
      expect(questionAt(settings, "replay", index, { orderSeed: "room" })).toEqual(stream.next());
    }
  });

  it("gives opponents the same category at every position, with different numbers", () => {
    const settings = { categories: "mixed", difficulty: "medium" } as const;
    const turquoise = createQuestionStream(settings, "room:turquoise", { orderSeed: "room" });
    const pink = createQuestionStream(settings, "room:pink", { orderSeed: "room" });
    let sameQuestion = 0;
    for (let index = 0; index < 700; index += 1) {
      const left = turquoise.next();
      const right = pink.next();
      expect(left.category).toBe(right.category);
      if (left.key === right.key) sameQuestion += 1;
    }
    expect(sameQuestion).toBeLessThan(35);
  });

  it("uses every selected category equally often in mixed play", () => {
    const stream = createQuestionStream({ categories: "mixed", difficulty: "easy" }, "balance");
    const counts = new Map<string, number>();
    let previous = "";
    for (let index = 0; index < 700; index += 1) {
      const question = stream.next();
      counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
      expect(question.category).not.toBe(previous);
      previous = question.category;
    }
    expect([...counts.values()]).toEqual(Array(7).fill(100));
  });

  it("never sends the answer in a public question", () => {
    const question = questionAt({ categories: "mixed", difficulty: "easy" }, "public", 3);
    const shown = publicQuestion(question);
    expect(Object.keys(shown).sort()).toEqual(["category", "choices", "index", "spoken", "text"]);
    expect(JSON.stringify(shown)).not.toContain("correctIndex");
  });

  it("marks only the correct side as correct", () => {
    const question = questionAt({ categories: "mixed", difficulty: "easy" }, "check", 0);
    expect(isCorrectChoice(question, question.correctIndex)).toBe(true);
    expect(isCorrectChoice(question, question.correctIndex === 0 ? 1 : 0)).toBe(false);
    expect(isCorrectChoice(question, 2)).toBe(false);
    expect(isCorrectChoice(question, Number.NaN)).toBe(false);
  });
});

describe("difficulty grows the numbers, not the error rate", () => {
  const largest = (category: RaceCategoryId, difficulty: RaceDifficultyId) =>
    Math.max(...audits.get(`${category}/${difficulty}`)!.questions.map(question => Number(parseDecimal(question.answer)!.m)));

  it.each(["missing-addend", "missing-subtrahend", "missing-multiplier", "missing-divisor"] as const)("%s answers get larger", category => {
    const sizes = DIFFICULTY_IDS.map(difficulty => largest(category, difficulty));
    for (let index = 1; index < sizes.length; index += 1) expect(sizes[index]).toBeGreaterThan(sizes[index - 1]!);
  });

  it("subtraction never goes below 1 and division never divides by 0", () => {
    for (const difficulty of DIFFICULTY_IDS) {
      for (const question of audits.get(`missing-subtrahend/${difficulty}`)!.questions) {
        const [first, missing, result] = question.operands as number[];
        expect(first! - missing!).toBe(result);
        expect(result).toBeGreaterThanOrEqual(1);
      }
      for (const question of audits.get(`missing-divisor/${difficulty}`)!.questions) {
        const [dividend, divisor, quotient] = question.operands as number[];
        expect(divisor).toBeGreaterThanOrEqual(2);
        expect(dividend! / divisor!).toBe(quotient);
        expect(question.choices.every(choice => Number(choice) >= 1)).toBe(true);
      }
    }
  });
});
