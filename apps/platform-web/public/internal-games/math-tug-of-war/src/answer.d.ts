import type { TugQuestion } from "./questions.js";

export const MAX_DIGITS: number;
export type TugKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "+" | "-" | "clear" | "backspace";
export type ParsedAnswer = Readonly<{ ok: true; value: number }> | Readonly<{ ok: false; reason: "empty" | "malformed" }>;

export function normalizeKey(character: string): "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "+" | "-" | null;
export function applyKey(buffer: string, key: string, options?: { signed?: boolean }): string;
export function displayBuffer(buffer: string): string;
export function parseAnswer(raw: unknown): ParsedAnswer;
export function isCorrect(question: TugQuestion, raw: string): boolean;
