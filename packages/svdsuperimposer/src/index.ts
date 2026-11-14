/**
 * @packageDocumentation
 * `@biolibs/svdsuperimposer`: a TypeScript port of Biopython's `Bio.SVDSuperimposer` — all **7 items**
 * at parity, verified against Biopython 1.88 by 520 recorded cases.
 *
 * The rotation and translation that put one set of 3D points on another with the least squared distance:
 * the Kabsch algorithm, through a singular value decomposition. No dependencies.
 *
 * **The rotation right-multiplies**, as Biopython's does — `moved = moving · rot + tran` — and
 * `set(reference, coords)` takes the reference *first*, so the second argument is the one that moves.
 * Both are easy to get round the wrong way, and both produce a plausible wrong answer rather than an
 * error.
 *
 * The array type decides the precision: `Float32Array` rows make the computation and every result single
 * precision, as NumPy's `'f'` arrays do.
 *
 * - `svd.ts`: `svd3`, a one-sided Jacobi singular value decomposition of 3x3 matrices, with `det3`,
 *   `matMul` and `transpose`
 * - `svd-superimposer.ts`: `SVDSuperimposer`
 *
 * NumPy calls LAPACK for the decomposition and this does not, so the cases agree to about 1e-8 in double
 * precision rather than bit for bit. For rank-deficient input — one point, or collinear points — the
 * singular vectors belonging to zero singular values are arbitrary in any implementation, so an exactly
 * collinear set is not guaranteed to match.
 *
 * The atom-level wrapper, `Superimposer`, is in `@biolibs/pdb`.
 */

export * from "./svd.js";
export * from "./svd-superimposer.js";
