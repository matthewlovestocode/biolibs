/**
 * @packageDocumentation
 * `@biolibs/restriction`: a TypeScript port of Biopython's `Bio.Restriction` — all **491 items** at
 * parity, verified against Biopython 1.88 by 5,387 recorded cases, 1,088 of which dump one enzyme each.
 *
 * All 1,088 REBASE enzymes Biopython ships are generated into the package, so there is no network and no
 * data file to find.
 *
 * **An enzyme here is an object, not a class.** Biopython builds one class per enzyme out of mixins
 * (`Palindromic`, `OneCut`, `Ov5`, `Defined`, …), so `issubclass(EcoRI, Blunt)` is how it asks what kind
 * an enzyme is; here each enzyme is a {@link RestrictionType} instance that knows its mixins, and the
 * question is `EcoRI.isA("Blunt")`.
 *
 * - `restriction-dictionary.ts`: the REBASE data (generated from `Bio.Restriction.Restriction_Dictionary`)
 * - `formatted-seq.ts`: `FormattedSeq` — a sequence with its topology attached, which is what the
 *   enzymes actually search, so that a circular search can wrap past the origin
 * - `restriction-type.ts`: `RestrictionType`, one enzyme: its site, where it cuts, what it leaves, and
 *   the comparisons that do not mean what their symbols suggest (`ne` compares *cuts*, so it is not the
 *   negation of equality)
 * - `batch.ts`: `RestrictionBatch`, several enzymes at once
 * - `print-format.ts`, `analysis.ts`: `PrintFormat` and `Analysis` — eighteen selectors over a digest and
 *   the three text layouts, map included
 * - `enzymes.ts`: `enzymes`, `AllEnzymes`, `CommOnly` (623), `NonComm` (465)
 * - `registry.ts`: the late binding between enzymes and batches, which keeps the two from importing one
 *   another
 *
 * Cut positions are 1-based and name the base *after* the cut. A linear search drops cuts that fall off
 * the end; a circular one wraps them.
 */

export * from "./restriction-dictionary.js";
export * from "./formatted-seq.js";
export * from "./restriction-type.js";
export * from "./batch.js";
export * from "./print-format.js";
export * from "./analysis.js";
export * from "./enzymes.js";
