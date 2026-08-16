import type { Operation } from "./types";

export function evaluateExpression(operands: readonly number[], operators: readonly Operation[]): number | null {
  if (operands.length !== operators.length + 1 || operands.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  const sums: number[] = [];
  const additions: Operation[] = [];
  let current = operands[0]!;
  for (let index = 0; index < operators.length; index += 1) {
    const operation = operators[index]!;
    const right = operands[index + 1]!;
    if (operation === "multiplication") current *= right;
    else if (operation === "division") { if (right === 0 || current % right !== 0) return null; current /= right; }
    else { sums.push(current); additions.push(operation); current = right; }
    if (!Number.isSafeInteger(current)) return null;
  }
  sums.push(current);
  let result = sums[0]!;
  for (let index = 0; index < additions.length; index += 1) result = additions[index] === "addition" ? result + sums[index + 1]! : result - sums[index + 1]!;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}
export function equationIsValid(operands: readonly number[], operators: readonly Operation[], result: number): boolean { return evaluateExpression(operands, operators) === result; }
