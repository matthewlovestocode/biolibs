/**
 * @packageDocumentation
 * `@biolibs/bionet-scene`: a lab in three dimensions.
 *
 * The same lab is drawn from four distances — the whole lab, one freezer, one box, one tube — and
 * pressing something moves to the next. It is drawn as edges in the Bionet theme: glowing on black,
 * or plainly on a pale ground.
 *
 * - `view.ts` — what to draw at each distance, as plain data, with nothing drawn
 * - `scene.tsx` — that list, drawn with three.js
 * - `arranging.ts` — a room being arranged by hand, as plain data
 * - `builder.tsx` — dragging, turning and resizing what stands in a room
 * - `explorer.tsx` — the scene with the way back, a search, and what was picked
 *
 * Import `@biolibs/bionet-theme/theme.css` and `@biolibs/bionet-scene/scene.css` once.
 */
export * from "./view.js";
export * from "./scene.js";
export * from "./explorer.js";
export * from "./arranging.js";
export * from "./builder.js";
