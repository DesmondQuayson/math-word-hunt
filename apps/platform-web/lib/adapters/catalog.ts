import {
  PRODUCT_CATALOG,
  type ProductDefinition
} from "@math-vocabulary-hunt/platform-core";

export type ProductCatalogView = Readonly<{
  product: ProductDefinition;
  statusLabel: "Current classroom game";
}>;

export function getProductCatalogView(): ProductCatalogView {
  const product = PRODUCT_CATALOG[0];
  if (!product) {
    throw new Error("Math Vocabulary Hunt is not registered");
  }
  return Object.freeze({ product, statusLabel: "Current classroom game" });
}
