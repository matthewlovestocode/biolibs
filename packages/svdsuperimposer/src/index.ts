/**
 * @packageDocumentation
 * `@biolibs/svdsuperimposer`: a TypeScript port of Biopython's `Bio.SVDSuperimposer`, the least-squares superposition of
 * two sets of 3D points by singular value decomposition.
 *
 * - `svd.ts`: `svd3`, a one-sided Jacobi singular value decomposition of 3x3 matrices, and small matrix helpers
 * - `svd-superimposer.ts`: `SVDSuperimposer`
 */

export * from "./svd.js";
export * from "./svd-superimposer.js";
