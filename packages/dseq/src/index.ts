/**
 * @packageDocumentation
 * `pydna.dseq`: double-stranded DNA whose ends are part of the molecule.
 *
 * This is the first slice of a port of [pydna](https://github.com/BjornFJohansson/pydna), measured against
 * it the way the Biopython packages are measured against Biopython: see `docs/parity-pydna/`.
 *
 * - `data/dscode.ts` — pydna's alphabet, generated from it by `reference/gen_pydna_data.py`.
 * - `alphabet.ts` — reading the strands and the overhangs off a dscode string.
 * - `dseq.ts` — `Dseq` itself: construction, geometry, printing, ligation and circularity.
 */

export * from "./alphabet.js";
export * from "./dseq.js";
export * as dscode from "./data/dscode.js";
