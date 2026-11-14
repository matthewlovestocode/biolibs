/**
 * `Array.__array_ufunc__`: what Biopython does when a NumPy ufunc is applied to a substitution matrix.
 *
 * The method itself is bookkeeping around NumPy. It unwraps every `Array` among the inputs — refusing the
 * call when one of them carries a different alphabet — hands the plain arrays to NumPy, and then puts the
 * alphabet back on whatever comes out, except for a result that is a bare number and except when the
 * caller supplied `out`, which is returned as it stands. `method="at"` answers with nothing at all, and a
 * ufunc with two outputs, such as `divmod`, answers with both.
 *
 * NumPy itself is not ported; what is here is the element-wise evaluation, with the broadcasting a one- or
 * two-dimensional matrix can need, for the ufuncs listed in {@link UFUNCS}. Comparison ufuncs are left out
 * because their result is an array of booleans, which this class has no element type for, and so is a
 * result whose shape is neither the alphabet's length nor its square: Biopython can hold one, because a
 * NumPy view keeps whatever shape it is given, while {@link SubstitutionArray} checks its shape against
 * its alphabet.
 */

import { SubstitutionArray } from "./array.js";
import { IndexError, ValueError } from "./py-errors.js";

/** How a ufunc's elements are combined, and what it does to an integer array's element type. */
interface Ufunc {
  /** The element-wise operation. */
  fn: (...args: number[]) => number[];
  /** How many arguments it takes. */
  nin: number;
  /** How many results it produces. */
  nout: number;
  /** Whether integer inputs give an integer result, as NumPy's type rules have it. */
  keepsInt: boolean;
}

/**
 * The ufuncs this port implements.
 *
 * `divmod` is here because it is the one with two outputs, which is a path of its own through the method.
 */
export const UFUNCS: Record<string, Ufunc> = {
  add: { fn: (a, b) => [a! + b!], nin: 2, nout: 1, keepsInt: true },
  subtract: { fn: (a, b) => [a! - b!], nin: 2, nout: 1, keepsInt: true },
  multiply: { fn: (a, b) => [a! * b!], nin: 2, nout: 1, keepsInt: true },
  true_divide: { fn: (a, b) => [a! / b!], nin: 2, nout: 1, keepsInt: false },
  // Python's own floor division and remainder: the quotient rounds towards minus infinity and the
  // remainder takes the divisor's sign, which is not what C does.
  floor_divide: { fn: (a, b) => [Math.floor(a! / b!)], nin: 2, nout: 1, keepsInt: true },
  remainder: { fn: (a, b) => [a! - Math.floor(a! / b!) * b!], nin: 2, nout: 1, keepsInt: true },
  maximum: { fn: (a, b) => [Math.max(a!, b!)], nin: 2, nout: 1, keepsInt: true },
  minimum: { fn: (a, b) => [Math.min(a!, b!)], nin: 2, nout: 1, keepsInt: true },
  exp: { fn: (a) => [Math.exp(a!)], nin: 1, nout: 1, keepsInt: false },
  log: { fn: (a) => [Math.log(a!)], nin: 1, nout: 1, keepsInt: false },
  sqrt: { fn: (a) => [Math.sqrt(a!)], nin: 1, nout: 1, keepsInt: false },
  negative: { fn: (a) => [-a!], nin: 1, nout: 1, keepsInt: true },
  absolute: { fn: (a) => [Math.abs(a!)], nin: 1, nout: 1, keepsInt: true },
  divmod: { fn: (a, b) => [Math.floor(a! / b!), a! - Math.floor(a! / b!) * b!], nin: 2, nout: 2, keepsInt: true },
};

/** Which of a ufunc's forms is being called, as NumPy names them. */
export type UfuncMethod = "__call__" | "reduce" | "accumulate" | "outer" | "at";

/**
 * What a ufunc may be given: a matrix, a number, or numbers in one or two dimensions.
 *
 * A `number` stands for a Python `float` and a `bigint` for a Python `int`, because NumPy decides the
 * result's element type from the operand's type and not from its value: an integer matrix plus `2` keeps
 * integers, while the same matrix plus `2.0` gives floats, and JavaScript cannot tell those two apart.
 */
export type UfuncInput = SubstitutionArray | number | bigint | number[] | number[][];

/** What a ufunc answers with: a matrix, a bare number, both results of a two-output ufunc, or nothing. */
export type UfuncResult = SubstitutionArray | number | (SubstitutionArray | number)[] | undefined;

