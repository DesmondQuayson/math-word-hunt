import { describe, expect, it } from "vitest";

import { applyKey, displayBuffer, parseAnswer } from "@/public/internal-games/math-tug-of-war/src/answer.js";
import {
  MINUS,
  SKILL_IDS,
  SKILLS,
  createQuestionStream,
  formatInteger,
  questionAt,
  validateQuestion,
  type TugSkillId
} from "@/public/internal-games/math-tug-of-war/src/questions.js";
import { createRandom } from "@/public/internal-games/math-tug-of-war/src/random.js";
import { ROBOT_TUNING, planRobotAnswer, robotEntry } from "@/public/internal-games/math-tug-of-war/src/robot.js";
import {
  TUG_LIMIT,
  applyPull,
  createLocalMatch,
  createTugState,
  describePosition,
  sanitizeName,
  type TugTeam
} from "@/public/internal-games/math-tug-of-war/src/tug.js";

const QUESTIONS_PER_SKILL = 10_000;

describe("Math Tug of War skills", () => {
  it("offers exactly the six V1 skills in display order", () => {
    expect(SKILLS.map(skill => skill.title)).toEqual([
      "Addition",
      "Subtraction",
      "Multiplication",
      "Addition & Subtraction of Integers",
      "Opposite of Integers",
      "Absolute Value"
    ]);
    expect(SKILLS.map(skill => skill.shortTitle)[3]).toBe("Integer Add & Subtract");
    expect(SKILLS.filter(skill => skill.signed).map(skill => skill.id)).toEqual(["integers", "opposite", "absolute"]);
  });
});

describe("question generator audit (10,000 per skill)", () => {
  const audit = new Map<TugSkillId, { generated: number; problems: Map<string, number>; operands: Set<number>; answers: Set<number>; keys: Set<string> }>();

  for (const skill of SKILL_IDS) {
    const record = { generated: 0, problems: new Map<string, number>(), operands: new Set<number>(), answers: new Set<number>(), keys: new Set<string>() };
    // 20 streams x 500 questions, so the repeat guard is exercised across seeds.
    for (let seed = 0; seed < 20; seed += 1) {
      const stream = createQuestionStream(skill, `audit-${skill}-${seed}`);
      let previous: string | null = null;
      for (let index = 0; index < QUESTIONS_PER_SKILL / 20; index += 1) {
        const question = stream.next();
        record.generated += 1;
        for (const problem of validateQuestion(question)) record.problems.set(problem, (record.problems.get(problem) ?? 0) + 1);
        if (previous === question.key) record.problems.set("immediate-repeat", (record.problems.get("immediate-repeat") ?? 0) + 1);
        previous = question.key;
        question.operands.forEach(value => record.operands.add(value));
        record.answers.add(question.answer);
        record.keys.add(question.key);
      }
    }
    audit.set(skill, record);
  }

  it.each(SKILL_IDS)("%s: 10,000 generated, zero invalid/malformed/out-of-range/mismatch/ambiguous/negative-zero", skill => {
    const record = audit.get(skill)!;
    expect(record.generated).toBe(QUESTIONS_PER_SKILL);
    expect(Object.fromEntries(record.problems)).toEqual({});
  });

  it("uses exactly the required operand ranges", () => {
    const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
    const sorted = (values: Set<number>) => [...values].sort((a, b) => a - b);
    expect(sorted(audit.get("addition")!.operands)).toEqual(range(1, 12));
    expect(sorted(audit.get("subtraction")!.operands)).toEqual(range(1, 12));
    expect(sorted(audit.get("multiplication")!.operands)).toEqual(range(1, 12));
    expect(sorted(audit.get("integers")!.operands)).toEqual(range(-12, 12));
    expect(sorted(audit.get("opposite")!.operands)).toEqual(range(-12, 12));
    expect(sorted(audit.get("absolute")!.operands)).toEqual(range(-12, 12));
    expect(Math.min(...audit.get("subtraction")!.answers)).toBe(0);
    expect(Math.min(...audit.get("absolute")!.answers)).toBe(0);
    expect(Math.min(...audit.get("integers")!.answers)).toBeLessThan(0);
    expect(audit.get("integers")!.answers.has(0)).toBe(true);
  });

  it("has natural variety (most of each skill's question space is reached)", () => {
    expect(audit.get("addition")!.keys.size).toBe(144);
    expect(audit.get("multiplication")!.keys.size).toBe(144);
    expect(audit.get("subtraction")!.keys.size).toBe(78);
    expect(audit.get("opposite")!.keys.size).toBe(25);
    expect(audit.get("absolute")!.keys.size).toBe(25);
    expect(audit.get("integers")!.keys.size).toBeGreaterThan(900);
  });

  it("never repeats a question inside the recent-history window (no tiny loops)", () => {
    for (const skill of SKILL_IDS) {
      const stream = createQuestionStream(skill, `loop-${skill}`);
      const window: string[] = [];
      for (let index = 0; index < 2_000; index += 1) {
        const question = stream.next();
        expect(window.includes(question.key)).toBe(false);
        window.push(question.key);
        if (window.length > 6) window.shift();
      }
    }
  });

  it("formats integer problems with true minus signs and parenthesised negative second operands", () => {
    const seen = new Set<string>();
    const stream = createQuestionStream("integers", "format");
    for (let index = 0; index < 3_000; index += 1) {
      const question = stream.next();
      seen.add(question.text);
      expect(question.text).not.toContain("-");
      expect(question.text).not.toMatch(new RegExp(`[+${MINUS}] ${MINUS}`));
      expect(question.operands[0] < 0 || question.operands[1] < 0 || question.answer < 0).toBe(true);
    }
    expect(seen.has(`5 + (${MINUS}3)`)).toBe(true);
    expect(seen.has(`${MINUS}4 ${MINUS} 2`)).toBe(true);
    expect(seen.has(`${MINUS}7 ${MINUS} (${MINUS}2)`)).toBe(true);
    expect(seen.has(`6 ${MINUS} 9`)).toBe(true);
  });

  it("words opposite and absolute value questions unambiguously", () => {
    expect(questionAt("opposite", "x", 0).text).toMatch(/^What is the opposite of (−?\d+|0)\?$/u);
    expect(questionAt("absolute", "x", 0).text).toMatch(/^\|(−?\d+)\|$/u);
    expect(formatInteger(-0)).toBe("0");
    expect(formatInteger(-7)).toBe(`${MINUS}7`);
  });

  it("reproduces the same sequence from the same seed", () => {
    for (const skill of SKILL_IDS) {
      const a = createQuestionStream(skill, 42);
      const b = createQuestionStream(skill, 42);
      for (let index = 0; index < 200; index += 1) expect(a.next().key).toBe(b.next().key);
      expect(questionAt(skill, 42, 57).key).toBe((() => {
        const stream = createQuestionStream(skill, 42);
        let last = stream.next();
        for (let position = 0; position < 57; position += 1) last = stream.next();
        return last.key;
      })());
    }
  });
});

