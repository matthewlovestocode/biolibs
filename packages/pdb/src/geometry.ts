/** Coordinate transforms and centers of mass with NumPy's dtype rules (float32 stays float32 only if every operand is). */

import { IndexError, ValueError, pyStr } from "@biolibs/core";
import { ZeroDivisionError } from "./pyformat.js";

/** A coordinate array: float32 as the parsers produce, or float64 after mixing with double-precision operands. */
export type Coord = Float32Array | Float64Array;

/** A matrix as rows: `Float32Array` rows are single precision, anything else double. */
export type RotMatrix = ArrayLike<ArrayLike<number>>;

const isF32 = (x: unknown): boolean => x instanceof Float32Array;

/**
 * `np.dot(coord, rot) + tran`: the new coordinates after a right-multiplying rotation and a translation.
 * The result is float32 only if the coordinates, every row of `rot` and `tran` are all float32.
 *
 * @param coord - The three coordinates.
 * @param rot - A 3x3 matrix.
 * @param tran - A translation of length 3 (or 1, which broadcasts).
 * @returns The transformed coordinates.
 * @throws ValueError for shapes NumPy cannot multiply or broadcast, with NumPy's message.
 */
export function transformCoord(coord: Coord, rot: RotMatrix, tran: ArrayLike<number>): Coord {
  const rows = rot.length, cols = rows > 0 ? rot[0]!.length : 0;
  if (rows !== coord.length) throw new ValueError(`shapes (${coord.length},) and (${rows},${cols}) not aligned: ${coord.length} (dim 0) != ${rows} (dim 0)`);
  if (tran.length !== cols && tran.length !== 1) throw new ValueError(`operands could not be broadcast together with shapes (${cols},) (${tran.length},) `);
  const single = isF32(coord) && Array.from(rot as ArrayLike<unknown>).every(isF32) && isF32(tran);
  const out = single ? new Float32Array(cols) : new Float64Array(cols);
  for (let j = 0; j < cols; j++) {
    let s = 0;
    for (let i = 0; i < rows; i++) s = single ? Math.fround(s + Math.fround(coord[i]! * rot[i]![j]!)) : s + coord[i]! * rot[i]![j]!;
    out[j] = single ? Math.fround(s + tran[tran.length === 1 ? 0 : j]!) : s + tran[tran.length === 1 ? 0 : j]!;
  }
  return out;
}

/** Minimal view of an entity for {@link centerOfMass}. */
interface EntityLike { level: string; childList: any[]; length: number; getUnpackedList?: () => any[] }

/**
 * The center of mass (or of geometry) of everything below an entity, as `np.average` over float32 coordinates and masses.
 *
 * @param entity - A structure, model, chain or residue.
 * @param geometric - Weight every atom equally.
 * @returns A float32 array of 3 numbers.
 * @throws ValueError for an entity without children; IndexError ("pop from an empty deque") if no atom is found below it.
 */
export function centerOfMass(entity: EntityLike & { repr?: () => string }, geometric = false): Float32Array {
  if (!entity.length) throw new ValueError(`${pyStr(entity)} does not have children`);
  // The same queue Biopython uses: unpack residues and chains, take children of the rest, until only atoms are left.
  // An atom reached early (a stray child of a disordered wrapper) has no children, which is an AttributeError in Python.
  const queue: any[] = [entity];
  for (;;) {
    const e = queue.shift();
    if (e === undefined) throw new IndexError("pop from an empty deque");
    if (e.level === "R" || e.level === "C") queue.push(...e.getUnpackedList());
    else {
      if (!Array.isArray(e.childList)) throw new TypeError("object has no attribute 'child_list'");
      queue.push(...e.childList);
    }
    if (queue.length > 0 && queue.every((q) => q.level === "A")) break;
  }
  const atoms = queue;
  return averageCoords(atoms.map((a) => a.coord as Coord), geometric ? null : atoms.map((a) => a.mass as number));
}

/**
 * `np.average(np.asarray(coords, dtype=float32), axis=0, weights=...)` in single precision.
 *
 * @param coords - One coordinate triple per atom.
 * @param masses - Weights, or null for the plain mean.
 * @throws ZeroDivisionError when the weights sum to zero.
 */
export function averageCoords(coords: Coord[], masses: number[] | null): Float32Array {
  const f = Math.fround;
  const n = coords.length;
  // Coordinates can have more than 3 components after a transform with a 3xN matrix.
  const dim = coords[0]!.length;
  const out = new Float32Array(dim);
  if (masses === null) {
    for (let j = 0; j < dim; j++) { let s = 0; for (const c of coords) s = f(s + f(c[j]!)); out[j] = f(s / n); }
    return out;
  }
  const w = masses.map(f);
  let scl = 0;
  for (const x of w) scl = f(scl + x);
  if (scl === 0) throw new ZeroDivisionError("Weights sum to zero, can't be normalized");
  for (let j = 0; j < dim; j++) { let s = 0; coords.forEach((c, i) => { s = f(s + f(f(c[j]!) * w[i]!)); }); out[j] = f(s / scl); }
  return out;
}
