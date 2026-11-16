/**
 * @packageDocumentation
 * `@biolibs/bionet-space`: where things are in a lab.
 *
 * A lab is a tree of places with things stored at the ends of it. This package says what that tree
 * is, gives every place somewhere to stand, and answers the questions a view of a lab asks: what is
 * inside what, where a position in a box is, what a search turns up, where a camera should look.
 *
 * It draws nothing and depends on nothing. It is the contract between whatever knows what a lab
 * holds and whatever shows it, so a 3D scene, a flat grid of a box and a list can all be views of
 * the same data.
 *
 * - `model.ts` — places, what is stored in them, and a place with somewhere to stand
 * - `arrange.ts` — giving every place somewhere to stand, and the positions inside a box
 * - `find.ts` — levels, bounds, camera poses, searching
 * - `example.ts` — a lab to look at
 */
export * from "./model.js";
export * from "./arrange.js";
export * from "./find.js";
export * from "./example.js";
