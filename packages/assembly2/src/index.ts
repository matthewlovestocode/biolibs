/**
 * @packageDocumentation
 * `@biolibs/assembly2`: the assembly engine of pydna — how fragments of DNA can be joined, and what
 * comes out when they are.
 *
 * Give it some fragments and a rule for where two of them may meet, and it builds a graph: a node for
 * every fragment in each of its two orientations, an edge for every place two of them overlap. A path
 * through that graph is a linear molecule, a cycle is a plasmid, and a cycle that passes through one
 * fragment twice is an insertion into it. The cloning methods — Gibson, In-Fusion, fusion PCR, in-vivo
 * assembly, ligation, Golden Gate, PCR — are the same engine with different rules about where a join is
 * allowed.
 *
 * Every product carries a record of how it was made: which fragments, which way round, and the stretch
 * of each that was shared with its neighbours. That is what makes a cloning plan replayable — the
 * recipe can be sent somewhere else and run again from the parts.
 *
 * **The order of the products is part of the answer**, so this reproduces networkx's graph searches and
 * CPython's set iteration rather than using the host's own. See `pyset.ts` for why.
 *
 * - `algorithms.ts` — where two fragments may join: `commonSubStrings`, `terminalOverlap`,
 *   `gibsonOverlap`, `inFusionOverlap`, `pcrFusionOverlap`, `stickyEndSubStrings`, `bluntOverlap`,
 *   `restrictionLigationOverlap`, `endsFromCutsite`, `combineAlgorithms`
 * - `assembly.ts` — `Assembly`: the graph, and the walks through it
 * - `single.ts` — `SingleFragmentAssembly`: what one fragment can do alone
 * - `pcr.ts` — `PCRAssembly`, `pcrAssembly`, `primerTemplateOverlap`, the zip matches
 * - `methods.ts` — `gibsonAssembly`, `inFusionAssembly`, `fusionPcrAssembly`, `inVivoAssembly`,
 *   `ligationAssembly`, `restrictionLigationAssembly`, `goldenGateAssembly`
 * - `assemble.ts` — turning a walk into a molecule
 * - `insertion.ts` — the shapes an insertion can take
 * - `source.ts` — the provenance a product carries
 * - `primer.ts` — `Primer`, with its footprint and tail
 * - `locations.ts`, `pyutils.ts` — stretches of a molecule, and Python's own small helpers
 * - `graph.ts`, `traverse.ts`, `cycles.ts`, `pyset.ts` — the graph, and the searches, in networkx's order
 *
 * @example
 * ```ts
 * import { Dseqrecord } from "@biolibs/dseqrecord";
 * import { gibsonAssembly } from "@biolibs/assembly2";
 *
 * const products = gibsonAssembly([backbone, insert], 25, true);
 * products[0]?.circular;              // true
 * products[0]?.source?.input.length;  // 2
 * ```
 */

export * from "./pyset.js";
export * from "./graph.js";
export * from "./traverse.js";
export * from "./cycles.js";
export * from "./locations.js";
export * from "./pyutils.js";
export * from "./primer.js";
export * from "./fragment.js";
export * from "./algorithms.js";
export * from "./source.js";
export * from "./assemble.js";
export * from "./insertion.js";
export * from "./assembly.js";
export * from "./single.js";
export * from "./pcr.js";
export * from "./methods.js";
