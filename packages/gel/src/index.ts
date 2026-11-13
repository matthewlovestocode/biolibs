/**
 * @packageDocumentation
 * `@biolibs/gel`: a virtual agarose gel — where DNA fragments of a given size would run, and which of them a gel
 * would tell apart.
 *
 * There is no Biopython counterpart; this is the data behind the gel photograph that tools such as SnapGene and
 * Benchling draw beside a digest. Migration follows the standard log-linear approximation over the range a gel
 * resolves, described in `bands.ts`. The figures are conventional working values for agarose in TAE, enough to show
 * which fragments would be distinguishable, not measurements of a particular rig.
 *
 * - `gels.ts`: `GelType`, `GELS`, `gelById` — agarose concentrations and their resolving ranges
 * - `ladders.ts`: `Ladder`, `LADDERS`, `ladderById` — size markers
 * - `bands.ts`: `bandPosition`, `resolves`, `Band`, `bandsOf`, `ladderBands` — fragment sizes to visible bands
 * - `fragments.ts`: `Topology`, `fragmentSizes` — cut positions to fragment lengths
 *
 * @example
 * ```ts
 * import { bandsOf, fragmentSizes, gelById } from "@biolibs/gel";
 *
 * const gel = gelById("1.0");
 * const sizes = fragmentSizes(2686, "circular", [395, 1230]); // pUC19 cut twice
 * for (const band of bandsOf(sizes, gel)) {
 *   console.log(`${band.size} bp at ${(band.position * 100).toFixed(0)}% down the gel`);
 * }
 * ```
 */

export * from "./gels.js";
export * from "./ladders.js";
export * from "./bands.js";
export * from "./fragments.js";
