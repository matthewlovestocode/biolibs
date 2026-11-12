/**
 * @packageDocumentation
 * `Bio.Align.substitution_matrices`: scoring matrices (BLOSUM, PAM, nucleotide matrices, ...) as letter-indexed arrays.
 *
 * - `matrix-files.ts`: the 30 bundled matrix files (generated from Biopython)
 * - `array.ts`: `SubstitutionArray`
 * - `read.ts`: `readMatrix`, `loadMatrix`, `loadNames`
 * - `percent.ts`, `py-errors.ts`: Python `%` formatting and error helpers
 */

export * from "./array.js";
export * from "./read.js";
export { MATRIX_NAMES } from "./matrix-files.js";
