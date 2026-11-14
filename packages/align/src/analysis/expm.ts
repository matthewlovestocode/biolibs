/**
 * The matrix exponential, as `scipy.linalg.expm` computes it.
 *
 * `Bio.Align.analysis` needs it for the YN00 and ML methods, which exponentiate a codon rate matrix, so the port
 * needs one that agrees with scipy closely enough that the numbers that come out of those methods match.
 *
 * This is the scaling-and-squaring Padé algorithm of Al-Mohy and Higham (2009), which is what scipy implements:
 * the order of the approximant is chosen from the norms of the matrix's powers, the matrix is halved until the
 * approximant is accurate, and the result is squared back up. The `ell` correction and its constants are the
 * paper's, and the 1x1 shortcut is scipy's own.
 */

/** A matrix as rows of numbers. */
export type Matrix = number[][];

/** How large the matrix may be before each Padé order stops being accurate enough (the paper's theta values). */
const THETA: Record<number, number> = {
  3: 1.495585217958292e-2,
  5: 2.53939833006323e-1,
  7: 9.504178996162932e-1,
  9: 2.097847961257068,
  13: 4.25,
};

/** The reciprocals of the Padé error coefficients, which decide the `ell` correction. */
const ABS_C_RECIP: Record<number, number> = {
  3: 100800,
  5: 10059033600,
  7: 4487938430976000,
  9: 5.91438478187741184e21,
  13: 1.132507756060211134832836608e35,
};

/** The numerators of each Padé approximant, lowest power first. */
const B: Record<number, number[]> = {
  3: [120, 60, 12, 1],
  5: [30240, 15120, 3360, 420, 30, 1],
  7: [17297280, 8648640, 1995840, 277200, 25200, 1512, 56, 1],
  9: [17643225600, 8821612800, 2075673600, 302702400, 30270240, 2162160, 110880, 3960, 90, 1],
  13: [64764752532480000, 32382376266240000, 7771770303897600, 1187353796428800, 129060195264000,
    10559470521600, 670442572800, 33522128640, 1323241920, 40840800, 960960, 16380, 182, 1],
};

/** Unit roundoff for a double, which the correction compares against. */
const U = 2 ** -53;

/** @param n - The size. @returns An `n` by `n` matrix of zeros. */
const zeros = (n: number): Matrix => Array.from({ length: n }, () => new Array<number>(n).fill(0));

/** @param n - The size. @returns The identity matrix of that size. */
const eye = (n: number): Matrix => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

/** @param a - A matrix. @param b - Another of the same size. @returns Their product. */
function matmul(a: Matrix, b: Matrix): Matrix {
  const n = a.length;
  const out = zeros(n);
  for (let i = 0; i < n; i++) {
    const ai = a[i]!, oi = out[i]!;
    for (let k = 0; k < n; k++) {
      const aik = ai[k]!;
      if (aik === 0) continue;
      const bk = b[k]!;
      for (let j = 0; j < n; j++) oi[j] = oi[j]! + aik * bk[j]!;
    }
  }
  return out;
}

/** @param terms - Scalar and matrix pairs. @returns Their weighted sum. */
function combine(terms: [number, Matrix][]): Matrix {
  const n = terms[0]![1].length;
  const out = zeros(n);
  for (const [c, m] of terms) {
    if (c === 0) continue;
    for (let i = 0; i < n; i++) {
      const oi = out[i]!, mi = m[i]!;
      for (let j = 0; j < n; j++) oi[j] = oi[j]! + c * mi[j]!;
    }
  }
  return out;
}

/** @param a - A matrix. @returns Its 1-norm, the largest column sum of absolute values. */
function onenorm(a: Matrix): number {
  const n = a.length;
  let best = 0;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.abs(a[i]![j]!);
    best = Math.max(best, sum);
  }
  return best;
}

/** @param a - A matrix. @param p - A power. @returns The 1-norm of `abs(a)` to that power. */
function onenormAbsPower(a: Matrix, p: number): number {
  let m = a.map((row) => row.map(Math.abs));
  const base = m;
  for (let k = 1; k < p; k++) m = matmul(m, base);
  return onenorm(m);
}

/**
 * How many extra halvings the Padé approximant of order `m` needs for this matrix.
 *
 * @param a - The matrix. @param m - The Padé order.
 * @returns The correction, which is zero when the approximant is already accurate enough.
 */
function ell(a: Matrix, m: number): number {
  const p = 2 * m + 1;
  const absNorm = onenormAbsPower(a, p);
  if (absNorm === 0) return 0;
  const alpha = (absNorm * ABS_C_RECIP[m]!) / (onenorm(a) * U);
  return Math.max(Math.ceil(Math.log2(alpha) / (2 * m)), 0);
}

/**
 * Solve `lhs X = rhs` by Gaussian elimination with partial pivoting, which is what LAPACK does for these.
 *
 * @param lhs - The left side, which this consumes. @param rhs - The right side, likewise.
 * @returns The solution.
 */
