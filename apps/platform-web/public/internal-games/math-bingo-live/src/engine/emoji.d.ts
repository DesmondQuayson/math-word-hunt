export type EmojiChoice = Readonly<{ emoji: string; name: string }>;

export const EMOJI_CHOICES: readonly EmojiChoice[];
export function isAllowedEmoji(value: unknown): value is string;
export function normalizeEmoji(raw: unknown): { ok: true; emoji: string | null } | { ok: false; error: string };
export function emojiName(emoji: unknown): string;
export function withEmoji(name: string, emoji: unknown): string;