describe("answer entry", () => {
  it.each([
    ["7", 7], ["+7", 7], ["-7", -7], [`${MINUS}7`, -7], ["–7", -7], ["0", 0], ["-0", 0], ["+0", 0], [" 12 ", 12], ["144", 144]
  ])("accepts %j as %d", (raw, value) => {
    const parsed = parseAnswer(raw);
    expect(parsed).toEqual({ ok: true, value });
    if (parsed.ok) expect(Object.is(parsed.value, -0)).toBe(false);
  });

  it.each(["--7", "++7", "+-7", "-+7", "7-", "7+", "+-", "-+", "", "-", "+", "1-2", "7.5", "1e2", "abc", "1234", "<b>"])(
    "rejects %j",
    raw => expect(parseAnswer(raw).ok).toBe(false)
  );

  it("keypad buffer can never hold a malformed sign sequence", () => {
    const signed = { signed: true };
    let buffer = "";
    buffer = applyKey(buffer, "-", signed);
    expect(buffer).toBe("-");
    expect(applyKey(buffer, "-", signed)).toBe("");
    expect(applyKey(buffer, "+", signed)).toBe("+");
    buffer = applyKey(buffer, "7", signed);
    expect(applyKey(buffer, "-", signed)).toBe("-7");
    expect(applyKey(buffer, "+", signed)).toBe("-7");
    expect(displayBuffer(buffer)).toBe(`${MINUS}7`);
    expect(applyKey("", "-", { signed: false })).toBe("");
    expect(applyKey("123", "4", signed)).toBe("123");
    expect(applyKey("-12", "3", signed)).toBe("-123");
    expect(applyKey("-12", "backspace", signed)).toBe("-1");
    expect(applyKey("-12", "clear", signed)).toBe("");
    // Exhaustive: every reachable buffer from short key sequences parses or is a bare sign/empty.
    const keys = ["0", "5", "+", "-", "backspace"];
    const reachable = new Set<string>([""]);
    for (let depth = 0; depth < 5; depth += 1) {
      for (const state of [...reachable]) for (const key of keys) reachable.add(applyKey(state, key, signed));
    }
    for (const state of reachable) {
      if (state === "" || state === "-" || state === "+") continue;
      expect(parseAnswer(state).ok).toBe(true);
    }
  });
});

