/**
 * The handful of BLAS and LAPACK routines L-BFGS-B calls, written out as the reference implementations.
 *
 * Fortran's column-major order is kept throughout, so a matrix is a flat array and element (i, j) of an
 * array with leading dimension `lda` is at `i + lda * j`. The arithmetic follows netlib's own loop order,
 * because a different summation order would move the last bits of every result and, through the line
 * search's comparisons, could take the iteration down a different path.
 */

/**
 * `y := y + alpha * x` over the first `n` elements (BLAS `daxpy`).
 *
 * @param n - How many elements. @param alpha - The multiplier. @param x - The source.
 * @param xOff - Where `x` starts. @param y - The destination. @param yOff - Where `y` starts.
 */
export function daxpy(n: number, alpha: number, x: Float64Array, xOff: number, y: Float64Array, yOff: number): void {
  if (n <= 0 || alpha === 0) return;
  for (let i = 0; i < n; i++) y[yOff + i] = y[yOff + i]! + alpha * x[xOff + i]!;
}

/**
 * `y := x` over the first `n` elements (BLAS `dcopy`).
 *
 * @param n - How many elements. @param x - The source. @param xOff - Where `x` starts.
 * @param y - The destination. @param yOff - Where `y` starts.
 */
export function dcopy(n: number, x: Float64Array, xOff: number, y: Float64Array, yOff: number): void {
  for (let i = 0; i < n; i++) y[yOff + i] = x[xOff + i]!;
}

/**
 * The dot product of two vectors (BLAS `ddot`).
 *
 * @param n - How many elements. @param x - One vector. @param xOff - Where it starts.
 * @param y - The other. @param yOff - Where it starts.
 * @returns Their dot product, summed in index order.
 */
export function ddot(n: number, x: Float64Array, xOff: number, y: Float64Array, yOff: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += x[xOff + i]! * y[yOff + i]!;
  return sum;
}

/**
 * `x := alpha * x` over the first `n` elements (BLAS `dscal`).
 *
 * @param n - How many elements. @param alpha - The multiplier. @param x - The vector.
 * @param xOff - Where it starts.
 */
export function dscal(n: number, alpha: number, x: Float64Array, xOff: number): void {
  for (let i = 0; i < n; i++) x[xOff + i] = alpha * x[xOff + i]!;
}

/**
 * The Euclidean norm of a vector (BLAS `dnrm2`), in the form LAPACK 3.10 introduced: elements are sorted
 * into three accumulators by size so that nothing overflows or vanishes, which for ordinary data leaves a
 * plain sum of squares in index order.
 *
 * @param n - How many elements. @param x - The vector. @param xOff - Where it starts.
 * @returns Its 2-norm.
 */
export function dnrm2(n: number, x: Float64Array, xOff: number): number {
  if (n <= 0) return 0;
  // 2**-511, 2**486, 2**537 and 2**-538: the thresholds and scale factors for IEEE doubles.
  const tsml = 2 ** -511, tbig = 2 ** 486, ssml = 2 ** 537, sbig = 2 ** -538;
  let notbig = true, asml = 0, amed = 0, abig = 0;
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(x[xOff + i]!);
    if (ax > tbig) {
      abig += (ax * sbig) ** 2;
      notbig = false;
    } else if (ax < tsml) {
      if (notbig) asml += (ax * ssml) ** 2;
    } else {
      amed += ax ** 2;
    }
  }
  let scl: number, sumsq: number;
  if (abig > 0) {
    // Mixing in the medium-sized elements, if there are any, would overflow without the scaling.
    if (amed > 0 || Number.isNaN(amed)) abig += (amed * sbig) * sbig;
    scl = 1 / sbig;
    sumsq = abig;
  } else if (asml > 0) {
    if (amed > 0 || Number.isNaN(amed)) {
      const sqrtAmed = Math.sqrt(amed);
      const sqrtAsml = Math.sqrt(asml) / ssml;
      const ymin = sqrtAsml > sqrtAmed ? sqrtAmed : sqrtAsml;
      const ymax = sqrtAsml > sqrtAmed ? sqrtAsml : sqrtAmed;
      scl = 1;
      sumsq = ymax ** 2 * (1 + (ymin / ymax) ** 2);
    } else {
      scl = 1 / ssml;
      sumsq = asml;
    }
  } else {
    scl = 1;
    sumsq = amed;
  }
  return scl * Math.sqrt(sumsq);
}

/**
 * The Cholesky factorization of a symmetric positive definite matrix (LAPACK `dpotrf` with `uplo = "U"`),
 * in the unblocked right-looking form `dpotrf2` takes for a matrix this small.
 *
 * @param n - The matrix's order. @param a - Its elements, column-major. @param aOff - Where it starts.
 * @param lda - Its leading dimension.
 * @returns 0 on success, or the one-based index of the leading minor that is not positive definite.
 */
export function dpotrf(n: number, a: Float64Array, aOff: number, lda: number): number {
  for (let j = 0; j < n; j++) {
    // The diagonal: a(j,j) - u(:,j)'u(:,j), then its square root.
    let ajj = a[aOff + j + lda * j]!;
    for (let k = 0; k < j; k++) ajj -= a[aOff + k + lda * j]! * a[aOff + k + lda * j]!;
    if (!(ajj > 0) || Number.isNaN(ajj)) {
      a[aOff + j + lda * j] = ajj;
      return j + 1;
    }
    ajj = Math.sqrt(ajj);
    a[aOff + j + lda * j] = ajj;
    // The rest of the row: (a(j,i) - u(:,j)'u(:,i)) / a(j,j).
    for (let i = j + 1; i < n; i++) {
      let v = a[aOff + j + lda * i]!;
      for (let k = 0; k < j; k++) v -= a[aOff + k + lda * j]! * a[aOff + k + lda * i]!;
      a[aOff + j + lda * i] = v / ajj;
    }
  }
  return 0;
}

/**
 * One triangular solve with a single right-hand side (LAPACK `dtrtrs`, which for one column is BLAS
 * `dtrsv`), always with an upper triangular matrix and a non-unit diagonal.
 *
 * @param transpose - Solve with the matrix transposed.
 * @param n - The matrix's order. @param a - Its elements, column-major. @param aOff - Where it starts.
 * @param lda - Its leading dimension. @param b - The right-hand side, overwritten with the solution.
 * @param bOff - Where it starts.
 * @returns 0 on success, or the one-based index of a zero on the diagonal.
 */
export function dtrtrsUpper(transpose: boolean, n: number, a: Float64Array, aOff: number, lda: number,
  b: Float64Array, bOff: number): number {
  for (let i = 0; i < n; i++) if (a[aOff + i + lda * i] === 0) return i + 1;
  if (transpose) {
    for (let i = 0; i < n; i++) {
      let temp = b[bOff + i]!;
      for (let k = 0; k < i; k++) temp -= a[aOff + k + lda * i]! * b[bOff + k]!;
      b[bOff + i] = temp / a[aOff + i + lda * i]!;
    }
  } else {
    for (let k = n - 1; k >= 0; k--) {
      b[bOff + k] = b[bOff + k]! / a[aOff + k + lda * k]!;
      const temp = b[bOff + k]!;
      for (let i = 0; i < k; i++) b[bOff + i] = b[bOff + i]! - temp * a[aOff + i + lda * k]!;
    }
  }
  return 0;
}

/** The machine epsilon L-BFGS-B uses, `numpy.finfo(numpy.float64).eps`. */
export const EPSMACH = 2.220446049250313e-16;
