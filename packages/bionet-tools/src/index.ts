/**
 * @packageDocumentation
 * `@biolibs/bionet-tools`: the tools a lab uses at the bench, tied to its freezer.
 *
 * A tool here works on the tubes a lab holds and records what was done with them. Running a PCR is
 * choosing a template and two primers from the freezer, seeing what they would make, and recording
 * the run: the template and primers drop by what was used, and the product is a new tube that knows
 * which run made it.
 *
 * - `pcr.ts` — what a PCR would make, worked out from sequences alone
 * - `pcr-scene.ts` — a PCR as met at the machine: the programme it shows, the checks, and what is in the tube
 * - `digest.ts` — where enzymes cut, the pieces, and the gel they would give
 * - `run.ts` — a PCR as a lab does one: which tubes, and what to record
 * - `pcr-tool.tsx`, `digest-tool.tsx` — the tools
 * - `pcr-bench.tsx` — a PCR at the machine: what is beside the scene, and what the scene is told to show
 * - `tools.tsx` — getting to one: from an instrument, or from a list of them all
 *
 * The tools are drawn with the styles of `@biolibs/bionet-panels` and belong inside its `LabWindow`.
 * Import `@biolibs/bionet-tools/tools.css` once.
 */
export * from "./pcr.js";
export * from "./pcr-scene.js";
export * from "./digest.js";
export * from "./run.js";
export * from "./pcr-tool.js";
export * from "./digest-tool.js";
export * from "./tools.js";
export * from "./pcr-bench.js";
