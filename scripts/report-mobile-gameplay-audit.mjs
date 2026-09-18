/**
 * Summarise a mobile gameplay audit run (e2e/mobile-gameplay/audit.spec.ts).
 *
 *   node scripts/report-mobile-gameplay-audit.mjs before                  # plain table
 *   node scripts/report-mobile-gameplay-audit.mjs before --md             # audit table (markdown)
 *   node scripts/report-mobile-gameplay-audit.mjs before after --md       # before/after, every engine
 *   node scripts/report-mobile-gameplay-audit.mjs before after --game     # per-game before/after (markdown)
 *   node scripts/report-mobile-gameplay-audit.mjs after --matrix          # viewport × engine matrix (markdown)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const markdown = args.includes("--md");
const perGame = args.includes("--game");
const matrix = args.includes("--matrix");
const labels = args.filter((value) => !value.startsWith("--"));
const root = resolve("qa-artifacts", "mobile-gameplay-audit");

const GAMES = ["math-vocabulary-hunt", "crosscalc", "number-cross", "number-logic"];
const TITLES = {
  "math-vocabulary-hunt": "Math Vocabulary Hunt",
  "crosscalc": "CrossCalc",
  "number-cross": "Number Cross",
  "number-logic": "Number Logic"
};
/** The one region each game may scroll internally (mirrors e2e/mobile-gameplay/contract.spec.ts). */
const ALLOWED_SCROLLERS = {
  "math-vocabulary-hunt": /^ol#wordList\b/,
  "crosscalc": /^(div#puzzle-board\.board-scroll|div\.number-tray x$)/,
  "number-cross": /^$/,
  "number-logic": /^(aside\._proofPanel_1annj_1|div\._busShell_1ozdl_1|div x$)/
};

function load(label) {
  const directory = resolve(root, label);
  if (!existsSync(directory)) throw new Error(`No audit output for "${label}" in ${directory}`);
  const rows = new Map();
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    for (const record of JSON.parse(readFileSync(resolve(directory, file), "utf8"))) {
      rows.set(`${record.game}|${record.project}|${record.viewport.width}x${record.viewport.height}`, record);
    }
  }
  return rows;
}

const size = (record) => `${record.viewport.width}×${record.viewport.height}`;
const yes = (value) => (value ? "yes" : "NO");
const scroll = (record) => (record.pageScrollExtent > 1 ? `YES (${record.pageScrollExtent}px)` : "no");
const clipped = (record) => (record.firstCellVisible && record.lastCellVisible ? "no" : "YES");
/** Board clipping, told apart from the intended internal board scroller. */
const boardState = (record) => {
  if (record.firstCellVisible && record.lastCellVisible) return "no";
  const scrollsInside = record.internalScrollers.some((scroller) => ALLOWED_SCROLLERS[record.game].test(scroller) && /board/.test(scroller));
  return scrollsInside && record.boardVisible ? "no (board scrolls in its own viewport)" : "YES";
};
const issues = (record) => {
  const found = [];
  if (record.pageScrollExtent > 1) found.push(`page scrolls ${record.pageScrollExtent}px`);
  if (record.startScrollTop > 0) found.push(`opens pre-scrolled ${record.startScrollTop}px`);
  if (record.horizontalOverflow > 1) found.push(`horizontal overflow ${record.horizontalOverflow}px`);
  if (!record.lastCellVisible) found.push("last board cell hidden");
  if (!record.problemVisible) found.push("problem/status off-screen");
  if (!record.controlsVisible) found.push("controls off-screen");
  for (const cover of record.covered) found.push(cover);
  for (const scroller of record.internalScrollers) found.push(`internal scroll: ${scroller}`);
  return found.join("; ") || "—";
};
/** The layout half of the mobile contract (the gate itself is contract.spec.ts). */
const playable = (record) =>
  record.pageScrollExtent <= 1 &&
  record.startScrollTop === 0 &&
  record.horizontalOverflow <= 1 &&
  record.backVisible &&
  record.problemVisible &&
  record.boardVisible &&
  record.controlsVisible &&
  record.covered.length === 0 &&
  record.internalScrollers.every((scroller) => ALLOWED_SCROLLERS[record.game].test(scroller));
/** Phones, tablets and landscape are judged on the touch profiles, desktop sizes on the desktop ones. */
const engineProject = (engine, record) => `${engine}-${record.viewport.width < 1000 ? "mobile" : "desktop"}`;
const byViewport = (a, b) => a.viewport.width - b.viewport.width || a.viewport.height - b.viewport.height;

const [first, second] = labels;
const before = load(first);
const after = second ? load(second) : null;
const keys = [...before.keys()].sort();

