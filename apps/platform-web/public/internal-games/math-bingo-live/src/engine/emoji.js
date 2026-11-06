// Math Bingo Live player emoji: an optional, decorative choice shown beside a
// student's display name ("🦁 Ava"). Only this curated list is accepted, by
// the server (exact string match) and again by the database
// (private.bingo_emoji_valid in 20261107100000_math_bingo_live_final_gameplay.sql;
// the engine tests fail if the two lists ever differ). The participant id —
// never the emoji or the name — identifies a player; two students may pick
// the same emoji.

export const EMOJI_CHOICES = Object.freeze([
  Object.freeze({ emoji: "🐶", name: "Dog" }),
  Object.freeze({ emoji: "🐱", name: "Cat" }),
  Object.freeze({ emoji: "🦁", name: "Lion" }),
  Object.freeze({ emoji: "🐯", name: "Tiger" }),
  Object.freeze({ emoji: "🐼", name: "Panda" }),
  Object.freeze({ emoji: "🐸", name: "Frog" }),
  Object.freeze({ emoji: "🐵", name: "Monkey" }),
  Object.freeze({ emoji: "🐧", name: "Penguin" }),
  Object.freeze({ emoji: "🦊", name: "Fox" }),
  Object.freeze({ emoji: "🐙", name: "Octopus" }),
  Object.freeze({ emoji: "🚀", name: "Rocket" }),
  Object.freeze({ emoji: "🌟", name: "Glowing star" }),
  Object.freeze({ emoji: "⭐", name: "Star" }),
  Object.freeze({ emoji: "🌙", name: "Moon" }),
  Object.freeze({ emoji: "🌈", name: "Rainbow" }),
  Object.freeze({ emoji: "⚡", name: "Lightning" }),
  Object.freeze({ emoji: "🔥", name: "Fire" }),
  Object.freeze({ emoji: "💎", name: "Gem" }),
  Object.freeze({ emoji: "⚽", name: "Soccer ball" }),
  Object.freeze({ emoji: "🏀", name: "Basketball" }),
  Object.freeze({ emoji: "🏈", name: "Football" }),
  Object.freeze({ emoji: "⚾", name: "Baseball" }),
  Object.freeze({ emoji: "🎾", name: "Tennis ball" }),
  Object.freeze({ emoji: "🍕", name: "Pizza" }),
  Object.freeze({ emoji: "🍎", name: "Apple" }),
  Object.freeze({ emoji: "🍉", name: "Watermelon" }),
  Object.freeze({ emoji: "🍓", name: "Strawberry" }),
  Object.freeze({ emoji: "🍩", name: "Doughnut" }),
  Object.freeze({ emoji: "📚", name: "Books" }),
  Object.freeze({ emoji: "✏️", name: "Pencil" }),
  Object.freeze({ emoji: "🎨", name: "Paint palette" }),
  Object.freeze({ emoji: "🧠", name: "Brain" }),
  Object.freeze({ emoji: "🧩", name: "Puzzle piece" })
]);

const BY_EMOJI = new Map(EMOJI_CHOICES.map(choice => [choice.emoji, choice]));

export function isAllowedEmoji(value) {
  return typeof value === "string" && BY_EMOJI.has(value);
}

/** null/""/missing mean "no emoji"; anything else must be on the list exactly. */
export function normalizeEmoji(raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: true, emoji: null };
  return isAllowedEmoji(raw) ? { ok: true, emoji: raw } : { ok: false, error: "emoji-invalid" };
}

/** The spoken name of an allowed emoji ("Lion"), or "". */
export function emojiName(emoji) {
  return BY_EMOJI.get(emoji)?.name ?? "";
}

/** "🦁 Ava", or just "Ava" without an emoji. */
export function withEmoji(name, emoji) {
  return isAllowedEmoji(emoji) ? `${emoji} ${name}` : name;
}
