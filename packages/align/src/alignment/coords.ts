/** Small array helpers that mirror the NumPy operations Biopython's `Alignment` applies to its coordinate array. */

/** A 2-D integer array: `rows[i][k]` is the coordinate of sequence `i` at column boundary `k`. */
export type Matrix = number[][];

/** `np.diff(a, 1)` along the last axis, for each row. */
export const diffRows = (a: Matrix): Matrix => a.map((row) => row.slice(1).map((v, k) => v - row[k]!));

/** For each step column, whether more than one sequence moves there (`sum(steps != 0, 0) > 1`). */
export function alignedColumns(steps: Matrix): boolean[] {
  const m = steps[0]?.length ?? 0;
  return Array.from({ length: m }, (_, k) => steps.reduce((n, row) => n + (row[k] !== 0 ? 1 : 0), 0) > 1);
}

/** `row[mask]`. */
export const select = (row: number[], mask: boolean[]): number[] => row.filter((_, k) => mask[k]);

/** `(row >= 0).all()`; true for an empty row. */
export const allNonNegative = (row: number[]): boolean => row.every((v) => v >= 0);
/** `(row <= 0).all()`; true for an empty row. */
export const allNonPositive = (row: number[]): boolean => row.every((v) => v <= 0);

/** The transpose of a matrix (rows become columns). */
export function transpose(a: Matrix): Matrix {
  const m = a[0]?.length ?? 0;
  return Array.from({ length: m }, (_, k) => a.map((row) => row[k]!));
}

/** Column-wise minimum and maximum (`a.min(0)`, `a.max(0)`). */
export function columnMin(a: Matrix): number[] {
  return transpose(a).map((col) => Math.min(...col));
}
/** Column-wise maximum. */
export function columnMax(a: Matrix): number[] {
  return transpose(a).map((col) => Math.max(...col));
}

/** Python's `str(int)` left-padded like `"%9d"`. */
export const pad = (n: number | string, width: number): string => String(n).padStart(width);