describe("tug model", () => {
  it("correct pulls move the rope toward the pulling team and win at the line", () => {
    let tug = createTugState();
    tug = applyPull(tug, "turquoise");
    expect(tug.position).toBe(-1);
    tug = applyPull(tug, "pink");
    tug = applyPull(tug, "pink");
    expect(tug.position).toBe(1);
    for (let index = 0; index < 4; index += 1) tug = applyPull(tug, "pink");
    expect(tug.position).toBe(TUG_LIMIT);
    expect(tug.winner).toBe("pink");
    expect(applyPull(tug, "turquoise")).toBe(tug);
  });

  it("describes position in words, never the raw number", () => {
    const names = { turquoise: "Sharks", pink: "Comets" };
    expect(describePosition(0, names)).toBe("The rope is centered.");
    expect(describePosition(-2, names)).toBe("Sharks leads by 2 pulls, 3 pulls from victory.");
    expect(describePosition(4, names)).toBe("Comets leads by 4 pulls, 1 pull from victory.");
    expect(describePosition(-5, names)).toBe("Sharks pulled the rope across the line.");
  });

  it("sanitizes names", () => {
    expect(sanitizeName("   ", "Team 1")).toBe("Team 1");
    expect(sanitizeName("  Blue   Sharks ", "Team 1")).toBe("Blue Sharks");
    expect(sanitizeName("<script>alert(1)</script>", "Team 1")).toBe("scriptalert(1)/scrip");
    expect(sanitizeName("a".repeat(60), "x")).toHaveLength(20);
    expect(sanitizeName("\u0000\u0007", "Team 2")).toBe("Team 2");
    expect(sanitizeName(42, "Team 2")).toBe("Team 2");
  });
});

describe("local match", () => {
  const names = { turquoise: "Left", pink: "Right" };

  it("wrong answers never pull; the team moves to its next question; the other team is untouched", () => {
    const match = createLocalMatch({ skill: "multiplication", names, seed: 7 });
    const before = match.snapshot();
    const wrong = String(before.questions.turquoise.answer + 1);
    const result = match.submit("turquoise", wrong);
    expect(result.type).toBe("incorrect");
    expect(result.match.tug.position).toBe(0);
    expect(result.match.questions.pink).toBe(before.questions.pink);
    expect(result.match.questions.turquoise.index).toBe(1);
  });

  it("malformed entries change nothing", () => {
    const match = createLocalMatch({ skill: "integers", names, seed: 9 });
    const before = match.snapshot();
    expect(match.submit("pink", "--3").type).toBe("invalid");
    expect(match.submit("pink", "").type).toBe("invalid");
    expect(match.snapshot().questions.pink).toBe(before.questions.pink);
  });

  it("both teams can answer in any interleaving (simultaneous play)", () => {
    const match = createLocalMatch({ skill: "addition", names, seed: 3 });
    const pinkQuestion = match.snapshot().questions.pink;
    match.submit("turquoise", String(match.snapshot().questions.turquoise.answer));
    const after = match.submit("pink", String(pinkQuestion.answer));
    expect(after.type).toBe("correct");
    expect(after.match.tug.position).toBe(0);
    expect(after.match.tug.pulls).toEqual({ turquoise: 1, pink: 1 });
  });

  it("play again keeps names and skill, resets the rope, fresh questions", () => {
    const match = createLocalMatch({ skill: "absolute", names, seed: 5 });
    for (let index = 0; index < TUG_LIMIT; index += 1) match.submit("turquoise", String(match.snapshot().questions.turquoise.answer));
    expect(match.snapshot().status).toBe("won");
    expect(match.submit("pink", String(match.snapshot().questions.pink.answer)).type).toBe("finished");
    const firstRoundQuestions = match.snapshot().questions;
    const again = match.rematch();
    expect(again.status).toBe("playing");
    expect(again.tug.position).toBe(0);
    expect(again.names).toEqual(names);
    expect(again.skill).toBe("absolute");
    expect(again.round).toBe(1);
    expect(again.questions.pink.key === firstRoundQuestions.pink.key && again.questions.turquoise.key === firstRoundQuestions.turquoise.key).toBe(false);
  });
});

