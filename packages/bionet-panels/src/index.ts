/**
 * @packageDocumentation
 * `@biolibs/bionet-panels`: the parts of a Bionet lab application, ready to place.
 *
 * Each panel reads the lab through `@biolibs/bionet-react`, so it goes anywhere inside a
 * `LabProvider`, and takes its colours from `@biolibs/bionet-theme`, so it follows a light or dark
 * theme. `LabWindow` is all of them put together: a whole application in one component.
 *
 * Import `@biolibs/bionet-theme/theme.css` and `@biolibs/bionet-panels/panels.css` once. The panels'
 * styles apply only inside an element with the class `bionet`, which `LabWindow` supplies; put a
 * panel used on its own inside one.
 *
 * - `window.tsx` — `LabWindow`, and the screens before there is a lab
 * - `freezer.tsx` — parts, tubes, amounts
 * - `people.tsx` — the roster, and letting somebody in
 * - `history.tsx` — every signed change, and what became of it
 * - `sharing.tsx` — what other labs are shown, and the lab's web peer
 * - `adviser.tsx` — the adviser a device hosts: letting it in, and the door an agent reaches it by
 * - `parts.tsx` — the small pieces they are made of
 * - `public.tsx` — a lab's public page: what it holds, and what it can see of another lab
 *
 * Everything but `public.tsx` uses hooks and is marked `"use client"`, for frameworks that draw on a
 * server first. The public page's pieces take plain values and can be drawn there.
 */
export * from "./window.js";
export * from "./freezer.js";
export * from "./places.js";
export * from "./backup.js";
export * from "./people.js";
export * from "./adviser.js";
export * from "./history.js";
export * from "./sharing.js";
export * from "./parts.js";
export * from "./public.js";
