// A shop card's picture: the optimized still of an item, rendered from its real
// 3D asset by scripts/render-polygon-showdown-products.mjs.

import { h } from "../../math-bingo-live/src/dom.js";
import { PRODUCT_IMAGE_VERSION } from "./product-images.js";

const BASE = new URL("../products/", import.meta.url).href;
const WIDTHS = [200, 400];

const fileUrl = (id, width, extension) => `${BASE}${encodeURIComponent(id)}-${width}.${extension}?v=${PRODUCT_IMAGE_VERSION}`;
const sourceSet = (id, extension) => WIDTHS.map((width) => `${fileUrl(id, width, extension)} ${width}w`).join(", ");

/** Sized for the shop grid unless `sizes` says otherwise. */
export function productPicture(item, { sizes = "(max-width: 820px) 42vw, 170px", eager = false } = {}) {
  return h("picture", { class: "product-picture" },
    h("source", { type: "image/avif", srcset: sourceSet(item.id, "avif"), sizes }),
    h("source", { type: "image/webp", srcset: sourceSet(item.id, "webp"), sizes }),
    h("img", { src: fileUrl(item.id, 200, "webp"), alt: "", width: "200", height: "200", loading: eager ? "eager" : "lazy", decoding: "async" }));
}