function solve(lhs: Matrix, rhs: Matrix): Matrix {
  const n = lhs.length;
  const a = lhs.map((row) => [...row]);
  const b = rhs.map((row) => [...row]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    if (pivot !== col) { [a[col], a[pivot]] = [a[pivot]!, a[col]!]; [b[col], b[pivot]] = [b[pivot]!, b[col]!]; }
    const akk = a[col]![col]!;
    for (let row = col + 1; row < n; row++) {
      const factor = a[row]![col]! / akk;
      if (factor === 0) continue;
      for (let j = col; j < n; j++) a[row]![j]! -= factor * a[col]![j]!;
      for (let j = 0; j < n; j++) b[row]![j]! -= factor * b[col]![j]!;
    }
  }
  for (let col = n - 1; col >= 0; col--) {
    const akk = a[col]![col]!;
    for (let j = 0; j < n; j++) b[col]![j]! /= akk;
    for (let row = 0; row < col; row++) {
      const factor = a[row]![col]!;
      if (factor === 0) continue;
      for (let j = 0; j < n; j++) b[row]![j]! -= factor * b[col]![j]!;
    }
  }
  return b;
}

/** The two halves of a Padé approximant: the odd part times the matrix, and the even part. */
function padeParts(a: Matrix, m: number, powers: Map<number, Matrix>): [Matrix, Matrix] {
  const n = a.length;
  const b = B[m]!;
  const power = (k: number): Matrix => {
    const have = powers.get(k);
    if (have !== undefined) return have;
    const made = matmul(power(k - 2), powers.get(2)!);
    powers.set(k, made);
    return made;
  };
  if (m === 13) {
    // The thirteenth-order approximant is evaluated in the paper's factored form, which needs only A2, A4, A6.
    const a2 = powers.get(2)!, a4 = powers.get(4)!, a6 = powers.get(6)!;
    const uInner = combine([[b[13]!, a6], [b[11]!, a4], [b[9]!, a2]]);
    const uRest = combine([[b[7]!, a6], [b[5]!, a4], [b[3]!, a2], [b[1]!, eye(n)]]);
    const u = matmul(a, combine([[1, matmul(a6, uInner)], [1, uRest]]));
    const vInner = combine([[b[12]!, a6], [b[10]!, a4], [b[8]!, a2]]);
    const vRest = combine([[b[6]!, a6], [b[4]!, a4], [b[2]!, a2], [b[0]!, eye(n)]]);
    const v = combine([[1, matmul(a6, vInner)], [1, vRest]]);
    return [u, v];
  }
  const odd: [number, Matrix][] = [[b[1]!, eye(n)]];
  const even: [number, Matrix][] = [[b[0]!, eye(n)]];
  for (let k = 2; k <= m; k += 2) {
    odd.push([b[k + 1]!, power(k)]);
    even.push([b[k]!, power(k)]);
  }
  return [matmul(a, combine(odd)), combine(even)];
}

/**
 * The matrix exponential.
 *
 * @param input - A square matrix.
 * @returns Its exponential, to the accuracy `scipy.linalg.expm` gives.
 */
export function expm(input: Matrix): Matrix {
  const n = input.length;
  // scipy answers a one-by-one matrix with the scalar exponential, overflow and all.
  if (n === 1) return [[Math.exp(input[0]![0]!)]];
  let a = input.map((row) => [...row]);
  const powers = new Map<number, Matrix>();
  powers.set(2, matmul(a, a));
  powers.set(4, matmul(powers.get(2)!, powers.get(2)!));
  powers.set(6, matmul(powers.get(2)!, powers.get(4)!));
  const d = (k: number): number => {
    const p = powers.get(k);
    const m = p ?? matmul(powers.get(k - 2) ?? powers.get(2)!, powers.get(2)!);
    if (p === undefined) powers.set(k, m);
    return onenorm(m) ** (1 / k);
  };
  const d4 = d(4), d6 = d(6);
  const run = (m: number): Matrix => {
    const [u, v] = padeParts(a, m, powers);
    return solve(combine([[1, v], [-1, u]]), combine([[1, v], [1, u]]));
  };

  const eta1 = Math.max(d4, d6);
  if (eta1 <= THETA[3]! && ell(a, 3) === 0) return run(3);
  const d8 = onenorm(matmul(powers.get(4)!, powers.get(4)!)) ** (1 / 8);
  const eta2 = Math.max(d4, d8);
  if (eta2 <= THETA[5]! && ell(a, 5) === 0) return run(5);
  const d10 = onenorm(matmul(powers.get(4)!, powers.get(6)!)) ** (1 / 10);
  const eta3 = Math.max(d6, d10);
  if (eta3 <= THETA[7]! && ell(a, 7) === 0) return run(7);
  if (eta3 <= THETA[9]! && ell(a, 9) === 0) return run(9);
  const eta4 = Math.max(d8, d10);
  const eta5 = Math.min(eta3, eta4);
  let s = Math.max(Math.ceil(Math.log2(eta5 / THETA[13]!)), 0);
  if (!Number.isFinite(s)) s = 0;
  const scaled = a.map((row) => row.map((x) => x / 2 ** s));
  s += ell(scaled, 13);
  a = a.map((row) => row.map((x) => x / 2 ** s));
  powers.clear();
  powers.set(2, matmul(a, a));
  powers.set(4, matmul(powers.get(2)!, powers.get(2)!));
  powers.set(6, matmul(powers.get(2)!, powers.get(4)!));
  let x = run(13);
  for (let i = 0; i < s; i++) x = matmul(x, x);
  return x;
}
