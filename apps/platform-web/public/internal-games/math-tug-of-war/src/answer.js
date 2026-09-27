// Answer entry rules for the Math Tug of War keypad and physical keyboard.
//
// A valid entry is an optional single leading sign followed by one to three
// digits. Every hyphen/dash look-alike a keyboard or paste can produce is
// normalised to the one minus the game displays. Anything else is rejected,
// including "--7", "+-7", "7-", "+" on its own and a sign after a digit.

import { MINUS } from "./questions.js";

export const MAX_DIGITS = 3;

const MINUS_LIKE = new Set([
  "-",
  MINUS,
  String.fromCharCode(0x2010), // hyphen
  String.fromCharCode(0x2011), // non-breaking hyphen
  String.fromCharCode(0x2012), // figure dash
  String.fromCharCode(0x2013), // en dash
  String.fromCharCode(0xfe63), // small hyphen-minus
  String.fromCharCode(0xff0d) // fullwidth hyphen-minus
]);
const PLUS_LIKE = new Set(["+", String.fromCharCode(0xff0b)]);

/** Map one typed character to a keypad key, or null. */
export function normalizeKey(character) {
  if (typeof character !== "string" || character.length !== 1) return null;
  if (character >= "0" && character <= "9") return character;
  if (MINUS_LIKE.has(character)) return "-";
  if (PLUS_LIKE.has(character)) return "+";
  return null;
}

/**
 * Apply one key to the entry buffer. The buffer only ever holds a state
 * that can still become a valid answer, so malformed sign sequences cannot
 * be typed in the first place. Signs are allowed only when `signed` is on.
 */
export function applyKey(buffer, key, { signed = false } = {}) {
  const current = typeof buffer === "string" ? buffer : "";
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1);
  if (key === "-" || key === "+") {
    if (!signed) return current;
    if (current === "") return key;
    // A second press of the same sign removes it; the other sign replaces it.
    if (current === "-" || current === "+") return current === key ? "" : key;
    return current;
  }
  if (typeof key === "string" && key.length === 1 && key >= "0" && key <= "9") {
    const digits = current.replace(/^[+-]/, "");
    if (digits.length >= MAX_DIGITS) return current;
    return current + key;
  }
  return current;
}

/** What the answer display shows for a buffer (true minus sign). */
export function displayBuffer(buffer) {
  return buffer.startsWith("-") ? MINUS + buffer.slice(1) : buffer;
}

/**
 * Parse a complete answer. Returns { ok: true, value } or { ok: false }.
 * Accepts "7", "+7", "-7", "0"; never produces negative zero.
 */
export function parseAnswer(raw) {
  if (typeof raw !== "string") return Object.freeze({ ok: false, reason: "empty" });
  let text = "";
  for (const character of raw.trim()) {
    const key = normalizeKey(character);
    if (key === null) return Object.freeze({ ok: false, reason: "malformed" });
    text += key;
  }
  if (text === "") return Object.freeze({ ok: false, reason: "empty" });
  const match = /^([+-]?)(\d{1,3})$/.exec(text);
  if (!match) return Object.freeze({ ok: false, reason: "malformed" });
  const magnitude = Number(match[2]);
  const value = match[1] === "-" && magnitude !== 0 ? -magnitude : magnitude;
  return Object.freeze({ ok: true, value });
}

export function isCorrect(question, raw) {
  const parsed = parseAnswer(raw);
  return parsed.ok && parsed.value === question.answer;
}
