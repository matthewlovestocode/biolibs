/**
 * @packageDocumentation
 * `@biolibs/glossary`: the words of molecular biology, said plainly, with a place for a biologist to
 * sign them off.
 *
 * Sixty terms, from *cell* to *RMSD*. Each has one sentence, one paragraph, a reason anybody needs
 * to know it, and the phrases in running text that mean it. This package is the words and nothing
 * else; `@biolibs/glossary-react` draws a picture for every one of them.
 *
 * - `terms.ts` — the terms, looking one up, and finding them in text
 * - `review.ts` — who has reviewed a term, and whether it has changed since
 */
export * from "./terms.js";
export * from "./review.js";