/** An input reduced to a shape and its values, which is what the element-wise evaluation works on. */
interface Operand {
  /** `[]` for a scalar, `[n]` or `[rows, cols]` otherwise. */
  shape: number[];
  /** The values, row-major. */
  data: Float64Array;
  /** Whether it was an integer matrix; a plain number counts as integral when it has no fraction. */
  isInt: boolean;
}

/**
 * Reduce one input to shape and values.
 *
 * @param x - The input. @param alphabet - The alphabet every matrix input has to agree with.
 * @returns Its shape, values and element type.
 * @throws {@link ValueError} when a matrix's alphabet is not the expected one.
 */
function operand(x: UfuncInput, alphabet: string): Operand {
  if (x instanceof SubstitutionArray) {
    if (alphabetKey(x.alphabet) !== alphabet) throw new ValueError("alphabets are inconsistent");
    return { shape: [...x.shape], data: x.data, isInt: x.dtype === "int" };
  }
  // A `number` is Python's float, a `bigint` its int; see {@link UfuncInput}.
  if (typeof x === "number") return { shape: [], data: Float64Array.of(x), isInt: false };
  if (typeof x === "bigint") return { shape: [], data: Float64Array.of(Number(x)), isInt: true };
  if (Array.isArray(x) && Array.isArray(x[0])) {
    const rows = x as number[][];
    const flat = new Float64Array(rows.length * rows[0]!.length);
    rows.forEach((row, i) => row.forEach((v, j) => { flat[i * rows[0]!.length + j] = v; }));
    return { shape: [rows.length, rows[0]!.length], data: flat, isInt: rows.every((r) => r.every(Number.isInteger)) };
  }
  const flat = Float64Array.from(x as number[]);
  return { shape: [flat.length], data: flat, isInt: (x as number[]).every(Number.isInteger) };
}

/**
 * The alphabet in a form two of them can be compared in, since Biopython compares a string with a tuple
 * by value.
 *
 * @param alphabet - A matrix's alphabet.
 * @returns Text that is equal exactly when the alphabets are.
 */
const alphabetKey = (alphabet: string | string[]): string =>
  typeof alphabet === "string" ? alphabet : `(${alphabet.join("\u0000")})`;

/**
 * The shape an element-wise call produces, by NumPy's broadcasting rules.
 *
 * @param shapes - The inputs' shapes.
 * @returns The result's shape.
 * @throws {@link ValueError} when the shapes cannot be broadcast together.
 */
function broadcast(shapes: number[][]): number[] {
  const rank = Math.max(...shapes.map((s) => s.length));
  const out: number[] = [];
  for (let axis = 0; axis < rank; axis++) {
    let size = 1;
    for (const shape of shapes) {
      // Shapes line up from the right, and a missing axis counts as one.
      const padded = axis - (rank - shape.length);
      const dim = padded < 0 ? 1 : shape[padded]!;
      if (dim !== 1 && size !== 1 && dim !== size) {
        throw new ValueError(`operands could not be broadcast together with shapes ${shapes.map((s) => `(${s.join(",")})`).join(" ")}`);
      }
      if (dim !== 1) size = dim;
    }
    out.push(size);
  }
  return out;
}

/**
 * One operand's element for a position in the result.
 *
 * @param op - The operand. @param index - The position, one coordinate per axis of the result.
 * @returns The value, with any axis of length one repeated.
 */
function at(op: Operand, index: number[]): number {
  if (op.shape.length === 0) return op.data[0]!;
  const offset = index.length - op.shape.length;
  let flat = 0;
  for (let axis = 0; axis < op.shape.length; axis++) {
    const dim = op.shape[axis]!;
    flat = flat * dim + (dim === 1 ? 0 : index[axis + offset]!);
  }
  return op.data[flat]!;
}

/** The positions of an array of this shape, in row-major order. */
function* positions(shape: number[]): Generator<number[]> {
  if (shape.length === 0) { yield []; return; }
  if (shape.length === 1) { for (let i = 0; i < shape[0]!; i++) yield [i]; return; }
  for (let i = 0; i < shape[0]!; i++) for (let j = 0; j < shape[1]!; j++) yield [i, j];
}

/**
 * Evaluate one ufunc element by element over its inputs.
 *
 * @param ufunc - The operation. @param ops - Its operands.
 * @returns One shape and one set of values per output.
 */
