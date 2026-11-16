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
 * - `shapes.ts` — what an instrument is made of, and where to stand for each view of it in use
 * - `instruments.tsx` — an instrument drawn from its shape
 * - `in-use.tsx` — a machine in use: what is drawn around it, in its own frame, for either host
 * - `stage.tsx` — one instrument in use on a stage of its own, away from any lab
 * - `motion.ts` — whether the scene moves between views, or cuts
 * - `explorer.tsx` — the lab: the scene with the way back, a search, what was picked, and whatever
 *   in it is being worked, since the room and the machine in it are one scene and not two
 *
 * Import `@biolibs/bionet-theme/theme.css` and `@biolibs/bionet-scene/scene.css` once.
 */
export * from "./view.js";
export * from "./scene.js";
export * from "./explorer.js";
export * from "./arranging.js";
export * from "./builder.js";
export * from "./shapes.js";
export * from "./motion.js";
export * from "./instruments.js";
export * from "./molecule.js";
// The shapes a host hands in come from the space package; re-exported so that anything drawing a
// lab needs only this one.
export type { Layout, RecordedLab, Standing } from "@biolibs/bionet-space";
export * from "./in-use.js";
export * from "./stage.js";
