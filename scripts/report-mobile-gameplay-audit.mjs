/**
 * Summarise a mobile gameplay audit run (e2e/mobile-gameplay/audit.spec.ts).
 *
 *   node scripts/report-mobile-gameplay-audit.mjs before            # plain table
 *   node scripts/report-mobile-gameplay-audit.mjs before after --md # before/after markdown
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const markdown = args.includes("--md");
const labels = args.filter((value) => !value.startsWith("--"));
const root = resolve("test-results", "mobile-gameplay-audit");

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

const yes = (value) => (value ? "yes" : "NO");
const scroll = (record) => (record.pageScrollExtent > 1 ? `YES (${record.pageScrollExtent}px)` : "no");
const clipped = (record) => (record.firstCellVisible && record.lastCellVisible ? "no" : "YES");
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

const [first, second] = labels;
const before = load(first);
const after = second ? load(second) : null;
const keys = [...before.keys()].sort();
if (markdown && after) {
  console.log("| GAME | ENGINE | VIEWPORT | PAGE SCROLL BEFORE | AFTER | BOARD CLIPPED BEFORE | AFTER | PROBLEM VISIBLE AFTER | CONTROLS VISIBLE AFTER | H-OVERFLOW AFTER |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const key of keys) {
    const b = before.get(key);
    const a = after.get(key);
    if (!a) continue;
    console.log(`| ${b.game} | ${b.project} | ${b.viewport.width}×${b.viewport.height} | ${scroll(b)} | ${scroll(a)} | ${clipped(b)} | ${clipped(a)} | ${yes(a.problemVisible)} | ${yes(a.controlsVisible)} | ${a.horizontalOverflow > 1 ? `${a.horizontalOverflow}px` : "none"} |`);
  }
} else if (markdown) {
  console.log("| GAME | ENGINE | VIEWPORT | PAGE SCROLL REQUIRED? | BOARD FULLY REACHABLE? | PROBLEM VISIBLE? | CONTROLS VISIBLE? | HORIZONTAL OVERFLOW? | ISSUE |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const key of keys) {
    const r = before.get(key);
    console.log(`| ${r.game} | ${r.project} | ${r.viewport.width}×${r.viewport.height} | ${scroll(r)} | ${yes(r.firstCellVisible && r.lastCellVisible)} | ${yes(r.problemVisible)} | ${yes(r.controlsVisible)} | ${r.horizontalOverflow > 1 ? `${r.horizontalOverflow}px` : "no"} | ${issues(r)} |`);
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
