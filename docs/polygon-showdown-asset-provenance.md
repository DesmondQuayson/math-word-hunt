# Polygon Showdown: where every 3D asset comes from

Status: **DRAFT, local owner review only.** Audited 2026-11-08.

## Result

**All 153 shop items are original project-created assets. Nothing was downloaded, scraped, bought or licensed.** No file in the shop or avatar comes from a third-party model, texture or image source.

| | Source | Rights |
| --- | --- | --- |
| Every garment, shoe, hat, pair of glasses, piece of jewelry, hairstyle, beard and body | Procedural geometry written for this project, in `apps/platform-web/public/internal-games/polygon-showdown/src/avatar/*.js` | Original MathNexa work |
| Fabric prints, face paint, eye texture | Drawn at runtime onto a canvas by code in the same folder (`prints.js`, `face.js`). There are no image files | Original MathNexa work |
| Item names, colours and tiers | `src/engine/catalog.js`. Fictional MathNexa names | Original MathNexa work |
| Display forms (torso, velvet bust, wrist cushion) | `buildFormGeometry` in `src/avatar/body.js` | Original MathNexa work |
| Shop images (`products/*.webp`, `*.avif`) | Rendered by `scripts/render-polygon-showdown-products.mjs` from the assets above | Generated from original work |
| 3D engine | three.js, already vendored for Math Tug of War at `math-tug-of-war/src/vendor/three.js` | MIT licence; code, not art |

There are no logos of any kind. The catalog and the avatar code contain none of the brand names the owner listed (a search for Nike, Adidas, Gucci, Jordan, Louis Vuitton, Roblox and Fortnite across `src/` returns nothing). Marks that appear on products are original: a pentagon badge on rare and legendary sneakers, the letter N on the varsity jacket, polygon motifs on prints.

## One canonical definition

```
catalog entry  ->  figure (model.js) builds its meshes  ->  worn on the avatar
                                                        ->  shown alone in the product view
                                                        ->  photographed for the shop card
```

A shop picture is not a drawing of an item. It is a render of the same meshes, from the same catalog entry, that Try On and Equip use. `lib/games/polygon-showdown/product-images.test.ts` hashes the catalog and the renderer against the hash stored with the images, so the test fails if an item or the renderer changes and the pictures are not re-rendered.

To re-render: `node scripts/render-polygon-showdown-products.mjs`.

## Audit of all 153 items

Categories from the brief: A acceptable 3D-render thumbnail; B 3D asset exists, thumbnail needs re-render; C placeholder that needs a real 3D asset; D asset or provenance problem.

| | State at the start of this pass | Items | After this pass |
| --- | --- | --- | --- |
| A | Real 3D-render thumbnail | 0 | 153 |
| B | 3D asset was fine; the card showed a flat CSS swatch | 141 | 0 |
| C | 3D asset itself was a placeholder: the 12 shoes were closed blobs with no opening, tongue or shaped sole | 12 | 0 (shoe model rebuilt) |
| D | Provenance problem | 0 | 0 |

Six catalog entries are deliberately "nothing" (`hair-bald`, `fh-none`, `lip-none`, `shadow-none`, `blush-none`, `liner-none`). Their render is the bare head they describe.

Also rebuilt or improved so the product view holds up close: trouser seat seam, pearl tessellation, Supernova Halo (crystals and rays added to the 25,000-coin item).

## How a product is photographed

Defined per category in `src/avatar/product.js`. Studio rig, neutral light, transparent PNG at 800 px, encoded with sharp to WebP and AVIF at 200 and 400 px.

| Category | Presentation | Angle |
| --- | --- | --- |
| Tops, jackets, dresses, suits | On a neutral torso form | 3/4 front |
| Bottoms | Hip form inside the waist | 3/4 front |
| Shoes | Pair, with a contact shadow | 3/4 front, raised to show shape and sole |
| Hats | Alone | Raised 3/4 |
| Glasses | Alone | Near-front 3/4 |
| Necklaces | Dark velvet bust | Near-front |
| Watches, bracelets | Velvet wrist form, dial to camera | 3/4 |
| Earrings | Portrait, ear to camera | Side 3/4 |
| Hair, hair colour, facial hair | Portrait | 3/4 |
| Makeup | Close portrait | Near-front |

Each category shares one camera distance (the median of its items), so a beanie and a sun hat are shown at one scale. An item larger than that gets just enough extra room not to be cut off.