function elementwise(ufunc: Ufunc, ops: Operand[]): { shape: number[]; data: Float64Array; isInt: boolean }[] {
  const shape = broadcast(ops.map((op) => op.shape));
  const size = shape.reduce((a, b) => a * b, 1);
  const outs = Array.from({ length: ufunc.nout }, () => new Float64Array(size));
  let flat = 0;
  for (const index of positions(shape)) {
    const values = ufunc.fn(...ops.map((op) => at(op, index)));
    for (let k = 0; k < ufunc.nout; k++) outs[k]![flat] = values[k]!;
    flat += 1;
  }
  // NumPy keeps integers only when every operand was integral and the operation cannot produce a fraction.
  const isInt = ufunc.keepsInt && ops.every((op) => op.isInt);
  return outs.map((data) => ({ shape, data, isInt }));
}

/**
 * Fold a ufunc along an axis (`reduce`), or along it keeping every partial result (`accumulate`).
 *
 * @param ufunc - The operation. @param op - The operand. @param axis - Which axis.
 * @param running - Whether to keep the partial results.
 * @returns The shape and values of the result.
 */
function fold(ufunc: Ufunc, op: Operand, axis: number, running: boolean): { shape: number[]; data: Float64Array; isInt: boolean } {
  if (ufunc.nin !== 2 || ufunc.nout !== 1) throw new ValueError(`reduction is not defined for this ufunc`);
  if (op.shape.length === 1) {
    const n = op.shape[0]!;
    if (running) {
      const data = new Float64Array(n);
      let acc = op.data[0]!;
      data[0] = acc;
      for (let i = 1; i < n; i++) { acc = ufunc.fn(acc, op.data[i]!)[0]!; data[i] = acc; }
      return { shape: [n], data, isInt: ufunc.keepsInt && op.isInt };
    }
    let acc = op.data[0]!;
    for (let i = 1; i < n; i++) acc = ufunc.fn(acc, op.data[i]!)[0]!;
    // A reduction over the whole of a one-dimensional array leaves no axes at all.
    return { shape: [], data: Float64Array.of(acc), isInt: ufunc.keepsInt && op.isInt };
  }
  const [rows, cols] = [op.shape[0]!, op.shape[1]!];
  const get = (i: number, j: number): number => op.data[i * cols + j]!;
  if (running) {
    const data = new Float64Array(rows * cols);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const prev = axis === 0 ? (i === 0 ? null : data[(i - 1) * cols + j]!) : (j === 0 ? null : data[i * cols + j - 1]!);
        data[i * cols + j] = prev === null ? get(i, j) : ufunc.fn(prev, get(i, j))[0]!;
      }
    }
    return { shape: [rows, cols], data, isInt: ufunc.keepsInt && op.isInt };
  }
  const n = axis === 0 ? cols : rows;
  const along = axis === 0 ? rows : cols;
  const data = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let acc = axis === 0 ? get(0, k) : get(k, 0);
    for (let i = 1; i < along; i++) acc = ufunc.fn(acc, axis === 0 ? get(i, k) : get(k, i))[0]!;
    data[k] = acc;
  }
  return { shape: [n], data, isInt: ufunc.keepsInt && op.isInt };
}

/**
 * `ufunc.outer`: every pairing of two one-dimensional operands.
 *
 * @param ufunc - The operation. @param a - The first operand. @param b - The second.
 * @returns The two-dimensional result.
 */
function outer(ufunc: Ufunc, a: Operand, b: Operand): { shape: number[]; data: Float64Array; isInt: boolean } {
  const rows = a.shape.length === 0 ? 1 : a.shape[0]!;
  const cols = b.shape.length === 0 ? 1 : b.shape[0]!;
  const data = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) data[i * cols + j] = ufunc.fn(a.data[i]!, b.data[j]!)[0]!;
  }
  return { shape: [rows, cols], data, isInt: ufunc.keepsInt && a.isInt && b.isInt };
}

