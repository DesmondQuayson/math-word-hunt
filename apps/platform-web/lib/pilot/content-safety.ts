const prohibitedPatterns = [
  { pattern: /\bstudent(?:'s)?\s+(?:name|email|id|identifier)\b/i, label: "student identifier" },
  { pattern: /\broster\b/i, label: "roster information" },
  { pattern: /\biep\b/i, label: "IEP information" },
  { pattern: /\b(?:password|passcode|token|cookie|secret)\b/i, label: "account secret" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, label: "email address" },
  { pattern: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b/i, label: "provider credential" }
] as const;

export type PilotContentCheck = Readonly<
  | { safe: true; value: string }
  | { safe: false; value: string; category: string }
>;

export function checkPilotText(value: string, maximum: number): PilotContentCheck {
  const normalized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maximum);
  const match = prohibitedPatterns.find(({ pattern }) => pattern.test(normalized));
  return match
    ? { safe: false, value: normalized, category: match.label }
    : { safe: true, value: normalized };
}

export function planningLabelError(value: string): string | null {
  const result = checkPilotText(value, 80);
  if (result.safe) return null;
  return `Remove ${result.category}. Use a general teacher-only planning label.`;
}
