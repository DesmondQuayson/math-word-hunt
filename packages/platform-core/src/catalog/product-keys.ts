export const PRODUCT_KEYS = ["math-vocabulary-hunt"] as const;

export type ProductKey = (typeof PRODUCT_KEYS)[number];

const productKeySet = new Set<string>(PRODUCT_KEYS);

export function isProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && productKeySet.has(value);
}

export function parseProductKey(value: unknown): ProductKey {
  if (!isProductKey(value)) {
    throw new Error("Unknown product key");
  }
  return value;
}
