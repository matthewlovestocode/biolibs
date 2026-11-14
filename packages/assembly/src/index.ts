/**
 * @packageDocumentation
 * Assembly of DNA fragments by shared homology.
 *
 * A port of the layer `pydna`'s assembly rests on: given two sequences, where and how far do they agree?
 * Gibson assembly, fusion PCR and homologous recombination all join fragments at such a shared stretch, so
 * this is the measurement every one of them starts from.
 *
 * - `substrings.ts` — `commonSubStrings` and `terminalOverlap`, and the `Match` a stretch is reported as.
 *
 * Measured against pydna the same way the other ports are measured: see `docs/parity-pydna/`.
 */

export * from "./substrings.js";
