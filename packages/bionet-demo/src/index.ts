/**
 * A lab that shows what Bionet is, and a tour that uses it.
 *
 * Everything a lab does here is spread over several packages and several tools, and a person
 * looking at it for the first time sees one window at a time. This package puts the whole of it in
 * order: a made-up lab, real in every way that matters, and a walk through it that picks a tube up,
 * reads what is on it, and then uses each tool on it in turn.
 *
 * - `molecules.ts` — the molecules the lab holds, made from a number that is written down
 * - `lab.ts` — the lab itself: opened, founded and filled by the same entries a person's app writes
 * - `tour.ts` — the walk, as plain data: where to be, what to say, and what to do there
 * - `lab-at.tsx` — the lab shown at one stop: the one scene a walk, a list of tools and watching an adviser all use
 * - `tour-player.tsx` — the walk, drawn and played
 */
export * from "./molecules.js";
export * from "./lab.js";
export * from "./tour.js";
export * from "./lab-at.js";
export * from "./tour-player.js";
