/**
 * @packageDocumentation
 * `@biolibs/cloning`: molecular cloning in silico — restriction digests and ligation, and Gibson assembly with
 * overlap primer design.
 *
 * Biopython has no counterpart. `Bio.Restriction` says where enzymes cut and will hand back the fragments, but it
 * has nothing about what the fragments' ends are, which of them will ligate, or what the product would be; this
 * package builds on it and supplies the rest. Melting temperatures come from `@biolibs/seqtools` through
 * `@biolibs/pcr`, and features are carried into products by `@biolibs/seqedit`, so nothing is reimplemented here.
 *
 * Positions are 0-based half-open spans, as elsewhere in biolibs. `@biolibs/restriction` reports cuts 1-based, as
 * Biopython does; `cuts.ts` converts in one place.
 *
 * A record is taken to be circular when its `topology` annotation is `"circular"`, which is where GenBank and EMBL
 * put it.
 *
 * - `ends.ts`: `End`, `EndKind`, `endAt`, `compatible`, `flipEnd`, `describeEnd`, `reverseComplement`
 * - `cuts.ts`: `Cut`, `cutsIn`, `lookupEnzymes`, `parseEnzymeNames`, `cutCounts`, `cuttersUpTo`, `Topology`
 * - `pieces.ts`: `Piece`, `piecesOf`, `flipPiece`, `describePiece`
 * - `ligate.ts`: `joinPieces`, `closeCircle`, `canSelfClose`, `religate`, `cloneProducts`, `CloneProduct`
 * - `gibson-types.ts`: `GibsonFragment`, `GibsonOptions`, `GibsonJunction`, `GibsonProduct`, `GibsonResult`,
 *   `overlapLength`, the fragment and overlap limits
 * - `gibson-ring.ts`: `buildRing`, `canonicalCircular`, `orientations`, `Oriented`
 * - `gibson.ts`: `assembleGibson`
 * - `gibson-design.ts`: `designGibson`, `DesignFragment`, `DesignedPrimer`, `GibsonDesign`, `checkTailedPrimer`
 *
 * @example
 * ```ts
 * import { assembleGibson, cloneProducts, designGibson, lookupEnzymes, piecesOf } from "@biolibs/cloning";
 *
 * // Restriction cloning: cut a vector and an insert, and see what circles come out.
 * const result = cloneProducts(pUC19, myGene, ["EcoRI", "BamHI"]);
 * if (result.ok) console.log(result.products[0]!.description);
 *
 * // Or a digest on its own.
 * const { enzymes } = lookupEnzymes(["EcoRI"]);
 * piecesOf(pUC19, enzymes).map((p) => p.length);
 *
 * // Gibson: fragments that already overlap, or primers to create the overlaps.
 * assembleGibson([{ name: "a", residues: a }, { name: "b", residues: b }]);
 * designGibson([{ name: "backbone", residues: backbone, amplify: false }, { name: "insert", residues: insert }]);
 * ```
 */

export * from "./ends.js";
export * from "./cuts.js";
export * from "./pieces.js";
export * from "./ligate.js";
export * from "./gibson-types.js";
export * from "./gibson-ring.js";
export * from "./gibson.js";
export * from "./gibson-design.js";
