/**
 * Replays the `Array.__array_ufunc__` golden cases (reference/golden/gen_ufunc_cases.py).
 *
 * What is being compared is Biopython's own bookkeeping — which inputs it refuses, what it hands back and
 * what alphabet and element type the results carry — together with the element-wise arithmetic NumPy does
 * underneath, which the port computes itself.
 *
 * Values are compared to within four ulps rather than exactly: `log` and `exp` go through NumPy's own
 * routines on one side and the engine's on the other, and the two disagree in the last bit for some
 * arguments. Infinities, NaNs and every shape, alphabet and element type are compared exactly.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { substitutionMatrices as sub } from "@biolibs/align";

type Num = number | string;

interface Spec { alphabet: string | string[]; dims: number; dtype?: string; data: number[] | number[][] }
/** An input as the generator writes it: a matrix, a float, `{int}` for a Python int, or plain numbers. */
type Input = Spec | number | { int: number } | number[] | number[][];
interface Encoded {
  array?: boolean;
  alphabet?: string | string[];
  dtype?: string;
  shape?: number[];
  values?: Num | Num[] | Num[][];
  scalar?: Num;
}
interface Case {
  ufunc: string;
  method: "__call__" | "reduce" | "accumulate" | "outer" | "at";
  inputs: Input[];
  out?: (Spec | null)[];
  axis?: number;
  indices?: number[];
  result?: Encoded | Encoded[] | null;
  after?: Encoded;
  out_after?: Encoded[];
  exc?: { type: string; msg: string };
}

const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/ufunc.json", import.meta.url), "utf8"));

/** @param v - A number as the generator wrote it. @returns It, with the strings turned back into floats. */
const dec = (v: Num): number => (typeof v === "number" ? v : v === "nan" ? NaN : v === "inf" ? Infinity : -Infinity);

/** @param spec - A case's description of an input. @returns The matrix, or the plain value it was. */
function build(spec: Input): sub.SubstitutionArray | number | bigint | number[] | number[][] {
  if (typeof spec === "number" || Array.isArray(spec)) return spec;
  // A Python int scalar, which the port takes as a bigint so that it keeps an integer matrix integral.
  if ("int" in spec) return BigInt(spec.int);
  const a = new sub.SubstitutionArray({ alphabet: spec.alphabet, dims: spec.dims, dtype: spec.dtype === "int" ? "int" : "float" });
  (spec.data as number[]).flat().forEach((v, i) => { a.data[i] = v; });
  return a;
}

/** @param x - A result. @returns It in the generator's own JSON form, for comparison. */
function enc(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(enc);
  if (x === undefined) return null;
  if (x instanceof sub.SubstitutionArray) {
    const values = x.shape.length === 1
      ? [...x.data]
      : Array.from({ length: x.shape[0]! }, (_, i) => [...x.data.slice(i * x.shape[1]!, (i + 1) * x.shape[1]!)]);
    return { array: true, alphabet: x.alphabet, dtype: x.dtype, shape: [...x.shape], values };
  }
  return { scalar: x };
}

/** @param want - What the generator recorded. @returns The same with its float text decoded. */
function decode(want: unknown): unknown {
  if (Array.isArray(want)) return want.map(decode);
  if (want === null || typeof want !== "object") return want;
  const w = { ...(want as Record<string, unknown>) };
  if ("values" in w) w["values"] = decode(w["values"]);
  if ("scalar" in w) w["scalar"] = dec(w["scalar"] as Num);
  if (typeof w === "object" && !("array" in w) && !("scalar" in w) && !("values" in w)) return w;
  return w;
}

/** @param v - Recorded values. @returns Them with "nan" and "inf" turned back into numbers. */
function decodeValues(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeValues);
  return dec(v as Num);
}

/**
 * Compare a result with what Biopython recorded: everything exactly, except that finite numbers are
 * allowed to differ in their last few bits.
 *
 * @param got - The port's result. @param want - Biopython's. @param where - What is being compared.
 */
function same(got: unknown, want: unknown, where: string): void {
  if (typeof want === "number" && typeof got === "number") {
    if (Number.isFinite(want)) {
      expect(Math.abs(got - want), `${where}: ${got} against ${want}`)
        .toBeLessThanOrEqual(4 * Number.EPSILON * Math.max(1, Math.abs(want)));
    } else if (Number.isNaN(want)) expect(got, where).toBeNaN();
    else expect(got, where).toBe(want);
    return;
  }
  if (Array.isArray(want)) {
    expect(Array.isArray(got), where).toBe(true);
    expect((got as unknown[]).length, `${where}: length`).toBe(want.length);
    want.forEach((w, i) => same((got as unknown[])[i], w, `${where}[${i}]`));
    return;
  }
  if (want !== null && typeof want === "object") {
    expect(got !== null && typeof got === "object", where).toBe(true);
    const g = got as Record<string, unknown>;
    expect(Object.keys(g).sort(), `${where}: keys`).toEqual(Object.keys(want).sort());
    for (const [key, w] of Object.entries(want)) same(g[key], w, `${where}.${key}`);
    return;
  }
  expect(got, where).toEqual(want);
}

describe("substitution_matrices.Array.__array_ufunc__", () => {
  cases.forEach((c, index) => {
    it(`${index} ${c.ufunc}.${c.method} (${c.inputs.length} input${c.inputs.length === 1 ? "" : "s"})`, () => {
      const inputs = c.inputs.map(build);
      const outs = c.out === undefined ? null : c.out.map((o) => (o === null ? null : build(o) as sub.SubstitutionArray));
      const self = inputs.find((x) => x instanceof sub.SubstitutionArray) as sub.SubstitutionArray;
      const call = (): unknown => sub.arrayUfunc(self, c.ufunc, c.method, inputs, {
        out: outs, axis: c.axis, indices: c.indices,
      });
      if (c.exc) {
        let err: { name?: string; message?: string } = {};
        try { call(); } catch (e) { err = e as Error; }
        expect(err.name, "exception type").toBe(c.exc.type);
        expect(err.message).toBe(c.exc.msg);
        return;
      }
      const got = call();
      const want = decode(c.result) as Record<string, unknown> | Record<string, unknown>[] | null;
      const fix = (w: unknown): unknown => {
        if (Array.isArray(w)) return w.map(fix);
        if (w === null || typeof w !== "object") return w;
        const o = { ...(w as Record<string, unknown>) };
        if ("values" in o) o["values"] = decodeValues(o["values"]);
        if ("scalar" in o) o["scalar"] = dec(o["scalar"] as Num);
        return o;
      };
      same(enc(got), fix(want), "result");
      // `at` writes into its first argument, and an `out` argument is both returned and written to.
      if (c.after !== undefined) same(enc(inputs[0]), fix(c.after), "after");
      if (c.out_after !== undefined) {
        outs!.forEach((o, i) => { if (o !== null) same(enc(o), fix(c.out_after![i]), `out ${i}`); });
      }
    });
  });
});
