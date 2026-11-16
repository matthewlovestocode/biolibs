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
 * - `run.ts` — a PCR as a lab does one: which tubes, and what to record
 * - `pcr-tool.tsx` — the PCR tool, and the tool an instrument opens
 *
 * The tools are drawn with the styles of `@biolibs/bionet-panels` and belong inside its `LabWindow`.
 * Import `@biolibs/bionet-tools/tools.css` once.
 */
export * from "./pcr.js";
export * from "./run.js";
export * from "./pcr-tool.js";