describe("match simulation audit (10,000 matches)", () => {
  const names = { turquoise: "Left", pink: "Right" };
  it("never crashes, leaves bounds, double-wins, transitions illegally or gets stuck", () => {
    const failures = { crashes: 0, outOfBounds: 0, multipleWinners: 0, invalidTransitions: 0, stuck: 0, wrongPulled: 0 };
    let matches = 0;
    const edgeStarts = [0, 1, 2, 3, 4];
    for (let run = 0; run < 10_000; run += 1) {
      const skill = SKILL_IDS[run % SKILL_IDS.length];
      const random = createRandom(`sim-${run}`);
      const robotMode = run % 2 === 0;
      try {
        const match = createLocalMatch({ skill, names, seed: `match-${run}` });
        // Edge tug states: pre-load one side close to its line with correct answers.
        const preload = edgeStarts[run % edgeStarts.length];
        const preloadTeam: TugTeam = run % 3 === 0 ? "turquoise" : "pink";
        for (let index = 0; index < preload; index += 1) match.submit(preloadTeam, String(match.snapshot().questions[preloadTeam].answer));
        let steps = 0;
        let winners = 0;
        let previousStatus = match.snapshot().status;
        while (match.snapshot().status === "playing" && steps < 5_000) {
          steps += 1;
          const team: TugTeam = random.next() < 0.5 ? "turquoise" : "pink";
          const snapshot = match.snapshot();
          const question = snapshot.questions[team];
          let entry: string;
          if (robotMode && team === "pink") {
            entry = robotEntry(planRobotAnswer(question, random.next).answer);
          } else {
            const roll = random.next();
            entry = roll < 0.7 ? String(question.answer) : roll < 0.9 ? String(question.answer + 1) : random.pick(["", "--1", "7-", "+-3"]);
          }
          const before = snapshot.tug.position;
          const result = match.submit(team, entry);
          const after = result.match.tug.position;
          if (Math.abs(after) > TUG_LIMIT) failures.outOfBounds += 1;
          if (result.type !== "correct" && after !== before) failures.wrongPulled += 1;
          if (result.type === "correct" && Math.abs(after - before) !== 1) failures.invalidTransitions += 1;
          if (previousStatus === "won" && result.match.status === "playing") failures.invalidTransitions += 1;
          if (result.match.status === "won") winners += 1;
          previousStatus = result.match.status;
        }
        const final = match.snapshot();
        if (final.status !== "won") failures.stuck += 1;
        if (winners !== 1) failures.multipleWinners += winners > 1 ? 1 : 0;
        if (final.tug.winner === "turquoise" && final.tug.position !== -TUG_LIMIT) failures.invalidTransitions += 1;
        if (final.tug.winner === "pink" && final.tug.position !== TUG_LIMIT) failures.invalidTransitions += 1;
        // Once won, nobody can move the rope.
        const frozen = match.submit("turquoise", String(final.questions.turquoise.answer));
        if (frozen.type !== "finished" || frozen.match.tug.position !== final.tug.position) failures.invalidTransitions += 1;
        matches += 1;
      } catch {
        failures.crashes += 1;
      }
    }
    expect(matches).toBe(10_000);
    expect(failures).toEqual({ crashes: 0, outOfBounds: 0, multipleWinners: 0, invalidTransitions: 0, stuck: 0, wrongPulled: 0 });
  });
});

describe("robot", () => {
  it("waits a natural variable delay, is mostly right, sometimes wrong, never instant", () => {
    const random = createRandom("robot");
    const delays: number[] = [];
    let correct = 0;
    const total = 20_000;
    for (let index = 0; index < total; index += 1) {
      const skill = SKILL_IDS[index % SKILL_IDS.length];
      const question = questionAt(skill, `r${index}`, 0);
      const plan = planRobotAnswer(question, random.next);
      delays.push(plan.delayMs);
      expect(plan.delayMs).toBeGreaterThanOrEqual(ROBOT_TUNING.minDelayMs);
      expect(plan.correct).toBe(plan.answer === question.answer);
      if (plan.correct) correct += 1;
      else if (skill !== "integers" && skill !== "opposite") expect(plan.answer).toBeGreaterThanOrEqual(0);
    }
    const rate = correct / total;
    expect(rate).toBeGreaterThan(0.75);
    expect(rate).toBeLessThan(0.85);
    expect(new Set(delays).size).toBeGreaterThan(1_000);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(1_800);
  });
});
