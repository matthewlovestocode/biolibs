/** Salt and chemical corrections to melting temperatures (Biopython's `salt_correction`, `chem_correction`). */

import { ValueError, ZeroDivisionError as ZeroDivision, pyFloatRepr, pySum } from "@biolibs/core";
import { gcFraction } from "./gc.js";

/** `math.log`, `math.log10` and `math.sqrt` raise `ValueError` outside their domain; JavaScript returns NaN. */
export function mlog(x: number): number {
  if (!(x > 0)) throw new ValueError(`expected a positive input, got ${pyFloatRepr(x)}`);
  return Math.log(x);
}

/** Python's `math.log10`. */
export function mlog10(x: number): number {
  if (!(x > 0)) throw new ValueError(`expected a positive input, got ${pyFloatRepr(x)}`);
  return Math.log10(x);
}

/** Python's `math.sqrt`. */
export function msqrt(x: number): number {
  if (x < 0) throw new ValueError(`expected a nonnegative input, got ${pyFloatRepr(x)}`);
  return Math.sqrt(x);
}

/** Python's `x in range(1, 7)` for a number. */
const inRange1to6 = (m: number): boolean => Number.isInteger(m) && m >= 1 && m < 7;

/** The empirical GC-dependent term shared by methods 6 and 7. */
const gcTerm = (seq: string, mon: number): number =>
  (4.29 * gcFraction(seq, "ignore") - 3.95) * 1e-05 * mlog(mon) + 9.4e-06 * mlog(mon) ** 2;

/**
 * Correction (in °C, or entropy units for method 5) for the salt concentrations of a PCR buffer.
 *
 * @param Na - Sodium (mM). @param K - Potassium (mM). @param Tris - Tris (mM). @param Mg - Magnesium (mM). @param dNTPs - dNTPs (mM).
 * @param method - 0 none; 1-4 are Tm corrections (Schildkraut, Wetmur, Owczarzy 2004, von Ahsen 2001); 5 an entropy correction (SantaLucia 1998);
 *   6 and 7 are Owczarzy 2004 and 2008. Methods 5-7 need `seq`.
 * @param seq - The sequence, for methods 5-7.
 * @throws {@link ValueError} for a missing sequence, zero ion concentration, or a method above 7.
 * @example
 * ```ts
 * saltCorrection(50, 0, 0, 0, 0, 1);   // -21.597...
 * ```
 */
export function saltCorrection(Na = 0, K = 0, Tris = 0, Mg = 0, dNTPs = 0, method: number = 1, seq: string | null = null): number {
  if ((method === 5 || method === 6 || method === 7) && !seq) throw new ValueError("sequence is missing (is needed to calculate GC content or sequence length).");
  let corr = 0;
  if (!method) return corr;
  let Mon = Na + K + Tris / 2.0;
  let mg = Mg * 0.001;
  if (pySum([K, Mg, Tris, dNTPs]) > 0 && method !== 7 && dNTPs < Mg) Mon += 120 * msqrt(Mg - dNTPs);
  const mon = Mon * 0.001;
  if (inRange1to6(method) && !mon) throw new ValueError("Total ion concentration of zero is not allowed in this method.");
  if (method === 1) corr = 16.6 * mlog10(mon);
  if (method === 2) corr = 16.6 * mlog10(mon / (1.0 + 0.7 * mon));
  if (method === 3) corr = 12.5 * mlog10(mon);
  if (method === 4) corr = 11.7 * mlog10(mon);
  if (method === 5) corr = 0.368 * (seq!.length - 1) * mlog(mon);
  if (method === 6) corr = gcTerm(seq!, mon);
  if (method === 7) {
    let a = 3.92, d = 1.42, g = 8.31;
    const b = -0.911, c = 6.26, e = -48.2, f = 52.5;
    if (dNTPs > 0) {
      const dntps = dNTPs * 0.001;
      const ka = 30000.0;
      mg = (-(ka * dntps - ka * mg + 1.0) + msqrt((ka * dntps - ka * mg + 1.0) ** 2 + 4.0 * ka * mg)) / (2.0 * ka);
    }
    if (Mon > 0) {
      const R = msqrt(mg) / mon;
      if (R < 0.22) {
        return gcTerm(seq!, mon);
      } else if (R < 6.0) {
        a = 3.92 * (0.843 - 0.352 * msqrt(mon) * mlog(mon));
        d = 1.42 * (1.279 - 0.00403 * mlog(mon) - 0.00803 * mlog(mon) ** 2);
        g = 8.31 * (0.486 - 0.258 * mlog(mon) + 0.00525 * mlog(mon) ** 3);
      }
    }
    // Evaluated left to right like Python, so a bad logarithm is reported before a division by zero.
    const n = seq!.length - 1;
    const first = a + b * mlog(mg);
    const second = gcFraction(seq!, "ignore") * (c + d * mlog(mg));
    if (n === 0) throw new ZeroDivision();
    const third = (1 / (2.0 * n)) * (e + f * mlog(mg) + g * mlog(mg) ** 2);
    corr = (first + second + third) * 1e-05;
  }
  if (method > 7) throw new ValueError("Allowed values for parameter 'method' are 1-7.");
  return corr;
}

/**
 * Subtract the effect of DMSO and formamide from a melting temperature.
 *
 * @param meltingTemp - Temperature to correct. @param DMSO - DMSO (%). @param fmd - Formamide (% or molar). @param DMSOfactor - °C per % DMSO (default 0.75).
 * @param fmdfactor - °C per % formamide (default 0.65). @param fmdmethod - 1: linear; 2: GC-dependent (Blake and Delcourt 1996).
 * @param GC - GC percent, for `fmdmethod` 2.
 * @throws {@link ValueError} for a missing or negative `GC` with method 2, or an unknown method.
 */
export function chemCorrection(meltingTemp: number, DMSO = 0, fmd = 0, DMSOfactor = 0.75, fmdfactor = 0.65, fmdmethod = 1, GC: number | null = null): number {
  if (DMSO) meltingTemp -= DMSOfactor * DMSO;
  if (fmd) {
    if (fmdmethod === 1) meltingTemp -= fmdfactor * fmd;
    if (fmdmethod === 2) {
      if (GC === null || GC < 0) throw new ValueError("'GC' is missing or negative");
      meltingTemp += (0.453 * (GC / 100.0) - 2.88) * fmd;
    }
    if (fmdmethod !== 1 && fmdmethod !== 2) throw new ValueError("'fmdmethod' must be 1 or 2");
  }
  return meltingTemp;
}