/**
 * `Array.__array_ufunc__`: apply a ufunc to a substitution matrix.
 *
 * @param self - The matrix NumPy dispatched to, whose alphabet every other matrix must share and whose
 *   alphabet the results are given.
 * @param name - The ufunc, which has to be one of {@link UFUNCS}.
 * @param method - Which of the ufunc's forms is wanted.
 * @param inputs - Its arguments. For `at`, these are the matrix, the indices and the values.
 * @param options - `out` for matrices to write the results into, and `axis` for `reduce` and
 *   `accumulate` (default 0, as NumPy's is).
 * @returns The result: a matrix, a bare number where the result has no axes left, a list for a ufunc with
 *   two outputs, the `out` matrices where they were given, or nothing at all for `at`.
 * @throws {@link ValueError} when a matrix's alphabet differs from `self`'s, when the shapes cannot be
 *   broadcast, or when the ufunc is not one this port implements.
 */
export function arrayUfunc(self: SubstitutionArray, name: string, method: UfuncMethod, inputs: UfuncInput[],
  options: { out?: (SubstitutionArray | null)[] | null; axis?: number; indices?: number[] } = {}): UfuncResult {
  const ufunc = UFUNCS[name];
  if (ufunc === undefined) throw new ValueError(`ufunc '${name}' is not implemented`);
  const alphabet = alphabetKey(self.alphabet);
  const ops = inputs.map((x) => operand(x, alphabet));
  // `out` is checked for its alphabet in the same way, and then returned to the caller as it stands.
  const outputs = options.out ?? null;
  if (outputs !== null) {
    for (const o of outputs) if (o !== null && alphabetKey(o.alphabet) !== alphabet) throw new ValueError("alphabets are inconsistent");
  }
  const axis = options.axis ?? 0;

  let results: { shape: number[]; data: Float64Array; isInt: boolean }[];
  if (method === "at") {
    // Unbuffered, in place: NumPy writes through the view it was handed, and the method answers with None.
    const target = inputs[0];
    if (!(target instanceof SubstitutionArray)) throw new ValueError("at requires an array");
    const indices = options.indices ?? [];
    const values = ops.length > 1 ? ops[ops.length - 1]! : null;
    // The indices address the first axis, so on a two-dimensional matrix each one names a whole row.
    const rows = target.shape[0]!;
    const rowSize = target.shape.length === 1 ? 1 : target.shape[1]!;
    indices.forEach((i, k) => {
      if (i < 0 || i >= rows) throw new IndexError(`index ${i} is out of bounds for axis 0 with size ${rows}`);
      const second = values === null ? 0 : (values.shape.length === 0 ? values.data[0]! : values.data[k]!);
      for (let j = 0; j < rowSize; j++) {
        const offset = i * rowSize + j;
        target.data[offset] = ufunc.fn(target.data[offset]!, second)[0]!;
      }
    });
    return undefined;
  }
  if (method === "reduce") results = [fold(ufunc, ops[0]!, axis, false)];
  else if (method === "accumulate") results = [fold(ufunc, ops[0]!, axis, true)];
  else if (method === "outer") results = [outer(ufunc, ops[0]!, ops[1]!)];
  else results = elementwise(ufunc, ops);

  return wrap(self, results, outputs);
}

/**
 * Put the alphabet back on the results, as the tail of Biopython's method does.
 *
 * @param self - The matrix the ufunc was dispatched to. @param results - What the ufunc produced.
 * @param outputs - The `out` matrices, or null.
 * @returns The one result, or the list of them.
 */
function wrap(self: SubstitutionArray, results: { shape: number[]; data: Float64Array; isInt: boolean }[],
  outputs: (SubstitutionArray | null)[] | null): UfuncResult {
  const out: (SubstitutionArray | number)[] = results.map((result, k) => {
    // A result with no axes left stays a bare number, and never becomes a matrix.
    if (result.shape.length === 0) return result.data[0]!;
    const given = outputs === null ? null : outputs[k] ?? null;
    if (given !== null) {
      given.data.set(result.data);
      return given;
    }
    const n = self.alphabet.length;
    const fits = result.shape.every((dim) => dim === n);
    if (!fits) {
      throw new ValueError(`a result of shape (${result.shape.join(", ")}) cannot be held by an array over an alphabet of ${n}`);
    }
    const made = new SubstitutionArray({
      alphabet: self.alphabet,
      dims: result.shape.length,
      dtype: result.isInt ? "int" : "float",
    });
    // The integer element type truncates towards zero, -0 is stored as 0, and a division by zero gives
    // zero rather than an infinity or a NaN, which is what NumPy's integer division does.
    made.data.set(result.isInt ? result.data.map((v) => (Number.isFinite(v) ? Math.trunc(v) + 0 : 0)) : result.data);
    return made;
  });
  return out.length === 1 ? out[0]! : out;
}