if (perGame && after) {
  for (const game of GAMES) {
    console.log(`\n#### ${TITLES[game]}\n`);
    console.log("| VIEWPORT | ENGINE | PAGE SCROLL HEIGHT before → after | VIEWPORT HEIGHT | HEADER HEIGHT before → after | BOARD HEIGHT before → after | CELL before → after | PROBLEM VISIBLE before → after | LAST BOARD CELL VISIBLE before → after |");
    console.log("|---|---|---|---|---|---|---|---|---|");
    const rows = [...before.values()].filter((record) => record.game === game && record.project === engineProject("chromium", record)).sort(byViewport);
    for (const b of rows) {
      const a = after.get(`${b.game}|${b.project}|${b.viewport.width}x${b.viewport.height}`);
      if (!a) continue;
      const boardHeight = (record) => (record.board ? `${Math.round(record.board.height)}` : "—");
      console.log(`| ${size(b)} | ${b.project} | ${b.pageScrollHeight} → ${a.pageScrollHeight} | ${a.viewport.height} | ${b.headerHeight} → ${a.headerHeight} | ${boardHeight(b)} → ${boardHeight(a)} | ${b.cellSize} → ${a.cellSize} | ${yes(b.problemVisible)} → ${yes(a.problemVisible)} | ${yes(b.lastCellVisible)} → ${yes(a.lastCellVisible)} |`);
    }
  }
} else if (matrix) {
  console.log("| GAME | VIEWPORT | CHROMIUM | WEBKIT | OVERFLOW | PLAYABLE |");
  console.log("|---|---|---|---|---|---|");
  for (const game of GAMES) {
    const viewports = [...new Map([...before.values()].filter((record) => record.game === game).map((record) => [`${record.viewport.width}x${record.viewport.height}`, record])).values()].sort(byViewport);
    for (const sample of viewports) {
      const cell = (engine) => {
        const record = before.get(`${game}|${engineProject(engine, sample)}|${sample.viewport.width}x${sample.viewport.height}`);
        return record ? { record, ok: playable(record) } : null;
      };
      const chromium = cell("chromium");
      const webkit = cell("webkit");
      const shown = (entry) => (entry ? (entry.ok ? "pass" : `FAIL (${issues(entry.record)})`) : "—");
      const overflow = [chromium, webkit].filter(Boolean).map((entry) => Math.max(entry.record.pageScrollExtent, entry.record.horizontalOverflow));
      const worst = overflow.length ? Math.max(...overflow) : 0;
      const ok = [chromium, webkit].filter(Boolean).every((entry) => entry.ok);
      console.log(`| ${TITLES[game]} | ${size(sample)} | ${shown(chromium)} | ${shown(webkit)} | ${worst > 1 ? `${worst}px` : "none"} | ${ok ? "YES" : "NO"} |`);
    }
  }
} else if (markdown && after) {
  console.log("| GAME | ENGINE | VIEWPORT | PAGE SCROLL BEFORE | AFTER | BOARD CLIPPED BEFORE | AFTER | PROBLEM VISIBLE AFTER | CONTROLS VISIBLE AFTER | H-OVERFLOW AFTER |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const key of keys) {
    const b = before.get(key);
    const a = after.get(key);
    if (!a) continue;
    console.log(`| ${b.game} | ${b.project} | ${size(b)} | ${scroll(b)} | ${scroll(a)} | ${clipped(b)} | ${boardState(a)} | ${yes(a.problemVisible)} | ${yes(a.controlsVisible)} | ${a.horizontalOverflow > 1 ? `${a.horizontalOverflow}px` : "none"} |`);
  }
} else if (markdown) {
  console.log("| GAME | ENGINE | VIEWPORT | PAGE SCROLL REQUIRED? | BOARD FULLY REACHABLE? | PROBLEM VISIBLE? | CONTROLS VISIBLE? | HORIZONTAL OVERFLOW? | ISSUE |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const key of keys) {
    const r = before.get(key);
    console.log(`| ${r.game} | ${r.project} | ${size(r)} | ${scroll(r)} | ${yes(r.firstCellVisible && r.lastCellVisible)} | ${yes(r.problemVisible)} | ${yes(r.controlsVisible)} | ${r.horizontalOverflow > 1 ? `${r.horizontalOverflow}px` : "no"} | ${issues(r)} |`);
  }
} else {
  for (const key of keys) {
    const r = before.get(key);
    console.log([
      r.game.padEnd(20), r.project.padEnd(16), `${r.viewport.width}x${r.viewport.height}`.padEnd(9),
      `scroll=${String(r.pageScrollExtent).padStart(4)}`, `start=${String(r.startScrollTop).padStart(3)}`, `hx=${r.horizontalOverflow}`,
      `hdr=${String(r.headerHeight).padStart(3)}`, `board=${r.board ? `${Math.round(r.board.width)}x${Math.round(r.board.height)}@${Math.round(r.board.y)}` : "-"}`,
      `cell=${r.cellSize}`, `prob=${r.problemVisible ? "Y" : "n"}`, `first=${r.firstCellVisible ? "Y" : "n"}`, `last=${r.lastCellVisible ? "Y" : "n"}`,
      `ctl=${r.controlsVisible ? "Y" : "n"}`, `cov=${r.covered.length}`, r.internalScrollers.join("|")
    ].join(" "));
  }
}
