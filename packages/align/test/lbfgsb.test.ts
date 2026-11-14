/**
 * Replays the L-BFGS-B golden cases (reference/golden/gen_lbfgsb_cases.py).
 *
 * The objectives are polynomials evaluated in the same order as the generator's, so scipy and the port
 * see bit-identical values and the recorded trace of evaluation points compares the two optimizers'
 * paths directly, not just where they stop.
 *
 * The paths agree bit for bit through the first function value and gradient and then part company in the
 * last bits. Recomputing one iteration by hand in Python gives this port's numbers and not scipy's, so
 * what differs is the rounding inside the dot products, norms and Cholesky factorizations scipy's
 * compiled BLAS and LAPACK perform, which `blas.ts` can only reproduce as the reference implementations
 * (and which is not the same across scipy's own builds). What follows is therefore checked as the same
 * path within a tolerance:
 * the same number of iterations and the same stopping reason in every case, an evaluation count within
 * five per cent, and a minimum that agrees to 1e-5 in the objective. The looser figure for `x` is in the
 * nature of the cases that use `ftol = 1e-5`: the iteration stops where the function has stopped
 * changing to that precision, which leaves the point itself determined only to about its square root.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analysis } from "@biolibs/align";

const { minimizeLbfgsb } = analysis;
type Bound = analysis.Bound;

/** A float as the generator writes it: a NaN or an infinity arrives as a string. */
type Num = number | string;

interface Case {
  func: string;
  x0: number[];
  bounds: (number | null)[][] | null;
  params: { c?: number[]; w?: number[] };
  options: Record<string, number>;
  trace: Num[][];
  x: Num[];
  fun: Num;
  jac: Num[] | null;
  nfev: number;
  nit: number | null;
  status: number | null;
  success: boolean;
}

/** The test objectives, written to match the generator's arithmetic term by term. */
const FUNCS: Record<string, (x: Float64Array, p: { c?: number[]; w?: number[] }) => number> = {
  quad: (x, p) => {
    let total = 0;
    for (let i = 0; i < x.length; i++) total += p.w![i]! * (x[i]! - p.c![i]!) * (x[i]! - p.c![i]!);
    return total;
  },
  quartic: (x, p) => {
    let total = 0;
    for (let i = 0; i < x.length; i++) {
      const d = x[i]! - p.c![i]!;
      total += p.w![i]! * d * d * d * d;
    }
    return total;
  },
  rosen: (x) => {
    let total = 0;
    for (let i = 0; i < x.length - 1; i++) {
      const a = x[i + 1]! - x[i]! * x[i]!, b = 1 - x[i]!;
      total += 100 * a * a + b * b;
    }
    return total;
  },
  beale: (x) => {
    const a = 1.5 - x[0]! + x[0]! * x[1]!;
    const b = 2.25 - x[0]! + x[0]! * x[1]! * x[1]!;
    const c = 2.625 - x[0]! + x[0]! * x[1]! * x[1]! * x[1]!;
    return a * a + b * b + c * c;
  },
  himmelblau: (x) => {
    const a = x[0]! * x[0]! + x[1]! - 11, b = x[0]! + x[1]! * x[1]! - 7;
    return a * a + b * b;
  },
  powell: (x) => {
    const a = x[0]! + 10 * x[1]!, b = x[2]! - x[3]!, c = x[1]! - 2 * x[2]!, d = x[0]! - x[3]!;
    return a * a + 5 * b * b + c * c * c * c + 10 * d * d * d * d;
  },
  trid: (x) => {
    let total = (x[0]! - 1) * (x[0]! - 1);
    for (let i = 1; i < x.length; i++) total += (x[i]! - 1) * (x[i]! - 1) - x[i]! * x[i - 1]!;
    return total;
  },
};

/** @param v - A number as the generator wrote it. @returns It, with the strings turned back into floats. */
const dec = (v: Num): number => (typeof v === "number" ? v : v === "nan" ? NaN : v === "inf" ? Infinity : -Infinity);

const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/lbfgsb.json", import.meta.url), "utf8"));

describe("scipy.optimize.minimize(method=\"L-BFGS-B\")", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.func} (${c.x0.length} variables, ${c.bounds === null ? "free" : "boxed"})`, () => {
      const trace: number[][] = [];
      const fun = (x: Float64Array): number => {
        trace.push([...x]);
        return FUNCS[c.func]!(x, c.params);
      };
      const bounds = c.bounds === null ? null : c.bounds.map((b) => [b[0] ?? null, b[1] ?? null] as Bound);
      const got = minimizeLbfgsb(fun, c.x0, bounds, null, c.options);
      // The starting value and the gradient there are reached before any dot product is taken, so these
      // points have to be identical.
      const prefix = 1 + c.x0.length - (c.bounds ?? []).filter((b) => b[0] !== null && b[0] === b[1]).length;
      for (let i = 0; i < Math.min(prefix, c.trace.length); i++) {
        expect(trace[i], `evaluation ${i}`).toEqual(c.trace[i]!.map(dec));
      }
      expect(Math.abs(trace.length - c.trace.length) / c.trace.length,
        `evaluations: ${trace.length} against ${c.trace.length}`).toBeLessThanOrEqual(0.05);
      if (c.nit !== null) expect(got.nit, "iterations").toBe(c.nit);
      if (c.status !== null) expect(got.status, "status").toBe(c.status);
      expect(got.success).toBe(c.success);
      expect(Math.abs(got.nfev - c.nfev) / c.nfev, "evaluation count").toBeLessThanOrEqual(0.05);
      const wantF = dec(c.fun);
      expect(Math.abs(got.fun - wantF) / Math.max(1, Math.abs(wantF)), "objective").toBeLessThanOrEqual(1e-5);
      let apart = 0;
      [...got.x].forEach((v, i) => {
        const want = dec(c.x[i]!);
        const rel = Math.abs(v - want) / Math.max(1, Math.abs(want));
        apart = Math.max(apart, rel);
        expect(rel, `x[${i}]`).toBeLessThanOrEqual(5e-3);
      });
      if (c.jac !== null) {
        [...got.jac].forEach((v, i) => {
          const want = dec(c.jac![i]!);
          // A NaN marks a variable the bounds fixed, which is checked whatever the point.
          if (Number.isNaN(want)) expect(v).toBeNaN();
          // The gradient is only worth comparing where the two runs stopped at the same point: on
          // Rosenbrock's floor the surface is steep across the valley, so a difference of 1e-3 in the
          // stopping point moves the gradient by far more than the gradient itself is.
          else if (apart <= 1e-9) expect(Math.abs(v - want), `jac[${i}]`).toBeLessThanOrEqual(1e-6);
        });
      }
    });
  });
});
