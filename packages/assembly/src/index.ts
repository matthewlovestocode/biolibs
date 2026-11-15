/**
 * @packageDocumentation
 * Assembly of DNA fragments by shared homology — **2 of 2 items** at parity, verified against pydna
 * 5.5.16 by 1,155 recorded cases.
 *
 * A port of the layer `pydna`'s assembly rests on: given two sequences, where and how far do they agree?
 * Gibson assembly, fusion PCR and homologous recombination all join fragments at such a shared stretch,
 * so this is the measurement every one of them starts from.
 *
 * **There was no Python to read.** Upstream this is a call into `pydivsufsort`, a compiled suffix-array
 * library, so what pydna promises is whatever that library returns. Four thousand random pairs against a
 * brute-force definition established the promise — every *maximal* common stretch of at least `limit`
 * characters, and nothing else — and that is what the cases pin, over one- and two-letter alphabets where
 * the number of stretches is quadratic and the order distinguishes one reading of "maximal" from another.
 *
 * This port then finds them by a different route: every position of `x` is filed under the `limit`
 * characters starting there, and each position of `y` looks its own run up. A pair cannot agree over
 * `limit` characters without agreeing over the first `limit`, so nothing hides from the index.
 *
 * - `substrings.ts` — `commonSubStrings` and `terminalOverlap`, and the `Match` a stretch is reported as.
 *
 * Measured against pydna the same way the other ports are measured: see `docs/parity-pydna/`.
 */

export * from "./substrings.js";
