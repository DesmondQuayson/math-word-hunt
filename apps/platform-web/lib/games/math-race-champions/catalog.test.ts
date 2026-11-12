// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORY_IDS, DIFFICULTY_IDS } from "@/public/internal-games/math-race-champions/src/engine/questions.js";
import { ACHIEVEMENTS, ACHIEVEMENT_REWARD, CARS, MIN_CORRECT, RACER_COLOURS, ROOM_CAPACITY, STAGES } from "@/public/internal-games/math-race-champions/src/engine/race.js";

const read = (name: string) => readFileSync(resolve(__dirname, `../../../../../supabase/${name}`), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = read("migrations/20261112110000_math_race_champions.sql");
const CATALOG = read("migrations/20261112100000_math_race_champions_catalog.sql");
const ROLLBACK = read("rollback/math_race_champions.sql");

describe("the database and the game agree", () => {
  it("on every car: name, price and the three numbers the race is run with", () => {
    const seed = MIGRATION.slice(MIGRATION.indexOf("insert into public.race_cars("));
    const rows = [...seed.slice(0, seed.indexOf(";")).matchAll(/^\('([^']+)','([^']+)',(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/gm)];
    expect(rows).toHaveLength(CARS.length);
    rows.forEach((row, index) => {
      const car = CARS[index]!;
      expect(row[1]).toBe(car.key);
      expect(row[2]).toBe(car.name);
      expect(Number(row[3])).toBe(car.price);
      expect(Number(row[4])).toBe(car.topSpeed);
      expect(Number(row[5])).toBe(car.boost);
      expect(Number(row[6])).toBe(Math.round(car.decay * 1000));
      expect([Number(row[7]), Number(row[8])]).toEqual([...car.recommended]);
      expect(Number(row[9])).toBe(index + 1);
    });
  });

  it("on every achievement and its reward", () => {
    const seed = MIGRATION.slice(MIGRATION.indexOf("insert into public.race_achievements("));
    const rows = [...seed.slice(0, seed.indexOf(";")).matchAll(/\('([a-z0-9-]+)',(\d+)\)/g)];
    expect(rows.map((row) => row[1]).sort()).toEqual(ACHIEVEMENTS.map((item) => item.key).sort());
    for (const row of rows) expect(Number(row[2])).toBe(ACHIEVEMENT_REWARD);
  });

  it("on the stage rewards", () => {
    expect(MIGRATION).toContain("then 400 + 100*p_stage else 0");
    STAGES.forEach((stage) => expect(stage.reward).toBe(400 + 100 * stage.stage));
  });

  it("on the 30-answer rule, held in three places", () => {
    expect(MIN_CORRECT).toBe(30);
    expect(MIGRATION).toContain("(p->>'correct')::integer >= 30");
    expect(MIGRATION).toContain("check (finish_ms is null or correct >= 30)");
  });

  it("on the categories, the difficulties, the colours and the room size", () => {
    for (const id of CATEGORY_IDS) expect(MIGRATION).toContain(`'${id}'`);
    expect(MIGRATION).not.toMatch(/fraction'/);
    expect(MIGRATION).toContain(`in (${DIFFICULTY_IDS.map((id) => `'${id}'`).join(",")})`);
    expect(MIGRATION).toContain(`in (${RACER_COLOURS.map((id) => `'${id}'`).join(",")})`);
    expect(MIGRATION).toContain(`>= ${ROOM_CAPACITY} then`);
  });
});

describe("the migrations are safe to apply", () => {
  it("register the game as a DRAFT and never publish it", () => {
    expect(CATALOG).toContain("'mixed','draft',next_order");
    expect(CATALOG).toContain("status='draft'");
    expect(CATALOG + MIGRATION).not.toMatch(/status\s*=\s*'published'/);
    expect(CATALOG + MIGRATION).not.toMatch(/'published'/);
  });

  it("are additive: nothing existing is dropped, truncated or altered", () => {
    for (const sql of [CATALOG, MIGRATION]) {
      expect(sql).not.toMatch(/\bdrop\s+(table|function|trigger|column|schema|index)\b/i);
      expect(sql).not.toMatch(/\btruncate\b/i);
      expect(sql).not.toMatch(/\balter\s+table\s+public\.(?!race_)/i);
      expect(sql).not.toMatch(/\bdelete\s+from\s+public\.(?!race_)/i);
    }
  });

  it("change only the two shared functions that keep one code space, and keep their grants", () => {
    const replaced = [...MIGRATION.matchAll(/create or replace function ((?:public|private)\.[a-z_]+)/g)].map((match) => match[1]).filter((name) => !/\.(race_)/.test(name!));
    expect(replaced.sort()).toEqual(["private.live_room_code_guard", "public.live_room_game_for_code"]);
    expect(MIGRATION).toContain("revoke all on function public.live_room_game_for_code(text) from public,anon,authenticated;");
    expect(MIGRATION).toContain("grant execute on function public.live_room_game_for_code(text) to service_role;");
    // The lookup still answers for the two older games.
    expect(MIGRATION).toContain("then 'polygon_showdown'");
    expect(MIGRATION).toContain("then 'math_bingo_live'");
  });

  it("give browsers nothing: forced RLS, no policy, every function for the server only", () => {
    const tables = [...MIGRATION.matchAll(/create table public\.(race_[a-z_]+)/g)].map((match) => match[1]!);
    expect(tables).toHaveLength(10);
    for (const table of tables) {
      expect(MIGRATION, table).toContain(`alter table public.${table} force row level security;`);
      expect(MIGRATION, table).toContain(`revoke all on table public.${table} from public,anon,authenticated,service_role;`);
    }
    expect(MIGRATION).not.toMatch(/create policy/i);
    expect(MIGRATION).toContain("grant select,insert on table public.race_ledger to service_role;");
    const publicFunctions = [...MIGRATION.matchAll(/create or replace function public\.(race_[a-z_]+)\(/g)].map((match) => match[1]!);
    const granted = MIGRATION.slice(MIGRATION.indexOf("do $grants$"));
    for (const name of publicFunctions) expect(granted, name).toContain(`'public.${name}(`);
    for (const definition of MIGRATION.split("create or replace function public.").slice(1)) {
      expect(definition.slice(0, definition.indexOf("as $$"))).toContain("security definer set search_path=''");
    }
  });

  it("never grant Race Dollars outside a stage win or an achievement", () => {
    const credits = [...MIGRATION.matchAll(/private\.race_credit\(([^)]*)\)/g)].map((match) => match[1]!).filter((args) => !args.startsWith("p_user uuid") && !args.startsWith("uuid,"));
    expect(credits).toHaveLength(2);
    expect(credits.some((args) => args.includes("'STAGE_REWARD'"))).toBe(true);
    expect(credits.some((args) => args.includes("'ACHIEVEMENT'"))).toBe(true);
    expect(MIGRATION).not.toMatch(/insert into public\.race_wallets\([^)]*balance/);
  });
});

describe("the rollback", () => {
  it("drops everything the migration created", () => {
    for (const match of MIGRATION.matchAll(/create table public\.(race_[a-z_]+)/g)) expect(ROLLBACK, match[1]).toContain(`drop table if exists public.${match[1]};`);
    for (const match of MIGRATION.matchAll(/create or replace function ((?:public|private)\.race_[a-z_]+)\(/g)) expect(ROLLBACK, match[1]).toContain(`drop function if exists ${match[1]}(`);
    for (const match of MIGRATION.matchAll(/create trigger ([a-z_]+) /g)) expect(ROLLBACK, match[1]).toContain(`drop trigger if exists ${match[1]} `);
  });

  it("puts the shared code guard back as it was, instead of dropping it from under the other games", () => {
    expect(ROLLBACK).not.toMatch(/drop function if exists private\.live_room_code_guard/);
    expect(ROLLBACK).not.toMatch(/drop function if exists public\.live_room_game_for_code/);
    expect(ROLLBACK).toContain("create or replace function private.live_room_code_guard()");
    expect(ROLLBACK).toContain("create or replace function public.live_room_game_for_code(p_code text)");
    expect(ROLLBACK).not.toContain("race_rooms r where");
    expect(ROLLBACK).toContain("status='archived'");
  });
});
