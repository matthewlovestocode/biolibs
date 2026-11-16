/**
 * @packageDocumentation
 * `@biolibs/glossary-react`: a picture for every term in `@biolibs/glossary`.
 *
 * A definition alone asks a reader to build the picture themselves. Here every term has one, and
 * nothing shows a term's words without it. Wherever a picture shows something the engines can work
 * out — a complement, a cut, where a band runs — it is worked out by them as it is drawn, so a
 * picture cannot disagree with the code.
 *
 * - `diagrams.tsx`, `basics.tsx`, `more.tsx` — the pictures; `TermDiagram` picks one by slug
 * - `primitives.tsx` — what they are drawn with
 * - `term.tsx` — a term in running text, a card, and the sheet a biologist reviews
 *
 * Import `@biolibs/glossary-react/glossary.css` once.
 */
export * from "./primitives.js";
export * from "./basics.js";
export * from "./more.js";
export * from "./diagrams.js";
export * from "./term.js";
