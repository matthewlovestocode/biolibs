/**
 * @packageDocumentation
 * `@biolibs/pcr`: PCR in silico — primer quality, where a primer binds, what a pair amplifies, and primer design.
 *
 * Biopython has no counterpart; the usual Python answer is `primer3-py`, a wrapper round a C library. Melting
 * temperatures here are not reimplemented either: they come from `@biolibs/seqtools`, which is Biopython's
 * `MeltingTemp` ported in full, so every nearest-neighbour table and salt correction it offers is available through
 * {@link Conditions}.
 *
 * Positions are 0-based half-open spans, as elsewhere in biolibs.
 *
 * - `primer.ts`: `cleanPrimer`, `isPrimer`, `primerProblem`, `requirePrimer`, `primerTm`, `gcFractionOf`,
 *   `reverseComplement`, `Conditions`, `DEFAULT_CONDITIONS`, the length limits
 * - `check.ts`: `PrimerReport`, `checkPrimer`, `longestRun`, `selfComplementarity`, `tmDifference`,
 *   `PrimerLimits`, `PRIMER_LIMITS`
 * - `binding.ts`: `BindingSite`, `BindingOptions`, `findBindingSites`, `Topology`, `Strand`
 * - `products.ts`: `NamedPrimer`, `Product`, `predictProducts`, `productSequence`, `productWithTails`
 * - `design.ts`: `PrimerPair`, `DesignOptions`, `designPrimers`, `primerCandidates`, `bestCandidate`, `withTail`
 *
 * @example
 * ```ts
 * import { checkPrimer, designPrimers, predictProducts } from "@biolibs/pcr";
 *
 * // Design a pair to amplify bases 100 to 600 of a template.
 * const pair = designPrimers(template, 100, 600);
 * pair?.forward.warnings;  // [] if it looks fine
 *
 * // Check where they bind and what they would make.
 * const products = predictProducts(template, "circular", [
 *   { name: "F", sequence: pair!.forward.sequence },
 *   { name: "R", sequence: pair!.reverse.sequence },
 * ]);
 * products[0]?.length; // 500
 *
 * // Or check a primer somebody else ordered.
 * checkPrimer("GTAAAACGACGGCCAGT").tm;
 * ```
 */

export * from "./primer.js";
export * from "./check.js";
export * from "./binding.js";
export * from "./products.js";
export * from "./design.js";
